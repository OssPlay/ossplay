import { getDb, type Session, sessions } from '@ossplay/db';
import { eq } from 'drizzle-orm';

const SESSION_TOKEN_BYTES = 32;
const SESSION_DURATION_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
// Sliding expiry: extend back to the full duration once a session gets this
// close to expiring, so an active user is never logged out mid-session.
const SESSION_REFRESH_THRESHOLD_MS = 15 * 24 * 60 * 60 * 1000;

export function generateSessionToken(): string {
  const bytes = new Uint8Array(SESSION_TOKEN_BYTES);
  crypto.getRandomValues(bytes);
  return Buffer.from(bytes).toString('base64url');
}

// Only this hash is ever persisted — the raw token (in the cookie) is never
// written to disk, so a database leak alone doesn't yield a usable session.
async function hashToken(token: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
  return Buffer.from(digest).toString('hex');
}

export async function createSession(userId: string): Promise<{ token: string; expiresAt: Date }> {
  const token = generateSessionToken();
  const id = await hashToken(token);
  const expiresAt = new Date(Date.now() + SESSION_DURATION_MS);
  await getDb().insert(sessions).values({ id, userId, expiresAt });
  return { token, expiresAt };
}

export async function validateSessionToken(token: string): Promise<Session | null> {
  const id = await hashToken(token);
  const db = getDb();
  const [session] = await db.select().from(sessions).where(eq(sessions.id, id));

  if (!session) return null;

  if (session.expiresAt.getTime() < Date.now()) {
    await db.delete(sessions).where(eq(sessions.id, id));
    return null;
  }

  if (session.expiresAt.getTime() - Date.now() < SESSION_REFRESH_THRESHOLD_MS) {
    const expiresAt = new Date(Date.now() + SESSION_DURATION_MS);
    await db.update(sessions).set({ expiresAt }).where(eq(sessions.id, id));
    session.expiresAt = expiresAt;
  }

  return session;
}

export async function revokeSessionToken(token: string): Promise<void> {
  const id = await hashToken(token);
  await getDb().delete(sessions).where(eq(sessions.id, id));
}
