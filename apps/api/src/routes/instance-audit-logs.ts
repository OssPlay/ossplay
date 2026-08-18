import { auditLogs, getDb, users } from "@ossplay/db";
import { count, desc, eq } from "drizzle-orm";
import { Hono } from "hono";
import { parseListQuery } from "../lib/http/list-query";
import { requireAuth } from "../middleware/require-auth";
import { requireInstancePermission } from "../middleware/require-instance-permission";
import type { AppEnv } from "../types";

export const instanceAuditLogsRoute = new Hono<AppEnv>();

// Read-only — its own permission (instance:view_audit_log), not
// instance:manage_settings, since reviewing the log shouldn't require the
// ability to change anything.
instanceAuditLogsRoute.use("*", requireAuth, requireInstancePermission("instance:view_audit_log"));

instanceAuditLogsRoute.get("/", async (c) => {
	const db = getDb();
	const { where, orderBy, page, pageSize, limit, offset } = parseListQuery(c, {
		searchable: [users.name, users.email],
		filters: { action: auditLogs.action },
		dateRanges: { created_at: auditLogs.createdAt },
		sortable: { createdAt: auditLogs.createdAt, action: auditLogs.action },
		defaultSort: { key: "createdAt", order: "desc" },
		defaultPageSize: 25,
	});

	const [rows, totalRows] = await Promise.all([
		db
			.select({
				id: auditLogs.id,
				action: auditLogs.action,
				targetType: auditLogs.targetType,
				targetId: auditLogs.targetId,
				metadata: auditLogs.metadata,
				ipAddress: auditLogs.ipAddress,
				createdAt: auditLogs.createdAt,
				actorUserId: auditLogs.actorUserId,
				actorName: users.name,
				actorEmail: users.email,
			})
			.from(auditLogs)
			.leftJoin(users, eq(auditLogs.actorUserId, users.id))
			.where(where)
			// sortable+defaultSort are always passed above, so parseListQuery
			// never actually returns undefined here — the fallback just satisfies
			// orderBy's SQL | undefined type without a non-null assertion.
			.orderBy(orderBy ?? desc(auditLogs.createdAt))
			.limit(limit)
			.offset(offset),
		db
			.select({ total: count() })
			.from(auditLogs)
			.leftJoin(users, eq(auditLogs.actorUserId, users.id))
			.where(where),
	]);

	return c.json({ logs: rows, total: totalRows[0]?.total ?? 0, page, pageSize });
});

// Distinct action values seen so far, for the filter dropdown — the set is
// small and fixed in practice (see lib/audit/log.ts), so a fresh query is
// cheap and self-maintaining rather than a hardcoded list that could drift
// from the actual action strings routes call logAudit with.
instanceAuditLogsRoute.get("/actions", async (c) => {
	const rows = await getDb().selectDistinct({ action: auditLogs.action }).from(auditLogs);
	return c.json({ actions: rows.map((row) => row.action).sort() });
});
