#!/usr/bin/env bun
// `bun test` used to run straight against the shared dev Postgres
// (DATABASE_URL in .env, port 5433) — every test file's truncateAllTables()
// call reset whatever an operator had set up manually in the dashboard for
// browser verification, silently wiping their state. This spins up a
// throwaway Postgres container instead, migrates it, points DATABASE_URL at
// it for the duration of the run, and tears it down afterward regardless of
// the test outcome — the dev database is never touched.
//
// Usage: bun run test (wired up in package.json) — not meant to be invoked
// directly with test-file args in mind, though `bun run scripts/test-db.ts
// <bun test args>` does forward extra args to `bun test`.

const CONTAINER_NAME = `ossplay-test-db-${crypto.randomUUID().slice(0, 8)}`;
const PG_USER = "ossplay";
const PG_PASSWORD = "ossplay";
const PG_DB = "ossplay";
const API_DIR = `${import.meta.dir}/..`;
const DB_PACKAGE_DIR = `${API_DIR}/../../packages/db`;

function fail(message: string): never {
	console.error(`\nError: ${message}`);
	process.exit(1);
}

async function main() {
	const docker = Bun.spawnSync(["docker", "info"], { stdout: "ignore", stderr: "ignore" });
	if (docker.exitCode !== 0) {
		fail(
			"Docker isn't running — start it and try again (tests need a throwaway Postgres container).",
		);
	}

	console.log(`Starting ephemeral test database (${CONTAINER_NAME})...`);
	const run = Bun.spawnSync(
		[
			"docker",
			"run",
			"-d",
			"--rm",
			"--name",
			CONTAINER_NAME,
			"-e",
			`POSTGRES_USER=${PG_USER}`,
			"-e",
			`POSTGRES_PASSWORD=${PG_PASSWORD}`,
			"-e",
			`POSTGRES_DB=${PG_DB}`,
			// Random host port bound to loopback only — avoids clashing with
			// the dev container (or anything else) on a fixed port.
			"-p",
			"127.0.0.1::5432",
			"postgres:16-alpine",
		],
		{ stdout: "pipe", stderr: "pipe" },
	);
	if (run.exitCode !== 0) {
		fail(`Could not start the test database container.\n${run.stderr.toString()}`);
	}

	let exitCode = 1;
	try {
		const port = resolveHostPort();
		const databaseUrl = `postgres://${PG_USER}:${PG_PASSWORD}@127.0.0.1:${port}/${PG_DB}`;
		await waitUntilReady();

		console.log("Applying migrations...");
		const migrate = Bun.spawnSync(["bunx", "drizzle-kit", "migrate"], {
			cwd: DB_PACKAGE_DIR,
			env: { ...process.env, DATABASE_URL: databaseUrl },
			stdout: "inherit",
			stderr: "inherit",
		});
		if (migrate.exitCode !== 0) fail("Migrations failed against the test database.");

		console.log("Running tests...\n");
		const test = Bun.spawnSync(["bun", "test", ...process.argv.slice(2)], {
			cwd: API_DIR,
			env: { ...process.env, DATABASE_URL: databaseUrl },
			stdout: "inherit",
			stderr: "inherit",
			stdin: "inherit",
		});
		exitCode = test.exitCode ?? 1;
	} finally {
		Bun.spawnSync(["docker", "stop", CONTAINER_NAME], { stdout: "ignore", stderr: "ignore" });
	}

	process.exit(exitCode);
}

function resolveHostPort(): string {
	const inspect = Bun.spawnSync(["docker", "port", CONTAINER_NAME, "5432/tcp"], {
		stdout: "pipe",
		stderr: "pipe",
	});
	if (inspect.exitCode !== 0) {
		fail(`Could not resolve the test database's host port.\n${inspect.stderr.toString()}`);
	}
	// Output looks like "127.0.0.1:54321" — just need the port.
	const match = inspect.stdout
		.toString()
		.trim()
		.match(/:(\d+)$/);
	if (!match?.[1]) fail(`Unexpected \`docker port\` output: ${inspect.stdout.toString()}`);
	return match[1];
}

async function waitUntilReady(): Promise<void> {
	const deadline = Date.now() + 30_000;
	while (Date.now() < deadline) {
		const check = Bun.spawnSync(["docker", "exec", CONTAINER_NAME, "pg_isready", "-U", PG_USER], {
			stdout: "ignore",
			stderr: "ignore",
		});
		if (check.exitCode === 0) return;
		await Bun.sleep(300);
	}
	fail("Test database did not become ready within 30 seconds.");
}

main().catch((err) => {
	fail(err instanceof Error ? err.message : String(err));
});
