// Centralized so setup and login normalize identically — a mismatch here
// would mean a user created during setup couldn't log back in.
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}
