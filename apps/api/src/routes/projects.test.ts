import { beforeAll, describe, expect, it } from "bun:test";
import {
	bootstrapAdmin,
	extractCookie,
	jsonRequest,
	stampInvitationToken,
	truncateAllTables,
} from "../test-support";

type Project = { id: string; name: string; orgId: string };

describe.skipIf(!process.env.DATABASE_URL)("projects", () => {
	beforeAll(truncateAllTables);

	let ownerCookie: string;
	let orgId: string;

	it("bootstraps an admin/owner", async () => {
		({ sessionCookie: ownerCookie, orgId } = await bootstrapAdmin());
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
			body: JSON.stringify({ name: "Marketing site" }),
		});
		expect(res.status).toBe(201);
		const body = (await res.json()) as { project: Project };
		expect(body.project.name).toBe("Marketing site");
		expect(body.project.orgId).toBe(orgId);
		project = body.project;
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
});
