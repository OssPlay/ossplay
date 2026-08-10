import {
	FolderCycleError,
	folderBreadcrumb,
	getFolder,
	insertFolderWithAncestors,
	moveFolderSubtree,
	notUnderTrashedAncestor,
	permanentlyDeleteSubtree,
} from "@ossplay/core";
import { type Folder, assets, folderClosure, folders, getDb } from "@ossplay/db";
import { and, desc, eq, inArray, isNull, ne, sql } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { getProjectWithDestination } from "../lib/drive/resolve-project";
import { parseListQuery } from "../lib/http/list-query";
import { requireAuth } from "../middleware/require-auth";
import { requireOrgPermission } from "../middleware/require-org-permission";
import type { AppEnv } from "../types";

export const foldersRoute = new Hono<AppEnv>();

const gate = [requireAuth, requireOrgPermission("org:manage_assets")] as const;

// True when `err` is (or wraps) a Postgres unique_violation — same helper
// shape as projects.ts's isUniqueViolation, kept local since each route
// file that needs it (projects.ts, this one) only has one call site.
function isUniqueViolation(err: unknown): boolean {
	const cause = err instanceof Error && err.cause ? err.cause : err;
	return Boolean(cause && typeof cause === "object" && "code" in cause && cause.code === "23505");
}

async function requireProject(orgId: string, projectId: string) {
	const project = await getProjectWithDestination(orgId, projectId);
	return project;
}

// The single browse endpoint backing the whole drive UI. `folderId`
// omitted (or empty) = project root. Breadcrumb/children are derived
// server-side from the id alone — the URL never carries a name-path.
foldersRoute.get("/:orgId/projects/:projectId/drive", ...gate, async (c) => {
	const { orgId, projectId } = c.req.param();
	const project = await requireProject(orgId, projectId);
	if (!project) return c.json({ error: "Project not found" }, 404);

	const folderId = c.req.query("folderId") || null;
	const db = getDb();

	let folder: Folder | null = null;
	let breadcrumb: Folder[] = [];
	if (folderId) {
		folder = await getFolder(db, projectId, folderId);
		// notUnderTrashedAncestor(folder.id) is self-inclusive (folder_closure's
		// depth-0 self row), so this alone also covers folder.deletedAt — a
		// direct navigation/bookmark to a folder whose *parent* got trashed
		// (this folder's own deletedAt stays null, per the no-fan-out design)
		// must still 404, not just a folder trashed directly.
		if (!folder) return c.json({ error: "Folder not found" }, 404);
		const [visible] = await db
			.select({ id: folders.id })
			.from(folders)
			.where(and(eq(folders.id, folder.id), notUnderTrashedAncestor(folders.id)));
		if (!visible) return c.json({ error: "Folder not found" }, 404);
		breadcrumb = await folderBreadcrumb(db, folderId);
	}

	const childFolders = await db
		.select()
		.from(folders)
		.where(
			and(
				eq(folders.projectId, projectId),
				folderId ? eq(folders.parentId, folderId) : isNull(folders.parentId),
				isNull(folders.deletedAt),
			),
		)
		.orderBy(folders.name);

	const query = parseListQuery(c, { searchable: [assets.filename], defaultPageSize: 60 });
	const assetWhere = and(
		eq(assets.projectId, projectId),
		folderId ? eq(assets.folderId, folderId) : isNull(assets.folderId),
		isNull(assets.deletedAt),
		// Derived variants (a thumbnail, an HLS segment/manifest, a
		// format-converted copy — see apps/worker/src/processors/shared.ts's
		// createVariant) live in the same folder as the asset they were
		// generated from, but aren't things a user ever uploaded or should
		// browse as their own row — excluding them here is what keeps a
		// single video upload (which can produce dozens of HLS segment rows)
		// from flooding this folder's listing.
		isNull(assets.parentAssetId),
		query.where,
	);
	const childAssets = await db
		.select()
		.from(assets)
		.where(assetWhere)
		.orderBy(assets.filename)
		.limit(query.limit)
		.offset(query.offset);
	const [totalRow] = await db
		.select({ count: sql<number>`count(*)::int` })
		.from(assets)
		.where(assetWhere);
	const total = totalRow?.count ?? 0;

	const childAssetsWithThumbnails = await attachThumbnails(db, childAssets);

	return c.json({
		folder,
		breadcrumb,
		childFolders,
		childAssets: { items: childAssetsWithThumbnails, total, page: query.page, pageSize: query.pageSize },
	});
});

// A designated thumbnail variant (image.ts/pdf.ts's `metadata.variant ===
// "thumbnail"`) is how the dashboard grid shows a real image instead of a
// generic file icon — batched into one extra query per listing call rather
// than a per-asset lookup.
async function attachThumbnails<T extends { id: string }>(
	db: ReturnType<typeof getDb>,
	rows: T[],
): Promise<(T & { thumbnailAssetId: string | null })[]> {
	if (rows.length === 0) return [];
	const thumbnails = await db
		.select({ parentAssetId: assets.parentAssetId, id: assets.id })
		.from(assets)
		.where(
			and(
				inArray(
					assets.parentAssetId,
					rows.map((r) => r.id),
				),
				sql`${assets.metadata} ->> 'variant' = 'thumbnail'`,
			),
		);
	const thumbnailByParent = new Map(thumbnails.map((t) => [t.parentAssetId, t.id]));
	return rows.map((row) => ({ ...row, thumbnailAssetId: thumbnailByParent.get(row.id) ?? null }));
}

const createFolderSchema = z.object({
	parentId: z.uuid().nullable(),
	name: z.string().trim().min(1).max(255),
});

foldersRoute.post("/:orgId/projects/:projectId/folders", ...gate, async (c) => {
	const { orgId, projectId } = c.req.param();
	const project = await requireProject(orgId, projectId);
	if (!project) return c.json({ error: "Project not found" }, 404);

	const parsed = createFolderSchema.safeParse(await c.req.json().catch(() => null));
	if (!parsed.success) return c.json({ error: "Invalid input" }, 400);

	const actor = c.get("user");
	const db = getDb();

	if (parsed.data.parentId) {
		const parent = await getFolder(db, projectId, parsed.data.parentId);
		if (!parent || parent.deletedAt) return c.json({ error: "Parent folder not found" }, 404);
	}

	// Explicit pre-check, not just the folders_parent_name_unique index's
	// catch block below: a plain unique index treats every NULL parent_id
	// as distinct from every other NULL (no NULLS NOT DISTINCT support in
	// this drizzle-orm version's index builder — see the schema comment),
	// so two root-level folders with the same name would otherwise slip
	// past the DB constraint entirely. This check covers that gap; the
	// catch block below still matters for a genuine concurrent-insert race
	// on a non-null parentId.
	const [existingSibling] = await db
		.select({ id: folders.id })
		.from(folders)
		.where(
			and(
				eq(folders.projectId, projectId),
				parsed.data.parentId ? eq(folders.parentId, parsed.data.parentId) : isNull(folders.parentId),
				eq(folders.name, parsed.data.name),
				isNull(folders.deletedAt),
			),
		);
	if (existingSibling) {
		return c.json({ error: "A folder with that name already exists here" }, 409);
	}

	try {
		const [folder] = await db
			.insert(folders)
			.values({
				projectId,
				parentId: parsed.data.parentId,
				name: parsed.data.name,
				createdByUserId: actor.id,
			})
			.returning();
		if (!folder) throw new Error("Folder insert did not return the expected row");

		await insertFolderWithAncestors(db, folder.id, parsed.data.parentId);

		return c.json({ folder }, 201);
	} catch (err) {
		if (isUniqueViolation(err)) {
			return c.json({ error: "A folder with that name already exists here" }, 409);
		}
		throw err;
	}
});

const updateFolderSchema = z.object({
	name: z.string().trim().min(1).max(255).optional(),
	parentId: z.uuid().nullable().optional(),
});

foldersRoute.patch("/:orgId/projects/:projectId/folders/:folderId", ...gate, async (c) => {
	const { orgId, projectId, folderId } = c.req.param();
	const project = await requireProject(orgId, projectId);
	if (!project) return c.json({ error: "Project not found" }, 404);

	const parsed = updateFolderSchema.safeParse(await c.req.json().catch(() => null));
	if (!parsed.success) return c.json({ error: "Invalid input" }, 400);

	const db = getDb();
	const existing = await getFolder(db, projectId, folderId);
	if (!existing || existing.deletedAt) return c.json({ error: "Folder not found" }, 404);

	if (parsed.data.parentId !== undefined && parsed.data.parentId !== existing.parentId) {
		if (parsed.data.parentId) {
			const target = await getFolder(db, projectId, parsed.data.parentId);
			if (!target || target.deletedAt) return c.json({ error: "Target folder not found" }, 404);
		}
		try {
			await moveFolderSubtree(db, folderId, parsed.data.parentId);
		} catch (err) {
			if (err instanceof FolderCycleError) return c.json({ error: err.message }, 409);
			throw err;
		}
	}

	if (parsed.data.name !== undefined) {
		try {
			await db.update(folders).set({ name: parsed.data.name }).where(eq(folders.id, folderId));
		} catch (err) {
			if (isUniqueViolation(err)) {
				return c.json({ error: "A folder with that name already exists here" }, 409);
			}
			throw err;
		}
	}

	const updated = await getFolder(db, projectId, folderId);
	return c.json({ folder: updated });
});

foldersRoute.post("/:orgId/projects/:projectId/folders/:folderId/trash", ...gate, async (c) => {
	const { orgId, projectId, folderId } = c.req.param();
	const project = await requireProject(orgId, projectId);
	if (!project) return c.json({ error: "Project not found" }, 404);

	const db = getDb();
	const existing = await getFolder(db, projectId, folderId);
	if (!existing || existing.deletedAt) return c.json({ error: "Folder not found" }, 404);

	await db.update(folders).set({ deletedAt: new Date() }).where(eq(folders.id, folderId));
	return c.body(null, 204);
});

foldersRoute.post("/:orgId/projects/:projectId/folders/:folderId/restore", ...gate, async (c) => {
	const { orgId, projectId, folderId } = c.req.param();
	const project = await requireProject(orgId, projectId);
	if (!project) return c.json({ error: "Project not found" }, 404);

	const db = getDb();
	const existing = await getFolder(db, projectId, folderId);
	if (!existing) return c.json({ error: "Folder not found" }, 404);
	if (!existing.deletedAt) return c.json({ error: "Folder isn't in the recycle bin" }, 400);

	// Checked separately from notUnderTrashedAncestor (which would also
	// count this folder's own still-set deletedAt via its depth-0 self-row)
	// — this restore-specific check only cares about real ancestors.
	const [trashedAncestor] = await db
		.select({ id: folderClosure.ancestorId })
		.from(folderClosure)
		.innerJoin(folders, eq(folders.id, folderClosure.ancestorId))
		.where(
			and(
				eq(folderClosure.descendantId, folderId),
				ne(folderClosure.ancestorId, folderId),
				sql`${folders.deletedAt} is not null`,
			),
		);
	if (trashedAncestor) {
		return c.json({ error: "A parent folder is also trashed — restore that one first" }, 409);
	}

	await db.update(folders).set({ deletedAt: null }).where(eq(folders.id, folderId));
	return c.body(null, 204);
});

foldersRoute.delete("/:orgId/projects/:projectId/folders/:folderId", ...gate, async (c) => {
	const { orgId, projectId, folderId } = c.req.param();
	const project = await requireProject(orgId, projectId);
	if (!project) return c.json({ error: "Project not found" }, 404);

	const db = getDb();
	const existing = await getFolder(db, projectId, folderId);
	if (!existing) return c.json({ error: "Folder not found" }, 404);
	if (!existing.deletedAt) {
		return c.json({ error: "Move this folder to the recycle bin first" }, 400);
	}

	// The storage-object cleanup for every asset under this subtree happens
	// via packages/core/src/folders/recycle.ts's permanentlyDeleteSubtree —
	// this route delegates to it rather than deleting the row directly, so
	// S3/local objects aren't orphaned.
	await permanentlyDeleteSubtree(db, project, { kind: "folder", id: folderId });

	return c.body(null, 204);
});

// Recycle bin listing: top-level trashed folders + assets (an item with a
// trashed ancestor doesn't get its own row — see notUnderTrashedAncestor's
// comment). "Top-level" here means deletedAt is set on the item itself; an
// asset/folder trashed only because a parent was trashed never has its own
// deletedAt set, so this query naturally excludes it without extra logic.
foldersRoute.get("/:orgId/projects/:projectId/trash", ...gate, async (c) => {
	const { orgId, projectId } = c.req.param();
	const project = await requireProject(orgId, projectId);
	if (!project) return c.json({ error: "Project not found" }, 404);

	const db = getDb();
	const trashedFolders = await db
		.select()
		.from(folders)
		.where(and(eq(folders.projectId, projectId), sql`${folders.deletedAt} is not null`))
		.orderBy(desc(folders.deletedAt));
	const trashedAssets = await db
		.select()
		.from(assets)
		.where(
			and(
				eq(assets.projectId, projectId),
				sql`${assets.deletedAt} is not null`,
				// Variants never get their own deletedAt (only ever trashed as a
				// side effect of their original), so this is defensive rather
				// than load-bearing — kept for the same reason as the browse
				// endpoint's filter: consistency, not because it's expected to
				// ever exclude a row in practice.
				isNull(assets.parentAssetId),
			),
		)
		.orderBy(desc(assets.deletedAt));

	return c.json({ folders: trashedFolders, assets: trashedAssets });
});

foldersRoute.post("/:orgId/projects/:projectId/trash/empty", ...gate, async (c) => {
	const { orgId, projectId } = c.req.param();
	const project = await requireProject(orgId, projectId);
	if (!project) return c.json({ error: "Project not found" }, 404);

	const db = getDb();

	const trashedFolders = await db
		.select({ id: folders.id })
		.from(folders)
		.where(and(eq(folders.projectId, projectId), sql`${folders.deletedAt} is not null`));
	const trashedAssets = await db
		.select({ id: assets.id })
		.from(assets)
		.where(and(eq(assets.projectId, projectId), sql`${assets.deletedAt} is not null`));

	for (const folder of trashedFolders) {
		await permanentlyDeleteSubtree(db, project, { kind: "folder", id: folder.id });
	}
	for (const asset of trashedAssets) {
		await permanentlyDeleteSubtree(db, project, { kind: "asset", id: asset.id });
	}

	return c.body(null, 204);
});
