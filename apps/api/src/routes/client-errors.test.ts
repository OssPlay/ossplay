import { beforeAll, describe, expect, it } from "bun:test";
import { bootstrapAdmin, jsonRequest, truncateAllTables } from "../test-support";

interface ErrorLogRow {
	id: string;
	source: string;
	message: string;
	metadata: Record<string, unknown> | null;
}

describe.skipIf(!process.env.DATABASE_URL)("client errors", () => {
	beforeAll(truncateAllTables);

	let rootCookie: string;

	it("bootstraps an admin/owner", async () => {
		({ sessionCookie: rootCookie } = await bootstrapAdmin());
	});

	it("rejects an unauthenticated request", async () => {
		const res = await jsonRequest("/client-errors", {
			method: "POST",
			body: JSON.stringify({ message: "boom" }),
		});
		expect(res.status).toBe(401);
	});

	it("POST / writes a row visible via GET /instance/error-logs", async () => {
		const res = await jsonRequest("/client-errors", {
			method: "POST",
			cookie: rootCookie,
			body: JSON.stringify({
				message: "Cannot read properties of undefined (reading 'foo')",
				stack: "TypeError: ...\n  at Component (app.tsx:1:1)",
				path: "/instance/error-logs",
				kind: "render",
			}),
		});
		expect(res.status).toBe(204);

		const listRes = await jsonRequest("/instance/error-logs", { cookie: rootCookie });
		expect(listRes.status).toBe(200);
		const listBody = (await listRes.json()) as { logs: ErrorLogRow[]; total: number };
		expect(listBody.total).toBe(1);
		expect(listBody.logs[0]?.source).toBe("dashboard");
		expect(listBody.logs[0]?.message).toBe(
			"Cannot read properties of undefined (reading 'foo')",
		);
		expect(listBody.logs[0]?.metadata?.path).toBe("/instance/error-logs");
		expect(listBody.logs[0]?.metadata?.kind).toBe("render");
	});

	it("still responds 204 for a malformed body instead of throwing", async () => {
		const res = await jsonRequest("/client-errors", {
			method: "POST",
			cookie: rootCookie,
			body: JSON.stringify({ notMessage: true }),
		});
		expect(res.status).toBe(204);

		// No new row was written for the malformed request.
		const listRes = await jsonRequest("/instance/error-logs", { cookie: rootCookie });
		const listBody = (await listRes.json()) as { total: number };
		expect(listBody.total).toBe(1);
	});
});
