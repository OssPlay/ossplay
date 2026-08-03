import { describe, expect, it } from "bun:test";
import { sshKeys } from "@ossplay/db";
import { Hono } from "hono";
import { parseListQuery } from "./list-query";

const config = {
	searchable: [sshKeys.label],
	filters: { type: sshKeys.keyType },
	dateRanges: { created_at: sshKeys.createdAt },
};

async function parse(query: string) {
	let result: ReturnType<typeof parseListQuery> | undefined;
	const app = new Hono().get("/", (c) => {
		result = parseListQuery(c, config);
		return c.body(null);
	});
	await app.request(`/${query}`);
	if (!result) throw new Error("handler did not run");
	return result;
}

describe("parseListQuery", () => {
	it("defaults to page 0, the default page size, and no where clause", async () => {
		const result = await parse("");
		expect(result.page).toBe(0);
		expect(result.pageSize).toBe(25);
		expect(result.offset).toBe(0);
		expect(result.limit).toBe(25);
		expect(result.where).toBeUndefined();
	});

	it("clamps page/per_page to sane bounds", async () => {
		expect((await parse("?page=-5")).page).toBe(0);
		// 0 is falsy, so — consistent with the pre-existing pagination code in
		// instance-users.ts/instance-audit-logs.ts this replaces — it falls
		// back to the default rather than clamping to the floor of 1.
		expect((await parse("?per_page=0")).pageSize).toBe(25);
		expect((await parse("?per_page=99999")).pageSize).toBe(100);
		const result = await parse("?page=3&per_page=10");
		expect(result.page).toBe(3);
		expect(result.pageSize).toBe(10);
		expect(result.offset).toBe(30);
	});

	it("builds a where clause for q against searchable columns", async () => {
		const result = await parse("?q=prod");
		expect(result.where).toBeDefined();
	});

	it("builds a where clause for filter_<key>", async () => {
		const result = await parse("?filter_type=ssh-rsa,ssh-ed25519");
		expect(result.where).toBeDefined();
	});

	it("ignores an empty filter value", async () => {
		const result = await parse("?filter_type=");
		expect(result.where).toBeUndefined();
	});

	it("builds a where clause for <key>_gt/_lt date bounds", async () => {
		const result = await parse("?created_at_gt=2026-01-01&created_at_lt=2026-02-01");
		expect(result.where).toBeDefined();
	});

	it("ignores an unparseable date bound", async () => {
		const result = await parse("?created_at_gt=not-a-date");
		expect(result.where).toBeUndefined();
	});

	it("combines q, filters, and date bounds into one where clause", async () => {
		const result = await parse("?q=prod&filter_type=ssh-rsa&created_at_gt=2026-01-01");
		expect(result.where).toBeDefined();
	});
});
