import { relations } from "drizzle-orm";
import { index, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { projects } from "./project.schema";
import { users } from "./user.schema";

// Project-scoped API keys for the public /v1 consumer API — same
// opaque-bearer-token convention as sessions.schema.ts's `sessions.id`: the
// primary key IS the hex SHA-256 hash of the raw `op_...` key, so a DB leak
// alone never yields a usable key. `keyPrefix` (the first several chars of
// the raw key, plaintext) is what the dashboard shows after creation to
// help a human tell keys apart — the rest of the secret is never
// retrievable again. One key = full read/write on its project; no
// read-only/write-only tiers (nothing asked for finer scopes yet).
export const projectApiKeys = pgTable(
	"project_api_keys",
	{
		id: text("id").primaryKey(),
		projectId: text("project_id")
			.references(() => projects.id, { onDelete: "cascade" })
			.notNull(),
		label: text("label").notNull(),
		keyPrefix: text("key_prefix").notNull(),
		createdByUserId: uuid("created_by_user_id").references(() => users.id, { onDelete: "set null" }),
		lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
		// Revoking is a single-column write, same recycle-bin-style convention
		// as assets.deletedAt/folders.deletedAt — a revoked key's row stays for
		// audit visibility, it just fails require-api-key's lookup.
		revokedAt: timestamp("revoked_at", { withTimezone: true }),
		createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
	},
	(table) => [index("project_api_keys_project_id_idx").on(table.projectId)],
);

export type ProjectApiKey = typeof projectApiKeys.$inferSelect;

export const projectApiKeysRelations = relations(projectApiKeys, ({ one }) => ({
	project: one(projects, {
		fields: [projectApiKeys.projectId],
		references: [projects.id],
	}),
	createdBy: one(users, {
		fields: [projectApiKeys.createdByUserId],
		references: [users.id],
	}),
}));
