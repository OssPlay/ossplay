import { beforeAll, describe, expect, it } from "bun:test";
import {
	bootstrapAdmin,
	createTestS3Destination,
	extractCookie,
	jsonRequest,
	stampInvitationToken,
	truncateAllTables,
} from "../test-support";

type Project = { id: string; name: string; orgId: string; visibility: string; destinationId: string };

describe.skipIf(!process.env.DATABASE_URL)("projects", () => {
	beforeAll(truncateAllTables);

	let ownerCookie: string;
	let orgId: string;
	let destinationId: string;

	it("bootstraps an admin/owner", async () => {
		({ sessionCookie: ownerCookie, orgId } = await bootstrapAdmin());
		({ id: destinationId } = await createTestS3Destination(orgId, { visibility: "private" }));
	});

	it("GET /:orgId/projects starts empty", async () => {
		const res = await jsonRequest(`/organizations/${orgId}/projects`, { cookie: ownerCookie });
		expect(res.status).toBe(200);
		const body = (await res.json()) as { projects: Project[] };
		expect(body.projects).toHaveLength(0);
	});

	let project: Project;

	it("POST /:orgId/projects creates a project", async () => {
		const res = await jsonRequest(`/organizations/${orgId}/projects`, {
			method: "POST",
			cookie: ownerCookie,
			body: JSON.stringify({
				name: "Marketing site",
				id: "marketing-site",
				visibility: "private",
				destinationId,
			}),
		});
		expect(res.status).toBe(201);
		const body = (await res.json()) as { project: Project };
		expect(body.project.name).toBe("Marketing site");
		expect(body.project.id).toBe("marketing-site");
		expect(body.project.orgId).toBe(orgId);
		project = body.project;
	});

	it("POST /:orgId/projects rejects a duplicate id", async () => {
		const res = await jsonRequest(`/organizations/${orgId}/projects`, {
			method: "POST",
			cookie: ownerCookie,
			body: JSON.stringify({
				name: "Another project",
				id: "marketing-site",
				visibility: "private",
				destinationId,
			}),
		});
		expect(res.status).toBe(409);
	});

	it("POST /:orgId/projects rejects an id in the wrong shape", async () => {
		const res = await jsonRequest(`/organizations/${orgId}/projects`, {
			method: "POST",
			cookie: ownerCookie,
			body: JSON.stringify({
				name: "Bad id",
				id: "Not Valid!",
				visibility: "private",
				destinationId,
			}),
		});
		expect(res.status).toBe(400);
	});

	it("POST /:orgId/projects rejects a destination whose visibility doesn't match", async () => {
		const publicDestination = await createTestS3Destination(orgId, { visibility: "public" });
		const res = await jsonRequest(`/organizations/${orgId}/projects`, {
			method: "POST",
			cookie: ownerCookie,
			body: JSON.stringify({
				name: "Mismatched",
				id: "mismatched",
				visibility: "private",
				destinationId: publicDestination.id,
			}),
		});
		expect(res.status).toBe(400);
	});

	it("GET /:orgId/projects lists the new project", async () => {
		const res = await jsonRequest(`/organizations/${orgId}/projects`, { cookie: ownerCookie });
		expect(res.status).toBe(200);
		const body = (await res.json()) as { projects: Project[] };
		expect(body.projects).toHaveLength(1);
		expect(body.projects[0]?.id).toBe(project.id);
	});

	it("PUT /:orgId/projects/:projectId renames the project", async () => {
		const res = await jsonRequest(`/organizations/${orgId}/projects/${project.id}`, {
			method: "PUT",
			cookie: ownerCookie,
			body: JSON.stringify({ name: "Renamed project" }),
		});
		expect(res.status).toBe(200);
		const body = (await res.json()) as { project: Project };
		expect(body.project.name).toBe("Renamed project");
	});

	it("PUT on a project in another org 404s", async () => {
		const res = await jsonRequest(`/organizations/${crypto.randomUUID()}/projects/${project.id}`, {
			method: "PUT",
			cookie: ownerCookie,
			body: JSON.stringify({ name: "Should not apply" }),
		});
		expect(res.status).toBe(404);
	});

	let memberCookie: string;

	it("a member cannot create a project", async () => {
		const inviteRes = await jsonRequest(`/organizations/${orgId}/invitations`, {
			method: "POST",
			cookie: ownerCookie,
			body: JSON.stringify({ email: "member@example.com", role: "member" }),
		});
		const inviteBody = (await inviteRes.json()) as { invitation: { id: string } };
		const token = await stampInvitationToken(inviteBody.invitation.id);
		const acceptRes = await jsonRequest(`/invitations/token/${token}/accept`, {
			method: "POST",
			body: JSON.stringify({ name: "A Member", password: "a fresh new safe password" }),
		});
		memberCookie = extractCookie(acceptRes, "ossplay_session");

		const res = await jsonRequest(`/organizations/${orgId}/projects`, {
			method: "POST",
			cookie: memberCookie,
			body: JSON.stringify({ name: "Not allowed" }),
		});
		expect(res.status).toBe(403);
	});

	it("a non-member is forbidden entirely", async () => {
		const res = await jsonRequest(`/organizations/${orgId}/projects`, {
			method: "POST",
			body: JSON.stringify({ name: "Anonymous" }),
		});
		expect(res.status).toBe(401);
	});

	// org:manage_projects (edit) is member-inclusive; org:create_projects and
	// org:delete_projects stay owner/admin-only — see permissions.ts.
	it("a member can edit an existing project", async () => {
		const res = await jsonRequest(`/organizations/${orgId}/projects/${project.id}`, {
			method: "PUT",
			cookie: memberCookie,
			body: JSON.stringify({ name: "Renamed by member" }),
		});
		expect(res.status).toBe(200);
		const body = (await res.json()) as { project: Project };
		expect(body.project.name).toBe("Renamed by member");
	});

	it("a member cannot delete a project", async () => {
		const res = await jsonRequest(`/organizations/${orgId}/projects/${project.id}`, {
			method: "DELETE",
			cookie: memberCookie,
		});
		expect(res.status).toBe(403);
	});

	it("DELETE /:orgId/projects/:projectId removes the project", async () => {
		const res = await jsonRequest(`/organizations/${orgId}/projects/${project.id}`, {
			method: "DELETE",
			cookie: ownerCookie,
		});
		expect(res.status).toBe(204);

		const listRes = await jsonRequest(`/organizations/${orgId}/projects`, { cookie: ownerCookie });
		const listBody = (await listRes.json()) as { projects: Project[] };
		expect(listBody.projects).toHaveLength(0);
	});

	// Regression test: creating a project against a nonexistent org (a stale
	// page, or a race with another tab deleting the org) used to fail as an
	// unhandled DB foreign-key-constraint violation — an opaque 500 instead
	// of a clean 404, the same "does this org actually exist" check every
	// other write in this file already does before touching a row.
	it("POST /:orgId/projects 404s for a nonexistent org", async () => {
		const res = await jsonRequest(`/organizations/${crypto.randomUUID()}/projects`, {
			method: "POST",
			cookie: ownerCookie,
			body: JSON.stringify({
				name: "Orphaned",
				id: "orphaned",
				visibility: "private",
				destinationId: crypto.randomUUID(),
			}),
		});
		expect(res.status).toBe(404);
	});
});
