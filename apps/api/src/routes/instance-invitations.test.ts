import { beforeAll, describe, expect, it } from "bun:test";
import { auditLogs, getDb, type InstanceInvitation } from "@ossplay/db";
import { desc, eq } from "drizzle-orm";
import {
	bootstrapAdmin,
	extractCookie,
	jsonRequest,
	stampInstanceInvitationToken,
	truncateAllTables,
} from "../test-support";

describe.skipIf(!process.env.DATABASE_URL)("instance-level (org-less) user invitations", () => {
	beforeAll(async () => {
		await truncateAllTables();
		process.env.OSSPLAY_ENCRYPTION_KEY ??= "e".repeat(64);
	});

	let rootCookie: string;

	it("bootstraps the root", async () => {
		({ sessionCookie: rootCookie } = await bootstrapAdmin());
	});

	it("rejects a non-root caller", async () => {
		const res = await jsonRequest("/instance/users/invite", {
			method: "POST",
			body: JSON.stringify({ email: "nope@example.com" }),
		});
		expect(res.status).toBe(401);
	});

	let invitation: InstanceInvitation;

	it("POST /instance/users/invite creates an invitation (degrading gracefully with no SMTP configured)", async () => {
		const res = await jsonRequest("/instance/users/invite", {
			method: "POST",
			cookie: rootCookie,
			body: JSON.stringify({ email: "newbie@example.com", grantRoot: false }),
		});
		// 201 either way — with a `warning` + `inviteUrl` since this test
		// environment has no default SMTP config, rather than losing the
		// invitation.
		expect(res.status).toBe(201);
		const body = (await res.json()) as {
			invitation: InstanceInvitation;
			inviteUrl: string;
			warning?: string;
		};
		expect(body.invitation.email).toBe("newbie@example.com");
		expect(body.invitation.grantRoot).toBe(false);
		expect(body.warning).toBeTruthy();
		expect(body.inviteUrl).toContain("/invite/instance/");
		invitation = body.invitation;
	});

	it("logs a user.invited audit entry", async () => {
		const [entry] = await getDb()
			.select()
			.from(auditLogs)
			.where(eq(auditLogs.action, "user.invited"))
			.orderBy(desc(auditLogs.createdAt))
			.limit(1);
		expect(entry?.targetId).toBe(invitation.id);
	});

	it("rejects a second pending invitation for the same email", async () => {
		const res = await jsonRequest("/instance/users/invite", {
			method: "POST",
			cookie: rootCookie,
			body: JSON.stringify({ email: "newbie@example.com" }),
		});
		expect(res.status).toBe(409);
	});

	it("rejects inviting an email that already has an account", async () => {
		const res = await jsonRequest("/instance/users/invite", {
			method: "POST",
			cookie: rootCookie,
			body: JSON.stringify({ email: "ada@example.com" }),
		});
		expect(res.status).toBe(409);
	});

	let inviteToken: string;

	it("GET /instance-invitations/token/:token returns invite details without needing auth", async () => {
		inviteToken = await stampInstanceInvitationToken(invitation.id);

		const res = await jsonRequest(`/instance-invitations/token/${inviteToken}`);
		expect(res.status).toBe(200);
		const body = (await res.json()) as { email: string; grantRoot: boolean; instanceName: string };
		expect(body.email).toBe("newbie@example.com");
		expect(body.grantRoot).toBe(false);
		expect(body.instanceName).toBe("OSSPlay");
	});

	it("404s for an invalid token", async () => {
		const res = await jsonRequest("/instance-invitations/token/not-a-real-token");
		expect(res.status).toBe(404);
	});

	it("POST /instance-invitations/token/:token/accept creates a rootless account and logs in", async () => {
		const res = await jsonRequest(`/instance-invitations/token/${inviteToken}/accept`, {
			method: "POST",
			body: JSON.stringify({ name: "Newbie", password: "newbie-password-123" }),
		});
		expect(res.status).toBe(200);
		const sessionCookie = extractCookie(res, "ossplay_session");

		const meRes = await jsonRequest("/auth/me", { cookie: sessionCookie });
		const { user } = (await meRes.json()) as {
			user: { email: string; instanceRole: string | null };
		};
		expect(user.email).toBe("newbie@example.com");
		expect(user.instanceRole).toBeNull();
	});

	it("logs a user.joined audit entry", async () => {
		const [entry] = await getDb()
			.select()
			.from(auditLogs)
			.where(eq(auditLogs.action, "user.joined"))
			.orderBy(desc(auditLogs.createdAt))
			.limit(1);
		expect(entry?.metadata).toEqual({ via: "instance_invitation", grantRoot: false });
	});

	it("the token can't be reused once accepted", async () => {
		const res = await jsonRequest(`/instance-invitations/token/${inviteToken}/accept`, {
			method: "POST",
			body: JSON.stringify({ name: "Newbie Again", password: "newbie-password-123" }),
		});
		expect(res.status).toBe(404);
	});

	it("grantRoot: true creates a root account", async () => {
		const inviteRes = await jsonRequest("/instance/users/invite", {
			method: "POST",
			cookie: rootCookie,
			body: JSON.stringify({ email: "second-root@example.com", grantRoot: true }),
		});
		const { invitation: rootInvitation } = (await inviteRes.json()) as {
			invitation: InstanceInvitation;
		};
		const token = await stampInstanceInvitationToken(rootInvitation.id);

		const acceptRes = await jsonRequest(`/instance-invitations/token/${token}/accept`, {
			method: "POST",
			body: JSON.stringify({ name: "Second Root", password: "second-root-password-123" }),
		});
		expect(acceptRes.status).toBe(200);
		const sessionCookie = extractCookie(acceptRes, "ossplay_session");

		const meRes = await jsonRequest("/auth/me", { cookie: sessionCookie });
		const { user } = (await meRes.json()) as { user: { instanceRole: string | null } };
		expect(user.instanceRole).toBe("root");
	});
});
