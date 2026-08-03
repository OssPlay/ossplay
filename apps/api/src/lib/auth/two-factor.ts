import { getDb, twoFactorChallenges, userRecoveryCodes } from "@ossplay/db";
import { and, eq, isNull } from "drizzle-orm";
import { generateToken, hashToken } from "./tokens";

const CHALLENGE_DURATION_MS = 10 * 60 * 1000; // 10 minutes
const RECOVERY_CODE_COUNT = 8;

export async function createTwoFactorChallenge(
	userId: string,
): Promise<{ token: string; expiresAt: Date }> {
	const token = generateToken();
	const id = await hashToken(token);
	const expiresAt = new Date(Date.now() + CHALLENGE_DURATION_MS);
	await getDb().insert(twoFactorChallenges).values({ id, userId, expiresAt });
	return { token, expiresAt };
}

// Read-only — a wrong code shouldn't burn the whole challenge (the user
// would have to re-enter their password to get a new one). Brute-forcing
// repeated guesses is bounded by rate limiting on the verify endpoint and
// this challenge's own short expiry, not by one-shot consumption.
export async function getTwoFactorChallenge(token: string): Promise<{ userId: string } | null> {
	const id = await hashToken(token);
	const [challenge] = await getDb()
		.select()
		.from(twoFactorChallenges)
		.where(eq(twoFactorChallenges.id, id));

	if (!challenge) return null;
	if (challenge.expiresAt.getTime() < Date.now()) return null;

	return { userId: challenge.userId };
}

// Deletes the challenge — call only once the code has actually verified, so
// it can't be replayed to open a second session.
export async function deleteTwoFactorChallenge(token: string): Promise<void> {
	const id = await hashToken(token);
	await getDb().delete(twoFactorChallenges).where(eq(twoFactorChallenges.id, id));
}

// Excludes 0/O and 1/I to avoid ambiguity when a user is typing a code back in.
const RECOVERY_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function generateRecoveryCode(): string {
	const bytes = new Uint8Array(10);
	crypto.getRandomValues(bytes);
	let raw = "";
	for (const byte of bytes) {
		raw += RECOVERY_CODE_ALPHABET[byte % RECOVERY_CODE_ALPHABET.length];
	}
	return `${raw.slice(0, 5)}-${raw.slice(5, 10)}`;
}

// Returns the plaintext codes — the ONLY time they're ever available. Only
// codeHash is persisted (SHA-256, same reasoning as sessions: these are
// high-entropy random codes, not human-chosen secrets).
export async function generateRecoveryCodes(userId: string): Promise<string[]> {
	const db = getDb();
	await db.delete(userRecoveryCodes).where(eq(userRecoveryCodes.userId, userId));

	const codes = Array.from({ length: RECOVERY_CODE_COUNT }, generateRecoveryCode);

	await db.insert(userRecoveryCodes).values(
		await Promise.all(
			codes.map(async (code) => ({
				userId,
				codeHash: await hashToken(code),
			})),
		),
	);

	return codes;
}

// Single-use: marks the code as used on success so it can't be replayed.
export async function verifyAndConsumeRecoveryCode(userId: string, code: string): Promise<boolean> {
	const db = getDb();
	const codeHash = await hashToken(code.trim().toUpperCase());

	const [match] = await db
		.select({ id: userRecoveryCodes.id })
		.from(userRecoveryCodes)
		.where(
			and(
				eq(userRecoveryCodes.userId, userId),
				eq(userRecoveryCodes.codeHash, codeHash),
				isNull(userRecoveryCodes.usedAt),
			),
		);

	if (!match) return false;

	await db
		.update(userRecoveryCodes)
		.set({ usedAt: new Date() })
		.where(eq(userRecoveryCodes.id, match.id));
	return true;
}
