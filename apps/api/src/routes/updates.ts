import { Hono } from "hono";
import { checkForUpdates } from "../lib/updates/check";
import { requireAuth } from "../middleware/require-auth";
import type { AppEnv } from "../types";

export const updatesRoute = new Hono<AppEnv>();

updatesRoute.use("*", requireAuth);

// Any authenticated user — not just root — hits this once per session (see
// apps/dashboard's post-login shell) to learn whether the version they're
// currently running has been recalled. Deliberately outside /instance
// (which is root-only end to end): a version recall is a safety notice for
// everyone using the instance, even though only root can act on it. Read-
// only and scoped to just the recall fields, not the full update-check
// payload (release notes URL etc. stay on the root-only /instance/updates
// endpoints).
updatesRoute.get("/recall-check", async (c) => {
	const result = await checkForUpdates();
	return c.json({
		forced: result.forced,
		forcedReason: result.forcedReason,
		currentVersion: result.currentVersion,
	});
});
