import { beforeAll, describe, expect, it } from "bun:test";
import { bootstrapAdmin, jsonRequest, truncateAllTables } from "../test-support";

// Simulating a real WebAuthn ceremony (a genuine authenticator attestation)
// isn't practical in CI — there's no hardware/virtual authenticator here.
// Instead these tests exercise everything up to the actual cryptographic
// verification: challenge issuance, the challenge/cookie plumbing, ownership
// checks, and the credential-lookup path — all real DB-backed behavior, none
// of it mocked. `verifyRegistrationResponse`/`verifyAuthenticationResponse`
// themselves are exactly the kind of small, well-tested library surface this
// codebase already defers to (nodemailer, drizzle) rather than re-verifying.
describe.skipIf(!process.env.DATABASE_URL)("passkeys", () => {
	beforeAll(async () => {
		await truncateAllTables();
		process.env.OSSPLAY_ENCRYPTION_KEY ??= "c".repeat(64);
	});

	let sessionCookie: string;

	it("bootstraps an admin", async () => {
		({ sessionCookie } = await bootstrapAdmin());
	});

	it("POST /auth/passkey/register-options requires auth", async () => {
		const res = await jsonRequest("/auth/passkey/register-options", { method: "POST" });
		expect(res.status).toBe(401);
	});

	it("POST /auth/passkey/register-options returns a challenge and sets a challenge cookie", async () => {
		const res = await jsonRequest("/auth/passkey/register-options", {
			method: "POST",
			cookie: sessionCookie,
		});
		expect(res.status).toBe(200);
		const body = (await res.json()) as { challenge: string; rp: { id: string; name: string } };
		expect(typeof body.challenge).toBe("string");
		expect(body.rp.name).toBe("OSSPlay");
		expect(res.headers.get("set-cookie")).toMatch(/ossplay_webauthn_challenge=/);
	});

	it("POST /auth/passkey/register-verify 400s with no pending challenge", async () => {
		const res = await jsonRequest("/auth/passkey/register-verify", {
			method: "POST",
			cookie: sessionCookie,
			body: JSON.stringify({ response: { id: "fake" } }),
		});
		expect(res.status).toBe(400);
	});

	it("GET /auth/passkey lists no credentials for a fresh account", async () => {
		const res = await jsonRequest("/auth/passkey", { cookie: sessionCookie });
		expect(res.status).toBe(200);
		expect(await res.json()).toEqual({ credentials: [] });
	});

	it("DELETE /auth/passkey/:id 404s for a credential that does not exist", async () => {
		const res = await jsonRequest("/auth/passkey/00000000-0000-0000-0000-000000000000", {
			method: "DELETE",
			cookie: sessionCookie,
		});
		expect(res.status).toBe(404);
	});

	it("POST /auth/passkey/login-options is public and returns a discoverable challenge", async () => {
		const res = await jsonRequest("/auth/passkey/login-options", { method: "POST" });
		expect(res.status).toBe(200);
		const body = (await res.json()) as { challenge: string; allowCredentials?: unknown[] };
		expect(typeof body.challenge).toBe("string");
		expect(body.allowCredentials ?? []).toHaveLength(0);
		expect(res.headers.get("set-cookie")).toMatch(/ossplay_webauthn_challenge=/);
	});

	it("POST /auth/passkey/login-verify 400s with no pending challenge", async () => {
		const res = await jsonRequest("/auth/passkey/login-verify", {
			method: "POST",
			body: JSON.stringify({ response: { id: "fake" } }),
		});
		expect(res.status).toBe(400);
	});

	it("POST /auth/passkey/login-verify rejects an unrecognized credential id", async () => {
		const optionsRes = await jsonRequest("/auth/passkey/login-options", { method: "POST" });
		const challengeCookie = optionsRes.headers
			.get("set-cookie")
			?.match(/ossplay_webauthn_challenge=[^;]+/)?.[0];
		if (!challengeCookie) throw new Error("Expected a webauthn challenge cookie");

		const res = await jsonRequest("/auth/passkey/login-verify", {
			method: "POST",
			cookie: challengeCookie,
			body: JSON.stringify({ response: { id: "never-registered" } }),
		});
		expect(res.status).toBe(401);
		expect(await res.json()).toEqual({ error: "Passkey not recognized" });
	});
});
