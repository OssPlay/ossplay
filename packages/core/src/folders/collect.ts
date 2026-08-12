import { assets, folderClosure } from "@ossplay/db";
import { and, inArray, isNull } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";

// biome-ignore lint/suspicious/noExplicitAny: same Drizzle db-or-transaction shape as closure.ts's Db.
type Db = PgDatabase<PgQueryResultHKT, any, any>;

// Walks every folder id's full descendant subtree (via folderClosure, same
// idiom as recycle.ts's permanentlyDeleteSubtree — folderClosure includes
// each folder as its own ancestor at depth 0, so the folder ids themselves
// are covered too) and returns the live, original assets found anywhere in
// it — the selection a bulk zip download actually wants. Deliberately NOT
// a reuse of recycle.ts's collectAssetAndVariantKeys: that walks
// parentAssetId to include every derived variant of a soon-to-be-deleted
// asset, with delete semantics (includes trashed rows); this is read-only,
// live-originals-only, for download.
export async function collectLiveOriginalAssetsUnderFolders(
	db: Db,
	folderIds: string[],
): Promise<{ id: string; s3Path: string; filename: string; size: number | null }[]> {
	if (folderIds.length === 0) return [];
	const descendantFolders = await db
		.select({ id: folderClosure.descendantId })
		.from(folderClosure)
		.where(inArray(folderClosure.ancestorId, folderIds));
	const allFolderIds = [...new Set(descendantFolders.map((row) => row.id))];
	if (allFolderIds.length === 0) return [];

	return db
		.select({ id: assets.id, s3Path: assets.s3Path, filename: assets.filename, size: assets.size })
		.from(assets)
		.where(
			and(
				inArray(assets.folderId, allFolderIds),
				isNull(assets.deletedAt),
				isNull(assets.parentAssetId),
			),
		);
}
