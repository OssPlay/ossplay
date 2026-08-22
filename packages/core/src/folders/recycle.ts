import { assets, folderClosure, folders } from "@ossplay/db";
import { eq, inArray, sql } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { resolveStorageDriver } from "../storage/resolve";
import type { StorageDriver } from "../storage/types";

// biome-ignore lint/suspicious/noExplicitAny: same Drizzle db-or-transaction shape as closure.ts's Db.
type Db = PgDatabase<PgQueryResultHKT, any, any>;

interface StorageProjectRef {
	id: string;
	orgId: string;
	destinationId: string | null;
	destination: {
		endpoint: string;
		bucket: string;
		region: string;
		accessKeyId: string;
		secretAccessKeyEncrypted: string;
		cloudfrontUrl: string | null;
		visibility: "public" | "private";
	} | null;
}

interface DeletionPlan {
	// Whole-folder deletes — new-convention roots only. Trailing slash so a
	// prefix match can never accidentally also match a sibling root asset
	// whose id happens to start with the same characters.
	prefixes: string[];
	// Exact-key deletes — old-convention roots, any non-root row (a lone
	// stale variant, an instant-deleted subtitle/audio-track), and every
	// derivative of an old-convention root.
	keys: string[];
}

// Walks an asset's parentAssetId chain to collect what needs deleting from
// storage — their DB rows already cascade-delete together, but their
// storage objects don't. A new-convention root (nested under its own
// `${projectId}/${id}/` folder) is deleted as a single prefix and its
// children aren't walked individually: every derivative's folderId always
// equals its root's folderId (createVariant's callers always pass
// `folderId: original.folderId`), so a folder-scoped delete already found
// them independently, and they're already covered by the root's prefix.
// An old-convention root (flat `${projectId}/${id}.${ext}` key — never
// matches the `/${id}/` prefix check, since a real extension always
// follows immediately) falls back to the exact-key walk this always did.
async function planAssetDeletion(db: Db, projectId: string, assetIds: string[]): Promise<DeletionPlan> {
	const prefixes: string[] = [];
	const keys: string[] = [];
	if (assetIds.length === 0) return { prefixes, keys };

	const seen = new Set<string>();
	const coveredRoots = new Set<string>();
	let frontier = assetIds;
	while (frontier.length > 0) {
		const rows = await db
			.select({ id: assets.id, s3Path: assets.s3Path, parentAssetId: assets.parentAssetId })
			.from(assets)
			.where(inArray(assets.id, frontier));
		if (rows.length === 0) break;

		const walkChildrenFor: string[] = [];
		for (const row of rows) {
			if (seen.has(row.id)) continue;
			seen.add(row.id);
			const rootId = row.parentAssetId ?? row.id;
			if (coveredRoots.has(rootId)) continue;

			if (row.parentAssetId === null && row.s3Path.startsWith(`${projectId}/${row.id}/`)) {
				prefixes.push(`${projectId}/${row.id}/`);
				coveredRoots.add(row.id);
				continue;
			}
			keys.push(row.s3Path);
			walkChildrenFor.push(row.id);
		}

		if (walkChildrenFor.length === 0) {
			frontier = [];
			continue;
		}
		const variantRows = await db
			.select({ id: assets.id })
			.from(assets)
			.where(inArray(assets.parentAssetId, walkChildrenFor));
		frontier = variantRows.filter((row) => !seen.has(row.id)).map((row) => row.id);
	}
	return { prefixes, keys };
}

async function executeDeletionPlan(storage: StorageDriver, plan: DeletionPlan): Promise<void> {
	await Promise.all([
		...plan.prefixes.map(async (prefix) => {
			try {
				await storage.deletePrefix(prefix);
			} catch (err) {
				// Best-effort, same reasoning as the per-key case below.
				console.error(`[recycle] failed to delete storage prefix ${prefix}:`, err);
			}
		}),
		...plan.keys.map(async (key) => {
			try {
				await storage.deleteObject(key);
			} catch (err) {
				// Best-effort: an already-missing object, or a transient storage
				// failure, shouldn't block the DB cleanup — an orphaned object in
				// a bucket is a much smaller problem than a row that can never be
				// removed. Logged loudly so it's at least diagnosable.
				console.error(`[recycle] failed to delete storage object ${key}:`, err);
			}
		}),
	]);
}

// Permanently removes a trashed folder or asset: deletes every affected
// storage object first (best-effort), then a single DELETE that lets the
// FK cascade chain (folders.parentId, assets.folderId, assets.parentAssetId
// — all onDelete: "cascade") remove every DB row in one statement. Reused
// by the daily expiry sweep, "delete forever," and "empty trash" — the
// same 3 call sites this module's own comment in the plan called out.
export async function permanentlyDeleteSubtree(
	db: Db,
	project: StorageProjectRef,
	target: { kind: "folder"; id: string } | { kind: "asset"; id: string },
): Promise<void> {
	let assetIds: string[];
	if (target.kind === "asset") {
		assetIds = [target.id];
	} else {
		const descendantFolders = await db
			.select({ id: folderClosure.descendantId })
			.from(folderClosure)
			.where(eq(folderClosure.ancestorId, target.id));
		const folderIds = descendantFolders.map((row) => row.id);
		const assetRows =
			folderIds.length > 0
				? await db.select({ id: assets.id }).from(assets).where(inArray(assets.folderId, folderIds))
				: [];
		assetIds = assetRows.map((row) => row.id);
	}

	const plan = await planAssetDeletion(db, project.id, assetIds);
	if (plan.prefixes.length > 0 || plan.keys.length > 0) {
		// Resolved lazily, only once there's actually something to delete —
		// an empty folder (or a folder subtree with no assets in it) should
		// never need a working storage destination just to be removed.
		// Building an S3Storage decrypts the destination's stored secret
		// immediately (see S3Storage's constructor), so doing this eagerly
		// would break deleting an empty folder on a project whose
		// destination credentials happen to be unreadable/misconfigured —
		// a real bug this would otherwise reintroduce.
		const storage = resolveStorageDriver(project);
		await executeDeletionPlan(storage, plan);
	}

	if (target.kind === "asset") {
		await db.delete(assets).where(eq(assets.id, target.id));
	} else {
		await db.delete(folders).where(eq(folders.id, target.id));
	}
}

// The 30-day sweep: every trashed folder/asset (top-level only — same
// "no own deletedAt means it's covered by a trashed ancestor" reasoning as
// the trash-listing route) older than the cutoff gets permanently deleted.
export async function sweepExpiredTrash(db: Db, project: StorageProjectRef, olderThanDays = 30): Promise<number> {
	const cutoff = new Date(Date.now() - olderThanDays * 24 * 60 * 60 * 1000).toString();

	const expiredFolders = await db
		.select({ id: folders.id })
		.from(folders)
		.where(
			sql`${folders.projectId} = ${project.id} and ${folders.deletedAt} is not null and ${folders.deletedAt} < ${cutoff}`,
		);
	const expiredAssets = await db
		.select({ id: assets.id })
		.from(assets)
		.where(
			sql`${assets.projectId} = ${project.id} and ${assets.deletedAt} is not null and ${assets.deletedAt} < ${cutoff}`,
		);

	for (const folder of expiredFolders) {
		await permanentlyDeleteSubtree(db, project, { kind: "folder", id: folder.id });
	}
	for (const asset of expiredAssets) {
		await permanentlyDeleteSubtree(db, project, { kind: "asset", id: asset.id });
	}
	return expiredFolders.length + expiredAssets.length;
}
