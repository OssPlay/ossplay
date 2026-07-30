import { getDb, webauthnChallenges } from '@ossplay/db';
import type { WebAuthnCredential } from '@simplewebauthn/server';
import { eq } from 'drizzle-orm';
import type { Context } from 'hono';
import { generateToken, hashToken } from './tokens';

const CHALLENGE_DURATION_MS = 5 * 60 * 1000; // 5 minutes

// Derived per-request from the effective host, the same mechanism
// getPublicUrl() (request-info.ts) uses — not from instanceSettings.domain.
// This makes passkeys work immediately without requiring the (skippable)
// onboarding DNS step. Standard WebAuthn caveat, not a bug: a passkey
// registered against one hostname stops validating if the admin later
// switches domains, since the RP ID is baked into the credential at
// registration time by the authenticator itself.
export function getRpId(c: Context): string {
  const host = c.req.header('x-forwarded-host') ?? c.req.header('host') ?? new URL(c.req.url).host;
  // WebAuthn RP IDs must not include a port.
  return host.split(':')[0] ?? host;
}

export function getRpOrigin(c: Context): string {
  const host = c.req.header('x-forwarded-host') ?? c.req.header('host') ?? new URL(c.req.url).host;
  const proto = c.req.header('x-forwarded-proto') ?? new URL(c.req.url).protocol.replace(':', '');
  return `${proto}://${host}`;
}

type ChallengeType = 'registration' | 'authentication';

// Same hashed-bearer-token pattern as twoFactorChallenges, plus the raw
// challenge string (needed for verify*Response()'s expectedChallenge) and a
// type discriminator so a registration challenge can't be replayed as an
// authentication one. userId is null for the login ceremony — which
// account it's for isn't known until the credential is looked up by
// credentialId at verify time.
export async function createWebauthnChallenge(
  type: ChallengeType,
  challenge: string,
  userId: string | null,
): Promise<{ token: string; expiresAt: Date }> {
  const token = generateToken();
  const id = await hashToken(token);
  const expiresAt = new Date(Date.now() + CHALLENGE_DURATION_MS);
  await getDb().insert(webauthnChallenges).values({ id, userId, challenge, type, expiresAt });
  return { token, expiresAt };
}

export async function getWebauthnChallenge(
  token: string,
  type: ChallengeType,
): Promise<{ userId: string | null; challenge: string } | null> {
  const id = await hashToken(token);
  const [row] = await getDb()
    .select()
    .from(webauthnChallenges)
    .where(eq(webauthnChallenges.id, id));

  if (!row) return null;
  if (row.type !== type) return null;
  if (row.expiresAt.getTime() < Date.now()) return null;

  return { userId: row.userId, challenge: row.challenge };
}

export async function deleteWebauthnChallenge(token: string): Promise<void> {
  const id = await hashToken(token);
  await getDb().delete(webauthnChallenges).where(eq(webauthnChallenges.id, id));
}

// Row <-> library shape conversions: publicKey is stored as base64url text
// (schema is text-typed like every other opaque value in this codebase),
// but @simplewebauthn/server's WebAuthnCredential wants raw bytes.
export function toLibraryCredential(row: {
  credentialId: string;
  publicKey: string;
  counter: number;
  transports: string[] | null;
}): WebAuthnCredential {
  return {
    id: row.credentialId,
    publicKey: new Uint8Array(Buffer.from(row.publicKey, 'base64url')),
    counter: row.counter,
    transports: (row.transports ?? undefined) as WebAuthnCredential['transports'],
  };
}

export function publicKeyToText(publicKey: Uint8Array): string {
  return Buffer.from(publicKey).toString('base64url');
}
