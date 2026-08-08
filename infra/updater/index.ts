// The ghcr.io/ossplay/ossplay:<version>-updater image (PRD.md §2.2) — the
// only one of the four role images with docker-cli/docker-cli-compose baked
// in, and the only one that ever gets the host docker.sock mounted (see
// infra/docker-compose.yml's `updater` service) — deliberately the smallest,
// most isolated image of the four (see infra/ossplay/Dockerfile) since it's
// also the most privileged. Docker-outside-of-Docker: this process talks to
// the HOST docker daemon via that mounted socket, using the `docker`/`docker
// compose` CLIs baked into its own image. It
// depends on infra/docker-compose.yml's `updater` service bind-mounting the
// install directory at the *same absolute path* inside the container as on
// the host — otherwise this file's own relative volume paths resolve wrong
// once the daemon (which only ever sees the host filesystem) reads them.
import { randomBytes, randomUUID } from "node:crypto";

const PORT = 8787;
const TOKEN = process.env.OSSPLAY_UPDATER_TOKEN;
if (!TOKEN) {
	console.error(
		"[updater] OSSPLAY_UPDATER_TOKEN is not set — refusing to start. This endpoint is root-equivalent (docker.sock access), it must never run unauthenticated.",
	);
	process.exit(1);
}

const COMPOSE_FILE = process.env.OSSPLAY_COMPOSE_FILE ?? "docker-compose.yml";
const ENV_FILE = process.env.OSSPLAY_ENV_FILE ?? ".env";
// Same repo the api container checks for releases against (apps/api/src/lib/
// updates/check.ts) — overridable so a fork's updater re-syncs from its own
// releases instead of upstream's.
const REPO = process.env.OSSPLAY_GITHUB_REPO ?? "OssPlay/ossplay";

// Secrets install.sh (website/public/install.sh) generates once, at first
// install — every var here is safe to backfill into an *existing* .env,
// because unlike POSTGRES_PASSWORD (already baked into Postgres's own data
// directory — regenerating it here would just lock the running database
// out) nothing else on the box has this value baked in anywhere else. Keep
// this list in sync with install.sh's own generation list.
const GENERATED_ENV_VARS = ["OSSPLAY_UPDATER_TOKEN", "OSSPLAY_ENCRYPTION_KEY"] as const;

type JobStatus = "pending" | "pulling" | "migrating" | "restarting" | "done" | "failed";

interface Job {
	id: string;
	status: JobStatus;
	version: string;
	log: string[];
	error: string | null;
	startedAt: string;
	finishedAt: string | null;
}

const jobs = new Map<string, Job>();

// Minimal semver compare — enough to reject an accidental downgrade, not a
// full semver-precedence implementation. Strips a leading "v", splits off a
// "-prerelease" suffix, compares major.minor.patch numerically, and treats
// "has a prerelease suffix" as strictly older when the numeric parts are
// equal (matches real semver precedence for the one case this needs).
//
// Prerelease identifiers are compared per real semver precedence (dot-
// separated identifiers, numeric ones compared numerically and always
// lower-precedence than non-numeric ones) rather than one plain string
// comparison — `"alpha.10" < "alpha.9"` is true lexically, which would make
// this reject an update FROM alpha.10 TO alpha.9 as a downgrade... but also
// silently accept the reverse (alpha.9 -> alpha.10) as a downgrade too,
// rejecting a real forward update. Same bug, same fix, as check.ts's
// isNewer — kept duplicated for the same reason that one is (see its
// comment), not shared.
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

function compareVersions(a: string, b: string): number {
	const parse = (v: string) => {
		const clean = v.replace(/^v/, "");
		const [core, prerelease] = clean.split("-", 2);
		const parts = (core ?? "").split(".").map((n) => Number.parseInt(n, 10) || 0);
		return { parts, prerelease: prerelease ?? null };
	};
	const pa = parse(a);
	const pb = parse(b);
	for (let i = 0; i < 3; i++) {
		const diff = (pa.parts[i] ?? 0) - (pb.parts[i] ?? 0);
		if (diff !== 0) return diff;
	}
	if (pa.prerelease === pb.prerelease) return 0;
	if (pa.prerelease === null) return 1;
	if (pb.prerelease === null) return -1;
	return comparePrerelease(pa.prerelease, pb.prerelease);
}

// The box's local docker-compose.yml is a point-in-time copy install.sh
// downloaded once at first install (see website/public/install.sh) — a real
// update only ever pulls new *images* (see applyUpdate below), so a
// compose-file-level change (a new required env var, a new service) would
// otherwise never reach an already-running instance at all, only a fresh
// install. Resolving the target release's actual tag first — rather than
// trusting `version`, which may literally be the string "latest" — mirrors
// install.sh's own reasoning for why it can't just hit GitHub's
// /releases/latest redirect: that skips pre-releases, and during the alpha
// series every release *is* one.
async function resolveReleaseTag(version: string): Promise<string> {
	if (version !== "latest") return version.startsWith("v") ? version : `v${version}`;
	const res = await fetch(`https://api.github.com/repos/${REPO}/releases`, {
		headers: { Accept: "application/vnd.github+json" },
	});
	if (!res.ok)
		throw new Error(`Could not resolve the latest release: GitHub returned ${res.status}`);
	const releases = (await res.json()) as Array<{ tag_name?: string }>;
	// GitHub's /releases list is NOT reliably sorted by version — confirmed
	// against this repo's own real tags, where alpha.9/alpha.8 came back
	// ahead of alpha.12/alpha.11/alpha.10 in one real response (apparently
	// ordered by each release object's `created_at`, which drifts from tag
	// order whenever a release is drafted/edited out of sequence). Taking
	// index 0 as "the latest" would resolve "latest" to an older tag than
	// what's actually newest — same bug, same fix, as
	// apps/api/src/lib/updates/check.ts's pickLatestReleaseTag (kept
	// duplicated, not shared, for the same reason compareVersions is).
	let tag: string | undefined;
	for (const release of releases) {
		if (!release.tag_name) continue;
		if (!tag || compareVersions(release.tag_name, tag) > 0) tag = release.tag_name;
	}
	if (!tag) throw new Error(`No published release found for ${REPO}`);
	return tag;
}

async function syncComposeFile(tag: string, job: Job): Promise<void> {
	const url = `https://github.com/${REPO}/releases/download/${tag}/docker-compose.yml`;
	const res = await fetch(url);
	if (!res.ok) {
		throw new Error(`Could not fetch docker-compose.yml for ${tag} (${url}): ${res.status}`);
	}
	const text = await res.text();
	const path = `${process.cwd()}/${COMPOSE_FILE}`;
	const current = await Bun.file(path)
		.text()
		.catch(() => "");
	if (text === current) return;
	await Bun.write(path, text);
	job.log.push(`Synced ${COMPOSE_FILE} to ${tag}`);
}

// Runs right after syncComposeFile, before the very first `docker compose`
// invocation — `pull` interpolates the *whole* compose file, including every
// service's `environment:` block, not just the ones `pull` itself needs
// (verified empirically: a bare `docker compose pull` fails immediately on a
// missing `${VAR:?...}`, same as `up`). Without this, a release that adds a
// newly-required var (like OSSPLAY_ENCRYPTION_KEY) would leave every
// existing instance's "Check for updates" stuck permanently failing at the
// pull step, with no way to recover short of SSHing in and hand-editing
// .env — silently defeating the whole point of an update button.
async function ensureEnvDefaults(job: Job): Promise<void> {
	const path = `${process.cwd()}/${ENV_FILE}`;
	const current = await Bun.file(path)
		.text()
		.catch(() => "");
	const present = new Set(
		current
			.split("\n")
			.map((line) => line.match(/^([A-Z0-9_]+)=/)?.[1])
			.filter((name): name is string => Boolean(name)),
	);
	const missing = GENERATED_ENV_VARS.filter((name) => !present.has(name));
	if (missing.length === 0) return;
	const additions = missing.map((name) => `${name}=${randomBytes(32).toString("hex")}\n`).join("");
	await Bun.write(
		path,
		(current.endsWith("\n") || current === "" ? current : `${current}\n`) + additions,
	);
	job.log.push(`Backfilled missing .env vars: ${missing.join(", ")}`);
}

async function run(cmd: string[], env: Record<string, string | undefined> = {}): Promise<string> {
	const proc = Bun.spawn(cmd, {
		cwd: process.cwd(),
		env: { ...process.env, ...env },
		stdout: "pipe",
		stderr: "pipe",
	});
	const [stdout, stderr, exitCode] = await Promise.all([
		new Response(proc.stdout).text(),
		new Response(proc.stderr).text(),
		proc.exited,
	]);
	if (exitCode !== 0) {
		throw new Error(`${cmd.join(" ")} failed (exit ${exitCode}): ${stderr || stdout}`);
	}
	return stdout;
}

async function applyUpdate(job: Job) {
	try {
		job.status = "pulling";
		// dev/local dry runs (job.version === "dev") have no matching GitHub
		// release to sync against — the compose file/.env are whatever the
		// dry run set up directly, nothing to fetch.
		if (job.version !== "dev") {
			const tag = await resolveReleaseTag(job.version);
			await syncComposeFile(tag, job);
		}
		await ensureEnvDefaults(job);
		job.log.push(
			await run(["docker", "compose", "-f", COMPOSE_FILE, "pull"], {
				OSSPLAY_VERSION: job.version,
			}),
		);

		job.status = "migrating";
		job.log.push(
			await run(
				[
					"docker",
					"compose",
					"-f",
					COMPOSE_FILE,
					"run",
					"--rm",
					"--entrypoint",
					"sh",
					"api",
					"-c",
					"cd packages/db && bunx drizzle-kit migrate",
				],
				{ OSSPLAY_VERSION: job.version },
			),
		);

		// "Rolling restart of the main app container" per PRD.md §2.2 — this
		// deliberately only restarts api/dashboard, not this updater
		// container itself (see the fire-and-forget block below for why).
		job.status = "restarting";
		job.log.push(
			await run(
				["docker", "compose", "-f", COMPOSE_FILE, "up", "-d", "--no-deps", "api", "dashboard"],
				{ OSSPLAY_VERSION: job.version },
			),
		);

		job.status = "done";
		job.finishedAt = new Date().toISOString();

		// Catch the updater sidecar itself up to the new image it already
		// pulled above, on its own next restart. Deliberately fire-and-forget
		// and outside this job's tracked status: this command is about to
		// kill the very container running it, so there's no way to await it
		// and still report a result.
		void run(["docker", "compose", "-f", COMPOSE_FILE, "up", "-d", "--no-deps", "updater"], {
			OSSPLAY_VERSION: job.version,
		}).catch(() => {});
	} catch (err) {
		job.status = "failed";
		job.error = err instanceof Error ? err.message : String(err);
		job.finishedAt = new Date().toISOString();
	}
}

function unauthorized() {
	return Response.json({ error: "Unauthorized" }, { status: 401 });
}

Bun.serve({
	port: PORT,
	async fetch(req) {
		const url = new URL(req.url);

		if (req.method === "GET" && url.pathname === "/health") {
			return Response.json({ ok: true });
		}

		if (req.method === "POST" && url.pathname === "/update") {
			if (req.headers.get("authorization") !== `Bearer ${TOKEN}`) return unauthorized();

			const body = (await req.json().catch(() => ({}))) as { version?: string };
			const currentVersion = process.env.OSSPLAY_VERSION;
			const targetVersion = body.version && body.version !== "latest" ? body.version : "latest";

			if (
				currentVersion &&
				currentVersion !== "dev" &&
				targetVersion !== "latest" &&
				compareVersions(targetVersion, currentVersion) < 0
			) {
				return Response.json(
					{
						error: `Refusing to downgrade from ${currentVersion} to ${targetVersion} — this repo's migrations are forward-only.`,
					},
					{ status: 400 },
				);
			}

			const job: Job = {
				id: randomUUID(),
				status: "pending",
				version: targetVersion,
				log: [],
				error: null,
				startedAt: new Date().toISOString(),
				finishedAt: null,
			};
			jobs.set(job.id, job);
			void applyUpdate(job);

			return Response.json({ jobId: job.id, status: job.status }, { status: 202 });
		}

		const jobMatch = url.pathname.match(/^\/update\/([^/]+)$/);
		if (req.method === "GET" && jobMatch?.[1]) {
			if (req.headers.get("authorization") !== `Bearer ${TOKEN}`) return unauthorized();
			const job = jobs.get(jobMatch[1]);
			if (!job) return Response.json({ error: "Not found" }, { status: 404 });
			return Response.json(job);
		}

		return Response.json({ error: "Not found" }, { status: 404 });
	},
});

console.log(`[updater] listening on :${PORT}`);
