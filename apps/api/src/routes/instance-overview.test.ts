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
	it("GET /instance/overview reports service versions and a best-effort server IP", async () => {
		const res = await jsonRequest("/instance/overview", { cookie: rootCookie });
		expect(res.status).toBe(200);
		const body = (await res.json()) as {
			serverIp: string | null;
			versions: { api: string | null; dashboard: string | null; worker: string | null };
		};
		expect(typeof body.serverIp === "string" || body.serverIp === null).toBe(true);
		expect(body.versions.api).not.toBeNull();
		expect(body.versions.dashboard).not.toBeNull();
		expect(body.versions.worker).not.toBeNull();
	});

	it("POST /instance/updates/check degrades gracefully — no sidecar endpoint exists yet", async () => {
		const res = await jsonRequest("/instance/updates/check", {
			method: "POST",
			cookie: rootCookie,
		});
		expect(res.status).toBe(200);
		const body = (await res.json()) as { available: boolean; reason: string };
		expect(body.available).toBe(false);
		expect(body.reason.length).toBeGreaterThan(0);
	});
});
