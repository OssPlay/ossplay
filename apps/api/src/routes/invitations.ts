import { getDb, invitations, organizationMembers, organizations, users } from '@ossplay/db';
import { eq } from 'drizzle-orm';
import { Hono } from 'hono';
import { z } from 'zod';
import { getSessionCookie, setSessionCookie } from '../lib/auth/cookie';
import { hashPassword } from '../lib/auth/password';
import { getClientIp, getUserAgent } from '../lib/auth/request-info';
import { completeSignIn, validateSessionToken } from '../lib/auth/session';
import { hashToken } from '../lib/auth/tokens';
import { can } from '../lib/authz/permissions';
import { requireAuth } from '../middleware/require-auth';
import { getMembership } from '../middleware/require-org-permission';
import type { AppEnv } from '../types';

export const invitationsRoute = new Hono<AppEnv>();

async function findValidInvitationByToken(token: string) {
  const tokenHash = await hashToken(token);
  const [invitation] = await getDb()
    .select()
    .from(invitations)
    .where(eq(invitations.tokenHash, tokenHash));
  if (
    !invitation ||
    invitation.status !== 'pending' ||
    invitation.expiresAt.getTime() < Date.now()
  ) {
    return null;
  }
  return invitation;
}

invitationsRoute.get('/token/:token', async (c) => {
  const invitation = await findValidInvitationByToken(c.req.param('token'));
  if (!invitation) {
    return c.json({ error: 'Invitation not found or no longer valid' }, 404);
  }

  const db = getDb();
  const [org] = await db.select().from(organizations).where(eq(organizations.id, invitation.orgId));
  const [inviter] = await db.select().from(users).where(eq(users.id, invitation.invitedByUserId));
  const [existingUser] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, invitation.email));

  return c.json({
    email: invitation.email,
    role: invitation.role,
    orgName: org?.name ?? null,
    inviterName: inviter?.name ?? null,
    accountExists: Boolean(existingUser),
  });
});

const acceptNewUserSchema = z.object({
  name: z.string().trim().min(1).max(200),
  password: z.string().min(12).max(200),
});

invitationsRoute.post('/token/:token/accept', async (c) => {
  const invitation = await findValidInvitationByToken(c.req.param('token'));
  if (!invitation) {
    return c.json({ error: 'Invitation not found or no longer valid' }, 404);
  }

  const db = getDb();
  const [existingUser] = await db.select().from(users).where(eq(users.email, invitation.email));

  let userId: string;
  let justCreatedAccount = false;

  if (existingUser) {
    const sessionToken = getSessionCookie(c);
    const session = sessionToken ? await validateSessionToken(sessionToken) : null;
    if (!session || session.userId !== existingUser.id) {
      return c.json({ error: `Log in as ${invitation.email} to accept this invitation` }, 401);
    }
    userId = existingUser.id;
  } else {
    const parsed = acceptNewUserSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: 'Invalid input' }, 400);

    const passwordHash = await hashPassword(parsed.data.password);
    const [createdUser] = await db
      .insert(users)
      .values({ email: invitation.email, passwordHash, name: parsed.data.name })
      .returning();
    if (!createdUser) throw new Error('Insert did not return the expected row');
    userId = createdUser.id;
    justCreatedAccount = true;
  }

  // Re-inviting an existing member (e.g. to change their role) updates the
  // role rather than silently no-op'ing — an invitation that says "admin"
  // shouldn't leave someone's existing "member" row untouched.
  await db
    .insert(organizationMembers)
    .values({ userId, orgId: invitation.orgId, role: invitation.role })
    .onConflictDoUpdate({
      target: [organizationMembers.userId, organizationMembers.orgId],
      set: { role: invitation.role },
    });

  await db
    .update(invitations)
    .set({ status: 'accepted', acceptedAt: new Date() })
    .where(eq(invitations.id, invitation.id));

  // A brand-new account gets logged in immediately, same as setup. An
  // already-logged-in existing user just keeps their current session.
  if (justCreatedAccount) {
    const { token, expiresAt } = await completeSignIn(userId, {
      ipAddress: getClientIp(c),
      userAgent: getUserAgent(c),
    });
    setSessionCookie(c, token, expiresAt);
  }

  return c.json({ ok: true });
});

invitationsRoute.post('/:id/revoke', requireAuth, async (c) => {
  const user = c.get('user');
  const invitationId = c.req.param('id');
  const db = getDb();

  const [invitation] = await db.select().from(invitations).where(eq(invitations.id, invitationId));
  if (!invitation) return c.json({ error: 'Invitation not found' }, 404);

  const membership = await getMembership(user.id, invitation.orgId);
  if (!can(user, 'org:manage_members', membership)) {
    return c.json({ error: 'Forbidden' }, 403);
  }

  await db.update(invitations).set({ status: 'revoked' }).where(eq(invitations.id, invitationId));
  return c.body(null, 204);
});
