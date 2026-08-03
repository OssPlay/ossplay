import { relations } from "drizzle-orm";
import {
	type AnyPgColumn,
	bigint,
	index,
	integer,
	jsonb,
	pgTable,
	primaryKey,
	text,
	timestamp,
	uuid,
} from "drizzle-orm/pg-core";
import { organizations } from "./organization.schema";

export type ProjectRules = {
	image: {
		format: "webp" | "avif" | "original";
		splitTiles: boolean;
		serving: "static" | "signed";
	};
	video: {
		resolutions: string[];
		hlsSegmentDuration: number;
		drmAes128: boolean;
	};
};

export const projects = pgTable("projects", {
	id: uuid("id").primaryKey().defaultRandom(),
	orgId: uuid("org_id")
		.references(() => organizations.id, { onDelete: "cascade" })
		.notNull(),
	name: text("name").notNull(),
	rules: jsonb("rules").$type<ProjectRules>().notNull(),
	createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

// PRD.md §6 defines folderClosure and assets.folderId without a backing `folders`
// table (no columns for a folder's name/project/parent beyond what the closure
// table implies). Left as-is for this infra scaffold: designing the actual
// folder entity is product/schema work, not scaffolding — see MEMORY.md.
export const folderClosure = pgTable(
	"folder_closure",
	{
		ancestorId: uuid("ancestor_id").notNull(),
		descendantId: uuid("descendant_id").notNull(),
		depth: integer("depth").notNull(),
	},
	(table) => [
		primaryKey({ columns: [table.ancestorId, table.descendantId] }),
		index("folder_closure_descendant_idx").on(table.descendantId),
	],
);

export const assets = pgTable("assets", {
	id: uuid("id").primaryKey().defaultRandom(),
	projectId: uuid("project_id")
		.references(() => projects.id, { onDelete: "cascade" })
		.notNull(),
	folderId: uuid("folder_id"),
	filename: text("filename").notNull(),
	mimeType: text("mime_type").notNull(),
	s3Path: text("s3_path").notNull(),
	// Nullable: not known until the upload completes.
	size: bigint("size", { mode: "number" }),
	// Free-form, type-specific (image dimensions, video duration/codec, etc.)
	// — same jsonb-for-variable-shape pattern as projects.rules.
	metadata: jsonb("metadata").$type<Record<string, unknown>>(),
	// Self-reference for derived variants (a thumbnail, an HLS rendition, a
	// WebP conversion) — null means this is an original, not a variant.
	// Deleting the original cascades to its variants.
	parentAssetId: uuid("parent_asset_id").references((): AnyPgColumn => assets.id, {
		onDelete: "cascade",
	}),
	status: text("status", {
		enum: ["pending", "processing", "ready", "failed"],
	})
		.default("pending")
		.notNull(),
	createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export type Project = typeof projects.$inferSelect;
export type Asset = typeof assets.$inferSelect;

export const projectsRelations = relations(projects, ({ one, many }) => ({
	organization: one(organizations, {
		fields: [projects.orgId],
		references: [organizations.id],
	}),
	assets: many(assets),
}));

// parentAssetId is a self-reference (see the column comment above) — both
// sides need the same relationName since Drizzle can't otherwise infer
// which of a table's several relations to itself pairs with which.
export const assetsRelations = relations(assets, ({ one, many }) => ({
	project: one(projects, {
		fields: [assets.projectId],
		references: [projects.id],
	}),
	parentAsset: one(assets, {
		fields: [assets.parentAssetId],
		references: [assets.id],
		relationName: "assetVariants",
	}),
	variants: many(assets, { relationName: "assetVariants" }),
}));
