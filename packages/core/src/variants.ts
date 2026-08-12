import { type Asset, assets } from "@ossplay/db";
import { and, eq, isNull, sql } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";

// Same Drizzle db-or-transaction shape as folders/closure.ts's Db.
// biome-ignore lint/suspicious/noExplicitAny: Drizzle's own recommended shape for "db client or transaction" — no narrower generic covers both.
type Db = PgDatabase<PgQueryResultHKT, any, any>;

// Shared by apps/api (checked before enqueueing a variant job — an
// existing ready row means an instant cache hit, no new job) and
// apps/worker isn't a consumer of this (it only writes via
// finalizeVariant), but both sides need the exact same jsonb-query shape
// as `metadata.specKey`, so this lives in packages/core rather than being
// duplicated. `variant: "on-demand"` distinguishes these rows from the
// eager thumbnail (`variant: "thumbnail"`) also parented to the same
// original — same jsonb-query idiom as folders.ts's attachThumbnails.
export async function findCachedVariant(
	db: Db,
	originalAssetId: string,
	specKey: string,
): Promise<Asset | null> {
	const [variant] = await db
		.select()
		.from(assets)
		.where(
			and(
				eq(assets.parentAssetId, originalAssetId),
				isNull(assets.deletedAt),
				sql`${assets.metadata} ->> 'variant' = 'on-demand'`,
				sql`${assets.metadata} ->> 'specKey' = ${specKey}`,
			),
		);
	return variant ?? null;
}
