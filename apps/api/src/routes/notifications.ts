import { getDb, notifications } from "@ossplay/db";
import { and, count, desc, eq, isNull } from "drizzle-orm";
import { Hono } from "hono";
import { parseListQuery } from "../lib/http/list-query";
import { requireAuth } from "../middleware/require-auth";
import type { AppEnv } from "../types";

export const notificationsRoute = new Hono<AppEnv>();

// requireAuth only — every route below filters on eq(notifications.userId,
// user.id), so a user only ever reads/mutates their own rows. No org/
// instance permission concept applies here, unlike every other list route in
// this app.
notificationsRoute.use("*", requireAuth);

notificationsRoute.get("/", async (c) => {
	const user = c.get("user");
	const db = getDb();
	const { where, page, pageSize, limit, offset } = parseListQuery(c, {
		searchable: [notifications.title],
		filters: { priority: notifications.priority },
		defaultPageSize: 25,
	});
	const scoped = and(eq(notifications.userId, user.id), where);

	const [rows, totalRows] = await Promise.all([
		db
			.select()
			.from(notifications)
			.where(scoped)
			.orderBy(desc(notifications.createdAt))
			.limit(limit)
			.offset(offset),
		db.select({ total: count() }).from(notifications).where(scoped),
	]);

	return c.json({ notifications: rows, total: totalRows[0]?.total ?? 0, page, pageSize });
});

// Cheap, header-bell-only count — deliberately not folded into GET / (the
// bell polls this on an interval; paying for the full list query that often
// isn't worth it).
notificationsRoute.get("/unread-count", async (c) => {
	const user = c.get("user");
	const [row] = await getDb()
		.select({ total: count() })
		.from(notifications)
		.where(and(eq(notifications.userId, user.id), isNull(notifications.readAt)));
	return c.json({ count: row?.total ?? 0 });
});

notificationsRoute.patch("/:id/read", async (c) => {
	const user = c.get("user");
	const id = c.req.param("id");
	const [existing] = await getDb()
		.select({ id: notifications.id })
		.from(notifications)
		.where(and(eq(notifications.id, id), eq(notifications.userId, user.id)));
	if (!existing) return c.json({ error: "Notification not found" }, 404);

	await getDb().update(notifications).set({ readAt: new Date() }).where(eq(notifications.id, id));
	return c.body(null, 204);
});

notificationsRoute.patch("/read-all", async (c) => {
	const user = c.get("user");
	await getDb()
		.update(notifications)
		.set({ readAt: new Date() })
		.where(and(eq(notifications.userId, user.id), isNull(notifications.readAt)));
	return c.body(null, 204);
});
