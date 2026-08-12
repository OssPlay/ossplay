import { describe, expect, it } from "bun:test";
import { sshKeys } from "@ossplay/db";
import { Hono } from "hono";
import { parseListQuery } from "./list-query";

const config = {
	searchable: [sshKeys.label],
	filters: { type: sshKeys.keyType },
	dateRanges: { created_at: sshKeys.createdAt },
	sortable: { label: sshKeys.label, created_at: sshKeys.createdAt },
	defaultSort: { key: "label", order: "asc" as const },
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

	it("falls back to defaultSort when sort is missing", async () => {
		const result = await parse("");
		expect(result.orderBy).toBeDefined();
	});

	it("falls back to defaultSort when sort is not a recognized key — never trusts the raw string as a column name", async () => {
		const fallback = (await parse("")).orderBy;
		const invalid = (await parse("?sort=drop table sshKeys;--")).orderBy;
		expect(invalid).toEqual(fallback);
	});

	it("honors a recognized sort key and order", async () => {
		const asc = await parse("?sort=created_at&order=asc");
		const desc = await parse("?sort=created_at&order=desc");
		expect(asc.orderBy).toBeDefined();
		expect(desc.orderBy).toBeDefined();
		expect(asc.orderBy).not.toEqual(desc.orderBy);
	});

	it("defaults order to asc when order is missing or invalid", async () => {
		const noOrder = await parse("?sort=created_at");
		const ascOrder = await parse("?sort=created_at&order=asc");
		expect(noOrder.orderBy).toEqual(ascOrder.orderBy);
	});

	it("leaves orderBy undefined when the config has no sortable map", async () => {
		let result: ReturnType<typeof parseListQuery> | undefined;
		const app = new Hono().get("/", (c) => {
			result = parseListQuery(c, { searchable: [sshKeys.label] });
			return c.body(null);
		});
		await app.request("/?sort=label");
		if (!result) throw new Error("handler did not run");
		expect(result.orderBy).toBeUndefined();
	});
});
