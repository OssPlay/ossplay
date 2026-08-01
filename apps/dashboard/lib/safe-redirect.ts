// Shared by every "come back here after you log in" flow (session-expiry
// auto-redirect, proxy.ts's unauthenticated deep-link redirect, the login
// and 2FA pages reading it back) — a `continue` value ultimately comes from
// a URL query string, so it must never be trusted as a same-origin path
// without checking. A bare "//evil.com" or "https://evil.com" is
// protocol-relative/absolute and would silently leave the app; only a
// single-leading-slash relative path is accepted.
export function getSafeContinuePath(value: string | null | undefined): string | null {
  if (!value) return null;
  if (!value.startsWith('/') || value.startsWith('//')) return null;
  // Don't bounce back into an auth page itself — that would either loop
  // (continue=/login) or land somewhere mid-challenge with no session yet.
  if (value === '/login' || value.startsWith('/login/') || value.startsWith('/login?')) {
    return null;
  }
  return value;
}
