import { beforeAll, describe, expect, it } from "bun:test";
import {
	bootstrapAdmin,
	createTestS3Destination,
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

	it("GET /organizations?sort=name&order=desc sorts by name", async () => {
		const res = await jsonRequest("/organizations?sort=name&order=desc", { cookie: ownerCookie });
		const body = (await res.json()) as { organizations: Array<{ name: string }> };
		expect(body.organizations.map((o) => o.name)).toEqual(["Second Org", "Acme Inc"]);
	});

	it("GET /organizations includes member/project counts, GET /:orgId returns the single org", async () => {
		const destination = await createTestS3Destination(orgId);
		await jsonRequest(`/organizations/${orgId}/projects`, {
			method: "POST",
			cookie: ownerCookie,
			body: JSON.stringify({
				name: "Website Assets",
				id: "website-assets",
				visibility: destination.visibility,
				destinationId: destination.id,
			}),
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

	it("PUT /:orgId is forbidden for a non-owner", async () => {
		// memberCookie was promoted to "admin" in the re-invite test above —
		// org:manage_settings is owner-only, admins can't rename the org.
		const res = await jsonRequest(`/organizations/${orgId}`, {
			method: "PUT",
			cookie: memberCookie,
			body: JSON.stringify({ name: "Hijacked" }),
		});
		expect(res.status).toBe(403);
	});

	it("PUT /:orgId renames the organization for the owner", async () => {
		const res = await jsonRequest(`/organizations/${orgId}`, {
			method: "PUT",
			cookie: ownerCookie,
			body: JSON.stringify({ name: "Acme Incorporated" }),
		});
		expect(res.status).toBe(200);
		const body = (await res.json()) as { organization: { name: string } };
		expect(body.organization.name).toBe("Acme Incorporated");

		const getRes = await jsonRequest(`/organizations/${orgId}`, { cookie: ownerCookie });
		const getBody = (await getRes.json()) as { organization: { name: string } };
		expect(getBody.organization.name).toBe("Acme Incorporated");
	});

	describe("member role change / removal", () => {
		let ownerId: string;
		let adminId: string; // "newbie" — currently "admin" from the re-invite test above
		let thirdCookie: string;
		let thirdId: string;

		it("sets up a third member to exercise the forbidden-for-non-owner case", async () => {
			const inviteRes = await jsonRequest(`/organizations/${orgId}/invitations`, {
				method: "POST",
				cookie: ownerCookie,
				body: JSON.stringify({ email: "third@example.com", role: "member" }),
			});
			const { invitation: thirdInvite } = (await inviteRes.json()) as { invitation: Invitation };
			const token = await stampInvitationToken(thirdInvite.id);
			const acceptRes = await jsonRequest(`/invitations/token/${token}/accept`, {
				method: "POST",
				body: JSON.stringify({ name: "Third Member", password: "another safe password value" }),
			});
			thirdCookie = extractCookie(acceptRes, "ossplay_session");
			expect(thirdCookie).toBeTruthy();

			const membersRes = await jsonRequest(`/organizations/${orgId}/members`, {
				cookie: ownerCookie,
			});
			const membersBody = (await membersRes.json()) as {
				members: Array<{ userId: string; email: string; role: string }>;
			};
			expect(membersBody.members).toHaveLength(3);
			ownerId = membersBody.members.find((m) => m.email === "ada@example.com")?.userId ?? "";
			adminId = membersBody.members.find((m) => m.email === "newbie@example.com")?.userId ?? "";
			thirdId = membersBody.members.find((m) => m.email === "third@example.com")?.userId ?? "";
			expect(ownerId).toBeTruthy();
			expect(adminId).toBeTruthy();
			expect(thirdId).toBeTruthy();
		});

		it("PUT /:orgId/members/:userId changes a member's role", async () => {
			const res = await jsonRequest(`/organizations/${orgId}/members/${adminId}`, {
				method: "PUT",
				cookie: ownerCookie,
				body: JSON.stringify({ role: "member" }),
			});
			expect(res.status).toBe(204);

			const membersRes = await jsonRequest(`/organizations/${orgId}/members`, {
				cookie: ownerCookie,
			});
			const membersBody = (await membersRes.json()) as {
				members: Array<{ userId: string; role: string }>;
			};
			expect(membersBody.members.find((m) => m.userId === adminId)?.role).toBe("member");
		});

		it("PUT /:orgId/members/:userId is forbidden for a non-owner", async () => {
			const res = await jsonRequest(`/organizations/${orgId}/members/${thirdId}`, {
				method: "PUT",
				cookie: memberCookie,
				body: JSON.stringify({ role: "owner" }),
			});
			expect(res.status).toBe(403);
		});

		it("PUT /:orgId/members/:userId 409s when demoting the sole remaining owner", async () => {
			const res = await jsonRequest(`/organizations/${orgId}/members/${ownerId}`, {
				method: "PUT",
				cookie: ownerCookie,
				body: JSON.stringify({ role: "admin" }),
			});
			expect(res.status).toBe(409);
		});

		it("DELETE /:orgId/members/:userId is forbidden when removing someone else without org:manage_members", async () => {
			const res = await jsonRequest(`/organizations/${orgId}/members/${thirdId}`, {
				method: "DELETE",
				cookie: memberCookie,
			});
			expect(res.status).toBe(403);
		});

		it("DELETE /:orgId/members/:userId lets a member leave on their own", async () => {
			const res = await jsonRequest(`/organizations/${orgId}/members/${adminId}`, {
				method: "DELETE",
				cookie: memberCookie,
			});
			expect(res.status).toBe(204);

			const membersRes = await jsonRequest(`/organizations/${orgId}/members`, {
				cookie: ownerCookie,
			});
			const membersBody = (await membersRes.json()) as { members: Array<{ userId: string }> };
			expect(membersBody.members.find((m) => m.userId === adminId)).toBeUndefined();
		});

		it("DELETE /:orgId/members/:userId removes another member as the owner", async () => {
			const res = await jsonRequest(`/organizations/${orgId}/members/${thirdId}`, {
				method: "DELETE",
				cookie: ownerCookie,
			});
			expect(res.status).toBe(204);
			// thirdCookie is now orphaned (removed from its only org) — nothing
			// further to assert with it, kept only so lint doesn't flag it unused
			// ahead of this point in the file.
			expect(thirdCookie).toBeTruthy();
		});

		it("DELETE /:orgId/members/:userId 409s when removing the sole remaining owner", async () => {
			const res = await jsonRequest(`/organizations/${orgId}/members/${ownerId}`, {
				method: "DELETE",
				cookie: ownerCookie,
			});
			expect(res.status).toBe(409);
		});
	});

	it("DELETE /:orgId is forbidden without org:delete permission", async () => {
		// memberCookie has no membership at all in secondOrgId, which also
		// resolves to a 403 (no membership = no permission), same outcome as a
		// non-owner member of the org being deleted.
		const res = await jsonRequest(`/organizations/${secondOrgId}`, {
			method: "DELETE",
			cookie: memberCookie,
		});
		expect(res.status).toBe(403);
	});

	it("DELETE /:orgId removes the organization and cascades", async () => {
		const res = await jsonRequest(`/organizations/${secondOrgId}`, {
			method: "DELETE",
			cookie: ownerCookie,
		});
		expect(res.status).toBe(204);

		const getRes = await jsonRequest(`/organizations/${secondOrgId}`, { cookie: ownerCookie });
		expect(getRes.status).toBe(404);
	});
});
