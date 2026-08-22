import { type AnyColumn, and, asc, desc, gt, ilike, inArray, lt, or, type SQL } from "drizzle-orm";
import type { Context } from "hono";

// The shared query-param contract every paginated list endpoint speaks, FE
// and BE alike: `q` (free-text search), `filter_<key>=a,b,c` (multi-value
// column filter), `<key>_gt` / `<key>_lt` (date-range bounds), `sort` /
// `order`, `page` / `per_page`. One parser here means one contract, not a
// slightly-different reimplementation per route (instance-users.ts and
// instance-audit-logs.ts each hand-rolled their own version of this before
// ssh-keys made it a 3rd).
export interface ListQueryConfig {
	/** Columns ORed together against `q`. */
	searchable?: AnyColumn[];
	/** `filter_<key>=a,b,c` → `inArray(column, [...])`, keyed by the `_<key>` suffix. */
	filters?: Record<string, AnyColumn>;
	/** `<key>_gt` / `<key>_lt` → date-range bounds, keyed by the `<key>_` prefix. */
	dateRanges?: Record<string, AnyColumn>;
	/**
	 * `sort=<key>` → `orderBy(column)`, keyed by the sort key a caller may
	 * pass. Never trust the raw query string as a column name — only keys
	 * present in this map are honored, same indirection `filters`/
	 * `dateRanges` already use.
	 */
	sortable?: Record<string, AnyColumn>;
	/** Falls back to this when `sort` is missing or not a recognized key. */
	defaultSort?: { key: string; order: "asc" | "desc" };
	defaultPageSize?: number;
	maxPageSize?: number;
}

export interface ParsedListQuery {
	where: SQL | undefined;
	orderBy: SQL | undefined;
	page: number;
	pageSize: number;
	limit: number;
	offset: number;
	// The resolved sort column/direction behind `orderBy`, exposed alongside
	// it (not instead of it) for a caller that needs to build its own keyset
	// condition on the same column — e.g. a cursor-paginated route. Every
	// other caller ignores these two fields.
	sortColumn: AnyColumn | undefined;
	sortDirection: "asc" | "desc";
}

const DEFAULT_PAGE_SIZE = 25;
const MAX_PAGE_SIZE = 100;

export function parseListQuery(c: Context, config: ListQueryConfig): ParsedListQuery {
	const conditions: SQL[] = [];

	const q = c.req.query("q")?.trim();
	if (q && config.searchable?.length) {
		const searchCondition = or(...config.searchable.map((column) => ilike(column, `%${q}%`)));
		if (searchCondition) conditions.push(searchCondition);
	}

	for (const [key, column] of Object.entries(config.filters ?? {})) {
		const raw = c.req.query(`filter_${key}`)?.trim();
		if (!raw) continue;
		const values = raw
			.split(",")
			.map((value) => value.trim())
			.filter(Boolean);
		if (values.length > 0) conditions.push(inArray(column, values));
	}

	for (const [key, column] of Object.entries(config.dateRanges ?? {})) {
		const gtRaw = c.req.query(`${key}_gt`)?.trim();
		if (gtRaw) {
			const date = new Date(gtRaw);
			if (!Number.isNaN(date.getTime())) conditions.push(gt(column, date));
		}
		const ltRaw = c.req.query(`${key}_lt`)?.trim();
		if (ltRaw) {
			const date = new Date(ltRaw);
			if (!Number.isNaN(date.getTime())) conditions.push(lt(column, date));
		}
	}

	const defaultPageSize = config.defaultPageSize ?? DEFAULT_PAGE_SIZE;
	const maxPageSize = config.maxPageSize ?? MAX_PAGE_SIZE;
	const page = Math.max(0, Number.parseInt(c.req.query("page") ?? "0", 10) || 0);
	const pageSize = Math.min(
		maxPageSize,
		Math.max(1, Number.parseInt(c.req.query("per_page") ?? "", 10) || defaultPageSize),
	);

	let orderBy: SQL | undefined;
	let sortColumn: AnyColumn | undefined;
	let sortDirection: "asc" | "desc" = "asc";
	if (config.sortable) {
		const requestedKey = c.req.query("sort");
		const requestedOrder = c.req.query("order") === "desc" ? "desc" : "asc";
		const sortKey = requestedKey && requestedKey in config.sortable ? requestedKey : undefined;
		const key = sortKey ?? config.defaultSort?.key;
		const order = sortKey ? requestedOrder : (config.defaultSort?.order ?? "asc");
		const column = key ? config.sortable[key] : undefined;
		if (column) {
			orderBy = order === "desc" ? desc(column) : asc(column);
			sortColumn = column;
			sortDirection = order;
		}
	}

	return {
		where: conditions.length > 0 ? and(...conditions) : undefined,
		orderBy,
		page,
		pageSize,
		limit: pageSize,
		offset: page * pageSize,
		sortColumn,
		sortDirection,
	};
}
