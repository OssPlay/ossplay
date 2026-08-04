import { beforeAll, describe, expect, it } from "bun:test";
import { bootstrapAdmin, jsonRequest, truncateAllTables } from "../test-support";

describe.skipIf(!process.env.DATABASE_URL)("instance overview", () => {
	beforeAll(async () => {
		await truncateAllTables();
	});

	let rootCookie: string;

	it("bootstraps the instance root", async () => {
		({ sessionCookie: rootCookie } = await bootstrapAdmin());
	});

	it("rejects an unauthenticated request", async () => {
		const res = await jsonRequest("/instance/overview");
		expect(res.status).toBe(401);
	});

	// detectServerIp() makes a real outbound call (no reliable way to fake a
	// container's public IP any other way) — this doesn't assert what it
	// returns, only that the endpoint degrades to null rather than erroring
	// when that call can't complete (e.g. no outbound internet in CI).
	it("GET /instance/overview reports the running version and a best-effort server IP", async () => {
		const res = await jsonRequest("/instance/overview", { cookie: rootCookie });
		expect(res.status).toBe(200);
		const body = (await res.json()) as { serverIp: string | null; version: string };
		expect(typeof body.serverIp === "string" || body.serverIp === null).toBe(true);
		expect(typeof body.version).toBe("string");
		expect(body.version.length).toBeGreaterThan(0);
	});

	// Real GitHub API calls under the hood (checkForUpdates never throws —
	// see apps/api/src/lib/updates/check.ts) — this only asserts the
	// response shape, not what GitHub actually reports, since CI may or may
	// not have outbound internet.
	it("POST /instance/updates/check returns a well-formed result", async () => {
		const res = await jsonRequest("/instance/updates/check", {
			method: "POST",
			cookie: rootCookie,
		});
		expect(res.status).toBe(200);
		const body = (await res.json()) as {
			currentVersion: string;
			latestVersion: string | null;
			available: boolean;
			forced: boolean;
		};
		expect(typeof body.currentVersion).toBe("string");
		expect(typeof body.available).toBe("boolean");
		expect(typeof body.forced).toBe("boolean");
	});

	it("POST /instance/updates/apply degrades gracefully — no updater sidecar configured in tests", async () => {
		const res = await jsonRequest("/instance/updates/apply", {
			method: "POST",
			cookie: rootCookie,
		});
		expect(res.status).toBe(503);
		const body = (await res.json()) as { started: boolean; reason: string };
		expect(body.started).toBe(false);
		expect(body.reason.length).toBeGreaterThan(0);
	});

	it("rejects an unauthenticated recall check", async () => {
		const res = await jsonRequest("/updates/recall-check");
		expect(res.status).toBe(401);
	});

	// Deliberately outside /instance (root-only) — any authenticated user
	// can check whether their running version was recalled.
	it("GET /updates/recall-check returns a well-formed result for any authenticated user", async () => {
		const res = await jsonRequest("/updates/recall-check", { cookie: rootCookie });
		expect(res.status).toBe(200);
		const body = (await res.json()) as {
			forced: boolean;
			forcedReason: string | null;
			currentVersion: string;
		};
		expect(typeof body.forced).toBe("boolean");
		expect(typeof body.currentVersion).toBe("string");
	});
});
