import { describe, expect, it } from "bun:test";
import { buildOtpauthUri, generateTotpCode, generateTotpSecret, verifyTotpCode } from "./totp";

const STEP_MS = 30_000;

describe("totp", () => {
	it("generates a base32 secret", () => {
		const secret = generateTotpSecret();
		expect(secret).toMatch(/^[A-Z2-7]+$/);
		expect(secret.length).toBeGreaterThan(0);
	});

	it("generates a 6-digit code", () => {
		const secret = generateTotpSecret();
		const code = generateTotpCode(secret);
		expect(code).toMatch(/^\d{6}$/);
	});

	it("verifies a code generated for the same secret and time", () => {
		const secret = generateTotpSecret();
		const now = Date.now();
		const code = generateTotpCode(secret, now);
		expect(verifyTotpCode(secret, code, now)).toBe(true);
	});

	it("rejects a code for a different secret", () => {
		const secretA = generateTotpSecret();
		const secretB = generateTotpSecret();
		const now = Date.now();
		const code = generateTotpCode(secretA, now);
		expect(verifyTotpCode(secretB, code, now)).toBe(false);
	});

	it("rejects a wrong code", () => {
		const secret = generateTotpSecret();
		const now = Date.now();
		const code = generateTotpCode(secret, now);
		const wrongCode = code === "000000" ? "111111" : "000000";
		expect(verifyTotpCode(secret, wrongCode, now)).toBe(false);
	});

	it("tolerates one step of clock drift in either direction", () => {
		const secret = generateTotpSecret();
		const now = Date.now();
		const codeOneStepAgo = generateTotpCode(secret, now - STEP_MS);
		const codeOneStepAhead = generateTotpCode(secret, now + STEP_MS);
		expect(verifyTotpCode(secret, codeOneStepAgo, now)).toBe(true);
		expect(verifyTotpCode(secret, codeOneStepAhead, now)).toBe(true);
	});

	it("rejects a code two steps out of drift tolerance", () => {
		const secret = generateTotpSecret();
		const now = Date.now();
		const codeTwoStepsAgo = generateTotpCode(secret, now - STEP_MS * 2);
		expect(verifyTotpCode(secret, codeTwoStepsAgo, now)).toBe(false);
	});

	it("builds a valid otpauth URI", () => {
		const uri = buildOtpauthUri({
			secret: "ABCDEFGH",
			accountName: "ada@example.com",
			issuer: "OSSPlay",
		});
		expect(uri).toStartWith("otpauth://totp/");
		expect(uri).toContain("secret=ABCDEFGH");
		expect(uri).toContain("issuer=OSSPlay");
		expect(uri).toContain("digits=6");
		expect(uri).toContain("period=30");
	});
});
