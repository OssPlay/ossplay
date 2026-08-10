import { type Folder, folderClosure, folders } from "@ossplay/db";
import { and, eq, sql } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";

// Any Drizzle Postgres db/transaction handle — every function here can run
// inside a caller's transaction (e.g. a bulk-move route) or standalone.
// biome-ignore lint/suspicious/noExplicitAny: Drizzle's own recommended shape for "db client or transaction" — no narrower generic covers both.
type Db = PgDatabase<PgQueryResultHKT, any, any>;

// Self-row + copy-parent's-ancestors — the standard closure-table create.
// A brand new folder is its own ancestor at depth 0, plus every ancestor
// its parent already has, one depth deeper.
export async function insertFolderWithAncestors(
	db: Db,
	folderId: string,
	parentId: string | null,
): Promise<void> {
	await db.insert(folderClosure).values({ ancestorId: folderId, descendantId: folderId, depth: 0 });
	if (!parentId) return;
	await db.execute(sql`
		insert into ${folderClosure} (ancestor_id, descendant_id, depth)
		select ancestor_id, ${folderId}, depth + 1
		from ${folderClosure}
		where descendant_id = ${parentId}
	`);
}

export class FolderCycleError extends Error {
	constructor() {
		super("Cannot move a folder into itself or one of its own descendants");
	}
}

// Standard closure-table move: detach the subtree rooted at `folderId` from
// all of its old ancestors (its own internal ancestor/descendant pairs stay
// untouched), then re-attach it under `newParentId`. Deliberately raw `sql`,
// not the query builder — this is inherently set-based (a self-join delete,
// a cross-join insert) and forcing it through row-at-a-time builder calls
// would just be a slower, harder-to-read version of the same two
// statements. Never bypass this with a bare `UPDATE folders SET parent_id`
// (see CLAUDE.md's closure-table invariant) — that would leave every
// ancestor/descendant pair for the moved subtree pointing at the old
// location.
export async function moveFolderSubtree(
	db: Db,
	folderId: string,
	newParentId: string | null,
): Promise<void> {
	if (newParentId === folderId) throw new FolderCycleError();
	if (newParentId) {
		const [wouldCycle] = await db
			.select({ ancestorId: folderClosure.ancestorId })
			.from(folderClosure)
			.where(and(eq(folderClosure.ancestorId, folderId), eq(folderClosure.descendantId, newParentId)));
		if (wouldCycle) throw new FolderCycleError();
	}

	// Detach: delete every (ancestor outside the subtree) -> (descendant
	// inside the subtree) pair.
	await db.execute(sql`
		delete from ${folderClosure}
		where descendant_id in (
			select descendant_id from ${folderClosure} where ancestor_id = ${folderId}
		)
		and ancestor_id in (
			select ancestor_id from ${folderClosure}
			where descendant_id = ${folderId} and ancestor_id != descendant_id
		)
	`);

	await db.update(folders).set({ parentId: newParentId }).where(eq(folders.id, folderId));

	if (!newParentId) return;

	// Re-attach: cross every ancestor of the new parent (including itself)
	// with every descendant of the moved folder (including itself).
	await db.execute(sql`
		insert into ${folderClosure} (ancestor_id, descendant_id, depth)
		select supertree.ancestor_id, subtree.descendant_id, supertree.depth + subtree.depth + 1
		from ${folderClosure} supertree
		cross join ${folderClosure} subtree
		where supertree.descendant_id = ${newParentId}
		and subtree.ancestor_id = ${folderId}
	`);
}

// Direct lookup + project-ownership check. No path-walking needed — URLs
// carry the folder id directly (see the drive route's design).
export async function getFolder(
	db: Db,
	projectId: string,
	folderId: string,
): Promise<Folder | null> {
	const [folder] = await db
		.select()
		.from(folders)
		.where(and(eq(folders.id, folderId), eq(folders.projectId, projectId)));
	return folder ?? null;
}

// Ancestors root -> self, for breadcrumb UI. Excludes nothing — the folder
// itself is included as the last entry (depth 0).
export async function folderBreadcrumb(db: Db, folderId: string): Promise<Folder[]> {
	const rows = await db
		.select({ folder: folders, depth: folderClosure.depth })
		.from(folderClosure)
		.innerJoin(folders, eq(folders.id, folderClosure.ancestorId))
		.where(eq(folderClosure.descendantId, folderId))
		.orderBy(sql`${folderClosure.depth} desc`);
	return rows.map((row) => row.folder);
}

// Shared visibility rule for both normal browsing and trash-listing.
// `folder_closure` includes each folder as its own ancestor at depth 0, so
// passing a *folder's own id* here is a complete check on its own (its own
// deletedAt is covered by that self-row) — no separate deletedAt check
// needed at the call site. Passing an *asset's folderId* only checks the
// containing hierarchy, since assets aren't rows in folder_closure — a
// caller checking asset visibility still needs `asset.deletedAt is null`
// as a separate AND clause. Either way, this is why an item only ever
// shows up as its own standalone row in the recycle bin when it has no
// trashed ancestor — otherwise every descendant of a trashed folder would
// also appear as its own separate trash entry, and why restore can never
// leave something hidden-but-not-in-trash: visibility and trash-listing
// both read off this same fragment.
export function notUnderTrashedAncestor(folderIdColumn: unknown) {
	return sql`not exists (
		select 1 from ${folderClosure} fc
		join ${folders} anc on anc.id = fc.ancestor_id
		where fc.descendant_id = ${folderIdColumn}
		and anc.deleted_at is not null
	)`;
}
