import { getDb, userRecoveryCodes, users } from '@ossplay/db';
import { eq } from 'drizzle-orm';
import { Hono } from 'hono';
import { z } from 'zod';
import {
  clearTwoFactorChallengeCookie,
  getTwoFactorChallengeCookie,
  setSessionCookie,
} from '../lib/auth/cookie';
import { verifyPassword } from '../lib/auth/password';
import { checkRateLimit } from '../lib/auth/rate-limit';
import { getClientIp, getUserAgent } from '../lib/auth/request-info';
import { completeSignIn } from '../lib/auth/session';
import { buildOtpauthUri, generateTotpSecret, verifyTotpCode } from '../lib/auth/totp';
import {
  deleteTwoFactorChallenge,
  generateRecoveryCodes,
  getTwoFactorChallenge,
  verifyAndConsumeRecoveryCode,
} from '../lib/auth/two-factor';
import { requireAuth } from '../middleware/require-auth';
import type { AppEnv } from '../types';

export const twoFactorRoute = new Hono<AppEnv>();

// Writes a pending secret but does NOT enable 2FA yet — /confirm does that,
// once the user proves they can actually generate a matching code.
twoFactorRoute.post('/setup', requireAuth, async (c) => {
  const user = c.get('user');
  const secret = generateTotpSecret();
  await getDb().update(users).set({ totpSecret: secret }).where(eq(users.id, user.id));
  return c.json({
    secret,
    otpauthUrl: buildOtpauthUri({ secret, accountName: user.email, issuer: 'OSSPlay' }),
  });
});

// TOTP codes are 6 digits; recovery codes are "XXXXX-XXXXX" (11 chars) — a
// single loose schema, since the actual code type is disambiguated by
// trying both verifyTotpCode and verifyAndConsumeRecoveryCode below.
const codeSchema = z.object({ code: z.string().trim().min(6).max(11) });

twoFactorRoute.post('/confirm', requireAuth, async (c) => {
  const user = c.get('user');
  const parsed = codeSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: 'Invalid code' }, 400);

  if (!user.totpSecret) {
    return c.json({ error: 'Call POST /auth/2fa/setup first' }, 409);
  }
  if (!verifyTotpCode(user.totpSecret, parsed.data.code)) {
    return c.json({ error: 'Invalid code' }, 400);
  }

  await getDb().update(users).set({ totpEnabled: true }).where(eq(users.id, user.id));
  const recoveryCodes = await generateRecoveryCodes(user.id);

  // Shown once — the dashboard must display these now, they're never
  // retrievable again (only their hashes are stored).
  return c.json({ recoveryCodes });
});

const disableSchema = z.object({
  password: z.string().min(1),
  code: z.string().trim().min(6).max(11),
});

twoFactorRoute.post('/disable', requireAuth, async (c) => {
  const user = c.get('user');
  const parsed = disableSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: 'Invalid input' }, 400);

  if (!user.totpEnabled || !user.totpSecret) {
    return c.json({ error: '2FA is not enabled' }, 409);
  }
  if (!(await verifyPassword(parsed.data.password, user.passwordHash))) {
    return c.json({ error: 'Invalid password' }, 401);
  }

  const validCode =
    verifyTotpCode(user.totpSecret, parsed.data.code) ||
    (await verifyAndConsumeRecoveryCode(user.id, parsed.data.code));
  if (!validCode) {
    return c.json({ error: 'Invalid code' }, 400);
  }

  const db = getDb();
  await db.update(users).set({ totpEnabled: false, totpSecret: null }).where(eq(users.id, user.id));
  await db.delete(userRecoveryCodes).where(eq(userRecoveryCodes.userId, user.id));

  return c.body(null, 204);
});

const regenerateSchema = z.object({ password: z.string().min(1) });

// The only way to get fresh codes today besides this is fully
// disabling+re-enabling TOTP — this closes that gap directly.
twoFactorRoute.post('/recovery-codes/regenerate', requireAuth, async (c) => {
  const user = c.get('user');
  const parsed = regenerateSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: 'Invalid input' }, 400);

  if (!user.totpEnabled) {
    return c.json({ error: '2FA is not enabled' }, 409);
  }
  if (!(await verifyPassword(parsed.data.password, user.passwordHash))) {
    return c.json({ error: 'Invalid password' }, 401);
  }

  const recoveryCodes = await generateRecoveryCodes(user.id);
  return c.json({ recoveryCodes });
});

// Public (no requireAuth) — the caller only has the short-lived challenge
// cookie set by POST /auth/login, not a real session yet.
twoFactorRoute.post('/verify', async (c) => {
  const challengeToken = getTwoFactorChallengeCookie(c);
  if (!challengeToken) {
    return c.json({ error: 'No pending two-factor challenge' }, 401);
  }

  const rateLimit = checkRateLimit(`2fa-verify:${challengeToken}`);
  if (!rateLimit.allowed) {
    c.header('Retry-After', String(rateLimit.retryAfterSeconds));
    return c.json({ error: 'Too many attempts, log in again' }, 429);
  }

  const parsed = codeSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: 'Invalid code' }, 400);

  const challenge = await getTwoFactorChallenge(challengeToken);
  if (!challenge) {
    clearTwoFactorChallengeCookie(c);
    return c.json({ error: 'Challenge expired — log in again' }, 401);
  }

  const [user] = await getDb().select().from(users).where(eq(users.id, challenge.userId));
  if (!user?.totpSecret) {
    clearTwoFactorChallengeCookie(c);
    return c.json({ error: 'Log in again' }, 401);
  }

  const validCode =
    verifyTotpCode(user.totpSecret, parsed.data.code) ||
    (await verifyAndConsumeRecoveryCode(user.id, parsed.data.code));
  if (!validCode) {
    return c.json({ error: 'Invalid code' }, 400);
  }

  await deleteTwoFactorChallenge(challengeToken);
  clearTwoFactorChallengeCookie(c);

  const { token, expiresAt } = await completeSignIn(user.id, {
    ipAddress: getClientIp(c),
    userAgent: getUserAgent(c),
  });
  setSessionCookie(c, token, expiresAt);

  return c.json({ user: { id: user.id, email: user.email, name: user.name } });
});
