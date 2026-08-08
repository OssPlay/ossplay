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
// Overridable so a fork (different org/repo) still gets working update
// checks against its own releases, rather than checking upstream's.
const GITHUB_REPO = process.env.OSSPLAY_GITHUB_REPO ?? "OssPlay/ossplay";
// /releases/latest explicitly excludes pre-releases and 404s if none exist —
// wrong during the alpha series, where every release published so far *is*
// one (same reasoning install.sh and infra/updater/index.ts's
// resolveReleaseTag already apply). /releases (the list, newest-first) plus
// taking index 0 is what actually reflects the newest published release,
// pre- or not.
const GITHUB_RELEASES_URL = `https://api.github.com/repos/${GITHUB_REPO}/releases`;
const RECALL_MANIFEST_URL = `https://raw.githubusercontent.com/${GITHUB_REPO}/main/RELEASES.json`;
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

// Minimal semver compare (same shape as infra/updater/index.ts's
// compareVersions — kept duplicated rather than shared, since infra/updater
// isn't part of this app's TS project/workspace and pulling in a shared
// package for one small function isn't worth the boundary). Only used here
// to decide "is the latest release actually newer," not for downgrade
// protection.
//
// Prerelease identifiers are compared per real semver precedence rules
// (dot-separated identifiers, numeric identifiers compared numerically and
// always lower-precedence than non-numeric ones, fewer identifiers is
// lower-precedence than a shared prefix with more) rather than one plain
// string comparison — a plain `"alpha.10" > "alpha.9"` is false (lexical
// comparison), which would make this report alpha.9 as newer than an
// already-installed alpha.10. Caught by testing this against the repo's
// actual alpha.9/alpha.10 tags, not hypothetically.
function comparePrerelease(a: string, b: string): number {
	const aParts = a.split(".");
	const bParts = b.split(".");
	for (let i = 0; i < Math.max(aParts.length, bParts.length); i++) {
		const ai = aParts[i];
		const bi = bParts[i];
		if (ai === undefined) return -1;
		if (bi === undefined) return 1;
		const an = Number.parseInt(ai, 10);
		const bn = Number.parseInt(bi, 10);
		const aIsNum = String(an) === ai;
		const bIsNum = String(bn) === bi;
		if (aIsNum && bIsNum) {
			if (an !== bn) return an - bn;
			continue;
		}
		if (aIsNum !== bIsNum) return aIsNum ? -1 : 1;
		if (ai !== bi) return ai < bi ? -1 : 1;
	}
	return 0;
}

// Exported for testing only — checkForUpdates() is the real public API.
export function isNewer(candidate: string, base: string): boolean {
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
	return comparePrerelease(pa.prerelease, pb.prerelease) > 0;
}

// Never throws — an unreachable GitHub (offline instance, rate limit, no
// outbound internet) degrades to "no update info available," it must not
// break the dashboard's overview page or the post-login recall check.
export async function checkForUpdates(): Promise<UpdateCheckResult> {
	const currentVersion = readVersion();
	const checkedAt = new Date().toISOString();

	const [releases, manifest] = await Promise.all([
		fetchJson<Array<{ tag_name?: string; html_url?: string }>>(GITHUB_RELEASES_URL),
		fetchJson<RecallManifest>(RECALL_MANIFEST_URL),
	]);
	const release = releases?.[0] ?? null;

	const recall = manifest?.recalled?.[currentVersion];

	if (!releases && !manifest) {
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
