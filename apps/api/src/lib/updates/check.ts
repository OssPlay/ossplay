import { readVersion } from "../server-info";

// Two independent GitHub-hosted signals, merged into one result — both
// satisfy "check via GitHub," no `website`/other infra dependency for the
// check itself:
//   1. GitHub Releases API — what's the newest version. Optional/dismissible
//      on its own.
//   2. RELEASES.json at the repo root (fetched via raw.githubusercontent.com
//      so it always reflects `main`, independent of what's tagged — a
//      same-day recall needs no new release) — the version-redaction/forced-
//      update signal. If the *currently running* version is a key in
//      `recalled`, the update is forced, not optional.
const GITHUB_RELEASES_URL = "https://api.github.com/repos/OssPlay/ossplay/releases/latest";
const RECALL_MANIFEST_URL = "https://raw.githubusercontent.com/OssPlay/ossplay/main/RELEASES.json";
const REQUEST_TIMEOUT_MS = 5000;

export interface UpdateCheckResult {
	currentVersion: string;
	latestVersion: string | null;
	available: boolean;
	releaseNotesUrl: string | null;
	forced: boolean;
	forcedReason: string | null;
	checkedAt: string;
	reason?: string;
}

interface RecallManifest {
	recalled?: Record<string, { reason?: string; severity?: string }>;
}

async function fetchJson<T>(url: string): Promise<T | null> {
	try {
		const res = await fetch(url, {
			signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
			headers: { Accept: "application/json" },
		});
		if (!res.ok) return null;
		return (await res.json()) as T;
	} catch {
		return null;
	}
}

// Minimal semver compare (same shape as infra/updater/index.ts's — kept
// duplicated rather than shared, since infra/updater isn't part of this
// app's TS project/workspace and pulling in a shared package for one small
// function isn't worth the boundary). Only used here to decide "is the
// latest release actually newer," not for downgrade protection.
function isNewer(candidate: string, base: string): boolean {
	const parse = (v: string) => {
		const clean = v.replace(/^v/, "");
		const [core, prerelease] = clean.split("-", 2);
		const parts = (core ?? "").split(".").map((n) => Number.parseInt(n, 10) || 0);
		return { parts, prerelease: prerelease ?? null };
	};
	const pa = parse(candidate);
	const pb = parse(base);
	for (let i = 0; i < 3; i++) {
		const diff = (pa.parts[i] ?? 0) - (pb.parts[i] ?? 0);
		if (diff !== 0) return diff > 0;
	}
	if (pa.prerelease === pb.prerelease) return false;
	if (pa.prerelease === null) return true;
	if (pb.prerelease === null) return false;
	return pa.prerelease > pb.prerelease;
}

// Never throws — an unreachable GitHub (offline instance, rate limit, no
// outbound internet) degrades to "no update info available," it must not
// break the dashboard's overview page or the post-login recall check.
export async function checkForUpdates(): Promise<UpdateCheckResult> {
	const currentVersion = readVersion();
	const checkedAt = new Date().toISOString();

	const [release, manifest] = await Promise.all([
		fetchJson<{ tag_name?: string; html_url?: string }>(GITHUB_RELEASES_URL),
		fetchJson<RecallManifest>(RECALL_MANIFEST_URL),
	]);

	const recall = manifest?.recalled?.[currentVersion];

	if (!release && !manifest) {
		return {
			currentVersion,
			latestVersion: null,
			available: false,
			releaseNotesUrl: null,
			forced: false,
			forcedReason: null,
			checkedAt,
			reason: "Could not reach GitHub to check for updates.",
		};
	}

	const latestVersion = release?.tag_name?.replace(/^v/, "") ?? null;
	const available =
		currentVersion !== "dev" && latestVersion !== null && isNewer(latestVersion, currentVersion);

	return {
		currentVersion,
		latestVersion,
		available,
		releaseNotesUrl: release?.html_url ?? null,
		forced: Boolean(recall),
		forcedReason: recall?.reason ?? null,
		checkedAt,
	};
}
