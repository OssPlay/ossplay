// Role-dispatch entrypoint shared by all four ghcr.io/ossplay/ossplay:<ver>-*
// role images (see infra/ossplay/Dockerfile's runner-{api,dashboard,worker,
// updater} stages) — one build definition/version to manage instead of four
// in lockstep, even though each stage only bakes in that role's own code.
// docker-compose sets OSSPLAY_ROLE per service (see infra/docker-compose.yml)
// to pick which process this execs; a mismatched role (e.g. OSSPLAY_ROLE=
// worker against the -api image, which has no apps/worker directory) fails
// fast here rather than the container silently doing nothing useful.
const ROLE_COMMANDS: Record<string, { cwd: string; cmd: string[] }> = {
	api: { cwd: "apps/api", cmd: ["bun", "run", "src/index.ts"] },
	dashboard: { cwd: "apps/dashboard", cmd: ["bun", "run", "server.js"] },
	worker: { cwd: "apps/worker", cmd: ["bun", "run", "src/index.ts"] },
	updater: { cwd: "infra/updater", cmd: ["bun", "run", "index.ts"] },
};

const role = process.env.OSSPLAY_ROLE;
if (!role || !(role in ROLE_COMMANDS)) {
	console.error(
		`[entrypoint] OSSPLAY_ROLE must be one of ${Object.keys(ROLE_COMMANDS).join(", ")} — got ${JSON.stringify(role)}`,
	);
	process.exit(1);
}

// A fresh install's Postgres volume has no schema at all until this runs
// once — nothing else in the fresh-install path does it. infra/updater/
// index.ts's applyUpdate() also runs `drizzle-kit migrate` explicitly, but
// only as part of an OTA update job a root user triggers from the
// dashboard; a brand new `docker compose up -d` never goes through that
// flow, so a first boot previously started apps/api against an empty
// database (every query, including apps/api/src/cli/reset-root.ts, failed
// until someone ran `bun run migrate` by hand). Running it here instead —
// unconditionally, before the api role starts serving — covers both cases
// with one idempotent step (a no-op when there's nothing pending), and
// only api ever needs it: dashboard/worker/updater don't touch the schema
// directly, and worker isn't even part of this compose stack (PRD.md §4).
if (role === "api") {
	const migrate = Bun.spawnSync(["bun", "run", "migrate"], {
		cwd: `${import.meta.dir}/packages/db`,
		stdio: ["inherit", "inherit", "inherit"],
		env: process.env,
	});
	if (!migrate.success) {
		console.error("[entrypoint] database migration failed — refusing to start api");
		process.exit(migrate.exitCode ?? 1);
	}
}

const { cwd, cmd } = ROLE_COMMANDS[role as string];
const proc = Bun.spawn(cmd, {
	cwd: `${import.meta.dir}/${cwd}`,
	stdio: ["inherit", "inherit", "inherit"],
	env: process.env,
});

// Forward termination signals so `docker stop`/a compose restart cleanly
// shuts down the actual app process, not just this dispatcher.
for (const signal of ["SIGTERM", "SIGINT"] as const) {
	process.on(signal, () => proc.kill(signal));
}

const exitCode = await proc.exited;
// Propagate the child's exit code so Docker's restart policy sees a real
// failure (rather than this dispatcher exiting 0 while the app crashed).
process.exit(exitCode ?? 1);
