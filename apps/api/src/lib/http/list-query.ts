import { type AnyColumn, and, type SQL, gt, ilike, inArray, lt, or } from "drizzle-orm";
import type { Context } from "hono";

// The shared query-param contract every paginated list endpoint speaks, FE
// and BE alike: `q` (free-text search), `filter_<key>=a,b,c` (multi-value
// column filter), `<key>_gt` / `<key>_lt` (date-range bounds), `page` /
// `per_page`. One parser here means one contract, not a slightly-different
// reimplementation per route (instance-users.ts and instance-audit-logs.ts
// each hand-rolled their own version of this before ssh-keys made it a 3rd).
export interface ListQueryConfig {
	/** Columns ORed together against `q`. */
	searchable?: AnyColumn[];
	/** `filter_<key>=a,b,c` → `inArray(column, [...])`, keyed by the `_<key>` suffix. */
	filters?: Record<string, AnyColumn>;
	/** `<key>_gt` / `<key>_lt` → date-range bounds, keyed by the `<key>_` prefix. */
	dateRanges?: Record<string, AnyColumn>;
	defaultPageSize?: number;
	maxPageSize?: number;
}

export interface ParsedListQuery {
	where: SQL | undefined;
	page: number;
	pageSize: number;
	limit: number;
	offset: number;
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

	return {
		where: conditions.length > 0 ? and(...conditions) : undefined,
		page,
		pageSize,
		limit: pageSize,
		offset: page * pageSize,
	};
}
