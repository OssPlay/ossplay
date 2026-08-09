import { app } from "./app";
import { readInstanceConfig, writeInstanceConfig } from "./lib/config/instance-config";
import { notifyRootsOfUpdateIfNew } from "./lib/notifications/notify";
import { checkForUpdates } from "./lib/updates/check";

const port = Number(process.env.PORT ?? 3001);

const AUTO_CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000;

// Gated on InstanceConfig's updates.autoCheck (the dashboard's "Check for
// updates automatically" checkbox, PUT /instance/updates) — re-read on
// every tick rather than captured once, so toggling the checkbox takes
// effect without restarting the api process. A plain setInterval is
// proportionate for one background timer; this isn't reason enough to
// stand up BullMQ-repeatable-job infra (see CLAUDE.md's abstraction-
// threshold rule). Never throws: checkForUpdates() already degrades
// gracefully on network failure.
async function runAutoCheckIfEnabled(): Promise<void> {
	const { updates } = readInstanceConfig();
	if (!updates.autoCheck) return;

	const result = await checkForUpdates();
	writeInstanceConfig({
		updates: {
			lastCheckedAt: result.checkedAt,
			lastCheckResult: {
				available: result.available,
				latestVersion: result.latestVersion,
				forced: result.forced,
			},
		},
	});
	await notifyRootsOfUpdateIfNew(result);
}

void runAutoCheckIfEnabled();
setInterval(runAutoCheckIfEnabled, AUTO_CHECK_INTERVAL_MS);

export default {
	port,
	fetch: app.fetch,
};
