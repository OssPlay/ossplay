import { beforeAll, describe, expect, it } from "bun:test";
import type { InstanceInvitation } from "@ossplay/db";
import {
	extractCookie,
	jsonRequest,
	stampInstanceInvitationToken,
	truncateAllTables,
} from "../test-support";

describe.skipIf(!process.env.DATABASE_URL)("onboarding status", () => {
	beforeAll(async () => {
		await truncateAllTables();
		process.env.OSSPLAY_ENCRYPTION_KEY ??= "e".repeat(64);
	});

	let rootCookie: string;

	it("rejects an unauthenticated request", async () => {
		const res = await jsonRequest("/onboarding/status");
		expect(res.status).toBe(401);
	});

	it("bootstraps the root with no org yet", async () => {
		const res = await jsonRequest("/setup", {
			method: "POST",
			body: JSON.stringify({
				adminName: "Ada Admin",
				adminEmail: "ada@example.com",
				adminPassword: "correct horse battery staple",
			}),
		});
		const setCookie = res.headers.get("set-cookie");
		const match = setCookie?.match(/ossplay_session=([^;]+)/);
		if (!match) throw new Error("Expected a session cookie");
		rootCookie = `ossplay_session=${match[1]}`;
	});

	it("reports needsOnboarding: true with dns/smtp/org all incomplete", async () => {
		const res = await jsonRequest("/onboarding/status", { cookie: rootCookie });
		expect(res.status).toBe(200);
		expect(await res.json()).toEqual({
			needsOnboarding: true,
			steps: {
				dns: { skippable: true, completed: false },
				smtp: { skippable: true, completed: false },
				org: { skippable: false, completed: false },
			},
		});
	});

	it("smtp step completes once instance SMTP is configured", async () => {
		await jsonRequest("/instance/smtp", {
			method: "POST",
			cookie: rootCookie,
			body: JSON.stringify({
				name: "Default",
				host: "smtp.example.com",
				port: 587,
				username: null,
				fromAddress: "noreply@example.com",
				fromName: null,
				secure: true,
			}),
		});

		const res = await jsonRequest("/onboarding/status", { cookie: rootCookie });
		const body = (await res.json()) as { steps: { smtp: { completed: boolean } } };
		expect(body.steps.smtp.completed).toBe(true);
	});

	it("dns step completes once a domain is saved", async () => {
		await jsonRequest("/instance/domain", {
			method: "PUT",
			cookie: rootCookie,
			body: JSON.stringify({
				domain: "ossplay.example.com",
				letsEncryptEmail: "admin@ossplay.example.com",
			}),
		});

		const res = await jsonRequest("/onboarding/status", { cookie: rootCookie });
		const body = (await res.json()) as { steps: { dns: { completed: boolean } } };
		expect(body.steps.dns.completed).toBe(true);
	});

	let orgId: string;

	it("needsOnboarding flips to false once the first org exists", async () => {
		const createRes = await jsonRequest("/organizations", {
			method: "POST",
			cookie: rootCookie,
			body: JSON.stringify({ name: "Acme Inc" }),
		});
		const { organization } = (await createRes.json()) as { organization: { id: string } };
		orgId = organization.id;

		const res = await jsonRequest("/onboarding/status", { cookie: rootCookie });
		const body = (await res.json()) as {
			needsOnboarding: boolean;
			steps: { org: { completed: boolean } };
		};
		expect(body.needsOnboarding).toBe(false);
		expect(body.steps.org.completed).toBe(true);
	});

	// Regression test: onboarding is a one-time first-run experience, stamped
	// via InstanceConfig.onboardedAt when the first org is ever created — it
	// must not flip back to true just because the instance is later emptied
	// out again (e.g. deleting the only org from its settings danger zone).
	it("needsOnboarding stays false after the only organization is deleted", async () => {
		const deleteRes = await jsonRequest(`/organizations/${orgId}`, {
			method: "DELETE",
			cookie: rootCookie,
		});
		expect(deleteRes.status).toBe(204);

		const res = await jsonRequest("/onboarding/status", { cookie: rootCookie });
		const body = (await res.json()) as {
			needsOnboarding: boolean;
			steps: { org: { completed: boolean } };
		};
		expect(body.needsOnboarding).toBe(false);
		expect(body.steps.org.completed).toBe(false);
	});

	// Regression test: a root invited via the org-less instance invite flow
	// (instance-users.ts's POST /invite, instanceRole: "root") has zero org
	// memberships of their own — before this fixed, that made
	// needsOnboarding derive per-user instead of per-instance, so a second
	// root would be walked through DNS/SMTP/org setup all over again even
	// though the instance was already fully onboarded by the first root.
	it("a second root invited after onboarding does not need onboarding again", async () => {
		const inviteRes = await jsonRequest("/instance/users/invite", {
			method: "POST",
			cookie: rootCookie,
			body: JSON.stringify({ email: "second-root@example.com", instanceRole: "root" }),
		});
		const { invitation } = (await inviteRes.json()) as { invitation: InstanceInvitation };
		const token = await stampInstanceInvitationToken(invitation.id);

		const acceptRes = await jsonRequest(`/instance-invitations/token/${token}/accept`, {
			method: "POST",
			body: JSON.stringify({ name: "Second Root", password: "second-root-password-123" }),
		});
		const secondRootCookie = extractCookie(acceptRes, "ossplay_session");

		const res = await jsonRequest("/onboarding/status", { cookie: secondRootCookie });
		const body = (await res.json()) as { needsOnboarding: boolean };
		expect(body.needsOnboarding).toBe(false);
	});
});
