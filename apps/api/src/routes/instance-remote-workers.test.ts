import { beforeAll, describe, expect, it } from "bun:test";
import { bootstrapAdmin, jsonRequest, truncateAllTables } from "../test-support";

describe.skipIf(!process.env.DATABASE_URL)("instance remote workers", () => {
	beforeAll(async () => {
		await truncateAllTables();
		process.env.OSSPLAY_ENCRYPTION_KEY ??= "f".repeat(64);
	});

	let rootCookie: string;

	it("rejects an unauthenticated request", async () => {
		const res = await jsonRequest("/instance/remote-workers");
		expect(res.status).toBe(401);
	});

	it("bootstraps the instance root, an SSH server, and a Lambda destination", async () => {
		({ sessionCookie: rootCookie } = await bootstrapAdmin());

		const genRes = await jsonRequest("/instance/ssh-keys/generate", {
			method: "POST",
			cookie: rootCookie,
			body: JSON.stringify({ type: "ed25519" }),
		});
		const generated = (await genRes.json()) as { publicKey: string; privateKey: string };
		const keyRes = await jsonRequest("/instance/ssh-keys", {
			method: "POST",
			cookie: rootCookie,
			body: JSON.stringify({
				label: "Test key",
				publicKey: generated.publicKey,
				privateKey: generated.privateKey,
			}),
		});
		const { id: sshKeyId } = (await keyRes.json()) as { id: string };

		await jsonRequest("/instance/servers", {
			method: "POST",
			cookie: rootCookie,
			body: JSON.stringify({
				label: "My VPS",
				host: "127.0.0.1",
				port: 22,
				sshUsername: "root",
				sshKeyId,
			}),
		});

		await jsonRequest("/instance/compute-destinations", {
			method: "POST",
			cookie: rootCookie,
			body: JSON.stringify({
				provider: "lambda",
				label: "My Function",
				region: "us-east-1",
				functionArn: "arn:aws:lambda:us-east-1:000000000000:function:test",
				accessKeyId: "AKIAEXAMPLE",
				secretAccessKey: "supersecret",
			}),
		});
	});

	it("GET /instance/remote-workers merges both kinds into one list", async () => {
		const res = await jsonRequest("/instance/remote-workers", { cookie: rootCookie });
		expect(res.status).toBe(200);
		const body = (await res.json()) as {
			workers: Array<{ kind: string; label: string }>;
			total: number;
		};
		expect(body.total).toBe(2);
		expect(body.workers.map((w) => w.kind).sort()).toEqual(["lambda", "ssh"]);
	});

	it("filter_kind=ssh returns only the SSH server", async () => {
		const res = await jsonRequest("/instance/remote-workers?filter_kind=ssh", { cookie: rootCookie });
		const body = (await res.json()) as { workers: Array<{ kind: string; label: string }> };
		expect(body.workers).toHaveLength(1);
		expect(body.workers[0]?.kind).toBe("ssh");
		expect(body.workers[0]?.label).toBe("My VPS");
	});

	it("filter_kind=lambda returns only the compute destination", async () => {
		const res = await jsonRequest("/instance/remote-workers?filter_kind=lambda", {
			cookie: rootCookie,
		});
		const body = (await res.json()) as { workers: Array<{ kind: string; label: string }> };
		expect(body.workers).toHaveLength(1);
		expect(body.workers[0]?.kind).toBe("lambda");
		expect(body.workers[0]?.label).toBe("My Function");
	});

	it("q searches label across both kinds", async () => {
		const res = await jsonRequest("/instance/remote-workers?q=function", { cookie: rootCookie });
		const body = (await res.json()) as { workers: Array<{ label: string }> };
		expect(body.workers).toHaveLength(1);
		expect(body.workers[0]?.label).toBe("My Function");
	});

	it("filter_status=pending returns both (neither has been tested yet)", async () => {
		const res = await jsonRequest("/instance/remote-workers?filter_status=pending", {
			cookie: rootCookie,
		});
		const body = (await res.json()) as { total: number };
		expect(body.total).toBe(2);
	});
});
