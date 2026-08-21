import { toast } from "sonner";

export class ApiError extends Error {
	status: number;
	constructor(message: string, status: number) {
		super(message);
		this.status = status;
	}
}

// The shared `<p role="alert">{message}</p>` blocks (components/form-error.tsx)
// and useAction's default error toast both need a human string out of
// whatever apiFetch threw — this is that one place, reused everywhere
// instead of re-deriving it per call site.
export function errorMessage(err: unknown, fallback = "Something went wrong"): string {
	return err instanceof ApiError ? err.message : fallback;
}

// requireAuth (apps/api/src/middleware/require-auth.ts) is the *only*
// place in the API that returns this exact message with a 401 — every
// other 401 (wrong password, wrong 2FA code, invalid login credentials,
// passkey not recognized) uses a distinct, specific message. That's what
// lets this distinguish "your session is actually dead" from "you just
// typed something wrong" with no API changes and no per-call-site opt-out.
const SESSION_EXPIRED_MESSAGE = "Unauthorized";

let sessionExpiredHandled = false; // guard: several in-flight requests can all 401 at once

function handleSessionExpired(): void {
	if (sessionExpiredHandled) return;
	sessionExpiredHandled = true;
	toast.error("Your session has expired", {
		description: "Redirecting you to log in again…",
	});
	// Long enough to actually read the toast before the hard navigation
	// (not router.push — this needs to work with no React context, and a
	// full reload guarantees no stale client state survives into /login)
	// wipes it.
	const returnTo = window.location.pathname + window.location.search;
	setTimeout(() => {
		window.location.href = `/login?continue=${encodeURIComponent(returnTo)}`;
	}, 1500);
}

// Always sets Content-Type: application/json — the api's CSRF middleware
// (hono/csrf) treats requests without it as a risky form submission and
// blocks them, so this is load-bearing, not just a nicety.
export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
	const headers = new Headers(init?.headers);
	headers.set("Content-Type", "application/json");

	const res = await fetch(`/api${path}`, { ...init, headers });

	if (!res.ok) {
		const body = (await res.json().catch(() => null)) as { error?: string } | null;
		if (res.status === 401 && body?.error === SESSION_EXPIRED_MESSAGE) {
			handleSessionExpired();
		}
		throw new ApiError(body?.error ?? "Request failed", res.status);
	}

	if (res.status === 204) {
		return undefined as T;
	}

	return res.json() as Promise<T>;
}

// A sibling of apiFetch for the one shape it can't handle: a multipart
// body (an uploaded file, e.g. add-audio-track-dialog.tsx). Deliberately
// does NOT set Content-Type — fetch derives the correct
// `multipart/form-data; boundary=...` value itself from a FormData body,
// and overriding it (the way apiFetch always does, for its own JSON-only
// case) would break the browser's own boundary generation. The API's CSRF
// middleware still passes for this: a same-origin fetch() call already
// sends `Sec-Fetch-Site: same-origin` on its own, which is the check path
// apiFetch's forced `Content-Type: application/json` was sidestepping,
// not something multipart specifically needs help with.
export async function apiFetchForm<T>(path: string, formData: FormData): Promise<T> {
	const res = await fetch(`/api${path}`, { method: "POST", body: formData });

	if (!res.ok) {
		const body = (await res.json().catch(() => null)) as { error?: string } | null;
		if (res.status === 401 && body?.error === SESSION_EXPIRED_MESSAGE) {
			handleSessionExpired();
		}
		throw new ApiError(body?.error ?? "Request failed", res.status);
	}

	if (res.status === 204) {
		return undefined as T;
	}

	return res.json() as Promise<T>;
}
