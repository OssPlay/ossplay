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
// became a real requirement — see @ossplay/mail's send.ts. This file now only
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
	// Set once, the first time any organization is ever created on this
	// instance (see organizations.ts's POST /) — never cleared afterward.
	// This is what lets /onboarding/status's `needsOnboarding` stay false
	// permanently once an instance has been through setup, even if every
	// organization is later deleted (e.g. via the org settings danger zone)
	// — onboarding is a one-time first-run experience, not something that
	// should re-trigger just because the org count happens to hit zero
	// again.
	onboardedAt: string | null;
	domain: {
		name: string | null;
		configuredAt: string | null; // ISO string — plain YAML has no native Date type
		letsEncryptEmail: string | null; // ACME contact email — required by every provider below, not just Let's Encrypt
		certProvider: CertProvider;
		customAcmeUrl: string | null; // only meaningful when certProvider is 'custom'
	};
	updates: {
		// The checkbox controls automatic *checking* only — it surfaces a
		// dashboard badge, it never pulls/restarts unattended. Unattended
		// auto-*apply* is a materially bigger risk and isn't built here.
		autoCheck: boolean;
		lastCheckedAt: string | null;
		lastCheckResult: { available: boolean; latestVersion: string | null; forced: boolean } | null;
		// Dedupes the root "update available" notification (lib/notifications/
		// notify.ts's notifyRootsOfUpdateIfNew) — fires once per newly-seen
		// latestVersion, not on every check that still finds the same version.
		lastNotifiedVersion: string | null;
	};
	// Populated by apps/jobs' repeatable serverIpCheck job (packages/core's
	// detectServerIp) rather than fetched live — GET /instance/overview used
	// to call the outbound ipify.org lookup on every request, which meant
	// every dashboard visit to that page waited on its up-to-3s timeout.
	serverIp: {
		value: string | null;
		checkedAt: string | null;
	};
}

// Only the fields a caller is actually setting — writeInstanceConfig merges
// this over the current file per section, so a caller can patch a subset
// without needing to know or re-send the rest.
export interface InstanceConfigPatch {
	instanceName?: string | null;
	onboardedAt?: string | null;
	domain?: Partial<InstanceConfig["domain"]>;
	updates?: Partial<InstanceConfig["updates"]>;
	serverIp?: Partial<InstanceConfig["serverIp"]>;
}

const DEFAULTS: InstanceConfig = {
	instanceName: null,
	onboardedAt: null,
	domain: {
		name: null,
		configuredAt: null,
		letsEncryptEmail: null,
		certProvider: "letsencrypt",
		customAcmeUrl: null,
	},
	updates: {
		autoCheck: false,
		lastCheckedAt: null,
		lastCheckResult: null,
		lastNotifiedVersion: null,
	},
	serverIp: {
		value: null,
		checkedAt: null,
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
	} catch (err) {
		// ENOENT (file doesn't exist yet — first boot) is the only case where
		// silently falling through to defaults below is correct. Anything
		// else — most notably EISDIR, which happens when this container's
		// bind mount was created before the host-side file existed, so
		// Docker auto-vivified it as a directory instead (see this file's own
		// resetInstanceConfig comment on why the host file must exist first)
		// — must not be swallowed the same way: silently returning defaults
		// here means onboardedAt reads back as null, bouncing an
		// already-onboarded instance's every user straight back through
		// onboarding with no indication why. Logging loudly is what actually
		// makes an incident like that diagnosable from `docker compose logs
		// api` instead of a silent, confusing redirect.
		if ((err as NodeJS.ErrnoException).code !== "ENOENT") {
			console.error(`[instance-config] failed to read ${path}, falling back to defaults:`, err);
		}
	}
	return {
		instanceName: parsed.instanceName ?? DEFAULTS.instanceName,
		onboardedAt: parsed.onboardedAt ?? DEFAULTS.onboardedAt,
		domain: { ...DEFAULTS.domain, ...parsed.domain },
		updates: { ...DEFAULTS.updates, ...parsed.updates },
		serverIp: { ...DEFAULTS.serverIp, ...parsed.serverIp },
	};
}

// Reads-then-writes, so concurrent writers can clobber each other — fine at
// this scale (one operator submitting one form at a time), same consistency
// the single-row DB table effectively had without transactions either.
export function writeInstanceConfig(patch: InstanceConfigPatch): InstanceConfig {
	const current = readInstanceConfig();
	const next: InstanceConfig = {
		instanceName: patch.instanceName !== undefined ? patch.instanceName : current.instanceName,
		onboardedAt: patch.onboardedAt !== undefined ? patch.onboardedAt : current.onboardedAt,
		domain: { ...current.domain, ...patch.domain },
		updates: { ...current.updates, ...patch.updates },
		serverIp: { ...current.serverIp, ...patch.serverIp },
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
		const code = (err as NodeJS.ErrnoException).code;
		if (code === "EBUSY") {
			writeFileSync(path, stringify(next), "utf8");
			rmSync(tmpPath, { force: true });
		} else {
			rmSync(tmpPath, { force: true });
			if (code === "EISDIR") {
				// The destination is a directory, not a file — happens when a
				// container's bind mount was created before the host-side file
				// existed, so Docker auto-vivified a directory there instead (see
				// readInstanceConfig's matching comment). No in-process recovery
				// is possible: the mount itself is wrong-typed, only recreating
				// the container against a correctly-typed host path fixes it.
				throw new Error(
					`Cannot write ${path}: it is a directory, not a file. This usually means the Docker bind mount was created before ${path} existed as a real file on the host — confirm the host-side file exists, then recreate the api container (e.g. \`docker compose up -d --force-recreate --no-deps api\`).`,
				);
			}
			throw err;
		}
	}

	return next;
}

// Overwrites (rather than deletes) the file — a Docker bind-mounted target
// has to keep existing as a file (see the EBUSY handling above and the
// README's `touch infra/ossplay.yaml` prerequisite), so reset means "back
// to defaults," not "gone."
export function resetInstanceConfig(): InstanceConfig {
	return writeInstanceConfig({
		instanceName: DEFAULTS.instanceName,
		onboardedAt: DEFAULTS.onboardedAt,
		domain: DEFAULTS.domain,
		updates: DEFAULTS.updates,
		serverIp: DEFAULTS.serverIp,
	});
}
