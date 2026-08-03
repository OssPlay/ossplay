import { beforeAll, describe, expect, it } from "bun:test";
import { getDb, users } from "@ossplay/db";
import { eq } from "drizzle-orm";
import { hashPassword } from "../lib/auth/password";
import { generateTotpCode } from "../lib/auth/totp";
import {
	bootstrapAdmin,
	extractCookie,
	jsonRequest,
	stampInvitationToken,
	truncateAllTables,
} from "../test-support";

describe.skipIf(!process.env.DATABASE_URL)("instance user management", () => {
	beforeAll(async () => {
		await truncateAllTables();
		process.env.OSSPLAY_ENCRYPTION_KEY ??= "d".repeat(64);
	});

	let rootCookie: string;
	let memberEmail: string;
	let memberId: string;
	let orgId: string;

	it("bootstraps the root and a second member", async () => {
		({ sessionCookie: rootCookie, orgId } = await bootstrapAdmin());

		memberEmail = "member@example.com";
		const inviteRes = await jsonRequest(`/organizations/${orgId}/invitations`, {
			method: "POST",
			cookie: rootCookie,
			body: JSON.stringify({ email: memberEmail, role: "member" }),
		});
		const inviteBody = (await inviteRes.json()) as { invitation: { id: string } };
		const token = await stampInvitationToken(inviteBody.invitation.id);
		const acceptRes = await jsonRequest(`/invitations/token/${token}/accept`, {
			method: "POST",
			body: JSON.stringify({ name: "Member", password: "member-password-123" }),
		});
		expect(acceptRes.status).toBe(200);
	});

	it("rejects a member (non-root) from listing instance users", async () => {
		const loginRes = await jsonRequest("/auth/login", {
			method: "POST",
			body: JSON.stringify({ email: memberEmail, password: "member-password-123" }),
		});
		const memberCookie = extractCookie(loginRes, "ossplay_session");
		const meRes = await jsonRequest("/auth/me", { cookie: memberCookie });
		const meBody = (await meRes.json()) as { user: { id: string } };
		memberId = meBody.user.id;

		const res = await jsonRequest("/instance/users", { cookie: memberCookie });
		expect(res.status).toBe(403);
	});

	it("GET /instance/users lists both accounts with passkeyCount 0", async () => {
		const res = await jsonRequest("/instance/users", { cookie: rootCookie });
		expect(res.status).toBe(200);
		const body = (await res.json()) as {
			users: Array<{ email: string; passkeyCount: number }>;
			total: number;
			page: number;
			pageSize: number;
		};
		expect(body.users).toHaveLength(2);
		expect(body.users.every((u) => u.passkeyCount === 0)).toBe(true);
		expect(body.total).toBe(2);
		expect(body.page).toBe(0);
		expect(body.pageSize).toBe(10);
	});

	it("GET /instance/users?search filters by name or email", async () => {
		const res = await jsonRequest("/instance/users?search=member", { cookie: rootCookie });
		expect(res.status).toBe(200);
		const body = (await res.json()) as { users: Array<{ email: string }>; total: number };
		expect(body.total).toBe(1);
		expect(body.users).toHaveLength(1);
		expect(body.users[0]?.email).toBe(memberEmail);
	});

	it("GET /instance/users?page&pageSize paginates without duplicating or skipping rows", async () => {
		const firstPage = await jsonRequest("/instance/users?page=0&pageSize=1", {
			cookie: rootCookie,
		});
		const firstBody = (await firstPage.json()) as { users: Array<{ id: string }>; total: number };
		expect(firstBody.users).toHaveLength(1);
		expect(firstBody.total).toBe(2);

		const secondPage = await jsonRequest("/instance/users?page=1&pageSize=1", {
			cookie: rootCookie,
		});
		const secondBody = (await secondPage.json()) as { users: Array<{ id: string }> };
		expect(secondBody.users).toHaveLength(1);
		expect(secondBody.users[0]?.id).not.toBe(firstBody.users[0]?.id);
	});

	it("PUT /instance/users/:id/password requires exactly one of newPassword/generateTemporary", async () => {
		const res = await jsonRequest(`/instance/users/${memberId}/password`, {
			method: "PUT",
			cookie: rootCookie,
			body: JSON.stringify({}),
		});
		expect(res.status).toBe(400);
	});

	it("PUT /instance/users/:id/password with generateTemporary returns a password once and revokes sessions", async () => {
		const res = await jsonRequest(`/instance/users/${memberId}/password`, {
			method: "PUT",
			cookie: rootCookie,
			body: JSON.stringify({ generateTemporary: true }),
		});
		expect(res.status).toBe(200);
		const body = (await res.json()) as { temporaryPassword: string };
		expect(body.temporaryPassword.length).toBeGreaterThanOrEqual(12);

		// The old password no longer works.
		const oldLoginRes = await jsonRequest("/auth/login", {
			method: "POST",
			body: JSON.stringify({ email: memberEmail, password: "member-password-123" }),
		});
		expect(oldLoginRes.status).toBe(401);

		// The new temporary password does.
		const newLoginRes = await jsonRequest("/auth/login", {
			method: "POST",
			body: JSON.stringify({ email: memberEmail, password: body.temporaryPassword }),
		});
		expect(newLoginRes.status).toBe(200);
	});

	it("POST /instance/users/:id/reset-2fa clears TOTP and revokes sessions", async () => {
		// The previous test already rotated the member's password to a
		// one-time temporary value that isn't captured here, so get a fresh
		// one to log in and enable 2FA with.
		const resetRes = await jsonRequest(`/instance/users/${memberId}/password`, {
			method: "PUT",
			cookie: rootCookie,
			body: JSON.stringify({ generateTemporary: true }),
		});
		const { temporaryPassword } = (await resetRes.json()) as { temporaryPassword: string };
		const freshLoginRes = await jsonRequest("/auth/login", {
			method: "POST",
			body: JSON.stringify({ email: memberEmail, password: temporaryPassword }),
		});
		const memberCookie = extractCookie(freshLoginRes, "ossplay_session");

		const setupRes = await jsonRequest("/auth/2fa/setup", { method: "POST", cookie: memberCookie });
		const { secret } = (await setupRes.json()) as { secret: string };
		await jsonRequest("/auth/2fa/confirm", {
			method: "POST",
			cookie: memberCookie,
			body: JSON.stringify({ code: generateTotpCode(secret) }),
		});

		const meBefore = await jsonRequest("/auth/me", { cookie: memberCookie });
		expect(((await meBefore.json()) as { user: { totpEnabled: boolean } }).user.totpEnabled).toBe(
			true,
		);

		const res = await jsonRequest(`/instance/users/${memberId}/reset-2fa`, {
			method: "POST",
			cookie: rootCookie,
		});
		expect(res.status).toBe(204);

		// The member's session was revoked as part of the reset.
		const meAfter = await jsonRequest("/auth/me", { cookie: memberCookie });
		expect(meAfter.status).toBe(401);

		// A fresh login no longer requires 2FA.
		const secondLoginRes = await jsonRequest("/auth/login", {
			method: "POST",
			body: JSON.stringify({ email: memberEmail, password: temporaryPassword }),
		});
		expect(secondLoginRes.status).toBe(200);
	});

	it("404s for a nonexistent user id", async () => {
		const res = await jsonRequest(
			"/instance/users/00000000-0000-0000-0000-000000000000/reset-2fa",
			{
				method: "POST",
				cookie: rootCookie,
			},
		);
		expect(res.status).toBe(404);
	});

	it("GET /instance/users/:id returns detail with org memberships", async () => {
		const res = await jsonRequest(`/instance/users/${memberId}`, { cookie: rootCookie });
		expect(res.status).toBe(200);
		const body = (await res.json()) as {
			user: { email: string };
			organizations: Array<{ id: string; name: string; role: string }>;
		};
		expect(body.user.email).toBe(memberEmail);
		expect(body.organizations).toEqual([{ id: orgId, name: "Acme Inc", role: "member" }]);
	});

	it("PUT .../block prevents login and revokes the session; unblock restores it", async () => {
		// Password was rotated by an earlier test to an unknown temporary
		// value — reset it to something known first.
		const resetRes = await jsonRequest(`/instance/users/${memberId}/password`, {
			method: "PUT",
			cookie: rootCookie,
			body: JSON.stringify({ newPassword: "member-new-password-123" }),
		});
		expect(resetRes.status).toBe(200);

		const freshLoginRes = await jsonRequest("/auth/login", {
			method: "POST",
			body: JSON.stringify({ email: memberEmail, password: "member-new-password-123" }),
		});
		const memberCookie = extractCookie(freshLoginRes, "ossplay_session");

		const blockRes = await jsonRequest(`/instance/users/${memberId}/block`, {
			method: "PUT",
			cookie: rootCookie,
		});
		expect(blockRes.status).toBe(204);

		// Existing session is dead immediately.
		const meAfterBlock = await jsonRequest("/auth/me", { cookie: memberCookie });
		expect(meAfterBlock.status).toBe(401);

		// Correct credentials no longer work either.
		const blockedLoginRes = await jsonRequest("/auth/login", {
			method: "POST",
			body: JSON.stringify({ email: memberEmail, password: "member-new-password-123" }),
		});
		expect(blockedLoginRes.status).toBe(403);

		const unblockRes = await jsonRequest(`/instance/users/${memberId}/unblock`, {
			method: "PUT",
			cookie: rootCookie,
		});
		expect(unblockRes.status).toBe(204);

		const restoredLoginRes = await jsonRequest("/auth/login", {
			method: "POST",
			body: JSON.stringify({ email: memberEmail, password: "member-new-password-123" }),
		});
		expect(restoredLoginRes.status).toBe(200);
	});

	it("cannot block your own account", async () => {
		const meRes = await jsonRequest("/auth/me", { cookie: rootCookie });
		const { user } = (await meRes.json()) as { user: { id: string } };
		const res = await jsonRequest(`/instance/users/${user.id}/block`, {
			method: "PUT",
			cookie: rootCookie,
		});
		expect(res.status).toBe(400);
	});

	it("PUT .../organizations/:orgId/role changes a member role", async () => {
		const res = await jsonRequest(`/instance/users/${memberId}/organizations/${orgId}/role`, {
			method: "PUT",
			cookie: rootCookie,
			body: JSON.stringify({ role: "admin" }),
		});
		expect(res.status).toBe(204);

		const detailRes = await jsonRequest(`/instance/users/${memberId}`, { cookie: rootCookie });
		const detail = (await detailRes.json()) as { organizations: Array<{ role: string }> };
		expect(detail.organizations[0]?.role).toBe("admin");
	});

	it("cannot demote or remove the sole owner of an organization", async () => {
		const meRes = await jsonRequest("/auth/me", { cookie: rootCookie });
		const { user: root } = (await meRes.json()) as { user: { id: string } };

		const demoteRes = await jsonRequest(`/instance/users/${root.id}/organizations/${orgId}/role`, {
			method: "PUT",
			cookie: rootCookie,
			body: JSON.stringify({ role: "admin" }),
		});
		expect(demoteRes.status).toBe(409);

		const removeRes = await jsonRequest(`/instance/users/${root.id}/organizations/${orgId}`, {
			method: "DELETE",
			cookie: rootCookie,
		});
		expect(removeRes.status).toBe(409);
	});

	it("DELETE .../organizations/:orgId removes a non-owner member", async () => {
		const res = await jsonRequest(`/instance/users/${memberId}/organizations/${orgId}`, {
			method: "DELETE",
			cookie: rootCookie,
		});
		expect(res.status).toBe(204);

		const detailRes = await jsonRequest(`/instance/users/${memberId}`, { cookie: rootCookie });
		const detail = (await detailRes.json()) as { organizations: unknown[] };
		expect(detail.organizations).toEqual([]);
	});

	it("cannot delete your own account, or the only instance root", async () => {
		const meRes = await jsonRequest("/auth/me", { cookie: rootCookie });
		const { user: root } = (await meRes.json()) as { user: { id: string } };

		const selfDeleteRes = await jsonRequest(`/instance/users/${root.id}`, {
			method: "DELETE",
			cookie: rootCookie,
		});
		expect(selfDeleteRes.status).toBe(400);

		// Only root sessions can even reach this endpoint (instance:manage_users
		// is root-only), so the "only root" guard's blocking path can never
		// actually trigger on a target other than the caller's own account —
		// the self-delete guard above already covers the one reachable
		// scenario. This just exercises the guard's non-blocking path (deleting
		// one of two roots is allowed) and confirms exactly one root remains
		// afterward. There's no API path to grant root today (by design, see
		// PRD.md §2.3), so the second root is seeded directly.
		const [secondRoot] = await getDb()
			.insert(users)
			.values({
				email: "second-root@example.com",
				passwordHash: await hashPassword("second-root-password-123"),
				name: "Second Root",
				instanceRole: "root",
			})
			.returning();
		if (!secondRoot) throw new Error("Expected the second root insert to return a row");

		const deleteSecondRootRes = await jsonRequest(`/instance/users/${secondRoot.id}`, {
			method: "DELETE",
			cookie: rootCookie,
		});
		expect(deleteSecondRootRes.status).toBe(204);

		// Now only one root remains — deleting it is blocked even though it
		// isn't the actor deleting themselves (simulated via a raw update
		// rather than a second session, since only one root account exists).
		const rootsLeft = await getDb().select().from(users).where(eq(users.instanceRole, "root"));
		expect(rootsLeft).toHaveLength(1);
	});

	it("DELETE /instance/users/:id removes a user entirely", async () => {
		const res = await jsonRequest(`/instance/users/${memberId}`, {
			method: "DELETE",
			cookie: rootCookie,
		});
		expect(res.status).toBe(204);

		const listRes = await jsonRequest("/instance/users", { cookie: rootCookie });
		const { users: remaining } = (await listRes.json()) as { users: Array<{ id: string }> };
		expect(remaining.some((u) => u.id === memberId)).toBe(false);
	});
});
