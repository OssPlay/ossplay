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

	// serverIp comes from InstanceConfig's cache (apps/jobs' serverIpCheck job
	// populates it — this route never calls detectServerIp() live, see
	// instance.overview.ts) — in a fresh test DB/config it's still null, so
	// this only asserts the response shape, not a real IP.
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
	it("POST /instance/overview/updates returns a well-formed result", async () => {
		const res = await jsonRequest("/instance/overview/updates", {
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

	it("POST /instance/overview/updates/apply degrades gracefully — no updater sidecar configured in tests", async () => {
		const res = await jsonRequest("/instance/overview/updates/apply", {
			method: "POST",
			cookie: rootCookie,
		});
		expect(res.status).toBe(503);
		const body = (await res.json()) as { started: boolean; error: string };
		expect(body.started).toBe(false);
		expect(body.error.length).toBeGreaterThan(0);
	});

	it("PUT /instance/overview updates the instance name", async () => {
		const res = await jsonRequest("/instance/overview", {
			method: "PUT",
			cookie: rootCookie,
			body: JSON.stringify({ instanceName: "Acme OSSPlay" }),
		});
		expect(res.status).toBe(200);
		expect(await res.json()).toEqual({ instanceName: "Acme OSSPlay" });

		const getRes = await jsonRequest("/instance/overview", { cookie: rootCookie });
		const getBody = (await getRes.json()) as { instanceName: string | null };
		expect(getBody.instanceName).toBe("Acme OSSPlay");
	});

	it("rejects an unauthenticated request to GET /instance", async () => {
		const res = await jsonRequest("/instance");
		expect(res.status).toBe(401);
	});

	// Deliberately outside the root-only /instance/* gate registered below in
	// routes/instance/index.ts: any authenticated user (not just root) can
	// check whether their running version was recalled. This is what
	// replaced the old, dedicated `/updates/recall-check` endpoint.
	it("GET /instance returns a well-formed result for any authenticated user", async () => {
		const res = await jsonRequest("/instance", { cookie: rootCookie });
		expect(res.status).toBe(200);
		const body = (await res.json()) as {
			version: string;
			updates: {
				forced: boolean;
				forcedReason: string | null;
				currentVersion: string;
			};
		};
		expect(typeof body.version).toBe("string");
		expect(typeof body.updates.forced).toBe("boolean");
		expect(typeof body.updates.currentVersion).toBe("string");
	});
});
