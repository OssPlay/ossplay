import { getDb, users, webauthnCredentials } from '@ossplay/db';
import type { AuthenticationResponseJSON, RegistrationResponseJSON } from '@simplewebauthn/server';
import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
} from '@simplewebauthn/server';
import { and, eq } from 'drizzle-orm';
import { Hono } from 'hono';
import { z } from 'zod';
import {
  clearWebauthnChallengeCookie,
  getWebauthnChallengeCookie,
  setSessionCookie,
  setWebauthnChallengeCookie,
} from '../lib/auth/cookie';
import { checkRateLimit } from '../lib/auth/rate-limit';
import { getClientIp, getUserAgent } from '../lib/auth/request-info';
import { completeSignIn } from '../lib/auth/session';
import {
  createWebauthnChallenge,
  deleteWebauthnChallenge,
  getRpId,
  getRpOrigin,
  getWebauthnChallenge,
  publicKeyToText,
  toLibraryCredential,
} from '../lib/auth/webauthn';
import { requireAuth } from '../middleware/require-auth';
import type { AppEnv } from '../types';

export const passkeyRoute = new Hono<AppEnv>();

// A passkey is a full first-factor login replacement, not a second factor
// stacked on password — matches the "Google-like" flow this instance's auth
// pages are modeled on. Enrollment (register-options/register-verify)
// requires an existing session; login (login-options/login-verify) is
// public and, on success, is a complete login with no subsequent TOTP step.

passkeyRoute.post('/register-options', requireAuth, async (c) => {
  const user = c.get('user');
  const existing = await getDb()
    .select({ credentialId: webauthnCredentials.credentialId })
    .from(webauthnCredentials)
    .where(eq(webauthnCredentials.userId, user.id));

  const options = await generateRegistrationOptions({
    rpName: 'OSSPlay',
    rpID: getRpId(c),
    userName: user.email,
    userDisplayName: user.name,
    attestationType: 'none',
    excludeCredentials: existing.map((row) => ({ id: row.credentialId })),
    authenticatorSelection: { residentKey: 'preferred', userVerification: 'preferred' },
  });

  const { token, expiresAt } = await createWebauthnChallenge(
    'registration',
    options.challenge,
    user.id,
  );
  setWebauthnChallengeCookie(c, token, expiresAt);

  return c.json(options);
});

const registerVerifySchema = z.object({
  response: z.custom<RegistrationResponseJSON>((v) => typeof v === 'object' && v !== null),
  deviceName: z.string().trim().max(200).optional(),
});

passkeyRoute.post('/register-verify', requireAuth, async (c) => {
  const user = c.get('user');
  const parsed = registerVerifySchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: 'Invalid input' }, 400);

  const challengeToken = getWebauthnChallengeCookie(c);
  if (!challengeToken) return c.json({ error: 'No pending passkey registration' }, 400);

  const challenge = await getWebauthnChallenge(challengeToken, 'registration');
  if (!challenge || challenge.userId !== user.id) {
    clearWebauthnChallengeCookie(c);
    return c.json({ error: 'Registration challenge expired — try again' }, 400);
  }

  let verification: Awaited<ReturnType<typeof verifyRegistrationResponse>>;
  try {
    verification = await verifyRegistrationResponse({
      response: parsed.data.response,
      expectedChallenge: challenge.challenge,
      expectedOrigin: getRpOrigin(c),
      expectedRPID: getRpId(c),
    });
  } catch (err) {
    return c.json({ error: err instanceof Error ? err.message : 'Verification failed' }, 400);
  }

  if (!verification.verified || !verification.registrationInfo) {
    return c.json({ error: 'Passkey registration could not be verified' }, 400);
  }

  const { credential, credentialDeviceType, credentialBackedUp } = verification.registrationInfo;

  const [row] = await getDb()
    .insert(webauthnCredentials)
    .values({
      userId: user.id,
      credentialId: credential.id,
      publicKey: publicKeyToText(credential.publicKey),
      counter: credential.counter,
      deviceType: credentialDeviceType,
      backedUp: credentialBackedUp,
      transports: credential.transports ?? null,
      deviceName: parsed.data.deviceName,
    })
    .returning();

  await deleteWebauthnChallenge(challengeToken);
  clearWebauthnChallengeCookie(c);

  if (!row) throw new Error('Passkey insert did not return the expected row');
  return c.json(
    { credential: { id: row.id, deviceName: row.deviceName, createdAt: row.createdAt } },
    201,
  );
});

passkeyRoute.get('/', requireAuth, async (c) => {
  const user = c.get('user');
  const rows = await getDb()
    .select({
      id: webauthnCredentials.id,
      deviceName: webauthnCredentials.deviceName,
      createdAt: webauthnCredentials.createdAt,
      lastUsedAt: webauthnCredentials.lastUsedAt,
      transports: webauthnCredentials.transports,
    })
    .from(webauthnCredentials)
    .where(eq(webauthnCredentials.userId, user.id));

  return c.json({ credentials: rows });
});

passkeyRoute.delete('/:id', requireAuth, async (c) => {
  const user = c.get('user');
  const deleted = await getDb()
    .delete(webauthnCredentials)
    .where(
      and(eq(webauthnCredentials.id, c.req.param('id')), eq(webauthnCredentials.userId, user.id)),
    )
    .returning({ id: webauthnCredentials.id });

  if (deleted.length === 0) return c.json({ error: 'Passkey not found' }, 404);
  return c.body(null, 204);
});

// Discoverable/usernameless: no allowCredentials, so the browser prompts
// the user to pick from whatever passkeys it has for this RP ID. Which
// account it's for isn't known until login-verify looks up the credential
// by its id.
passkeyRoute.post('/login-options', async (c) => {
  const options = await generateAuthenticationOptions({
    rpID: getRpId(c),
    userVerification: 'preferred',
  });

  const { token, expiresAt } = await createWebauthnChallenge(
    'authentication',
    options.challenge,
    null,
  );
  setWebauthnChallengeCookie(c, token, expiresAt);

  return c.json(options);
});

const loginVerifySchema = z.object({
  response: z.custom<AuthenticationResponseJSON>((v) => typeof v === 'object' && v !== null),
});

passkeyRoute.post('/login-verify', async (c) => {
  const ip = getClientIp(c);
  const rateLimit = checkRateLimit(`passkey-login:${ip}`);
  if (!rateLimit.allowed) {
    c.header('Retry-After', String(rateLimit.retryAfterSeconds));
    return c.json({ error: 'Too many attempts, try again later' }, 429);
  }

  const parsed = loginVerifySchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: 'Invalid input' }, 400);

  const challengeToken = getWebauthnChallengeCookie(c);
  if (!challengeToken) return c.json({ error: 'No pending passkey login' }, 400);

  const challenge = await getWebauthnChallenge(challengeToken, 'authentication');
  if (!challenge) {
    clearWebauthnChallengeCookie(c);
    return c.json({ error: 'Login challenge expired — try again' }, 400);
  }

  const db = getDb();
  const [credentialRow] = await db
    .select()
    .from(webauthnCredentials)
    .where(eq(webauthnCredentials.credentialId, parsed.data.response.id));
  if (!credentialRow) return c.json({ error: 'Passkey not recognized' }, 401);

  let verification: Awaited<ReturnType<typeof verifyAuthenticationResponse>>;
  try {
    verification = await verifyAuthenticationResponse({
      response: parsed.data.response,
      expectedChallenge: challenge.challenge,
      expectedOrigin: getRpOrigin(c),
      expectedRPID: getRpId(c),
      credential: toLibraryCredential(credentialRow),
    });
  } catch (err) {
    return c.json({ error: err instanceof Error ? err.message : 'Verification failed' }, 400);
  }

  if (!verification.verified) {
    return c.json({ error: 'Passkey login could not be verified' }, 401);
  }

  const [user] = await db.select().from(users).where(eq(users.id, credentialRow.userId));
  if (!user) return c.json({ error: 'Account no longer exists' }, 401);
  // Passkeys are a full password alternative, not just a 2FA step — needs
  // its own disabled check since it never goes through auth.ts's.
  if (user.disabledAt) {
    return c.json({ error: 'This account has been disabled' }, 403);
  }

  await db
    .update(webauthnCredentials)
    .set({ counter: verification.authenticationInfo.newCounter, lastUsedAt: new Date() })
    .where(eq(webauthnCredentials.id, credentialRow.id));

  await deleteWebauthnChallenge(challengeToken);
  clearWebauthnChallengeCookie(c);

  const { token, expiresAt } = await completeSignIn(user.id, {
    ipAddress: ip,
    userAgent: getUserAgent(c),
  });
  setSessionCookie(c, token, expiresAt);

  return c.json({ user: { id: user.id, email: user.email, name: user.name } });
});
