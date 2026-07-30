import { getDb, organizationMembers, organizations, users } from '@ossplay/db';
import { eq } from 'drizzle-orm';
import { Hono } from 'hono';
import { z } from 'zod';
import { clearSessionCookie, getSessionCookie, setSessionCookie } from '../lib/auth/cookie';
import { normalizeEmail } from '../lib/auth/email';
import { verifyPassword } from '../lib/auth/password';
import { checkRateLimit, resetRateLimit } from '../lib/auth/rate-limit';
import { getClientIp, getUserAgent } from '../lib/auth/request-info';
import {
  completeSignIn,
  listSessionsForUser,
  revokeSessionById,
  revokeSessionToken,
} from '../lib/auth/session';
import { requireAuth } from '../middleware/require-auth';
import type { AppEnv } from '../types';

const loginSchema = z.object({
  email: z.string().trim().email(),
  password: z.string().min(1),
});

export const authRoute = new Hono<AppEnv>();

authRoute.post('/login', async (c) => {
  const body = await c.req.json().catch(() => null);
  const parsed = loginSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: 'Invalid email or password' }, 400);
  }

  const email = normalizeEmail(parsed.data.email);
  const rateLimitKey = `login:${email}`;
  const rateLimit = checkRateLimit(rateLimitKey);
  if (!rateLimit.allowed) {
    c.header('Retry-After', String(rateLimit.retryAfterSeconds));
    return c.json({ error: 'Too many attempts, try again later' }, 429);
  }

  const db = getDb();
  const [user] = await db.select().from(users).where(eq(users.email, email));

  // Same generic message whether the email doesn't exist or the password is
  // wrong — no user enumeration.
  const invalidCredentials = () => c.json({ error: 'Invalid email or password' }, 401);

  if (!user) return invalidCredentials();
  if (!(await verifyPassword(parsed.data.password, user.passwordHash))) return invalidCredentials();

  resetRateLimit(rateLimitKey);
  const { token, expiresAt } = await completeSignIn(user.id, {
    ipAddress: getClientIp(c),
    userAgent: getUserAgent(c),
  });
  setSessionCookie(c, token, expiresAt);

  return c.json({ user: { id: user.id, email: user.email, name: user.name } });
});

authRoute.post('/logout', requireAuth, async (c) => {
  const token = getSessionCookie(c);
  if (token) await revokeSessionToken(token);
  clearSessionCookie(c);
  return c.body(null, 204);
});

authRoute.get('/me', requireAuth, async (c) => {
  const user = c.get('user');
  const memberships = await getDb()
    .select({
      orgId: organizationMembers.orgId,
      orgName: organizations.name,
      role: organizationMembers.role,
    })
    .from(organizationMembers)
    .innerJoin(organizations, eq(organizationMembers.orgId, organizations.id))
    .where(eq(organizationMembers.userId, user.id));

  return c.json({
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      instanceRole: user.instanceRole,
    },
    organizations: memberships,
  });
});

authRoute.get('/sessions', requireAuth, async (c) => {
  const user = c.get('user');
  const currentSession = c.get('session');
  const sessions = await listSessionsForUser(user.id);

  return c.json({
    sessions: sessions.map((session) => ({
      id: session.id,
      ipAddress: session.ipAddress,
      userAgent: session.userAgent,
      createdAt: session.createdAt,
      expiresAt: session.expiresAt,
      isCurrent: session.id === currentSession.id,
    })),
  });
});

authRoute.delete('/sessions/:id', requireAuth, async (c) => {
  const user = c.get('user');
  const revoked = await revokeSessionById(c.req.param('id'), user.id);
  if (!revoked) {
    return c.json({ error: 'Session not found' }, 404);
  }
  return c.body(null, 204);
});
