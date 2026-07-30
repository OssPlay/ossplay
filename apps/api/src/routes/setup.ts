import { getDb, users } from '@ossplay/db';
import { isNotNull } from 'drizzle-orm';
import { Hono } from 'hono';
import { z } from 'zod';
import { setSessionCookie } from '../lib/auth/cookie';
import { normalizeEmail } from '../lib/auth/email';
import { hashPassword } from '../lib/auth/password';
import { checkRateLimit } from '../lib/auth/rate-limit';
import { getClientIp, getUserAgent } from '../lib/auth/request-info';
import { completeSignIn } from '../lib/auth/session';
import { getInstanceSettings, isSmtpConfigured } from '../lib/mail/send';
import type { AppEnv } from '../types';

// Org creation moved to `POST /organizations` (see routes/onboarding.ts +
// routes/organizations.ts) — setup now only creates the instance root.
const setupSchema = z.object({
  adminName: z.string().trim().min(1).max(200),
  adminEmail: z.string().trim().email(),
  adminPassword: z.string().min(12).max(200),
});

export const setupRoute = new Hono<AppEnv>();

// Precise per the Authorization Model: "needs setup" means no instance root
// exists yet, not "zero users" — the two happen to be equivalent today since
// setup is the only way any account gets created, but this is the correct
// check going forward.
async function instanceNeedsSetup(): Promise<boolean> {
  const [existingRoot] = await getDb()
    .select({ id: users.id })
    .from(users)
    .where(isNotNull(users.instanceRole))
    .limit(1);
  return !existingRoot;
}

// smtpConfigured lets /forgot-password decide whether to offer the email
// option without needing a separate public endpoint (instanceRoute's guard
// is blanket-applied and this must stay reachable while logged out).
setupRoute.get('/status', async (c) => {
  const settings = await getInstanceSettings();
  return c.json({
    needsSetup: await instanceNeedsSetup(),
    smtpConfigured: isSmtpConfigured(settings.smtp),
  });
});

setupRoute.post('/', async (c) => {
  const ip = getClientIp(c);
  const rateLimit = checkRateLimit(`setup:${ip}`);
  if (!rateLimit.allowed) {
    c.header('Retry-After', String(rateLimit.retryAfterSeconds));
    return c.json({ error: 'Too many attempts' }, 429);
  }

  // Bootstrap-only: this is not a general signup endpoint. Checked again
  // inside the transaction's unique constraint is not enough on its own —
  // this early check gives a clear 409 instead of a generic insert failure.
  if (!(await instanceNeedsSetup())) {
    return c.json({ error: 'Instance is already set up' }, 409);
  }

  const body = await c.req.json().catch(() => null);
  const parsed = setupSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: 'Invalid input', details: parsed.error.flatten() }, 400);
  }

  const { adminName, adminPassword } = parsed.data;
  const adminEmail = normalizeEmail(parsed.data.adminEmail);
  const passwordHash = await hashPassword(adminPassword);

  const [user] = await getDb()
    .insert(users)
    .values({ email: adminEmail, passwordHash, name: adminName, instanceRole: 'root' })
    .returning();
  // A single-row insert's RETURNING always yields exactly one row — drizzle's
  // type just can't express that statically.
  if (!user) {
    throw new Error('Setup insert did not return the expected row');
  }

  const { token, expiresAt } = await completeSignIn(user.id, {
    ipAddress: ip,
    userAgent: getUserAgent(c),
  });
  setSessionCookie(c, token, expiresAt);

  return c.json({ user: { id: user.id, email: user.email, name: user.name } }, 201);
});
