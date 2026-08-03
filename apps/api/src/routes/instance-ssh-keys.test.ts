import { beforeAll, describe, expect, it } from "bun:test";
import { utils as sshUtils } from "ssh2";
import { bootstrapAdmin, jsonRequest, truncateAllTables } from "../test-support";

describe.skipIf(!process.env.DATABASE_URL)("instance SSH keys", () => {
	beforeAll(async () => {
		await truncateAllTables();
		process.env.OSSPLAY_ENCRYPTION_KEY ??= "e".repeat(64);
	});

	let rootCookie: string;
	let generatedKeyId: string;
	let pastedKeyId: string;

	it("bootstraps the instance root", async () => {
		({ sessionCookie: rootCookie } = await bootstrapAdmin());
	});

	it("rejects an unauthenticated request", async () => {
		const res = await jsonRequest("/instance/ssh-keys");
		expect(res.status).toBe(401);
	});

	it("GET /instance/ssh-keys starts empty", async () => {
		const res = await jsonRequest("/instance/ssh-keys", { cookie: rootCookie });
		expect(res.status).toBe(200);
		expect(await res.json()).toEqual({ keys: [] });
	});

	it("POST /instance/ssh-keys (generate) creates a key and never returns the private key", async () => {
		const res = await jsonRequest("/instance/ssh-keys", {
			method: "POST",
			cookie: rootCookie,
			body: JSON.stringify({ mode: "generate", label: "Generated key" }),
		});
		expect(res.status).toBe(201);
		const body = (await res.json()) as {
			key: {
				id: string;
				label: string;
				publicKey: string;
				fingerprint: string;
				serverCount: number;
			};
		};
		expect(body.key.label).toBe("Generated key");
		expect(body.key.publicKey).toStartWith("ssh-ed25519 ");
		expect(body.key.fingerprint).toStartWith("SHA256:");
		expect(body.key.serverCount).toBe(0);
		expect(body.key).not.toHaveProperty("privateKey");
		expect(body.key).not.toHaveProperty("privateKeyEncrypted");
		generatedKeyId = body.key.id;
	});

	it("POST /instance/ssh-keys (paste) derives the same public key material from a pasted private key", async () => {
		const { private: privateKeyPem, public: publicKeyLine } =
			sshUtils.generateKeyPairSync("ed25519");
		const res = await jsonRequest("/instance/ssh-keys", {
			method: "POST",
			cookie: rootCookie,
			body: JSON.stringify({ mode: "paste", label: "Pasted key", privateKey: privateKeyPem }),
		});
		expect(res.status).toBe(201);
		const body = (await res.json()) as { key: { id: string; publicKey: string } };
		// Same key material, just re-derived server-side — the base64 blob
		// matches even though comments/formatting could differ.
		expect(body.key.publicKey.split(" ")[1]).toBe(publicKeyLine.split(" ")[1]);
		pastedKeyId = body.key.id;
	});

	it("POST /instance/ssh-keys (paste) rejects unparseable input", async () => {
		const res = await jsonRequest("/instance/ssh-keys", {
			method: "POST",
			cookie: rootCookie,
			body: JSON.stringify({ mode: "paste", label: "Bad key", privateKey: "not a key" }),
		});
		expect(res.status).toBe(400);
	});

	it("GET /instance/ssh-keys lists both keys", async () => {
		const res = await jsonRequest("/instance/ssh-keys", { cookie: rootCookie });
		const body = (await res.json()) as { keys: Array<{ id: string }> };
		expect(body.keys).toHaveLength(2);
	});

	it("DELETE /instance/ssh-keys/:id removes an unreferenced key", async () => {
		const res = await jsonRequest(`/instance/ssh-keys/${pastedKeyId}`, {
			method: "DELETE",
			cookie: rootCookie,
		});
		expect(res.status).toBe(204);
	});

	it("DELETE /instance/ssh-keys/:id blocks deleting a key still used by a server", async () => {
		await jsonRequest("/instance/servers", {
			method: "POST",
			cookie: rootCookie,
			body: JSON.stringify({
				label: "Test box",
				host: "127.0.0.1",
				port: 22,
				sshUsername: "root",
				sshKeyId: generatedKeyId,
			}),
		});

		const res = await jsonRequest(`/instance/ssh-keys/${generatedKeyId}`, {
			method: "DELETE",
			cookie: rootCookie,
		});
		expect(res.status).toBe(409);
	});
});
