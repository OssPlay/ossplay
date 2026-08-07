import { Hono } from "hono";
import { readVersion } from "@/lib/server-info";
import { checkForUpdates } from "@/lib/updates/check";
import { requireAuth, requireInstancePermission } from "@/middleware";
import type { AppEnv } from "@/types";
import { instanceDomainRoute } from "./instance.domain";
import { instanceOverviewRoute } from "./instance.overview";

export const instanceRoute = new Hono<AppEnv>();

// Deliberately outside the root-only gate below: any authenticated user (not
// just root) hits this once per session — via AuthProvider's `/instance`
// SWR call — to learn the running version and whether it's been recalled.
// `requireAuth` alone (no instance:manage_settings) matches the old,
// dedicated `/updates/recall-check` endpoint's contract; see MEMORY.md.
instanceRoute.get("/", requireAuth, async (c) => {
	const [version, result] = await Promise.all([Promise.resolve(readVersion()), checkForUpdates()]);

	return c.json({
		version,
		updates: {
			forced: result.forced,
			forcedReason: result.forcedReason,
			currentVersion: result.currentVersion,
			// Already computed by the same checkForUpdates() call above — no
			// extra cost to also return them. Lets the sidebar's root-only
			// "Update available" button (components/layout/account-dropdown.tsx)
			// reuse this same once-per-session check instead of root needing a
			// separate live request just to learn a version number.
			available: result.available,
			latestVersion: result.latestVersion,
		},
	});
});

instanceRoute.use("*", requireAuth, requireInstancePermission("instance:manage_settings"));

instanceRoute.route("/overview", instanceOverviewRoute);
instanceRoute.route("/domain", instanceDomainRoute);
