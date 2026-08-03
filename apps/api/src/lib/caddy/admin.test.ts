import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
import { applyDomainConfig } from "./admin";

const originalFetch = globalThis.fetch;
const originalAdminUrl = process.env.OSSPLAY_CADDY_ADMIN_URL;

afterEach(() => {
	globalThis.fetch = originalFetch;
	if (originalAdminUrl === undefined) {
		delete process.env.OSSPLAY_CADDY_ADMIN_URL;
	} else {
		process.env.OSSPLAY_CADDY_ADMIN_URL = originalAdminUrl;
	}
});

describe("applyDomainConfig", () => {
	it("no-ops with no network call when OSSPLAY_CADDY_ADMIN_URL is unset", async () => {
		delete process.env.OSSPLAY_CADDY_ADMIN_URL;
		const fetchSpy = mock(() => {
			throw new Error("fetch should not have been called");
		});
		globalThis.fetch = fetchSpy as unknown as typeof fetch;

		const result = await applyDomainConfig("example.com");

		expect(result.applied).toBe(false);
		expect(result.reason).toMatch(/not configured/i);
		expect(fetchSpy).not.toHaveBeenCalled();
	});

	describe("with OSSPLAY_CADDY_ADMIN_URL set", () => {
		beforeEach(() => {
			process.env.OSSPLAY_CADDY_ADMIN_URL = "http://caddy:2019";
		});

		it("reports applied on a successful /load call", async () => {
			const fetchSpy = mock(async () => new Response(null, { status: 200 }));
			globalThis.fetch = fetchSpy as unknown as typeof fetch;

			const result = await applyDomainConfig("example.com");

			expect(result).toEqual({ applied: true });
			expect(fetchSpy).toHaveBeenCalledTimes(1);
			const [url, init] = fetchSpy.mock.calls[0] as unknown as [string, RequestInit];
			expect(url).toBe("http://caddy:2019/load");
			expect(init.method).toBe("POST");
			expect((init.headers as Record<string, string>)["Content-Type"]).toBe("text/caddyfile");
			expect(String(init.body)).toContain("example.com");
		});

		it("reports not applied with a reason on a non-2xx response", async () => {
			globalThis.fetch = mock(
				async () => new Response("bad config", { status: 400 }),
			) as unknown as typeof fetch;

			const result = await applyDomainConfig("example.com");

			expect(result.applied).toBe(false);
			expect(result.reason).toMatch(/400/);
		});

		it("reports not applied with a reason when the request throws", async () => {
			globalThis.fetch = mock(async () => {
				throw new Error("connection refused");
			}) as unknown as typeof fetch;

			const result = await applyDomainConfig("example.com");

			expect(result.applied).toBe(false);
			expect(result.reason).toBe("connection refused");
		});
	});
});
