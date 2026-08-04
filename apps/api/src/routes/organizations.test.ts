import { beforeAll, describe, expect, it } from "bun:test";
import {
	bootstrapAdmin,
	extractCookie,
	jsonRequest,
	stampInvitationToken,
	truncateAllTables,
} from "../test-support";

type Invitation = { id: string; email: string; role: string; status: string };

describe.skipIf(!process.env.DATABASE_URL)("organizations, members, invitations", () => {
	beforeAll(truncateAllTables);

	let ownerCookie: string;
	let orgId: string;

	it("bootstraps an admin/owner", async () => {
		({ sessionCookie: ownerCookie, orgId } = await bootstrapAdmin());
	});

	it("GET /:orgId/members lists the owner", async () => {
		const res = await jsonRequest(`/organizations/${orgId}/members`, { cookie: ownerCookie });
		expect(res.status).toBe(200);
		const body = (await res.json()) as { members: Array<{ email: string; role: string }> };
		expect(body.members).toHaveLength(1);
		expect(body.members[0]).toMatchObject({ email: "ada@example.com", role: "owner" });
	});

	let secondOrgId: string;

	it("GET /organizations lists every org for root, even without a membership row", async () => {
		const createRes = await jsonRequest("/organizations", {
			method: "POST",
			cookie: ownerCookie,
			body: JSON.stringify({ name: "Second Org" }),
		});
		expect(createRes.status).toBe(201);
		const { organization } = (await createRes.json()) as { organization: { id: string } };
		secondOrgId = organization.id;

		const res = await jsonRequest("/organizations", { cookie: ownerCookie });
		expect(res.status).toBe(200);
		const body = (await res.json()) as { organizations: Array<{ id: string; name: string }> };
		expect(body.organizations.map((o) => o.name).sort()).toEqual(["Acme Inc", "Second Org"]);
	});

	it("GET /organizations includes member/project counts, GET /:orgId returns the single org", async () => {
		await jsonRequest(`/organizations/${orgId}/projects`, {
			method: "POST",
			cookie: ownerCookie,
			body: JSON.stringify({ name: "Website Assets" }),
		});

		const listRes = await jsonRequest("/organizations", { cookie: ownerCookie });
		const listBody = (await listRes.json()) as {
			organizations: Array<{ id: string; memberCount: number; projectCount: number }>;
		};
		const acme = listBody.organizations.find((o) => o.id === orgId);
		expect(acme).toMatchObject({ memberCount: 1, projectCount: 1 });
		const second = listBody.organizations.find((o) => o.id === secondOrgId);
		expect(second).toMatchObject({ memberCount: 1, projectCount: 0 });

		const detailRes = await jsonRequest(`/organizations/${orgId}`, { cookie: ownerCookie });
		expect(detailRes.status).toBe(200);
		const detailBody = (await detailRes.json()) as { organization: { id: string; name: string } };
		expect(detailBody.organization).toMatchObject({ id: orgId, name: "Acme Inc" });
	});

	it("GET /:orgId 404s for a non-existent org", async () => {
		const res = await jsonRequest("/organizations/00000000-0000-0000-0000-000000000000", {
			cookie: ownerCookie,
		});
		expect(res.status).toBe(404);
	});

	it("GET /organizations is forbidden for a non-root member", async () => {
		// Invited into the second org specifically, not `orgId` — later tests
		// in this file assert exact member/invitation counts on `orgId` and
		// would break if this leaked a member into it.
		const memberRes = await jsonRequest(`/organizations/${secondOrgId}/invitations`, {
			method: "POST",
			cookie: ownerCookie,
			body: JSON.stringify({ email: "member-for-org-list@example.com", role: "member" }),
		});
		const { invitation: memberInvite } = (await memberRes.json()) as { invitation: Invitation };
		const token = await stampInvitationToken(memberInvite.id);
		const acceptRes = await jsonRequest(`/invitations/token/${token}/accept`, {
			method: "POST",
			body: JSON.stringify({ name: "Regular Member", password: "correct horse battery staple" }),
		});
		const memberCookie = extractCookie(acceptRes, "ossplay_session");

		const res = await jsonRequest("/organizations", { cookie: memberCookie });
		expect(res.status).toBe(403);
	});

	let invitation: Invitation;

	it("POST /:orgId/invitations creates an invitation (degrading gracefully with no SMTP configured)", async () => {
		const res = await jsonRequest(`/organizations/${orgId}/invitations`, {
			method: "POST",
			cookie: ownerCookie,
			body: JSON.stringify({ email: "newbie@example.com", role: "member" }),
		});
		// 201 either way — with a `warning` field if SMTP isn't configured in
		// this test environment, rather than losing the invitation.
		expect(res.status).toBe(201);
		const body = (await res.json()) as { invitation: Invitation };
		expect(body.invitation.email).toBe("newbie@example.com");
		expect(body.invitation.status).toBe("pending");
		invitation = body.invitation;
	});

	it("rejects a second pending invitation for the same email", async () => {
		const res = await jsonRequest(`/organizations/${orgId}/invitations`, {
			method: "POST",
			cookie: ownerCookie,
			body: JSON.stringify({ email: "newbie@example.com", role: "admin" }),
		});
		expect(res.status).toBe(409);
	});

	it("GET /:orgId/invitations lists the pending invitation", async () => {
		const res = await jsonRequest(`/organizations/${orgId}/invitations`, { cookie: ownerCookie });
		expect(res.status).toBe(200);
		const body = (await res.json()) as { invitations: Invitation[] };
		expect(body.invitations).toHaveLength(1);
		expect(body.invitations[0]?.email).toBe("newbie@example.com");
	});

	let inviteToken: string;

	it("GET /invitations/token/:token returns invite details without needing auth", async () => {
		inviteToken = await stampInvitationToken(invitation.id);

		const res = await jsonRequest(`/invitations/token/${inviteToken}`);
		expect(res.status).toBe(200);
		const body = (await res.json()) as { email: string; orgName: string; accountExists: boolean };
		expect(body.email).toBe("newbie@example.com");
		expect(body.orgName).toBe("Acme Inc");
		expect(body.accountExists).toBe(false);
	});

	let memberCookie: string;

	it("POST /invitations/token/:token/accept creates the account and logs in", async () => {
		const res = await jsonRequest(`/invitations/token/${inviteToken}/accept`, {
			method: "POST",
			body: JSON.stringify({ name: "Newbie User", password: "a fresh new safe password" }),
		});
		expect(res.status).toBe(200);
		memberCookie = extractCookie(res, "ossplay_session");

		const membersRes = await jsonRequest(`/organizations/${orgId}/members`, {
			cookie: ownerCookie,
		});
		const membersBody = (await membersRes.json()) as {
			members: Array<{ email: string; role: string }>;
		};
		expect(membersBody.members).toHaveLength(2);
		expect(membersBody.members.find((m) => m.email === "newbie@example.com")?.role).toBe("member");
	});

	it("the new member cannot create invitations, but can view the member list", async () => {
		const createRes = await jsonRequest(`/organizations/${orgId}/invitations`, {
			method: "POST",
			cookie: memberCookie,
			body: JSON.stringify({ email: "someone-else@example.com", role: "member" }),
		});
		expect(createRes.status).toBe(403);

		const membersRes = await jsonRequest(`/organizations/${orgId}/members`, {
			cookie: memberCookie,
		});
		expect(membersRes.status).toBe(200);
	});

	it("re-inviting an existing member updates their role instead of no-op", async () => {
		const promoteRes = await jsonRequest(`/organizations/${orgId}/invitations`, {
			method: "POST",
			cookie: ownerCookie,
			body: JSON.stringify({ email: "newbie@example.com", role: "admin" }),
		});
		expect(promoteRes.status).toBe(201);
		const promoteBody = (await promoteRes.json()) as { invitation: Invitation };
		const promoteToken = await stampInvitationToken(promoteBody.invitation.id);

		const acceptRes = await jsonRequest(`/invitations/token/${promoteToken}/accept`, {
			method: "POST",
			cookie: memberCookie,
		});
		expect(acceptRes.status).toBe(200);

		const membersRes = await jsonRequest(`/organizations/${orgId}/members`, {
			cookie: ownerCookie,
		});
		const membersBody = (await membersRes.json()) as {
			members: Array<{ email: string; role: string }>;
		};
		expect(membersBody.members.find((m) => m.email === "newbie@example.com")?.role).toBe("admin");
	});

	it("revoking an invitation blocks a later accept", async () => {
		const createRes = await jsonRequest(`/organizations/${orgId}/invitations`, {
			method: "POST",
			cookie: ownerCookie,
			body: JSON.stringify({ email: "revoke-me@example.com", role: "member" }),
		});
		const createBody = (await createRes.json()) as { invitation: Invitation };
		const revokeToken = await stampInvitationToken(createBody.invitation.id);

		const revokeRes = await jsonRequest(`/invitations/${createBody.invitation.id}/revoke`, {
			method: "POST",
			cookie: ownerCookie,
		});
		expect(revokeRes.status).toBe(204);

		const acceptRes = await jsonRequest(`/invitations/token/${revokeToken}/accept`, {
			method: "POST",
			body: JSON.stringify({ name: "Too Late", password: "irrelevant password value" }),
		});
		expect(acceptRes.status).toBe(404);
	});
});
