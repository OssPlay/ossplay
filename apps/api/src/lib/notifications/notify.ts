// Moved to packages/core/src/notifications/notify.ts so apps/jobs (the
// update-check and s3-destination-config-check repeatable jobs) can notify
// too — thin re-export here so every existing apps/api call site's
// relative import keeps working unchanged.
export type { NotifyEntry } from "@ossplay/core";
export { getOrgManagers, notifyRootsOfUpdateIfNew, notifyUsers } from "@ossplay/core";
