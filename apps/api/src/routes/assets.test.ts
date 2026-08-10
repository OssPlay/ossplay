import { rmSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { bootstrapAdmin, jsonRequest, truncateAllTables } from "../test-support";
import { app } from "../app";

// Local-disk mode, not S3 — lets this file exercise the real upload/
// confirm/content round trip without needing network access or a real
// bucket. Every project created here omits destinationId, so
// resolveStorageDriver always falls back to local disk. Set before any
// request runs; resolveStorageDriver reads this per-call, not once at
// import.
const SCRATCH_ROOT = `${import.meta.dir}/assets.test.scratch`;
process.env.OSSPLAY_LOCAL_STORAGE_PATH = SCRATCH_ROOT;

type Asset = {
	id: string;
	filename: string;
	mimeType: string;
	status: string;
	size: number | null;
	folderId: string | null;
};

function rawRequest(path: string, init: RequestInit & { cookie?: string } = {}) {
	const headers = new Headers(init.headers);
	if (init.cookie) headers.set("cookie", init.cookie);
	return app.request(path, { ...init, headers });
}

describe.skipIf(!process.env.DATABASE_URL)("assets", () => {
	beforeAll(truncateAllTables);
	afterAll(() => rmSync(SCRATCH_ROOT, { force: true, recursive: true }));

	let ownerCookie: string;
	let orgId: string;
	let projectId: string;

	it("bootstraps an admin/owner and a local-storage project", async () => {
		({ sessionCookie: ownerCookie, orgId } = await bootstrapAdmin());
		const res = await jsonRequest(`/organizations/${orgId}/projects`, {
			method: "POST",
			cookie: ownerCookie,
			body: JSON.stringify({
				name: "Local drive test",
				id: "local-drive-test",
				visibility: "private",
				destinationId: null,
			}),
		});
		expect(res.status).toBe(201);
		const body = (await res.json()) as { project: { id: string } };
		projectId = body.project.id;
	});

	let assetId: string;
	let uploadTarget: string;

	it("POST .../uploads creates a pending asset and a local upload target", async () => {
		const res = await jsonRequest(`/organizations/${orgId}/projects/${projectId}/uploads`, {
			method: "POST",
			cookie: ownerCookie,
			body: JSON.stringify({ folderId: null, filename: "hello.txt", mimeType: "text/plain" }),
		});
		expect(res.status).toBe(201);
		const body = (await res.json()) as { assetId: string; uploadTarget: string; key: string };
		expect(body.key).toBe(`${projectId}/${body.assetId}.txt`);
		expect(body.uploadTarget).toContain("/local-upload");
		assetId = body.assetId;
		uploadTarget = body.uploadTarget;
	});

	it("PUT the local-upload target writes the real bytes", async () => {
		// application/octet-stream, not the fetch default of text/plain for a
		// bare string body — hono/csrf's own default treats text/plain (a
		// form-submittable content type) on a non-GET request with no Origin
		// header as a cross-site risk and 403s it. A real upload client sets
		// an explicit content type for the same reason a real browser upload
		// would (a raw <input type=file> PUT is never form-encoded).
		const res = await rawRequest(uploadTarget, {
			method: "PUT",
			cookie: ownerCookie,
			headers: { "content-type": "application/octet-stream" },
			body: "hello world",
		});
		expect(res.status).toBe(204);
	});

	it("POST .../confirm stats the object, marks it ready (no processing queue for text/plain)", async () => {
		const res = await jsonRequest(
			`/organizations/${orgId}/projects/${projectId}/assets/${assetId}/confirm`,
			{ method: "POST", cookie: ownerCookie },
		);
		expect(res.status).toBe(200);
		const body = (await res.json()) as { asset: Asset };
		expect(body.asset.status).toBe("ready");
		expect(body.asset.size).toBe(11);
	});

	it("GET .../content streams the real bytes back", async () => {
		const res = await rawRequest(
			`/organizations/${orgId}/projects/${projectId}/assets/${assetId}/content`,
			{ cookie: ownerCookie },
		);
		expect(res.status).toBe(200);
		expect(res.headers.get("content-type")).toBe("text/plain");
		expect(await res.text()).toBe("hello world");
	});

	it("GET .../activity shows the upload event", async () => {
		const res = await jsonRequest(
			`/organizations/${orgId}/projects/${projectId}/assets/${assetId}/activity`,
			{ cookie: ownerCookie },
		);
		const body = (await res.json()) as { activity: Array<{ action: string }> };
		expect(body.activity.map((a) => a.action)).toEqual(["uploaded"]);
	});

	it("PATCH .../assets/:id renames and logs activity", async () => {
		const res = await jsonRequest(
			`/organizations/${orgId}/projects/${projectId}/assets/${assetId}`,
			{ method: "PATCH", cookie: ownerCookie, body: JSON.stringify({ filename: "greeting.txt" }) },
		);
		expect(res.status).toBe(200);
		const body = (await res.json()) as { asset: Asset };
		expect(body.asset.filename).toBe("greeting.txt");

		const activityRes = await jsonRequest(
			`/organizations/${orgId}/projects/${projectId}/assets/${assetId}/activity`,
			{ cookie: ownerCookie },
		);
		const activityBody = (await activityRes.json()) as {
			activity: Array<{ action: string; fromValue: string | null; toValue: string | null }>;
		};
		expect(activityBody.activity[0]).toMatchObject({
			action: "renamed",
			fromValue: "hello.txt",
			toValue: "greeting.txt",
		});
	});

	it("trash -> restore round trip", async () => {
		const trashRes = await jsonRequest(
			`/organizations/${orgId}/projects/${projectId}/assets/${assetId}/trash`,
			{ method: "POST", cookie: ownerCookie },
		);
		expect(trashRes.status).toBe(204);

		const contentRes = await rawRequest(
			`/organizations/${orgId}/projects/${projectId}/assets/${assetId}/content`,
			{ cookie: ownerCookie },
		);
		expect(contentRes.status).toBe(404);

		const restoreRes = await jsonRequest(
			`/organizations/${orgId}/projects/${projectId}/assets/${assetId}/restore`,
			{ method: "POST", cookie: ownerCookie },
		);
		expect(restoreRes.status).toBe(204);

		const contentAgain = await rawRequest(
			`/organizations/${orgId}/projects/${projectId}/assets/${assetId}/content`,
			{ cookie: ownerCookie },
		);
		expect(contentAgain.status).toBe(200);
	});

	it("DELETE forever removes the DB row and the real file", async () => {
		await jsonRequest(`/organizations/${orgId}/projects/${projectId}/assets/${assetId}/trash`, {
			method: "POST",
			cookie: ownerCookie,
		});
		const res = await jsonRequest(
			`/organizations/${orgId}/projects/${projectId}/assets/${assetId}`,
			{ method: "DELETE", cookie: ownerCookie },
		);
		expect(res.status).toBe(204);

		const contentRes = await rawRequest(
			`/organizations/${orgId}/projects/${projectId}/assets/${assetId}/content`,
			{ cookie: ownerCookie },
		);
		expect(contentRes.status).toBe(404);
	});

	it("POST .../uploads/batch creates nested folders and pending assets from relative paths", async () => {
		const res = await jsonRequest(`/organizations/${orgId}/projects/${projectId}/uploads/batch`, {
			method: "POST",
			cookie: ownerCookie,
			body: JSON.stringify({
				folderId: null,
				items: [
					{ relativePath: "", filename: "root.txt", mimeType: "text/plain" },
					{ relativePath: "Docs", filename: "a.txt", mimeType: "text/plain" },
					{ relativePath: "Docs/2024", filename: "b.txt", mimeType: "text/plain" },
					{ relativePath: "Docs/2024", filename: "c.txt", mimeType: "text/plain" },
				],
			}),
		});
		expect(res.status).toBe(201);
		const body = (await res.json()) as {
			items: Array<{ relativePath: string; filename: string; assetId: string }>;
		};
		expect(body.items).toHaveLength(4);

		const driveRes = await jsonRequest(`/organizations/${orgId}/projects/${projectId}/drive`, {
			cookie: ownerCookie,
		});
		const driveBody = (await driveRes.json()) as {
			childFolders: Array<{ id: string; name: string }>;
		};
		expect(driveBody.childFolders.map((f) => f.name)).toEqual(["Docs"]);

		const docsId = driveBody.childFolders[0]?.id as string;
		const docsRes = await jsonRequest(
			`/organizations/${orgId}/projects/${projectId}/drive?folderId=${docsId}`,
			{ cookie: ownerCookie },
		);
		const docsBody = (await docsRes.json()) as {
			childFolders: Array<{ name: string }>;
			childAssets: { items: Array<{ filename: string }> };
		};
		expect(docsBody.childFolders.map((f) => f.name)).toEqual(["2024"]);
		expect(docsBody.childAssets.items.map((a) => a.filename)).toEqual(["a.txt"]);
	});
});
