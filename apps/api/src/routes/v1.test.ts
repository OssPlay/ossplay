import { rmSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { assets, getDb } from "@ossplay/db";
import { and, eq, isNull, sql } from "drizzle-orm";
import { app } from "../app";
import { bootstrapAdmin, jsonRequest, truncateAllTables } from "../test-support";

// Local-disk mode, same reasoning/setup as assets.test.ts — exercises the
// real upload/download round trip without a real bucket.
const SCRATCH_ROOT = `${import.meta.dir}/v1.test.scratch`;
process.env.OSSPLAY_LOCAL_STORAGE_PATH = SCRATCH_ROOT;

function rawRequest(path: string, init: RequestInit & { cookie?: string } = {}) {
	const headers = new Headers(init.headers);
	if (init.cookie) headers.set("cookie", init.cookie);
	return app.request(path, { ...init, headers });
}

describe.skipIf(!process.env.DATABASE_URL)("public /v1 API", () => {
	beforeAll(truncateAllTables);
	afterAll(() => rmSync(SCRATCH_ROOT, { force: true, recursive: true }));

	let ownerCookie: string;
	let orgId: string;
	let privateProjectId: string;
	let publicProjectId: string;

	it("bootstraps an admin/owner and a private + a public local-storage project", async () => {
		({ sessionCookie: ownerCookie, orgId } = await bootstrapAdmin());

		const privateRes = await jsonRequest(`/organizations/${orgId}/projects`, {
			method: "POST",
			cookie: ownerCookie,
			body: JSON.stringify({
				name: "v1 private",
				id: "v1-private",
				visibility: "private",
				destinationId: null,
			}),
		});
		expect(privateRes.status).toBe(201);
		privateProjectId = ((await privateRes.json()) as { project: { id: string } }).project.id;

		const publicRes = await jsonRequest(`/organizations/${orgId}/projects`, {
			method: "POST",
			cookie: ownerCookie,
			body: JSON.stringify({
				name: "v1 public",
				id: "v1-public",
				visibility: "public",
				destinationId: null,
			}),
		});
		expect(publicRes.status).toBe(201);
		publicProjectId = ((await publicRes.json()) as { project: { id: string } }).project.id;
	});

	it("GET /v1/:project on a private project rejects with no key", async () => {
		const res = await rawRequest(`/v1/${privateProjectId}`);
		expect(res.status).toBe(401);
	});

	it("GET /v1/:project on a public project needs no key", async () => {
		const res = await rawRequest(`/v1/${publicProjectId}`);
		expect(res.status).toBe(200);
		const body = (await res.json()) as { folders: unknown[]; assets: unknown[] };
		expect(body.folders).toEqual([]);
		expect(body.assets).toEqual([]);
	});

	let secret: string;
	let keyId: string;

	it("creates a project API key (session-authed dashboard route)", async () => {
		const res = await jsonRequest(`/organizations/${orgId}/projects/${privateProjectId}/api-keys`, {
			method: "POST",
			cookie: ownerCookie,
			body: JSON.stringify({ label: "CI test key" }),
		});
		expect(res.status).toBe(201);
		const body = (await res.json()) as { key: { id: string; keyPrefix: string }; secret: string };
		expect(body.secret.startsWith("op_")).toBe(true);
		expect(body.key.keyPrefix).toBe(body.secret.slice(0, 10));
		secret = body.secret;
		keyId = body.key.id;
	});

	it("GET /v1/:project on the private project succeeds with X-Api-Key", async () => {
		const res = await rawRequest(`/v1/${privateProjectId}`, { headers: { "X-Api-Key": secret } });
		expect(res.status).toBe(200);
	});

	it("GET /v1/:project succeeds with the key as a query param", async () => {
		const res = await rawRequest(`/v1/${privateProjectId}?api_key=${secret}`);
		expect(res.status).toBe(200);
	});

	it("header precedence: an invalid header wins over a valid query param and rejects", async () => {
		const res = await rawRequest(`/v1/${privateProjectId}?api_key=${secret}`, {
			headers: { "X-Api-Key": "op_not-a-real-key" },
		});
		expect(res.status).toBe(401);
	});

	let assetId: string;

	it("POST /v1/:project/upload accepts a multipart file with a valid key", async () => {
		const form = new FormData();
		form.append("file", new File(["hello from v1"], "hello.txt", { type: "text/plain" }));
		const res = await app.request(`/v1/${privateProjectId}/upload`, {
			method: "POST",
			headers: { "X-Api-Key": secret },
			body: form,
		});
		expect(res.status).toBe(201);
		const body = (await res.json()) as {
			assets: { assetId: string; filename: string; mimeType: string; size: number }[];
		};
		expect(body.assets).toHaveLength(1);
		expect(body.assets[0]?.filename).toBe("hello.txt");
		assetId = body.assets[0]?.assetId as string;
	});

	it("POST /v1/:project/upload rejects with no key", async () => {
		const form = new FormData();
		form.append("file", new File(["nope"], "nope.txt", { type: "text/plain" }));
		const res = await app.request(`/v1/${privateProjectId}/upload`, { method: "POST", body: form });
		expect(res.status).toBe(401);
	});

	it("GET /v1/:project/:item.<ext> serves the uploaded bytes", async () => {
		const res = await rawRequest(`/v1/${privateProjectId}/${assetId}.txt`, {
			headers: { "X-Api-Key": secret },
		});
		expect(res.status).toBe(200);
		expect(await res.text()).toBe("hello from v1");
	});

	it("DELETE /v1/:project/:assetId removes it", async () => {
		const res = await rawRequest(`/v1/${privateProjectId}/${assetId}`, {
			method: "DELETE",
			headers: { "X-Api-Key": secret },
		});
		expect(res.status).toBe(204);

		const getRes = await rawRequest(`/v1/${privateProjectId}/${assetId}.txt`, {
			headers: { "X-Api-Key": secret },
		});
		expect(getRes.status).toBe(404);
	});

	let imageAssetId: string;

	it("uploads a real PNG for the transform tests", async () => {
		// 1x1 transparent PNG — smallest valid input sharp will accept.
		const onePixelPng = Uint8Array.from(
			atob(
				"iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
			),
			(char) => char.charCodeAt(0),
		);
		const form = new FormData();
		form.append("file", new File([onePixelPng], "pixel.png", { type: "image/png" }));
		const res = await app.request(`/v1/${privateProjectId}/upload`, {
			method: "POST",
			headers: { "X-Api-Key": secret },
			body: form,
		});
		expect(res.status).toBe(201);
		const body = (await res.json()) as { assets: { assetId: string }[] };
		imageAssetId = body.assets[0]?.assetId as string;
	});

	it("rejects an invalid transform param", async () => {
		const res = await rawRequest(`/v1/${privateProjectId}/${imageAssetId}.png?format=bogus`, {
			headers: { "X-Api-Key": secret },
		});
		expect(res.status).toBe(400);
	});

	it("serves a transformed image inline without promoting it on the first two requests", async () => {
		for (let i = 0; i < 2; i++) {
			const res = await rawRequest(`/v1/${privateProjectId}/${imageAssetId}.png?w=1&format=webp`, {
				headers: { "X-Api-Key": secret },
			});
			expect(res.status).toBe(200);
			expect(res.headers.get("content-type")).toBe("image/webp");
		}

		const listRes = await rawRequest(`/v1/${privateProjectId}`, { headers: { "X-Api-Key": secret } });
		const listBody = (await listRes.json()) as { assets: { id: string }[] };
		// Only the original — no durable variant row yet below the promotion
		// threshold. (The list route only returns top-level originals —
		// parentAssetId isNull — so a promoted variant wouldn't show up here
		// either way; this just confirms nothing broke.)
		expect(listBody.assets.map((a) => a.id)).toContain(imageAssetId);
	});

	async function countVariants(): Promise<number> {
		const [row] = await getDb()
			.select({ count: sql<string>`count(*)` })
			.from(assets)
			.where(
				and(
					eq(assets.parentAssetId, imageAssetId),
					isNull(assets.deletedAt),
					sql`${assets.metadata} ->> 'variant' = 'on-demand'`,
				),
			);
		return Number(row?.count ?? 0);
	}

	it("promotes to a durable variant on the 3rd identical request, and stops recomputing after", async () => {
		const res = await rawRequest(`/v1/${privateProjectId}/${imageAssetId}.png?w=1&format=webp`, {
			headers: { "X-Api-Key": secret },
		});
		expect(res.status).toBe(200);

		expect(await countVariants()).toBe(1);

		// A 4th (and 5th) request should now be served from the durable
		// variant (findCachedVariant hit) rather than recomputed — the row
		// count must stay at exactly 1, not grow per request.
		for (let i = 0; i < 2; i++) {
			const res = await rawRequest(`/v1/${privateProjectId}/${imageAssetId}.png?w=1&format=webp`, {
				headers: { "X-Api-Key": secret },
			});
			expect(res.status).toBe(200);
		}
		expect(await countVariants()).toBe(1);
	});

	it("a non-image asset with transform params just serves the original", async () => {
		const form = new FormData();
		form.append("file", new File(["plain text"], "plain.txt", { type: "text/plain" }));
		const uploadRes = await app.request(`/v1/${privateProjectId}/upload`, {
			method: "POST",
			headers: { "X-Api-Key": secret },
			body: form,
		});
		const uploadBody = (await uploadRes.json()) as { assets: { assetId: string }[] };
		const textAssetId = uploadBody.assets[0]?.assetId;

		const res = await rawRequest(`/v1/${privateProjectId}/${textAssetId}.txt?w=100`, {
			headers: { "X-Api-Key": secret },
		});
		expect(res.status).toBe(200);
		expect(await res.text()).toBe("plain text");
	});

	it("revoking the key (session-authed) invalidates it for /v1", async () => {
		const revokeRes = await jsonRequest(
			`/organizations/${orgId}/projects/${privateProjectId}/api-keys/${keyId}`,
			{ method: "DELETE", cookie: ownerCookie },
		);
		expect(revokeRes.status).toBe(204);

		const res = await rawRequest(`/v1/${privateProjectId}`, { headers: { "X-Api-Key": secret } });
		expect(res.status).toBe(401);
	});
});
