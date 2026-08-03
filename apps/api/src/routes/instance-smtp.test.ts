import { beforeAll, describe, expect, it } from "bun:test";
import { bootstrapAdmin, jsonRequest, truncateAllTables } from "../test-support";

describe.skipIf(!process.env.DATABASE_URL)("instance SMTP configs", () => {
	beforeAll(async () => {
		await truncateAllTables();
		process.env.OSSPLAY_ENCRYPTION_KEY ??= "c".repeat(64);
	});

	let rootCookie: string;
	let firstConfigId: string;
	let secondConfigId: string;

	it("bootstraps the instance root", async () => {
		({ sessionCookie: rootCookie } = await bootstrapAdmin());
	});

	it("rejects an unauthenticated request", async () => {
		const res = await jsonRequest("/instance/smtp");
		expect(res.status).toBe(401);
	});

	it("GET /instance/smtp starts empty", async () => {
		const res = await jsonRequest("/instance/smtp", { cookie: rootCookie });
		expect(res.status).toBe(200);
		expect(await res.json()).toEqual({ configs: [] });
	});

	it("POST /instance/smtp creates a config and makes the first one default", async () => {
		const res = await jsonRequest("/instance/smtp", {
			method: "POST",
			cookie: rootCookie,
			body: JSON.stringify({
				name: "Primary",
				host: "smtp.example.com",
				port: 587,
				username: "apikey",
				password: "super-secret-password",
				fromAddress: "noreply@example.com",
				fromName: "OSSPlay",
				secure: true,
			}),
		});
		expect(res.status).toBe(201);
		const body = (await res.json()) as {
			config: { id: string; isDefault: boolean; passwordSet: boolean };
		};
		expect(body.config.isDefault).toBe(true);
		expect(body.config.passwordSet).toBe(true);
		firstConfigId = body.config.id;
	});

	it("never echoes the password back", async () => {
		const res = await jsonRequest("/instance/smtp", { cookie: rootCookie });
		const body = (await res.json()) as { configs: Array<Record<string, unknown>> };
		expect(body.configs).toHaveLength(1);
		expect(body.configs[0]).not.toHaveProperty("password");
		expect(body.configs[0]).not.toHaveProperty("passwordEncrypted");
	});

	it("a second config is not default automatically", async () => {
		const res = await jsonRequest("/instance/smtp", {
			method: "POST",
			cookie: rootCookie,
			body: JSON.stringify({
				name: "Backup",
				host: "smtp2.example.com",
				port: 465,
				username: null,
				fromAddress: "noreply2@example.com",
				fromName: null,
				secure: true,
			}),
		});
		expect(res.status).toBe(201);
		const body = (await res.json()) as { config: { id: string; isDefault: boolean } };
		expect(body.config.isDefault).toBe(false);
		secondConfigId = body.config.id;
	});

	it("PUT /instance/smtp/:id updates fields and leaves the password unchanged when omitted", async () => {
		const res = await jsonRequest(`/instance/smtp/${firstConfigId}`, {
			method: "PUT",
			cookie: rootCookie,
			body: JSON.stringify({ fromName: "OSSPlay Renamed" }),
		});
		expect(res.status).toBe(200);
		const body = (await res.json()) as { config: { fromName: string; passwordSet: boolean } };
		expect(body.config.fromName).toBe("OSSPlay Renamed");
		expect(body.config.passwordSet).toBe(true);
	});

	it("PUT /instance/smtp/:id/default swaps which config is default", async () => {
		const res = await jsonRequest(`/instance/smtp/${secondConfigId}/default`, {
			method: "PUT",
			cookie: rootCookie,
		});
		expect(res.status).toBe(204);

		const listRes = await jsonRequest("/instance/smtp", { cookie: rootCookie });
		const { configs } = (await listRes.json()) as {
			configs: Array<{ id: string; isDefault: boolean }>;
		};
		expect(configs.find((cfg) => cfg.id === secondConfigId)?.isDefault).toBe(true);
		expect(configs.find((cfg) => cfg.id === firstConfigId)?.isDefault).toBe(false);
	});

	it("POST /instance/smtp/:id/test fails clearly against an unreachable host", async () => {
		const res = await jsonRequest(`/instance/smtp/${firstConfigId}/test`, {
			method: "POST",
			cookie: rootCookie,
		});
		expect(res.status).toBe(502);
		const body = (await res.json()) as { error: string };
		expect(body.error.length).toBeGreaterThan(0);
	});

	it("DELETE /instance/smtp/:id removes a config", async () => {
		const res = await jsonRequest(`/instance/smtp/${firstConfigId}`, {
			method: "DELETE",
			cookie: rootCookie,
		});
		expect(res.status).toBe(204);

		const listRes = await jsonRequest("/instance/smtp", { cookie: rootCookie });
		const { configs } = (await listRes.json()) as { configs: Array<{ id: string }> };
		expect(configs.some((cfg) => cfg.id === firstConfigId)).toBe(false);
	});

	it("404s for a nonexistent config id", async () => {
		const res = await jsonRequest("/instance/smtp/00000000-0000-0000-0000-000000000000", {
			method: "PUT",
			cookie: rootCookie,
			body: JSON.stringify({ name: "x" }),
		});
		expect(res.status).toBe(404);
	});
});
