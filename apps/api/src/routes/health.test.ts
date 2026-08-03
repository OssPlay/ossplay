import { describe, expect, it } from "bun:test";
import { app } from "../app";

describe("GET /health", () => {
	it("returns ok status", async () => {
		const res = await app.request("/health");
		expect(res.status).toBe(200);
		expect(await res.json()).toEqual({ status: "ok" });
	});
});
