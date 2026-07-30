type Entry = { count: number; resetAt: number };

const WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 5;

// Single-instance, in-memory limiter — fine for the self-hosted single-node
// target this project is built for. A multi-instance deployment would need
// a shared store (e.g. Redis) instead; out of scope for now.
const attempts = new Map<string, Entry>();

export function checkRateLimit(key: string): { allowed: boolean; retryAfterSeconds?: number } {
  const now = Date.now();
  const entry = attempts.get(key);

  if (!entry || entry.resetAt < now) {
    attempts.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return { allowed: true };
  }

  if (entry.count >= MAX_ATTEMPTS) {
    return { allowed: false, retryAfterSeconds: Math.ceil((entry.resetAt - now) / 1000) };
  }

  entry.count += 1;
  return { allowed: true };
}

export function resetRateLimit(key: string): void {
  attempts.delete(key);
}

// Test-only: the limiter is a module-level singleton, so without this,
// integration tests across different files accumulate attempts against the
// same keys (every test request shares the same 'unknown' IP and the same
// bootstrap admin email) and spuriously trip the limit.
export function resetAllRateLimitsForTests(): void {
  attempts.clear();
}
