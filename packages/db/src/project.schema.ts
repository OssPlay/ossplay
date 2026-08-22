import { relations, sql } from "drizzle-orm";
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
	uniqueIndex,
	uuid,
} from "drizzle-orm/pg-core";
import { organizations, s3Destinations } from "./organization.schema";
import { users } from "./user.schema";

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

// `id` is app-supplied (no defaultRandom) — a slug derived from the
// project's name, editable at creation, required to be unique across the
// whole instance (not just the org). Two reasons it's a readable string
// rather than an opaque uuid: a forthcoming project-scoped API-key feature
// will key off of it, and it's used to organize this project's objects in
// S3. Existing rows created before this change keep whatever uuid string
// they already had — a uuid is a valid string, no backfill needed.
export const projects = pgTable("projects", {
	id: text("id").primaryKey(),
	orgId: uuid("org_id")
		.references(() => organizations.id, { onDelete: "cascade" })
		.notNull(),
	name: text("name").notNull(),
	// Immutable once created — an S3 destination's own visibility
	// (public/private) is likewise immutable, so a project can only ever
	// point at a destination matching this value (enforced in projects.ts).
	visibility: text("visibility", { enum: ["public", "private"] }).notNull(),
	// Changeable later (project settings) — new uploads go to whatever
	// destination is current, previously-stored files don't move. Nullable:
	// a project with no destination — never assigned one, or its assigned
	// destination was later deleted (onDelete: "set null" below) — falls
	// back to local-disk storage automatically (see packages/core/src/
	// storage/resolve.ts). This is a real fallback in every deployment, not
	// a dev-only mode: an org with zero configured S3 destinations, or a
	// project whose destination just got deleted, must never end up with
	// nowhere to store files.
	destinationId: uuid("destination_id").references(() => s3Destinations.id, {
		onDelete: "set null",
	}),
	rules: jsonb("rules").$type<ProjectRules>().notNull(),
	createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

// Folder entity backing folderClosure/assets.folderId — PRD.md §6 originally
// specified the closure table without this (see MEMORY.md), left as an infra
// scaffold gap until the Drive feature needed real folder rows to exist.
export const folders = pgTable(
	"folders",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		projectId: text("project_id")
			.references(() => projects.id, { onDelete: "cascade" })
			.notNull(),
		// null = project root. Self-reference, so a folder can nest under
		// another — moves go through packages/core/src/folders/closure.ts's
		// moveFolderSubtree, never a bare UPDATE (see that module's comment).
		parentId: uuid("parent_id").references((): AnyPgColumn => folders.id, {
			onDelete: "cascade",
		}),
		name: text("name").notNull(),
		// Recycle bin: null = live. Trashing/restoring a folder is a single
		// row write here — visibility for descendants is computed at read
		// time via the closure table (see notUnderTrashedAncestor), not by
		// fanning this out to every descendant row.
		deletedAt: timestamp("deleted_at", { withTimezone: true }),
		createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
		updatedAt: timestamp("updated_at", { withTimezone: true })
			.defaultNow()
			.notNull()
			.$onUpdate(() => new Date()),
		createdByUserId: uuid("created_by_user_id").references(() => users.id, {
			onDelete: "set null",
		}),
	},
	(table) => [
		index("folders_project_id_idx").on(table.projectId),
		index("folders_parent_id_idx").on(table.parentId),
		// Duplicate names among trashed siblings are fine (nothing user-facing
		// cares once something's in the recycle bin) — only live siblings need
		// to stay unique. Doesn't fully cover root-level (parentId null)
		// siblings on its own: a plain unique index treats every NULL as
		// distinct from every other NULL, and this drizzle-orm version's
		// index builder has no NULLS NOT DISTINCT option — apps/api/src/
		// routes/folders.ts does an explicit pre-check for that case. This
		// index still catches every non-null-parent duplicate, and guards
		// against a genuine concurrent-insert race on those.
		uniqueIndex("folders_parent_name_unique")
			.on(table.projectId, table.parentId, table.name)
			.where(sql`deleted_at is null`),
		// Trigram, not a tsvector/'english' config — filenames aren't prose,
		// stemming would hurt exact-token matches like "IMG_2024". Requires
		// the pg_trgm extension (see migration 0009's hand-added
		// `CREATE EXTENSION IF NOT EXISTS pg_trgm` — drizzle-kit generate
		// can't infer that statement from a schema diff).
		index("folders_name_trgm_idx").using("gin", table.name.op("gin_trgm_ops")),
	],
);

// Ancestor/descendant closure table for `folders` — every folder is its own
// ancestor at depth 0. Maintained exclusively through
// packages/core/src/folders/closure.ts (insertFolderWithAncestors /
// moveFolderSubtree) — never insert/update these rows directly at a call
// site (see CLAUDE.md's closure-table invariant).
export const folderClosure = pgTable(
	"folder_closure",
	{
		ancestorId: uuid("ancestor_id")
			.references(() => folders.id, { onDelete: "cascade" })
			.notNull(),
		descendantId: uuid("descendant_id")
			.references(() => folders.id, { onDelete: "cascade" })
			.notNull(),
		depth: integer("depth").notNull(),
	},
	(table) => [
		primaryKey({ columns: [table.ancestorId, table.descendantId] }),
		index("folder_closure_descendant_idx").on(table.descendantId),
	],
);

export const assets = pgTable(
	"assets",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		projectId: text("project_id")
			.references(() => projects.id, { onDelete: "cascade" })
			.notNull(),
		// null = project root, same convention as folders.parentId. Cascades on
		// folder delete — this is what makes the recycle-bin hard-delete sweep
		// (packages/core/src/folders/recycle.ts) a single DELETE FROM folders
		// instead of recursive application code: deleting a trashed folder
		// cascades through here to every asset inside it.
		folderId: uuid("folder_id").references(() => folders.id, { onDelete: "cascade" }),
		// The mutable display name — renaming updates this column directly, it
		// never touches the S3/local object. The real key's shape is
		// convention-dependent (don't assume it): newer rows nest everything
		// under `<projectId>/<rootAssetId>/...` with a fixed leaf name per
		// artifact kind, older rows still use the flat `<projectId>/<assetId>.
		// <ext>` convention they were written with (see
		// packages/core/src/storage/key.ts — forward-only, no backfill). A
		// rename can make the apparent extension stale relative to the real
		// object (e.g. "photo.jpg" renamed to "vacation.png") — cosmetic only,
		// mimeType stays authoritative for actual file handling. Every rename is
		// also recorded in assetActivity below, not folded into this column.
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
		// Recycle bin — same single-row-write, computed-visibility convention as
		// folders.deletedAt.
		deletedAt: timestamp("deleted_at", { withTimezone: true }),
		createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
		updatedAt: timestamp("updated_at", { withTimezone: true })
			.defaultNow()
			.notNull()
			.$onUpdate(() => new Date()),
	},
	(table) => [
		// Trigram, not tsvector/'english' — see folders_name_trgm_idx's comment.
		index("assets_filename_trgm_idx").using("gin", table.filename.op("gin_trgm_ops")),
		// Covers the drive listing's WHERE filter (projectId/folderId/
		// parentAssetId/deletedAt) plus its default sort column and an id
		// tiebreaker — both the keyset boundary the cursor-paginated drive
		// route needs and the first index this table has ever had for its own
		// WHERE clause (previously unindexed entirely, offset pagination and
		// all). Other sort options (size/updatedAt/createdAt) stay correct but
		// unaccelerated by this index — no regression vs. today, just not yet
		// covered; add a matching index if one of those proves to need it.
		index("assets_drive_listing_idx").on(
			table.projectId,
			table.folderId,
			table.parentAssetId,
			table.deletedAt,
			table.filename,
			table.id,
		),
	],
);

// A per-asset activity feed (upload/rename/move/trash/restore), distinct
// from lib/audit/log.ts's logAudit — that table is deliberately scoped to
// root/instance-level and org-lifecycle actions (see its own comment), not
// granular per-resource history. Permanent delete is NOT logged here: the
// row (and its whole trail, via the cascade below) is removed by that same
// operation, so there's nothing left to read it back from.
export const assetActivity = pgTable(
	"asset_activity",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		assetId: uuid("asset_id")
			.references(() => assets.id, { onDelete: "cascade" })
			.notNull(),
		action: text("action", {
			enum: ["uploaded", "renamed", "moved", "trashed", "restored"],
		}).notNull(),
		// Old/new filename for "renamed", old/new folderId for "moved", null
		// for the rest — free-form on purpose, this is a display feed, not a
		// structured audit record.
		fromValue: text("from_value"),
		toValue: text("to_value"),
		actorUserId: uuid("actor_user_id").references(() => users.id, { onDelete: "set null" }),
		createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
	},
	(table) => [index("asset_activity_asset_id_idx").on(table.assetId, table.createdAt.desc())],
);

export type Project = typeof projects.$inferSelect;
export type Folder = typeof folders.$inferSelect;
export type Asset = typeof assets.$inferSelect;
export type AssetActivity = typeof assetActivity.$inferSelect;

export const projectsRelations = relations(projects, ({ one, many }) => ({
	organization: one(organizations, {
		fields: [projects.orgId],
		references: [organizations.id],
	}),
	assets: many(assets),
	folders: many(folders),
}));

// parentId is a self-reference (see the column comment above) — both sides
// need the same relationName, same reasoning as assets.parentAssetId below.
export const foldersRelations = relations(folders, ({ one, many }) => ({
	project: one(projects, {
		fields: [folders.projectId],
		references: [projects.id],
	}),
	parent: one(folders, {
		fields: [folders.parentId],
		references: [folders.id],
		relationName: "folderChildren",
	}),
	children: many(folders, { relationName: "folderChildren" }),
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
	folder: one(folders, {
		fields: [assets.folderId],
		references: [folders.id],
	}),
	parentAsset: one(assets, {
		fields: [assets.parentAssetId],
		references: [assets.id],
		relationName: "assetVariants",
	}),
	variants: many(assets, { relationName: "assetVariants" }),
	activity: many(assetActivity),
}));

export const assetActivityRelations = relations(assetActivity, ({ one }) => ({
	asset: one(assets, {
		fields: [assetActivity.assetId],
		references: [assets.id],
	}),
	actor: one(users, {
		fields: [assetActivity.actorUserId],
		references: [users.id],
	}),
}));
