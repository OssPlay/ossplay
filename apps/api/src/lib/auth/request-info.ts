import type { Context } from "hono";

// Caddy sets X-Forwarded-For in front of the api service (see
// infra/caddy/Caddyfile); there's no framework-agnostic way to read the raw
// socket address otherwise, so direct/unproxied requests (e.g. local dev)
// just get 'unknown'.
export function getClientIp(c: Context): string {
	const forwardedFor = c.req.header("x-forwarded-for");
	if (forwardedFor) return forwardedFor.split(",")[0]?.trim() ?? "unknown";
	return c.req.header("x-real-ip") ?? "unknown";
}

export function getUserAgent(c: Context): string | undefined {
	return c.req.header("user-agent");
}

// Used to build absolute links in emails (invite/reset URLs). Caddy sets
// X-Forwarded-Host/X-Forwarded-Proto in front of the api service; the
// dashboard's dev-only proxy (proxy.ts) sets the same headers so links point
// at the dashboard's origin (e.g. localhost:6100) rather than the raw Host
// header, which — since the api is only ever reached through a proxy, never
// directly by a browser — would otherwise reflect whichever proxy hop is
// immediately in front (Caddy's upstream address, or localhost:6101 in dev).
export function getPublicUrl(c: Context): string {
	const host = c.req.header("x-forwarded-host") ?? c.req.header("host") ?? new URL(c.req.url).host;
	const proto = c.req.header("x-forwarded-proto") ?? new URL(c.req.url).protocol.replace(":", "");
	return `${proto}://${host}`;
}
