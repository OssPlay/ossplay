// The `updater` role of the unified ghcr.io/ossplay/ossplay image (PRD.md
// §2.2). Docker-outside-of-Docker: this process talks to the HOST docker
// daemon via the mounted /var/run/docker.sock, using the `docker`/`docker
// compose` CLIs baked into the image (see infra/ossplay/Dockerfile). It
// depends on infra/docker-compose.yml's `updater` service bind-mounting the
// install directory at the *same absolute path* inside the container as on
// the host — otherwise this file's own relative volume paths resolve wrong
// once the daemon (which only ever sees the host filesystem) reads them.
import { randomUUID } from "node:crypto";

const PORT = 8787;
const TOKEN = process.env.OSSPLAY_UPDATER_TOKEN;
if (!TOKEN) {
	console.error(
		"[updater] OSSPLAY_UPDATER_TOKEN is not set — refusing to start. This endpoint is root-equivalent (docker.sock access), it must never run unauthenticated.",
	);
	process.exit(1);
}

const COMPOSE_FILE = process.env.OSSPLAY_COMPOSE_FILE ?? "docker-compose.yml";

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
	return pa.prerelease < pb.prerelease ? -1 : 1;
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
