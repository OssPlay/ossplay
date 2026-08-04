import { mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { parse, stringify } from "yaml";

// Instance-wide settings, file-backed rather than a DB row — the same file
// works for self-hosted (bind-mounted next to docker-compose.yml) and a
// future SaaS deployment (a per-tenant file/ConfigMap mounted at the same
// well-known path). See OSSPLAY_CONFIG_PATH below.
//
// SMTP used to live here too (a singleton `smtp` section) but moved to the
// smtpConfigs DB table once multiple named configs with a default flag
// became a real requirement — see lib/mail/send.ts. This file now only
// holds domain/TLS settings, which stay genuinely singleton and benefit
// from being readable/hand-editable on disk.
export type CertProvider = "letsencrypt" | "zerossl" | "custom";

export interface InstanceConfig {
	// A display name for this instance — e.g. the operator's company name.
	// Distinct from `domain.name` (a DNS hostname): this is what gets shown
	// in instance-level invite emails ("You've been invited to join
	// Acme Inc"), since a bare hostname is a poor greeting and a domain isn't
	// always configured at all.
	instanceName: string | null;
	domain: {
		name: string | null;
		configuredAt: string | null; // ISO string — plain YAML has no native Date type
		letsEncryptEmail: string | null; // ACME contact email — required by every provider below, not just Let's Encrypt
		certProvider: CertProvider;
		customAcmeUrl: string | null; // only meaningful when certProvider is 'custom'
	};
}

// Only the fields a caller is actually setting — writeInstanceConfig merges
// this over the current file per section, so a caller can patch a subset
// without needing to know or re-send the rest.
export interface InstanceConfigPatch {
	instanceName?: string | null;
	domain?: Partial<InstanceConfig["domain"]>;
}

const DEFAULTS: InstanceConfig = {
	instanceName: null,
	domain: {
		name: null,
		configuredAt: null,
		letsEncryptEmail: null,
		certProvider: "letsencrypt",
		customAcmeUrl: null,
	},
};

function configPath(): string {
	return process.env.OSSPLAY_CONFIG_PATH ?? "./ossplay.yaml";
}

// Merges over DEFAULTS at every level, so a hand-edited file missing a
// field — or missing the section entirely — still parses into a
// fully-populated, correctly-typed object.
export function readInstanceConfig(): InstanceConfig {
	const path = configPath();
	let parsed: Partial<InstanceConfig> = {};
	try {
		parsed = (parse(readFileSync(path, "utf8")) ?? {}) as Partial<InstanceConfig>;
	} catch {
		// File doesn't exist yet (first boot) or can't be read — parsed stays
		// {}, so every field below falls through to its default.
	}
	return {
		instanceName: parsed.instanceName ?? DEFAULTS.instanceName,
		domain: { ...DEFAULTS.domain, ...parsed.domain },
	};
}

// Reads-then-writes, so concurrent writers can clobber each other — fine at
// this scale (one operator submitting one form at a time), same consistency
// the single-row DB table effectively had without transactions either.
export function writeInstanceConfig(patch: InstanceConfigPatch): InstanceConfig {
	const current = readInstanceConfig();
	const next: InstanceConfig = {
		instanceName: patch.instanceName !== undefined ? patch.instanceName : current.instanceName,
		domain: { ...current.domain, ...patch.domain },
	};

	const path = configPath();
	const dir = dirname(path);
	if (dir !== ".") mkdirSync(dir, { recursive: true });

	// Write to a temp file first, so a serialization error can't corrupt the
	// real file, then move it into place. Prefer rename (atomic — a crash
	// mid-write never leaves a torn file behind), but a bind-mounted target
	// (the self-hosted Docker case this file is built for) can't have its
	// directory entry replaced by rename — the kernel returns EBUSY, since
	// that path is itself a mount point. Fall back to an in-place overwrite
	// there; a torn write is still possible on a crash mid-write, but only in
	// that one case, and it's the same risk every other file-based instance
	// config already accepts.
	const tmpPath = `${path}.tmp-${process.pid}-${Date.now()}`;
	writeFileSync(tmpPath, stringify(next), "utf8");
	try {
		renameSync(tmpPath, path);
	} catch (err) {
		if ((err as NodeJS.ErrnoException).code !== "EBUSY") throw err;
		writeFileSync(path, stringify(next), "utf8");
		rmSync(tmpPath, { force: true });
	}

	return next;
}

// Overwrites (rather than deletes) the file — a Docker bind-mounted target
// has to keep existing as a file (see the EBUSY handling above and the
// README's `touch infra/ossplay.yaml` prerequisite), so reset means "back
// to defaults," not "gone."
export function resetInstanceConfig(): InstanceConfig {
	return writeInstanceConfig({ instanceName: DEFAULTS.instanceName, domain: DEFAULTS.domain });
}
