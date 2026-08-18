import { app } from "./app";

const port = Number(process.env.PORT ?? 6101);

// The daily update-check (and every other repeatable/scheduled job) moved
// to apps/jobs — see MEMORY.md. This process is purely HTTP-serving now.

export default {
	port,
	fetch: app.fetch,
};
