// Moved to packages/core/src/updates/check.ts so apps/jobs (the
// update-check repeatable job) can run it too — thin re-export here so
// every existing apps/api call site's relative import keeps working
// unchanged.
export type { UpdateCheckResult } from "@ossplay/core";
export { checkForUpdates, isNewer, pickLatestReleaseTag } from "@ossplay/core";
