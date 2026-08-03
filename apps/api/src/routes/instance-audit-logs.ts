import { auditLogs, getDb, users } from "@ossplay/db";
import { and, count, desc, eq, gte, ilike, lte, or } from "drizzle-orm";
import { Hono } from "hono";
import { requireAuth } from "../middleware/require-auth";
import { requireInstancePermission } from "../middleware/require-instance-permission";
import type { AppEnv } from "../types";

export const instanceAuditLogsRoute = new Hono<AppEnv>();

// Read-only — its own permission (instance:view_audit_log), not
// instance:manage_settings, since reviewing the log shouldn't require the
// ability to change anything.
instanceAuditLogsRoute.use("*", requireAuth, requireInstancePermission("instance:view_audit_log"));

const DEFAULT_PAGE_SIZE = 25;
const MAX_PAGE_SIZE = 100;

instanceAuditLogsRoute.get("/", async (c) => {
	const db = getDb();
	const action = c.req.query("action")?.trim() || undefined;
	const actor = c.req.query("actor")?.trim() || undefined;
	const from = c.req.query("from")?.trim() || undefined;
	const to = c.req.query("to")?.trim() || undefined;
	const page = Math.max(0, Number.parseInt(c.req.query("page") ?? "0", 10) || 0);
	const pageSize = Math.min(
		MAX_PAGE_SIZE,
		Math.max(1, Number.parseInt(c.req.query("pageSize") ?? "", 10) || DEFAULT_PAGE_SIZE),
	);

	const conditions = [];
	if (action) conditions.push(eq(auditLogs.action, action));
	if (actor) {
		conditions.push(or(ilike(users.name, `%${actor}%`), ilike(users.email, `%${actor}%`)));
	}
	if (from) {
		const fromDate = new Date(from);
		if (!Number.isNaN(fromDate.getTime())) conditions.push(gte(auditLogs.createdAt, fromDate));
	}
	if (to) {
		const toDate = new Date(to);
		if (!Number.isNaN(toDate.getTime())) conditions.push(lte(auditLogs.createdAt, toDate));
	}
	const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

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
			.where(whereClause)
			.orderBy(desc(auditLogs.createdAt))
			.limit(pageSize)
			.offset(page * pageSize),
		db
			.select({ total: count() })
			.from(auditLogs)
			.leftJoin(users, eq(auditLogs.actorUserId, users.id))
			.where(whereClause),
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
