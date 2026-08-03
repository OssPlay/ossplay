import { beforeAll, describe, expect, it } from "bun:test";
import { bootstrapAdmin, jsonRequest, truncateAllTables } from "../test-support";

describe.skipIf(!process.env.DATABASE_URL)("instance remote servers", () => {
	beforeAll(async () => {
		await truncateAllTables();
		process.env.OSSPLAY_ENCRYPTION_KEY ??= "f".repeat(64);
	});

	let rootCookie: string;
	let keyId: string;
	let serverId: string;

	it("bootstraps the instance root and an SSH key", async () => {
		({ sessionCookie: rootCookie } = await bootstrapAdmin());
		const genRes = await jsonRequest("/instance/ssh-keys/generate", {
			method: "POST",
			cookie: rootCookie,
			body: JSON.stringify({ type: "ed25519" }),
		});
		const generated = (await genRes.json()) as { publicKey: string; privateKey: string };
		const res = await jsonRequest("/instance/ssh-keys", {
			method: "POST",
			cookie: rootCookie,
			body: JSON.stringify({
				label: "Test key",
				publicKey: generated.publicKey,
				privateKey: generated.privateKey,
			}),
		});
		const body = (await res.json()) as { id: string };
		keyId = body.id;
	});

	it("rejects an unauthenticated request", async () => {
		const res = await jsonRequest("/instance/servers");
		expect(res.status).toBe(401);
	});

	it("GET /instance/servers starts empty", async () => {
		const res = await jsonRequest("/instance/servers", { cookie: rootCookie });
		expect(res.status).toBe(200);
		expect(await res.json()).toEqual({ servers: [], total: 0, page: 0, pageSize: 25 });
	});

	it("POST /instance/servers rejects an unknown SSH key", async () => {
		const res = await jsonRequest("/instance/servers", {
			method: "POST",
			cookie: rootCookie,
			body: JSON.stringify({
				label: "Bad box",
				host: "127.0.0.1",
				port: 22,
				sshUsername: "root",
				sshKeyId: "00000000-0000-0000-0000-000000000000",
			}),
		});
		expect(res.status).toBe(400);
	});

	it("POST /instance/servers creates a server pending its first test", async () => {
		const res = await jsonRequest("/instance/servers", {
			method: "POST",
			cookie: rootCookie,
			body: JSON.stringify({
				label: "My VPS",
				host: "127.0.0.1",
				// Nothing listens here — chosen so the connection test below fails
				// fast (ECONNREFUSED) instead of waiting out the connect timeout.
				port: 2,
				sshUsername: "root",
				sshKeyId: keyId,
			}),
		});
		expect(res.status).toBe(201);
		const body = (await res.json()) as { server: { id: string; status: string } };
		expect(body.server.status).toBe("pending");
		serverId = body.server.id;
	});

	it("POST /instance/servers/:id/test fails clearly against an unreachable host and records the error", async () => {
		const res = await jsonRequest(`/instance/servers/${serverId}/test`, {
			method: "POST",
			cookie: rootCookie,
		});
		expect(res.status).toBe(200);
		const body = (await res.json()) as { server: { status: string; lastError: string | null } };
		expect(body.server.status).toBe("error");
		expect(body.server.lastError?.length).toBeGreaterThan(0);
	});

	it("POST /instance/servers/:id/provision is a clearly-labeled placeholder", async () => {
		const res = await jsonRequest(`/instance/servers/${serverId}/provision`, {
			method: "POST",
			cookie: rootCookie,
		});
		expect(res.status).toBe(501);
		const body = (await res.json()) as { provisioned: boolean };
		expect(body.provisioned).toBe(false);
	});

	it("DELETE /instance/servers/:id removes the server", async () => {
		const res = await jsonRequest(`/instance/servers/${serverId}`, {
			method: "DELETE",
			cookie: rootCookie,
		});
		expect(res.status).toBe(204);

		const listRes = await jsonRequest("/instance/servers", { cookie: rootCookie });
		const body = (await listRes.json()) as { servers: unknown[] };
		expect(body.servers).toHaveLength(0);
	});
});
