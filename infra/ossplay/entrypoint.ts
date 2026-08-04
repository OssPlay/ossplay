// Role-dispatch entrypoint for the unified ghcr.io/ossplay/ossplay image.
// docker-compose runs this same image as several containers (api, dashboard,
// worker, updater), each with a different OSSPLAY_ROLE — this just execs the
// matching app's process, so there's one build/publish pipeline but the
// containers still restart/scale/health-check independently, same as when
// they were four separate images.
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
