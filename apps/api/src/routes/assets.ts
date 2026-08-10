import {
	FolderCycleError,
	LocalDiskStorage,
	buildAssetKey,
	insertFolderWithAncestors,
	moveFolderSubtree,
	notUnderTrashedAncestor,
	permanentlyDeleteSubtree,
	queueForMimeType,
	resolveStorageDriver,
} from "@ossplay/core";
import { type Asset, assetActivity, assets, folderClosure, folders, getDb, users } from "@ossplay/db";
import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { getProjectWithDestination, type ProjectWithDestination } from "../lib/drive/resolve-project";
import { getQueue } from "../lib/queue";
import { requireAuth } from "../middleware/require-auth";
import { requireOrgPermission } from "../middleware/require-org-permission";
import type { AppEnv } from "../types";

export const assetsRoute = new Hono<AppEnv>();

const gate = [requireAuth, requireOrgPermission("org:manage_assets")] as const;

async function requireProject(orgId: string, projectId: string) {
	return getProjectWithDestination(orgId, projectId);
}

async function requireAsset(projectId: string, assetId: string): Promise<Asset | null> {
	const [asset] = await getDb()
		.select()
		.from(assets)
		.where(and(eq(assets.id, assetId), eq(assets.projectId, projectId)));
	return asset ?? null;
}

async function logActivity(
	assetId: string,
	action: "uploaded" | "renamed" | "moved" | "trashed" | "restored",
	actorUserId: string,
	fromValue: string | null = null,
	toValue: string | null = null,
): Promise<void> {
	await getDb().insert(assetActivity).values({ assetId, action, actorUserId, fromValue, toValue });
}

// image/rules.serving is the only static-vs-signed rule that exists today
// (see s3-storage.ts's own comment) — every other mimeType defaults to
// signed until that rule surface grows.
function shouldServeStatic(project: ProjectWithDestination, mimeType: string): boolean {
	return mimeType.startsWith("image/") && project.rules.image.serving === "static";
}

async function assertFolderExists(projectId: string, folderId: string | null): Promise<boolean> {
	if (!folderId) return true;
	const [folder] = await getDb()
		.select({ id: folders.id })
		.from(folders)
		.where(and(eq(folders.id, folderId), eq(folders.projectId, projectId), isNull(folders.deletedAt)));
	return Boolean(folder);
}

// Single-asset fetch — used by the deep-linkable preview page
// (/project/:id/file/:assetId) and search-result navigation, which land
// directly on an asset with no surrounding drive-browse response already
// in hand.
assetsRoute.get("/:orgId/projects/:projectId/assets/:assetId", ...gate, async (c) => {
	const { orgId, projectId, assetId } = c.req.param();
	const project = await requireProject(orgId, projectId);
	if (!project) return c.json({ error: "Project not found" }, 404);
	const asset = await requireAsset(projectId, assetId);
	if (!asset || asset.deletedAt) return c.json({ error: "Asset not found" }, 404);
	return c.json({ asset });
});

const createUploadSchema = z.object({
	folderId: z.uuid().nullable(),
	filename: z.string().trim().min(1).max(255),
	mimeType: z.string().trim().min(1),
	size: z.number().int().nonnegative().optional(),
});

assetsRoute.post("/:orgId/projects/:projectId/uploads", ...gate, async (c) => {
	const { orgId, projectId } = c.req.param();
	const project = await requireProject(orgId, projectId);
	if (!project) return c.json({ error: "Project not found" }, 404);

	const parsed = createUploadSchema.safeParse(await c.req.json().catch(() => null));
	if (!parsed.success) return c.json({ error: "Invalid input" }, 400);
	if (!(await assertFolderExists(projectId, parsed.data.folderId))) {
		return c.json({ error: "Folder not found" }, 404);
	}

	const storage = resolveStorageDriver(project);

	const assetId = crypto.randomUUID();
	const key = buildAssetKey(projectId, assetId, parsed.data.filename);
	await getDb().insert(assets).values({
		id: assetId,
		projectId,
		folderId: parsed.data.folderId,
		filename: parsed.data.filename,
		mimeType: parsed.data.mimeType,
		s3Path: key,
		size: parsed.data.size,
	});

	return c.json({ assetId, key, uploadTarget: storage.createUploadTarget(key, { mimeType: parsed.data.mimeType }) }, 201);
});

const batchItemSchema = z.object({
	relativePath: z.string().trim(),
	filename: z.string().trim().min(1).max(255),
	mimeType: z.string().trim().min(1),
	size: z.number().int().nonnegative().optional(),
});
const createBatchUploadSchema = z.object({
	folderId: z.uuid().nullable(),
	items: z.array(batchItemSchema).min(1).max(500),
});

// Folder-upload variant: `items[].relativePath` is the folder path
// (segment names joined by "/", "" = directly in `folderId`) each file
// lives at *within* the batch — every distinct intermediate path gets
// find-or-created once, memoized per call, before any pending asset rows
// are inserted.
assetsRoute.post("/:orgId/projects/:projectId/uploads/batch", ...gate, async (c) => {
	const { orgId, projectId } = c.req.param();
	const project = await requireProject(orgId, projectId);
	if (!project) return c.json({ error: "Project not found" }, 404);

	const parsed = createBatchUploadSchema.safeParse(await c.req.json().catch(() => null));
	if (!parsed.success) return c.json({ error: "Invalid input" }, 400);
	if (!(await assertFolderExists(projectId, parsed.data.folderId))) {
		return c.json({ error: "Folder not found" }, 404);
	}

	const storage = resolveStorageDriver(project);

	const actor = c.get("user");
	const db = getDb();
	const pathFolderIds = new Map<string, string | null>([["", parsed.data.folderId]]);

	async function resolveFolderPath(path: string): Promise<string | null> {
		const cached = pathFolderIds.get(path);
		if (cached !== undefined) return cached;
		const segments = path.split("/");
		const parentPath = segments.slice(0, -1).join("/");
		const name = segments[segments.length - 1] as string;
		const parentId = await resolveFolderPath(parentPath);

		const [existing] = await db
			.select({ id: folders.id })
			.from(folders)
			.where(
				and(
					eq(folders.projectId, projectId),
					parentId ? eq(folders.parentId, parentId) : isNull(folders.parentId),
					eq(folders.name, name),
					isNull(folders.deletedAt),
				),
			);
		if (existing) {
			pathFolderIds.set(path, existing.id);
			return existing.id;
		}

		const [created] = await db
			.insert(folders)
			.values({ projectId, parentId, name, createdByUserId: actor.id })
			.returning();
		if (!created) throw new Error("Folder insert did not return the expected row");
		await insertFolderWithAncestors(db, created.id, parentId);
		pathFolderIds.set(path, created.id);
		return created.id;
	}

	const results: Array<{ relativePath: string; filename: string; assetId: string; key: string; uploadTarget: string }> = [];
	for (const item of parsed.data.items) {
		const folderId = await resolveFolderPath(item.relativePath);
		const assetId = crypto.randomUUID();
		const key = buildAssetKey(projectId, assetId, item.filename);
		await db.insert(assets).values({
			id: assetId,
			projectId,
			folderId,
			filename: item.filename,
			mimeType: item.mimeType,
			s3Path: key,
			size: item.size,
		});
		results.push({
			relativePath: item.relativePath,
			filename: item.filename,
			assetId,
			key,
			uploadTarget: storage.createUploadTarget(key, { mimeType: item.mimeType }),
		});
	}

	return c.json({ items: results }, 201);
});

assetsRoute.post("/:orgId/projects/:projectId/assets/:assetId/confirm", ...gate, async (c) => {
	const { orgId, projectId, assetId } = c.req.param();
	const project = await requireProject(orgId, projectId);
	if (!project) return c.json({ error: "Project not found" }, 404);
	const asset = await requireAsset(projectId, assetId);
	if (!asset) return c.json({ error: "Asset not found" }, 404);

	const storage = resolveStorageDriver(project);
	const stat = await storage.statObject(asset.s3Path);
	if (!stat) return c.json({ error: "Upload not found — the file was never actually received" }, 400);

	const actor = c.get("user");
	const queueName = queueForMimeType(asset.mimeType);
	await getDb()
		.update(assets)
		.set({ size: stat.size, status: queueName ? "processing" : "ready" })
		.where(eq(assets.id, assetId));
	await logActivity(assetId, "uploaded", actor.id);

	if (queueName) {
		await getQueue(queueName).add("process", {
			assetId,
			projectId,
			s3Path: asset.s3Path,
			mimeType: asset.mimeType,
		});
	}

	const updated = await requireAsset(projectId, assetId);
	return c.json({ asset: updated });
});

// Local-disk-only raw byte receiver — the URL LocalDiskStorage's
// createUploadTarget hands back. 400s if the project isn't actually in
// local-disk mode (e.g. a stale client still holding an old upload target
// after the project's destination was configured).
assetsRoute.put("/:orgId/projects/:projectId/assets/:assetId/local-upload", ...gate, async (c) => {
	const { orgId, projectId, assetId } = c.req.param();
	const project = await requireProject(orgId, projectId);
	if (!project) return c.json({ error: "Project not found" }, 404);
	const asset = await requireAsset(projectId, assetId);
	if (!asset) return c.json({ error: "Asset not found" }, 404);

	const storage = resolveStorageDriver(project);
	if (!(storage instanceof LocalDiskStorage)) {
		return c.json({ error: "This project isn't using local-disk storage" }, 400);
	}
	const body = c.req.raw.body;
	if (!body) return c.json({ error: "No file body" }, 400);
	await storage.writeObject(asset.s3Path, body);

	return c.body(null, 204);
});

assetsRoute.get("/:orgId/projects/:projectId/assets/:assetId/content", ...gate, async (c) => {
	const { orgId, projectId, assetId } = c.req.param();
	const project = await requireProject(orgId, projectId);
	if (!project) return c.json({ error: "Project not found" }, 404);
	const asset = await requireAsset(projectId, assetId);
	if (!asset || asset.deletedAt) return c.json({ error: "Asset not found" }, 404);

	const disposition = c.req.query("disposition") === "attachment" ? "attachment" : "inline";
	const storage = resolveStorageDriver(project);

	if (storage instanceof LocalDiskStorage) {
		const stream = await storage.readObject(asset.s3Path);
		if (!stream) return c.json({ error: "File not found in storage" }, 404);
		return new Response(stream, {
			headers: {
				"content-type": asset.mimeType,
				"content-disposition": `${disposition}; filename="${encodeURIComponent(asset.filename)}"`,
			},
		});
	}

	const url = storage.createDownloadUrl(asset.s3Path, {
		disposition,
		static: shouldServeStatic(project, asset.mimeType),
	});
	return c.redirect(url, 302);
});

assetsRoute.get("/:orgId/projects/:projectId/assets/:assetId/activity", ...gate, async (c) => {
	const { orgId, projectId, assetId } = c.req.param();
	const project = await requireProject(orgId, projectId);
	if (!project) return c.json({ error: "Project not found" }, 404);
	const asset = await requireAsset(projectId, assetId);
	if (!asset) return c.json({ error: "Asset not found" }, 404);

	const rows = await getDb()
		.select({
			id: assetActivity.id,
			action: assetActivity.action,
			fromValue: assetActivity.fromValue,
			toValue: assetActivity.toValue,
			createdAt: assetActivity.createdAt,
			actorName: users.name,
			actorEmail: users.email,
		})
		.from(assetActivity)
		.leftJoin(users, eq(users.id, assetActivity.actorUserId))
		.where(eq(assetActivity.assetId, assetId))
		.orderBy(desc(assetActivity.createdAt));

	return c.json({ activity: rows });
});

const updateAssetSchema = z.object({
	filename: z.string().trim().min(1).max(255).optional(),
	folderId: z.uuid().nullable().optional(),
});

assetsRoute.patch("/:orgId/projects/:projectId/assets/:assetId", ...gate, async (c) => {
	const { orgId, projectId, assetId } = c.req.param();
	const project = await requireProject(orgId, projectId);
	if (!project) return c.json({ error: "Project not found" }, 404);
	const existing = await requireAsset(projectId, assetId);
	if (!existing || existing.deletedAt) return c.json({ error: "Asset not found" }, 404);

	const parsed = updateAssetSchema.safeParse(await c.req.json().catch(() => null));
	if (!parsed.success) return c.json({ error: "Invalid input" }, 400);

	const actor = c.get("user");
	const db = getDb();

	if (parsed.data.folderId !== undefined && parsed.data.folderId !== existing.folderId) {
		if (!(await assertFolderExists(projectId, parsed.data.folderId))) {
			return c.json({ error: "Target folder not found" }, 404);
		}
		await db.update(assets).set({ folderId: parsed.data.folderId }).where(eq(assets.id, assetId));
		await logActivity(assetId, "moved", actor.id, existing.folderId, parsed.data.folderId);
	}

	if (parsed.data.filename !== undefined && parsed.data.filename !== existing.filename) {
		await db.update(assets).set({ filename: parsed.data.filename }).where(eq(assets.id, assetId));
		await logActivity(assetId, "renamed", actor.id, existing.filename, parsed.data.filename);
	}

	const updated = await requireAsset(projectId, assetId);
	return c.json({ asset: updated });
});

assetsRoute.post("/:orgId/projects/:projectId/assets/:assetId/trash", ...gate, async (c) => {
	const { orgId, projectId, assetId } = c.req.param();
	const project = await requireProject(orgId, projectId);
	if (!project) return c.json({ error: "Project not found" }, 404);
	const existing = await requireAsset(projectId, assetId);
	if (!existing || existing.deletedAt) return c.json({ error: "Asset not found" }, 404);

	const actor = c.get("user");
	await getDb().update(assets).set({ deletedAt: new Date() }).where(eq(assets.id, assetId));
	await logActivity(assetId, "trashed", actor.id);
	return c.body(null, 204);
});

assetsRoute.post("/:orgId/projects/:projectId/assets/:assetId/restore", ...gate, async (c) => {
	const { orgId, projectId, assetId } = c.req.param();
	const project = await requireProject(orgId, projectId);
	if (!project) return c.json({ error: "Project not found" }, 404);
	const existing = await requireAsset(projectId, assetId);
	if (!existing) return c.json({ error: "Asset not found" }, 404);
	if (!existing.deletedAt) return c.json({ error: "Asset isn't in the recycle bin" }, 400);

	const db = getDb();
	if (existing.folderId) {
		const [visible] = await db
			.select({ id: folders.id })
			.from(folders)
			.where(and(eq(folders.id, existing.folderId), notUnderTrashedAncestor(folders.id)));
		if (!visible) {
			return c.json({ error: "The containing folder is also trashed — restore that one first" }, 409);
		}
	}

	const actor = c.get("user");
	await db.update(assets).set({ deletedAt: null }).where(eq(assets.id, assetId));
	await logActivity(assetId, "restored", actor.id);
	return c.body(null, 204);
});

assetsRoute.delete("/:orgId/projects/:projectId/assets/:assetId", ...gate, async (c) => {
	const { orgId, projectId, assetId } = c.req.param();
	const project = await requireProject(orgId, projectId);
	if (!project) return c.json({ error: "Project not found" }, 404);
	const existing = await requireAsset(projectId, assetId);
	if (!existing) return c.json({ error: "Asset not found" }, 404);
	if (!existing.deletedAt) return c.json({ error: "Move this asset to the recycle bin first" }, 400);

	await permanentlyDeleteSubtree(getDb(), project, { kind: "asset", id: assetId });
	return c.body(null, 204);
});

// Project-scoped. Trigram-ranked via the pg_trgm GIN indexes on
// folders.name/assets.filename (migration 0009): `%` is pg_trgm's
// similarity operator (threshold set by pg_trgm.similarity_threshold,
// default 0.3), OR'd with a plain ilike substring match so short/partial
// queries (e.g. "img") that fall below the trigram threshold still hit —
// ilike alone can't use the GIN index for arbitrary substrings, but the OR
// still benefits from the index via the `%` branch's bitmap scan on the
// common case. Ranked by similarity() so closer matches surface first.
assetsRoute.get("/:orgId/projects/:projectId/search", ...gate, async (c) => {
	const { orgId, projectId } = c.req.param();
	const project = await requireProject(orgId, projectId);
	if (!project) return c.json({ error: "Project not found" }, 404);

	const q = c.req.query("q")?.trim();
	if (!q) return c.json({ folders: [], assets: [] });

	const db = getDb();
	const matchedFolders = await db
		.select()
		.from(folders)
		.where(
			and(
				eq(folders.projectId, projectId),
				isNull(folders.deletedAt),
				notUnderTrashedAncestor(folders.id),
				sql`(${folders.name} % ${q} OR ${folders.name} ilike ${`%${q}%`})`,
			),
		)
		.orderBy(sql`similarity(${folders.name}, ${q}) desc`)
		.limit(25);
	const matchedAssets = await db
		.select()
		.from(assets)
		.where(
			and(
				eq(assets.projectId, projectId),
				isNull(assets.deletedAt),
				// Same exclusion as the folder-browse endpoint (folders.ts) — a
				// derived variant (HLS segment, thumbnail, format conversion)
				// shouldn't be independently searchable/navigable, only the
				// original it was generated from.
				isNull(assets.parentAssetId),
				assets.folderId ? notUnderTrashedAncestor(assets.folderId) : undefined,
				sql`(${assets.filename} % ${q} OR ${assets.filename} ilike ${`%${q}%`})`,
			),
		)
		.orderBy(sql`similarity(${assets.filename}, ${q}) desc`)
		.limit(25);

	return c.json({ folders: matchedFolders, assets: matchedAssets });
});

const bulkTargetSchema = z.object({
	folderIds: z.array(z.uuid()).default([]),
	assetIds: z.array(z.uuid()).default([]),
});

assetsRoute.post("/:orgId/projects/:projectId/bulk/trash", ...gate, async (c) => {
	const { orgId, projectId } = c.req.param();
	const project = await requireProject(orgId, projectId);
	if (!project) return c.json({ error: "Project not found" }, 404);
	const parsed = bulkTargetSchema.safeParse(await c.req.json().catch(() => null));
	if (!parsed.success) return c.json({ error: "Invalid input" }, 400);

	const actor = c.get("user");
	const db = getDb();
	const results: Record<string, boolean> = {};

	if (parsed.data.folderIds.length > 0) {
		await db
			.update(folders)
			.set({ deletedAt: new Date() })
			.where(and(inArray(folders.id, parsed.data.folderIds), eq(folders.projectId, projectId)));
		for (const id of parsed.data.folderIds) results[id] = true;
	}
	for (const assetId of parsed.data.assetIds) {
		try {
			await db.update(assets).set({ deletedAt: new Date() }).where(and(eq(assets.id, assetId), eq(assets.projectId, projectId)));
			await logActivity(assetId, "trashed", actor.id);
			results[assetId] = true;
		} catch {
			results[assetId] = false;
		}
	}

	return c.json({ results });
});

assetsRoute.post("/:orgId/projects/:projectId/bulk/restore", ...gate, async (c) => {
	const { orgId, projectId } = c.req.param();
	const project = await requireProject(orgId, projectId);
	if (!project) return c.json({ error: "Project not found" }, 404);
	const parsed = bulkTargetSchema.safeParse(await c.req.json().catch(() => null));
	if (!parsed.success) return c.json({ error: "Invalid input" }, 400);

	const actor = c.get("user");
	const db = getDb();
	const results: Record<string, boolean> = {};

	for (const folderId of parsed.data.folderIds) {
		try {
			const [trashedAncestor] = await db
				.select({ id: folderClosure.ancestorId })
				.from(folderClosure)
				.innerJoin(folders, eq(folders.id, folderClosure.ancestorId))
				.where(
					and(
						eq(folderClosure.descendantId, folderId),
						sql`${folderClosure.ancestorId} != ${folderId}`,
						sql`${folders.deletedAt} is not null`,
					),
				);
			if (trashedAncestor) {
				results[folderId] = false;
				continue;
			}
			await db.update(folders).set({ deletedAt: null }).where(eq(folders.id, folderId));
			results[folderId] = true;
		} catch {
			results[folderId] = false;
		}
	}
	for (const assetId of parsed.data.assetIds) {
		try {
			const [asset] = await db.select().from(assets).where(eq(assets.id, assetId));
			if (!asset) {
				results[assetId] = false;
				continue;
			}
			if (asset.folderId) {
				const [visible] = await db
					.select({ id: folders.id })
					.from(folders)
					.where(and(eq(folders.id, asset.folderId), notUnderTrashedAncestor(folders.id)));
				if (!visible) {
					results[assetId] = false;
					continue;
				}
			}
			await db.update(assets).set({ deletedAt: null }).where(eq(assets.id, assetId));
			await logActivity(assetId, "restored", actor.id);
			results[assetId] = true;
		} catch {
			results[assetId] = false;
		}
	}

	return c.json({ results });
});

const bulkMoveSchema = bulkTargetSchema.extend({ targetFolderId: z.uuid().nullable() });

assetsRoute.post("/:orgId/projects/:projectId/bulk/move", ...gate, async (c) => {
	const { orgId, projectId } = c.req.param();
	const project = await requireProject(orgId, projectId);
	if (!project) return c.json({ error: "Project not found" }, 404);
	const parsed = bulkMoveSchema.safeParse(await c.req.json().catch(() => null));
	if (!parsed.success) return c.json({ error: "Invalid input" }, 400);
	if (!(await assertFolderExists(projectId, parsed.data.targetFolderId))) {
		return c.json({ error: "Target folder not found" }, 404);
	}

	const actor = c.get("user");
	const db = getDb();
	const results: Record<string, boolean> = {};

	for (const folderId of parsed.data.folderIds) {
		try {
			await moveFolderSubtree(db, folderId, parsed.data.targetFolderId);
			results[folderId] = true;
		} catch (err) {
			if (!(err instanceof FolderCycleError)) throw err;
			results[folderId] = false;
		}
	}
	for (const assetId of parsed.data.assetIds) {
		try {
			const [asset] = await db.select({ folderId: assets.folderId }).from(assets).where(eq(assets.id, assetId));
			if (!asset) {
				results[assetId] = false;
				continue;
			}
			await db.update(assets).set({ folderId: parsed.data.targetFolderId }).where(eq(assets.id, assetId));
			await logActivity(assetId, "moved", actor.id, asset.folderId, parsed.data.targetFolderId);
			results[assetId] = true;
		} catch {
			results[assetId] = false;
		}
	}

	return c.json({ results });
});

assetsRoute.post("/:orgId/projects/:projectId/bulk/delete", ...gate, async (c) => {
	const { orgId, projectId } = c.req.param();
	const project = await requireProject(orgId, projectId);
	if (!project) return c.json({ error: "Project not found" }, 404);
	const parsed = bulkTargetSchema.safeParse(await c.req.json().catch(() => null));
	if (!parsed.success) return c.json({ error: "Invalid input" }, 400);

	const db = getDb();
	const results: Record<string, boolean> = {};

	for (const folderId of parsed.data.folderIds) {
		try {
			await permanentlyDeleteSubtree(db, project, { kind: "folder", id: folderId });
			results[folderId] = true;
		} catch {
			results[folderId] = false;
		}
	}
	for (const assetId of parsed.data.assetIds) {
		try {
			await permanentlyDeleteSubtree(db, project, { kind: "asset", id: assetId });
			results[assetId] = true;
		} catch {
			results[assetId] = false;
		}
	}

	return c.json({ results });
});
