import { relations } from "drizzle-orm";
import { index, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { assets } from "./project.schema";
import { users } from "./user.schema";

// A short-lived, single-asset read grant for the dashboard's "Copy link" on
// a private project — same opaque-bearer-token convention as
// `projectApiKeys.id`/`sessions.id`: the primary key IS the hex SHA-256
// hash of the raw token. Deliberately scoped to one assetId (not a whole
// project like `projectApiKeys`) and always time-bound — this is "let
// someone view this one file for a while," not a credential. Checked by
// apps/api/src/routes/v1.ts's authorizeRead as a second fallback alongside
// verifyProjectApiKey, so a share link reuses the exact same serving path
// (local-disk streaming, S3 redirect, disposition, transforms) as every
// other /v1 read.
export const assetShareLinks = pgTable(
	"asset_share_links",
	{
		id: text("id").primaryKey(),
		assetId: uuid("asset_id")
			.references(() => assets.id, { onDelete: "cascade" })
			.notNull(),
		expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
		createdByUserId: uuid("created_by_user_id").references(() => users.id, { onDelete: "set null" }),
		createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
	},
	(table) => [index("asset_share_links_asset_id_idx").on(table.assetId)],
);

export type AssetShareLink = typeof assetShareLinks.$inferSelect;

export const assetShareLinksRelations = relations(assetShareLinks, ({ one }) => ({
	asset: one(assets, {
		fields: [assetShareLinks.assetId],
		references: [assets.id],
	}),
	createdBy: one(users, {
		fields: [assetShareLinks.createdByUserId],
		references: [users.id],
	}),
}));
