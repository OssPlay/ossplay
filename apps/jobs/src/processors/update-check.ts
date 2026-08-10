import {
	checkForUpdates,
	notifyRootsOfUpdateIfNew,
	readInstanceConfig,
	writeInstanceConfig,
} from "@ossplay/core";

// Moved from apps/api's own setInterval (see MEMORY.md) — same logic,
// running from the always-on apps/jobs role instead of tying background
// scheduling to the HTTP-serving process. Gated on InstanceConfig's
// updates.autoCheck (the dashboard's "Check for updates automatically"
// checkbox, PUT /instance/updates) — re-read on every run rather than
// cached, so toggling the checkbox takes effect on the next scheduled tick
// without restarting this process. Never throws: checkForUpdates() already
// degrades gracefully on network failure.
export async function processUpdateCheck(): Promise<void> {
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
