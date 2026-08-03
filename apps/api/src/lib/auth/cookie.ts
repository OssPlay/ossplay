import type { Context } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";

export const SESSION_COOKIE_NAME = "ossplay_session";
export const TWO_FACTOR_COOKIE_NAME = "ossplay_2fa_challenge";
export const WEBAUTHN_CHALLENGE_COOKIE_NAME = "ossplay_webauthn_challenge";

function baseCookieOptions() {
	return {
		httpOnly: true,
		secure: process.env.NODE_ENV === "production",
		sameSite: "Lax" as const,
		path: "/",
	};
}

export function setSessionCookie(c: Context, token: string, expiresAt: Date): void {
	setCookie(c, SESSION_COOKIE_NAME, token, { ...baseCookieOptions(), expires: expiresAt });
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
	setCookie(c, TWO_FACTOR_COOKIE_NAME, token, { ...baseCookieOptions(), expires: expiresAt });
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
		...baseCookieOptions(),
		expires: expiresAt,
	});
}

export function getWebauthnChallengeCookie(c: Context): string | undefined {
	return getCookie(c, WEBAUTHN_CHALLENGE_COOKIE_NAME);
}

export function clearWebauthnChallengeCookie(c: Context): void {
	deleteCookie(c, WEBAUTHN_CHALLENGE_COOKIE_NAME, { path: "/" });
}
