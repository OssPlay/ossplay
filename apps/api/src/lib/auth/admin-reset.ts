import { getDb, userRecoveryCodes, users, webauthnCredentials } from '@ossplay/db';
import { eq } from 'drizzle-orm';
import { revokeAllSessionsForUser } from './session';

// Shared by both the instance-root "force reset" HTTP endpoints
// (routes/instance-users.ts) and the CLI recovery tool
// (src/cli/reset-root.ts), so the two paths can never drift on what
// "reset" actually touches.

export async function setUserPassword(userId: string, passwordHash: string): Promise<void> {
  await getDb().update(users).set({ passwordHash }).where(eq(users.id, userId));
  // A password reset — self-service or forced — should not leave existing
  // sessions valid; whoever the previous password belonged to may not be
  // the one who should still be signed in.
  await revokeAllSessionsForUser(userId);
}

// Clears every second factor: TOTP, recovery codes, and passkeys. A user
// "locked out" is, by definition, unable to complete whichever second
// factor is blocking them — clearing only the password would leave them
// stuck at the next prompt.
export async function clearUserSecondFactors(userId: string): Promise<void> {
  const db = getDb();
  await db.update(users).set({ totpEnabled: false, totpSecret: null }).where(eq(users.id, userId));
  await db.delete(userRecoveryCodes).where(eq(userRecoveryCodes.userId, userId));
  await db.delete(webauthnCredentials).where(eq(webauthnCredentials.userId, userId));
  await revokeAllSessionsForUser(userId);
}
