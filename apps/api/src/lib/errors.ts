import type { Context, ErrorHandler, NotFoundHandler } from "hono";
import { HTTPException } from "hono/http-exception";
import type { AppEnv } from "../types";

// The one place every unhandled error in the app funnels through. Every
// route already returns `c.json({ error: "..." }, code)` for expected
// failures (bad input, not found, forbidden) — this exists for the rest:
// invariant-violation throws ("insert did not return the expected row"),
// unexpected DB/network errors, and middleware rejections (hono/csrf
// throws HTTPException on a blocked request). Without this, those fall
// through to Hono's default handler, which returns a plain-text body —
// apps/dashboard/lib/api.ts's apiFetch always tries to `.json()` the
// response, so an unhandled error there reads as an opaque "Request
// failed" instead of anything useful, and any 401-detection logic keyed
// on the response body silently never fires.
export const errorHandler: ErrorHandler<AppEnv> = (err, c: Context<AppEnv>) => {
	if (err instanceof HTTPException) {
		return c.json({ error: err.message || "Request failed" }, err.status);
	}

	// Anything else is a genuine bug or an unexpected failure (DB down,
	// etc.) — log the real error server-side, but never leak its message
	// (stack traces, connection strings, driver internals) to the client.
	console.error(err);
	return c.json({ error: "Something went wrong. Please try again." }, 500);
};

export const notFoundHandler: NotFoundHandler<AppEnv> = (c) => {
	return c.json({ error: "Not found" }, 404);
};
