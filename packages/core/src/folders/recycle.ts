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

// Walks an asset's parentAssetId chain to collect every derived variant
// (thumbnail, HLS rendition, WebP conversion) alongside the original —
// their DB rows already cascade-delete together, but their storage
// objects don't, so this is what makes sure nothing gets orphaned in S3/
// local-disk.
async function collectAssetAndVariantKeys(db: Db, assetIds: string[]): Promise<string[]> {
	if (assetIds.length === 0) return [];
	const keys: string[] = [];
	let frontier = assetIds;
	const seen = new Set<string>();
	while (frontier.length > 0) {
		const rows = await db
			.select({ id: assets.id, s3Path: assets.s3Path })
			.from(assets)
			.where(inArray(assets.id, frontier));
		const nextFrontierIds: string[] = [];
		for (const row of rows) {
			if (seen.has(row.id)) continue;
			seen.add(row.id);
			keys.push(row.s3Path);
		}
		if (rows.length === 0) break;
		const variantRows = await db
			.select({ id: assets.id })
			.from(assets)
			.where(inArray(assets.parentAssetId, rows.map((row) => row.id)));
		for (const row of variantRows) {
			if (!seen.has(row.id)) nextFrontierIds.push(row.id);
		}
		frontier = nextFrontierIds;
	}
	return keys;
}

async function deleteKeys(storage: StorageDriver, keys: string[]): Promise<void> {
	await Promise.all(
		keys.map(async (key) => {
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
	);
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

	const keys = await collectAssetAndVariantKeys(db, assetIds);
	if (keys.length > 0) {
		// Resolved lazily, only once there's actually something to delete —
		// an empty folder (or a folder subtree with no assets in it) should
		// never need a working storage destination just to be removed.
		// Building an S3Storage decrypts the destination's stored secret
		// immediately (see S3Storage's constructor), so doing this eagerly
		// would break deleting an empty folder on a project whose
		// destination credentials happen to be unreadable/misconfigured —
		// a real bug this would otherwise reintroduce.
		const storage = resolveStorageDriver(project);
		await deleteKeys(storage, keys);
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
	const cutoff = new Date(Date.now() - olderThanDays * 24 * 60 * 60 * 1000);

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
