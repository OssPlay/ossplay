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
		expect(await res.json()).toEqual({ keys: [], total: 0, page: 0, pageSize: 25 });
	});

	it("POST /instance/ssh-keys/generate returns a fresh Ed25519 keypair", async () => {
		const res = await jsonRequest("/instance/ssh-keys/generate", {
			method: "POST",
			cookie: rootCookie,
			body: JSON.stringify({ type: "ed25519" }),
		});
		expect(res.status).toBe(200);
		const body = (await res.json()) as {
			publicKey: string;
			privateKey: string;
			fingerprint: string;
			keyType: string;
		};
		expect(body.publicKey).toStartWith("ssh-ed25519 ");
		expect(body.privateKey).toContain("PRIVATE KEY");
		expect(body.fingerprint).toStartWith("SHA256:");
		expect(body.keyType).toBe("ssh-ed25519");

		const createRes = await jsonRequest("/instance/ssh-keys", {
			method: "POST",
			cookie: rootCookie,
			body: JSON.stringify({
				label: "Generated key",
				publicKey: body.publicKey,
				privateKey: body.privateKey,
			}),
		});
		expect(createRes.status).toBe(201);
		const created = (await createRes.json()) as { id: string };
		expect(created).not.toHaveProperty("privateKey");
		expect(created).not.toHaveProperty("privateKeyEncrypted");
		generatedKeyId = created.id;
	});

	it("POST /instance/ssh-keys (paste) derives the same public key material from a pasted private key", async () => {
		const { private: privateKeyPem, public: publicKeyLine } =
			sshUtils.generateKeyPairSync("ed25519");
		const res = await jsonRequest("/instance/ssh-keys", {
			method: "POST",
			cookie: rootCookie,
			body: JSON.stringify({
				label: "Pasted key",
				publicKey: publicKeyLine,
				privateKey: privateKeyPem,
			}),
		});
		expect(res.status).toBe(201);
		const { id } = (await res.json()) as { id: string };
		pastedKeyId = id;

		const listRes = await jsonRequest("/instance/ssh-keys", { cookie: rootCookie });
		const { keys } = (await listRes.json()) as { keys: Array<{ id: string; publicKey: string }> };
		const pasted = keys.find((k) => k.id === id);
		// Same key material, just re-derived server-side — the base64 blob
		// matches even though comments/formatting could differ.
		expect(pasted?.publicKey.split(" ")[1]).toBe(publicKeyLine.split(" ")[1]);
	});

	it("POST /instance/ssh-keys rejects unparseable private key input", async () => {
		const res = await jsonRequest("/instance/ssh-keys", {
			method: "POST",
			cookie: rootCookie,
			body: JSON.stringify({
				label: "Bad key",
				publicKey: "ssh-ed25519 AAAA",
				privateKey: "not a key",
			}),
		});
		expect(res.status).toBe(400);
	});

	it("GET /instance/ssh-keys lists both keys", async () => {
		const res = await jsonRequest("/instance/ssh-keys", { cookie: rootCookie });
		const body = (await res.json()) as { keys: Array<{ id: string }>; total: number };
		expect(body.keys).toHaveLength(2);
		expect(body.total).toBe(2);
	});

	it("GET /instance/ssh-keys?q= searches by label", async () => {
		const res = await jsonRequest("/instance/ssh-keys?q=pasted", { cookie: rootCookie });
		const body = (await res.json()) as { keys: Array<{ label: string }> };
		expect(body.keys).toHaveLength(1);
		expect(body.keys[0]?.label).toBe("Pasted key");
	});

	it("GET /instance/ssh-keys?filter_type= filters by key type", async () => {
		const res = await jsonRequest("/instance/ssh-keys?filter_type=ssh-ed25519", {
			cookie: rootCookie,
		});
		const body = (await res.json()) as { keys: unknown[]; total: number };
		expect(body.total).toBe(2);

		const noneRes = await jsonRequest("/instance/ssh-keys?filter_type=ssh-rsa", {
			cookie: rootCookie,
		});
		expect(((await noneRes.json()) as { total: number }).total).toBe(0);
	});

	it("GET /instance/ssh-keys?sort=label&order=desc sorts by label", async () => {
		const res = await jsonRequest("/instance/ssh-keys?sort=label&order=desc", {
			cookie: rootCookie,
		});
		const body = (await res.json()) as { keys: Array<{ label: string }> };
		expect(body.keys.map((k) => k.label)).toEqual(["Pasted key", "Generated key"]);
	});

	it("GET /instance/ssh-keys?page=&per_page= paginates", async () => {
		const res = await jsonRequest("/instance/ssh-keys?per_page=1&page=0", {
			cookie: rootCookie,
		});
		const body = (await res.json()) as { keys: unknown[]; total: number; pageSize: number };
		expect(body.keys).toHaveLength(1);
		expect(body.total).toBe(2);
		expect(body.pageSize).toBe(1);
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
