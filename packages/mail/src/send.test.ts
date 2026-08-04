import { describe, expect, it } from "bun:test";
import { resolveTlsOptions } from "./send";

describe("resolveTlsOptions", () => {
	it("uses implicit TLS for port 465 when the config wants encryption", () => {
		expect(resolveTlsOptions({ secure: true, port: 465 })).toEqual({
			secure: true,
			requireTLS: false,
		});
	});

	// The bug this guards against: smtp.resend.com (and most modern
	// providers) run STARTTLS on 587, not implicit TLS. Passing
	// `secure: true` straight through for that port made nodemailer attempt
	// a raw TLS handshake against a plaintext-first server, surfacing as
	// "Cert does not contain a DNS name" instead of a clear connection error.
	it("uses STARTTLS (requireTLS) for port 587 when the config wants encryption", () => {
		expect(resolveTlsOptions({ secure: true, port: 587 })).toEqual({
			secure: false,
			requireTLS: true,
		});
	});

	it("uses STARTTLS for any non-465 port, not just 587", () => {
		expect(resolveTlsOptions({ secure: true, port: 25 })).toEqual({
			secure: false,
			requireTLS: true,
		});
	});

	it("requires no TLS at all when the config does not want encryption", () => {
		expect(resolveTlsOptions({ secure: false, port: 587 })).toEqual({
			secure: false,
			requireTLS: false,
		});
		expect(resolveTlsOptions({ secure: false, port: 465 })).toEqual({
			secure: false,
			requireTLS: false,
		});
	});
});
