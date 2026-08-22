import { app } from "./app";

const port = Number(process.env.PORT ?? 6101);

// The daily update-check (and every other repeatable/scheduled job) moved
// to apps/jobs — see MEMORY.md. This process is purely HTTP-serving now.

export default {
	port,
	fetch: app.fetch,
	// Bun's own default (10s) is tuned for typical API calls, not a large
	// file body still streaming in — a multi-hundred-MB video upload over a
	// slow connection can easily go quiet for longer than that between
	// chunks, and Bun aborts the connection the moment it does ("request
	// timed out after 10 seconds"). Raised well past any realistic upload
	// stall; this only fires on genuine inactivity; a healthy transfer never
	// gets close to it regardless of size.
	idleTimeout: 120,
	// Bun's own default (128MB) silently rejects any local-disk upload past
	// that size with a 413 — and does it abruptly enough that a reverse
	// proxy sitting in front (e.g. the dashboard's dev-mode Next.js rewrite)
	// sees the connection drop mid-write and surfaces its own opaque 500/
	// EPIPE instead of the real 413. This app has no max upload size by
	// design (see next.config.ts's matching proxyClientMaxBodySize comment
	// on the dashboard side) — 10GB is a generous ceiling, not a
	// deliberately-chosen ceiling.
	maxRequestBodySize: 10 * 1024 * 1024 * 1024,
};
