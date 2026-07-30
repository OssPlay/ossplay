import { getDb, users, webauthnCredentials } from '@ossplay/db';
import { eq } from 'drizzle-orm';
import { Hono } from 'hono';
import { z } from 'zod';
import { clearUserSecondFactors, setUserPassword } from '../lib/auth/admin-reset';
import { hashPassword } from '../lib/auth/password';
import { generateToken } from '../lib/auth/tokens';
import { requireAuth } from '../middleware/require-auth';
import { requireInstancePermission } from '../middleware/require-instance-permission';
import type { AppEnv } from '../types';

export const instanceUsersRoute = new Hono<AppEnv>();

// Instance-root-only, not extended to org owners/admins: password/2FA/
// passkeys live on `users`, which has no orgId — there's no existing
// mechanism for an org-scoped admin to reach them regardless of root's own
// (separately implicit) reach into every org. See ARCHITECTURE.md's
// Authorization Model section.
instanceUsersRoute.use('*', requireAuth, requireInstancePermission('instance:manage_users'));

instanceUsersRoute.get('/', async (c) => {
  const db = getDb();
  const rows = await db
    .select({
      id: users.id,
      email: users.email,
      name: users.name,
      instanceRole: users.instanceRole,
      totpEnabled: users.totpEnabled,
      createdAt: users.createdAt,
      lastSignInAt: users.lastSignInAt,
    })
    .from(users);

  const credentials = await db
    .select({ userId: webauthnCredentials.userId })
    .from(webauthnCredentials);
  const passkeyCounts = new Map<string, number>();
  for (const { userId } of credentials) {
    passkeyCounts.set(userId, (passkeyCounts.get(userId) ?? 0) + 1);
  }

  return c.json({
    users: rows.map((row) => ({ ...row, passkeyCount: passkeyCounts.get(row.id) ?? 0 })),
  });
});

const setPasswordSchema = z
  .object({
    newPassword: z.string().min(12).max(200).optional(),
    generateTemporary: z.boolean().optional(),
  })
  .refine((data) => Boolean(data.newPassword) !== Boolean(data.generateTemporary), {
    message: 'Provide exactly one of newPassword or generateTemporary',
  });

instanceUsersRoute.put('/:id/password', async (c) => {
  const parsed = setPasswordSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) {
    return c.json({ error: 'Invalid input', details: parsed.error.flatten() }, 400);
  }

  const [target] = await getDb()
    .select()
    .from(users)
    .where(eq(users.id, c.req.param('id')));
  if (!target) return c.json({ error: 'User not found' }, 404);

  // Long enough to be unguessable and to satisfy the normal 12-char
  // minimum with room to spare; base64url-safe so it's easy to select/copy
  // in the dashboard's one-time reveal.
  const temporaryPassword = parsed.data.generateTemporary ? generateToken(18) : undefined;
  const newPassword = parsed.data.newPassword ?? temporaryPassword;
  if (!newPassword) throw new Error('Expected a password to have been resolved by now');

  await setUserPassword(target.id, await hashPassword(newPassword));

  return c.json(temporaryPassword ? { temporaryPassword } : {});
});

instanceUsersRoute.post('/:id/reset-2fa', async (c) => {
  const [target] = await getDb()
    .select()
    .from(users)
    .where(eq(users.id, c.req.param('id')));
  if (!target) return c.json({ error: 'User not found' }, 404);

  await clearUserSecondFactors(target.id);
  return c.body(null, 204);
});
