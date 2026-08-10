// Moved to packages/core/src/config/instance-config.ts so apps/jobs (the
// update-check repeatable job) can read/write it too — thin re-export here
// so every existing apps/api call site's relative import keeps working
// unchanged. Named, not `export *`, to avoid silently re-exporting
// unrelated packages/core symbols through this module's namespace.
export type {
	CertProvider,
	InstanceConfig,
	InstanceConfigPatch,
} from "@ossplay/core";
export { readInstanceConfig, resetInstanceConfig, writeInstanceConfig } from "@ossplay/core";
