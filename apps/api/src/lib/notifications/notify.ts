// Moved to packages/core/src/notifications/notify.ts so apps/jobs (the
// update-check and s3-destination-config-check repeatable jobs) can notify
// too — thin re-export here so every existing apps/api call site's
// relative import keeps working unchanged.
import { type NotifyEntry, notifyUsers, publishEvent } from "@ossplay/core";
import { getRedisConnection } from "../queue";

export type { NotifyEntry } from "@ossplay/core";
export { getOrgManagers, notifyRootsOfUpdateIfNew, notifyUsers } from "@ossplay/core";

// notifyUsers writes the durable inbox row; the SSE push is a separate,
// best-effort side channel for the notification bell to pick up
// immediately instead of on its next poll — same "publish after write"
// shape as every asset-status transition (see events-bus.ts). apps/api-only
// (needs a Redis connection), not moved into packages/core with notifyUsers
// itself — apps/jobs' own notifyRootsOfUpdateIfNew call site has no
// Redis-publish wiring and doesn't need one (see notifications.ts's own
// comment on why "update available" stays poll-only).
export async function notifyUsersAndPublish(userIds: string[], entry: NotifyEntry): Promise<void> {
	await notifyUsers(userIds, entry);
	const redis = getRedisConnection();
	for (const userId of userIds) {
		await publishEvent(redis, { type: "notification", userId });
	}
}
