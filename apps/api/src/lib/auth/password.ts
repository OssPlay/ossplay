// Bun ships argon2id natively — no dependency needed for password hashing.
const HASH_OPTIONS = {
  algorithm: 'argon2id',
  // OWASP's current minimum recommendation for argon2id.
  memoryCost: 19456,
  timeCost: 2,
} as const;

export function hashPassword(password: string): Promise<string> {
  return Bun.password.hash(password, HASH_OPTIONS);
}

export function verifyPassword(password: string, hash: string): Promise<boolean> {
  return Bun.password.verify(password, hash);
}
