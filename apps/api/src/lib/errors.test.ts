import { describe, expect, it } from "bun:test";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { jsonRequest } from "../test-support";
import type { AppEnv } from "../types";
import { errorHandler, notFoundHandler } from "./errors";

// The real app (app.ts) wires errorHandler/notFoundHandler globally, but
// none of its real routes are built to throw on purpose — a throwaway app
// reusing the same handlers is the only way to exercise the actual
// branches (an uncaught Error vs. an HTTPException) directly.
function buildTestApp() {
	const app = new Hono<AppEnv>();
	app.onError(errorHandler);
	app.notFound(notFoundHandler);
	app.get("/ok", (c) => c.json({ ok: true }));
	app.get("/boom", () => {
		throw new Error("insert did not return the expected row");
	});
	app.get("/forbidden", () => {
		throw new HTTPException(403, { message: "Forbidden" });
	});
	app.get("/no-message", () => {
		throw new HTTPException(400);
	});
	return app;
}

describe("errorHandler / notFoundHandler", () => {
	it("leaves normal responses untouched", async () => {
		const res = await buildTestApp().request("/ok");
		expect(res.status).toBe(200);
		expect(await res.json()).toEqual({ ok: true });
	});

	it("normalizes an uncaught Error into a safe 500 without leaking its message", async () => {
		const res = await buildTestApp().request("/boom");
		expect(res.status).toBe(500);
		const body = (await res.json()) as { error: string };
		expect(body.error).toBe("Something went wrong. Please try again.");
		expect(body.error).not.toContain("insert did not return");
	});

	it("preserves an HTTPException's own status and message", async () => {
		const res = await buildTestApp().request("/forbidden");
		expect(res.status).toBe(403);
		expect(await res.json()).toEqual({ error: "Forbidden" });
	});

	it("falls back to a generic message when the HTTPException has none", async () => {
		const res = await buildTestApp().request("/no-message");
		expect(res.status).toBe(400);
		const body = (await res.json()) as { error: string };
		expect(body.error.length).toBeGreaterThan(0);
	});

	it("returns JSON for an unmatched route", async () => {
		const res = await buildTestApp().request("/does-not-exist");
		expect(res.status).toBe(404);
		expect(await res.json()).toEqual({ error: "Not found" });
	});
});

describe("errorHandler wired into the real app", () => {
	it("returns JSON for an unmatched route on the real app", async () => {
		const res = await jsonRequest("/this-route-does-not-exist");
		expect(res.status).toBe(404);
		expect(await res.json()).toEqual({ error: "Not found" });
	});
});
