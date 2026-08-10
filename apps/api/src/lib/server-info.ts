// Moved to packages/core/src/server-info.ts so apps/jobs (the update-check
// repeatable job) can read the running version too — thin re-export here
// so every existing apps/api call site's relative import keeps working
// unchanged.
export { detectServerIp, readVersion } from "@ossplay/core";
