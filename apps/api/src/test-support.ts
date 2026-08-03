import { rmSync } from "node:fs";
import { getDb, invitations } from "@ossplay/db";
import { eq, sql } from "drizzle-orm";
import { app } from "./app";
import { resetAllRateLimitsForTests } from "./lib/auth/rate-limit";
import { generateToken, hashToken } from "./lib/auth/tokens";

// Must never resolve to a real dev ossplay.yaml — the same contamination
// class as the shared Postgres DB (running tests alongside manual browser
// verification silently resets manually-set state). Set unconditionally,
// not `??=`, so nothing in the environment can override it into pointing
// at a real file.
const TEST_CONFIG_PATH = `${import.meta.dir}/ossplay.test.yaml`;
process.env.OSSPLAY_CONFIG_PATH = TEST_CONFIG_PATH;

export function jsonRequest(path: string, init: RequestInit & { cookie?: string } = {}) {
	const headers = new Headers(init.headers);
	headers.set("Content-Type", "application/json");
	if (init.cookie) headers.set("cookie", init.cookie);
	return app.request(path, { ...init, headers });
}

export function extractCookie(res: Response, name: string): string {
	const setCookie = res.headers.get("set-cookie");
	if (!setCookie) throw new Error("Expected a Set-Cookie header");
	const match = setCookie.match(new RegExp(`${name}=([^;]+)`));
	if (!match) throw new Error(`Expected a ${name} cookie`);
	return `${name}=${match[1]}`;
}

export async function truncateAllTables(): Promise<void> {
	resetAllRateLimitsForTests();
	await getDb().execute(
		sql`TRUNCATE TABLE sessions, organization_members, organizations, users, two_factor_challenges, user_recovery_codes, password_reset_tokens, invitations, webauthn_credentials, webauthn_challenges, smtp_configs RESTART IDENTITY CASCADE`,
	);
	rmSync(TEST_CONFIG_PATH, { force: true });
}

export const DEFAULT_ADMIN = {
	adminName: "Ada Admin",
	adminEmail: "ada@example.com",
	adminPassword: "correct horse battery staple",
	orgName: "Acme Inc",
};

// Runs the real /setup flow, then the real POST /organizations flow (not a
// DB shortcut) so every test file exercises the actual bootstrap +
// onboarding path, matching how it behaves in production now that org
// creation is a separate step from setup.
export async function bootstrapAdmin(overrides: Partial<typeof DEFAULT_ADMIN> = {}) {
	const { orgName, ...setupBody } = { ...DEFAULT_ADMIN, ...overrides };
	const res = await jsonRequest("/setup", { method: "POST", body: JSON.stringify(setupBody) });
	const sessionCookie = extractCookie(res, "ossplay_session");

	const orgRes = await jsonRequest("/organizations", {
		method: "POST",
		cookie: sessionCookie,
		body: JSON.stringify({ name: orgName }),
	});
	const { organization } = (await orgRes.json()) as { organization: { id: string } };
	if (!organization) throw new Error("Expected POST /organizations to return an organization");

	return {
		sessionCookie,
		orgId: organization.id,
		email: setupBody.adminEmail,
		password: setupBody.adminPassword,
	};
}

// The API only ever exposes an invitation's token via the (in tests,
// unsent) email — it stores just the hash. Test-only escape hatch: stamp a
// known token onto an existing invitation row so accept-flow tests can
// drive the real /invitations/token/:token endpoints end to end.
export async function stampInvitationToken(invitationId: string): Promise<string> {
	const token = generateToken();
	const tokenHash = await hashToken(token);
	await getDb().update(invitations).set({ tokenHash }).where(eq(invitations.id, invitationId));
	return token;
}
