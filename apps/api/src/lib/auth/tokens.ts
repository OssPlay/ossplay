// Shared opaque-bearer-token scheme: a random token goes to the client, only
// its SHA-256 hash is ever persisted. Used by sessions, 2FA challenges, and
// password reset tokens — a DB leak alone never yields a usable token.
const DEFAULT_TOKEN_BYTES = 32;

export function generateToken(bytes: number = DEFAULT_TOKEN_BYTES): string {
  const buf = new Uint8Array(bytes);
  crypto.getRandomValues(buf);
  return Buffer.from(buf).toString('base64url');
}

export async function hashToken(token: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
  return Buffer.from(digest).toString('hex');
}
