import type { Context } from 'hono';

// Caddy sets X-Forwarded-For in front of the api service (see
// infra/caddy/Caddyfile); there's no framework-agnostic way to read the raw
// socket address otherwise, so direct/unproxied requests (e.g. local dev)
// just get 'unknown'.
export function getClientIp(c: Context): string {
  const forwardedFor = c.req.header('x-forwarded-for');
  if (forwardedFor) return forwardedFor.split(',')[0]?.trim() ?? 'unknown';
  return c.req.header('x-real-ip') ?? 'unknown';
}

export function getUserAgent(c: Context): string | undefined {
  return c.req.header('user-agent');
}

// Used to build absolute links in emails (invite/reset URLs). Caddy sets
// X-Forwarded-Proto in front of the api service; falls back to the request's
// own protocol for local dev where there's no reverse proxy in front.
export function getPublicUrl(c: Context): string {
  const host = c.req.header('host') ?? new URL(c.req.url).host;
  const proto = c.req.header('x-forwarded-proto') ?? new URL(c.req.url).protocol.replace(':', '');
  return `${proto}://${host}`;
}
