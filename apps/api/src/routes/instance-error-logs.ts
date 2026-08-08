import { getDb, systemLogs } from "@ossplay/db";
import { count, desc } from "drizzle-orm";
import { Hono } from "hono";
import { parseListQuery } from "../lib/http/list-query";
import { requireAuth } from "../middleware/require-auth";
import { requireInstancePermission } from "../middleware/require-instance-permission";
import type { AppEnv } from "../types";

export const instanceErrorLogsRoute = new Hono<AppEnv>();

// Same permission as audit logs — both are read-only observability, no
// mutation surface here, so there's no reason to gate this separately.
instanceErrorLogsRoute.use("*", requireAuth, requireInstancePermission("instance:view_audit_log"));

instanceErrorLogsRoute.get("/", async (c) => {
	const db = getDb();
	const { where, page, pageSize, limit, offset } = parseListQuery(c, {
		searchable: [systemLogs.message],
		filters: { source: systemLogs.source },
		dateRanges: { created_at: systemLogs.createdAt },
		defaultPageSize: 25,
	});

	const [rows, totalRows] = await Promise.all([
		db
			.select()
			.from(systemLogs)
			.where(where)
			.orderBy(desc(systemLogs.createdAt))
			.limit(limit)
			.offset(offset),
		db.select({ total: count() }).from(systemLogs).where(where),
	]);

	return c.json({ logs: rows, total: totalRows[0]?.total ?? 0, page, pageSize });
});

// Distinct source values seen so far, for the filter dropdown — same
// self-maintaining pattern as instance-audit-logs.ts's /actions.
instanceErrorLogsRoute.get("/sources", async (c) => {
	const rows = await getDb().selectDistinct({ source: systemLogs.source }).from(systemLogs);
	return c.json({ sources: rows.map((row) => row.source).sort() });
});
