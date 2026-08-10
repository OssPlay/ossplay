import { beforeAll, describe, expect, it } from "bun:test";
import {
	bootstrapAdmin,
	createTestS3Destination,
	jsonRequest,
	truncateAllTables,
} from "../test-support";

type Folder = { id: string; name: string; parentId: string | null; deletedAt: string | null };

describe.skipIf(!process.env.DATABASE_URL)("folders", () => {
	beforeAll(truncateAllTables);

	let ownerCookie: string;
	let orgId: string;
	let projectId: string;

	it("bootstraps an admin/owner and a project", async () => {
		({ sessionCookie: ownerCookie, orgId } = await bootstrapAdmin());
		const { id: destinationId } = await createTestS3Destination(orgId, { visibility: "private" });
		const res = await jsonRequest(`/organizations/${orgId}/projects`, {
			method: "POST",
			cookie: ownerCookie,
			body: JSON.stringify({
				name: "Drive test",
				id: "drive-test",
				visibility: "private",
				destinationId,
			}),
		});
		expect(res.status).toBe(201);
		const body = (await res.json()) as { project: { id: string } };
		projectId = body.project.id;
	});

	it("GET .../drive starts at an empty root", async () => {
		const res = await jsonRequest(`/organizations/${orgId}/projects/${projectId}/drive`, {
			cookie: ownerCookie,
		});
		expect(res.status).toBe(200);
		const body = (await res.json()) as { folder: null; childFolders: Folder[] };
		expect(body.folder).toBeNull();
		expect(body.childFolders).toHaveLength(0);
	});

	let photosId: string;

	it("POST .../folders creates a root-level folder", async () => {
		const res = await jsonRequest(`/organizations/${orgId}/projects/${projectId}/folders`, {
			method: "POST",
			cookie: ownerCookie,
			body: JSON.stringify({ parentId: null, name: "Photos" }),
		});
		expect(res.status).toBe(201);
		const body = (await res.json()) as { folder: Folder };
		expect(body.folder.name).toBe("Photos");
		photosId = body.folder.id;
	});

	it("POST .../folders rejects a duplicate sibling name", async () => {
		const res = await jsonRequest(`/organizations/${orgId}/projects/${projectId}/folders`, {
			method: "POST",
			cookie: ownerCookie,
			body: JSON.stringify({ parentId: null, name: "Photos" }),
		});
		expect(res.status).toBe(409);
	});

	let year2024Id: string;

	it("POST .../folders nests a child folder", async () => {
		const res = await jsonRequest(`/organizations/${orgId}/projects/${projectId}/folders`, {
			method: "POST",
			cookie: ownerCookie,
			body: JSON.stringify({ parentId: photosId, name: "2024" }),
		});
		expect(res.status).toBe(201);
		const body = (await res.json()) as { folder: Folder };
		year2024Id = body.folder.id;
	});

	it("GET .../drive?folderId= returns breadcrumb and children", async () => {
		const res = await jsonRequest(
			`/organizations/${orgId}/projects/${projectId}/drive?folderId=${year2024Id}`,
			{ cookie: ownerCookie },
		);
		expect(res.status).toBe(200);
		const body = (await res.json()) as { folder: Folder; breadcrumb: Folder[] };
		expect(body.folder.id).toBe(year2024Id);
		expect(body.breadcrumb.map((f) => f.name)).toEqual(["Photos", "2024"]);
	});

	it("PATCH .../folders/:id renames a folder", async () => {
		const res = await jsonRequest(
			`/organizations/${orgId}/projects/${projectId}/folders/${year2024Id}`,
			{ method: "PATCH", cookie: ownerCookie, body: JSON.stringify({ name: "2024 Trip" }) },
		);
		expect(res.status).toBe(200);
		const body = (await res.json()) as { folder: Folder };
		expect(body.folder.name).toBe("2024 Trip");
	});

	it("POST .../folders/:id/trash trashes a leaf folder, hides it from browsing", async () => {
		const trashRes = await jsonRequest(
			`/organizations/${orgId}/projects/${projectId}/folders/${year2024Id}/trash`,
			{ method: "POST", cookie: ownerCookie },
		);
		expect(trashRes.status).toBe(204);

		const browseRes = await jsonRequest(
			`/organizations/${orgId}/projects/${projectId}/drive?folderId=${year2024Id}`,
			{ cookie: ownerCookie },
		);
		expect(browseRes.status).toBe(404);

		const parentRes = await jsonRequest(
			`/organizations/${orgId}/projects/${projectId}/drive?folderId=${photosId}`,
			{ cookie: ownerCookie },
		);
		const parentBody = (await parentRes.json()) as { childFolders: Folder[] };
		expect(parentBody.childFolders).toHaveLength(0);
	});

	it("GET .../trash lists the trashed folder", async () => {
		const res = await jsonRequest(`/organizations/${orgId}/projects/${projectId}/trash`, {
			cookie: ownerCookie,
		});
		expect(res.status).toBe(200);
		const body = (await res.json()) as { folders: Folder[] };
		expect(body.folders.map((f) => f.id)).toEqual([year2024Id]);
	});

	it("POST .../folders/:id/restore brings it back", async () => {
		const res = await jsonRequest(
			`/organizations/${orgId}/projects/${projectId}/folders/${year2024Id}/restore`,
			{ method: "POST", cookie: ownerCookie },
		);
		expect(res.status).toBe(204);

		const browseRes = await jsonRequest(
			`/organizations/${orgId}/projects/${projectId}/drive?folderId=${year2024Id}`,
			{ cookie: ownerCookie },
		);
		expect(browseRes.status).toBe(200);
	});

	it("restore is blocked while a parent is trashed", async () => {
		await jsonRequest(`/organizations/${orgId}/projects/${projectId}/folders/${photosId}/trash`, {
			method: "POST",
			cookie: ownerCookie,
		});
		await jsonRequest(
			`/organizations/${orgId}/projects/${projectId}/folders/${year2024Id}/trash`,
			{ method: "POST", cookie: ownerCookie },
		);

		const res = await jsonRequest(
			`/organizations/${orgId}/projects/${projectId}/folders/${year2024Id}/restore`,
			{ method: "POST", cookie: ownerCookie },
		);
		expect(res.status).toBe(409);
	});

	it("DELETE .../folders/:id permanently removes a trashed folder and its subtree", async () => {
		const res = await jsonRequest(
			`/organizations/${orgId}/projects/${projectId}/folders/${photosId}`,
			{ method: "DELETE", cookie: ownerCookie },
		);
		expect(res.status).toBe(204);

		const trashRes = await jsonRequest(`/organizations/${orgId}/projects/${projectId}/trash`, {
			cookie: ownerCookie,
		});
		const trashBody = (await trashRes.json()) as { folders: Folder[] };
		expect(trashBody.folders).toHaveLength(0);
	});

	it("DELETE .../folders/:id refuses a folder that isn't trashed", async () => {
		const createRes = await jsonRequest(`/organizations/${orgId}/projects/${projectId}/folders`, {
			method: "POST",
			cookie: ownerCookie,
			body: JSON.stringify({ parentId: null, name: "Documents" }),
		});
		const { folder } = (await createRes.json()) as { folder: Folder };

		const res = await jsonRequest(
			`/organizations/${orgId}/projects/${projectId}/folders/${folder.id}`,
			{ method: "DELETE", cookie: ownerCookie },
		);
		expect(res.status).toBe(400);
	});
});
