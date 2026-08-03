import { getDb, type Session, sessions, users } from "@ossplay/db";
import { and, eq, ne } from "drizzle-orm";
import { generateToken, hashToken } from "./tokens";

const SESSION_DURATION_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
// Sliding expiry: extend back to the full duration once a session gets this
// close to expiring, so an active user is never logged out mid-session.
const SESSION_REFRESH_THRESHOLD_MS = 15 * 24 * 60 * 60 * 1000;

export async function createSession(
	userId: string,
	info?: { ipAddress?: string; userAgent?: string },
): Promise<{ token: string; expiresAt: Date }> {
	const token = generateToken();
	const id = await hashToken(token);
	const expiresAt = new Date(Date.now() + SESSION_DURATION_MS);
	await getDb()
		.insert(sessions)
		.values({ id, userId, expiresAt, ipAddress: info?.ipAddress, userAgent: info?.userAgent });
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

// Creates the session and records users.lastSignInAt/lastSignInIp in one
// place, used by setup, login, and the 2FA verify step so all three "you are
// now signed in" paths stay in sync.
export async function completeSignIn(
	userId: string,
	info?: { ipAddress?: string; userAgent?: string },
): Promise<{ token: string; expiresAt: Date }> {
	const [session] = await Promise.all([
		createSession(userId, info),
		getDb()
			.update(users)
			.set({ lastSignInAt: new Date(), lastSignInIp: info?.ipAddress })
			.where(eq(users.id, userId)),
	]);
	return session;
}

export async function revokeSessionToken(token: string): Promise<void> {
	const id = await hashToken(token);
	await getDb().delete(sessions).where(eq(sessions.id, id));
}

export function listSessionsForUser(userId: string): Promise<Session[]> {
	return getDb().select().from(sessions).where(eq(sessions.userId, userId));
}

// Scoped to userId so a caller can only ever revoke their own sessions, not
// guess another user's session id.
export async function revokeSessionById(id: string, userId: string): Promise<boolean> {
	const deleted = await getDb()
		.delete(sessions)
		.where(and(eq(sessions.id, id), eq(sessions.userId, userId)))
		.returning({ id: sessions.id });
	return deleted.length > 0;
}

// Used after a password change/reset — invalidates every other session for
// the account in case it was compromised. `exceptSessionId` (the caller's
// own current session, already-hashed id) is optional so reset-password
// (no current session to keep) can revoke everything.
export async function revokeAllSessionsForUser(
	userId: string,
	exceptSessionId?: string,
): Promise<void> {
	const db = getDb();
	const condition = exceptSessionId
		? and(eq(sessions.userId, userId), ne(sessions.id, exceptSessionId))
		: eq(sessions.userId, userId);
	await db.delete(sessions).where(condition);
}
