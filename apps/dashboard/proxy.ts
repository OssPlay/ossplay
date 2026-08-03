import { type NextRequest, NextResponse } from "next/server";

const SESSION_COOKIE_NAME = "ossplay_session";
const API_INTERNAL_URL = process.env.API_INTERNAL_URL ?? "http://localhost:3001";

// Accessible regardless of session/setup state — /invite/:token works for
// both a brand-new account and an already-logged-in existing user accepting
// a second org, forgot/reset-password are meant for logged-out use but
// aren't harmful to view while logged in either, and /login/2fa is where a
// user mid-challenge lands: they have a 2FA-challenge cookie but not yet a
// session cookie, so the session-based gate below would otherwise bounce
// them straight back to /login before they can enter a code.
const ALWAYS_PUBLIC_PREFIXES = [
	"/invite/",
	"/forgot-password",
	"/reset-password",
	"/login/2fa",
	"/statics/",
];
const AUTH_PAGES = ["/setup", "/login"];
const ONBOARDING_PREFIX = "/onboarding";

async function checkNeedsSetup(): Promise<boolean> {
	try {
		const res = await fetch(`${API_INTERNAL_URL}/setup/status`, {
			cache: "no-store",
		});
		if (!res.ok) return false;
		const data = (await res.json()) as { needsSetup: boolean };
		return data.needsSetup;
	} catch {
		// API unreachable — fall through to the login page rather than
		// blocking the whole dashboard on a hard error.
		return false;
	}
}

// Mirrors checkNeedsSetup()'s fail-open philosophy, but needs the caller's
// session forwarded — GET /onboarding/status requires auth, unlike
// /setup/status.
async function checkNeedsOnboarding(request: NextRequest): Promise<boolean> {
	try {
		const res = await fetch(`${API_INTERNAL_URL}/onboarding/status`, {
			cache: "no-store",
			headers: { cookie: request.headers.get("cookie") ?? "" },
		});
		if (!res.ok) return false;
		const data = (await res.json()) as { needsOnboarding: boolean };
		return data.needsOnboarding;
	} catch {
		return false;
	}
}

// Cheap redirect gate, not full auth enforcement: a stale/expired session
// cookie is caught by the API returning 401 and handled client-side, not by
// re-validating the session here on every navigation.
//
// Named `proxy` per Next.js 16's rename of the middleware convention (a
// file named middleware.ts with an exported `middleware` function is
// deprecated — see https://nextjs.org/docs/messages/middleware-to-proxy).
export async function proxy(request: NextRequest) {
	const { pathname } = request.nextUrl;

	// /api/* must reach the api service untouched — it has its own auth
	// enforcement (requireAuth). Redirecting these here as if they were page
	// navigations would corrupt every API call made while logged out
	// (including the /setup and /auth/login calls needed to log in at all).
	//
	// In production Caddy reverse-proxies /api/* to the api service directly
	// (see infra/caddy/Caddyfile) — the dashboard never sees these requests at
	// all, so this branch is dev-only. Caddy also sets X-Forwarded-Host/Proto
	// by default; done manually here so getPublicUrl() (used to build
	// invite/reset email links) sees the dashboard's origin in dev too,
	// instead of this rewrite's destination (localhost:3001).
	if (pathname.startsWith("/api/")) {
		if (process.env.NODE_ENV === "production") {
			return NextResponse.next();
		}
		const destination = new URL(
			pathname.replace(/^\/api/, "") + request.nextUrl.search,
			API_INTERNAL_URL,
		);
		const headers = new Headers(request.headers);
		headers.set("x-forwarded-host", request.headers.get("host") ?? request.nextUrl.host);
		headers.set("x-forwarded-proto", request.nextUrl.protocol.replace(":", ""));
		return NextResponse.rewrite(destination, { request: { headers } });
	}

	if (ALWAYS_PUBLIC_PREFIXES.some((prefix) => pathname.startsWith(prefix))) {
		return NextResponse.next();
	}

	const hasSessionCookie = request.cookies.has(SESSION_COOKIE_NAME);
	const isAuthPage = AUTH_PAGES.includes(pathname);

	if (hasSessionCookie) {
		if (isAuthPage) {
			return NextResponse.redirect(new URL("/", request.url));
		}

		const isOnboardingPage =
			pathname === ONBOARDING_PREFIX || pathname.startsWith(`${ONBOARDING_PREFIX}/`);
		const needsOnboarding = await checkNeedsOnboarding(request);

		if (needsOnboarding && !isOnboardingPage) {
			return NextResponse.redirect(new URL(ONBOARDING_PREFIX, request.url));
		}
		if (!needsOnboarding && isOnboardingPage) {
			return NextResponse.redirect(new URL("/", request.url));
		}

		return NextResponse.next();
	}

	const needsSetup = await checkNeedsSetup();
	const target = needsSetup ? "/setup" : "/login";

	if (pathname === target) {
		return NextResponse.next();
	}

	const destination = new URL(target, request.url);
	if (target === "/login") {
		destination.searchParams.set("continue", pathname + request.nextUrl.search);
	}
	return NextResponse.redirect(destination);
}

export const config = {
	matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
