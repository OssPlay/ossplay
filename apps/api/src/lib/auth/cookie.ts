import type { Context } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";

export const SESSION_COOKIE_NAME = "ossplay_session";
export const TWO_FACTOR_COOKIE_NAME = "ossplay_2fa_challenge";
export const WEBAUTHN_CHALLENGE_COOKIE_NAME = "ossplay_webauthn_challenge";

// NODE_ENV=production is baked into the Docker image unconditionally (see
// infra/ossplay/Dockerfile) — it's set the same way whether Caddy is
// currently serving the bootstrap :80/HTTP config (see infra/caddy/
// Caddyfile) or a real domain over HTTPS, so it was never actually a signal
// of whether *this* connection is secure. A browser silently refuses to
// store a `Secure` cookie set over plain HTTP; using NODE_ENV meant login
// over the bare-IP bootstrap origin looked like it succeeded (the API
// returned 200 + Set-Cookie) but the cookie never actually got stored, so
// every subsequent request came back unauthenticated. Same
// x-forwarded-proto signal getPublicUrl() (request-info.ts) already relies
// on — Caddy sets it based on the scheme it actually received the request
// on, and the dev-only proxy (apps/dashboard/proxy.ts) sets it explicitly
// for the same reason.
function isSecureRequest(c: Context): boolean {
	const forwardedProto = c.req.header("x-forwarded-proto");
	if (forwardedProto) return forwardedProto === "https";
	return new URL(c.req.url).protocol === "https:";
}

function baseCookieOptions(c: Context) {
	return {
		httpOnly: true,
		secure: isSecureRequest(c),
		sameSite: "Lax" as const,
		path: "/",
	};
}

export function setSessionCookie(c: Context, token: string, expiresAt: Date): void {
	setCookie(c, SESSION_COOKIE_NAME, token, { ...baseCookieOptions(c), expires: expiresAt });
}

export function getSessionCookie(c: Context): string | undefined {
	return getCookie(c, SESSION_COOKIE_NAME);
}

export function clearSessionCookie(c: Context): void {
	deleteCookie(c, SESSION_COOKIE_NAME, { path: "/" });
}

// Short-lived — only bridges the gap between password verification and TOTP
// code entry, never a substitute for a real session.
export function setTwoFactorChallengeCookie(c: Context, token: string, expiresAt: Date): void {
	setCookie(c, TWO_FACTOR_COOKIE_NAME, token, { ...baseCookieOptions(c), expires: expiresAt });
}

export function getTwoFactorChallengeCookie(c: Context): string | undefined {
	return getCookie(c, TWO_FACTOR_COOKIE_NAME);
}

export function clearTwoFactorChallengeCookie(c: Context): void {
	deleteCookie(c, TWO_FACTOR_COOKIE_NAME, { path: "/" });
}

// Same short-lived-bridge role as the 2FA challenge cookie, but for the
// WebAuthn registration/authentication ceremony instead.
export function setWebauthnChallengeCookie(c: Context, token: string, expiresAt: Date): void {
	setCookie(c, WEBAUTHN_CHALLENGE_COOKIE_NAME, token, {
		...baseCookieOptions(c),
		expires: expiresAt,
	});
}

export function getWebauthnChallengeCookie(c: Context): string | undefined {
	return getCookie(c, WEBAUTHN_CHALLENGE_COOKIE_NAME);
}

export function clearWebauthnChallengeCookie(c: Context): void {
	deleteCookie(c, WEBAUTHN_CHALLENGE_COOKIE_NAME, { path: "/" });
}
