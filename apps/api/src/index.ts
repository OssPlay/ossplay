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
};
