import { getDb, passwordResetTokens } from '@ossplay/db';
import { eq } from 'drizzle-orm';
import { generateToken, hashToken } from './tokens';

const RESET_TOKEN_DURATION_MS = 60 * 60 * 1000; // 1 hour

export async function createPasswordResetToken(
  userId: string,
): Promise<{ token: string; expiresAt: Date }> {
  const token = generateToken();
  const id = await hashToken(token);
  const expiresAt = new Date(Date.now() + RESET_TOKEN_DURATION_MS);
  await getDb().insert(passwordResetTokens).values({ id, userId, expiresAt });
  return { token, expiresAt };
}

// Single-use: marks the token used on successful lookup, so it can't be
// replayed even if the caller doesn't end up completing the reset.
export async function consumePasswordResetToken(token: string): Promise<{ userId: string } | null> {
  const id = await hashToken(token);
  const db = getDb();
  const [record] = await db
    .select()
    .from(passwordResetTokens)
    .where(eq(passwordResetTokens.id, id));

  if (!record) return null;
  if (record.usedAt) return null;
  if (record.expiresAt.getTime() < Date.now()) return null;

  await db
    .update(passwordResetTokens)
    .set({ usedAt: new Date() })
    .where(eq(passwordResetTokens.id, id));
  return { userId: record.userId };
}
