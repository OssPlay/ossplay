import { relations } from "drizzle-orm";
import { index, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { users } from "./user.schema";

// One row per (recipient, event), not a shared event row fanned out via a
// join table — per-user read state (readAt) is the only thing that ever
// changes after insert, and this app's notification volume per user never
// justifies the extra join. `type` is a short, fixed, dot-namespaced string
// (same convention as auditLogs.action: "organization.member_joined",
// "organization.project_created", "organization.project_deleted",
// "instance.update_available") — the dashboard maps it to an icon
// client-side, nothing icon/asset-related is stored here. `href` is where
// clicking the notification navigates. `readAt` null = unread; no separate
// boolean, same "derive state from a nullable timestamp" pattern already
// used by invitations.acceptedAt / instanceInvitations.acceptedAt.
export const notifications = pgTable(
	"notifications",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		userId: uuid("user_id")
			.references(() => users.id, { onDelete: "cascade" })
			.notNull(),
		type: text("type").notNull(),
		title: text("title").notNull(),
		body: text("body"),
		href: text("href"),
		priority: text("priority", { enum: ["low", "normal", "high"] })
			.default("normal")
			.notNull(),
		metadata: jsonb("metadata").$type<Record<string, unknown>>(),
		readAt: timestamp("read_at", { withTimezone: true }),
		createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
	},
	(table) => [
		// Backs "my notifications, newest first" (GET /notifications) and the
		// header bell's unread-count poll — both always filter on userId first,
		// so a composite index beats two single-column ones for this access
		// pattern.
		index("notifications_user_id_created_at_idx").on(table.userId, table.createdAt.desc()),
		index("notifications_user_id_read_at_idx").on(table.userId, table.readAt),
	],
);

export type Notification = typeof notifications.$inferSelect;

export const notificationsRelations = relations(notifications, ({ one }) => ({
	user: one(users, { fields: [notifications.userId], references: [users.id] }),
}));
