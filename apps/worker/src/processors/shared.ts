import { buildAssetKey, type StorageDriver } from "@ossplay/core";
import { type Asset, assets, getDb } from "@ossplay/db";
import { eq } from "drizzle-orm";

// One insert-then-upload helper, reused by every processor (image
// thumbnail + format conversion, video segments + manifest, pdf
// thumbnail) — each derived output is its own `assets` row with
// `parentAssetId` set to the original, matching the existing convention
// (see project.schema.ts's assets.parentAssetId comment).
export async function createVariant(opts: {
	projectId: string;
	folderId: string | null;
	parentAssetId: string;
	filename: string;
	mimeType: string;
	storage: StorageDriver;
	data: Uint8Array;
	metadata?: Record<string, unknown>;
}): Promise<Asset> {
	const id = crypto.randomUUID();
	const key = buildAssetKey(opts.projectId, id, opts.filename);
	await opts.storage.uploadObject(key, opts.data, { mimeType: opts.mimeType });
	const [asset] = await getDb()
		.insert(assets)
		.values({
			id,
			projectId: opts.projectId,
			folderId: opts.folderId,
			filename: opts.filename,
			mimeType: opts.mimeType,
			s3Path: key,
			size: opts.data.byteLength,
			parentAssetId: opts.parentAssetId,
			status: "ready",
			metadata: opts.metadata,
		})
		.returning();
	if (!asset) throw new Error("Variant asset insert did not return the expected row");
	return asset;
}

export async function markAssetStatus(
	assetId: string,
	status: "ready" | "failed",
	metadata?: Record<string, unknown>,
): Promise<void> {
	await getDb()
		.update(assets)
		.set({ status, ...(metadata !== undefined && { metadata }) })
		.where(eq(assets.id, assetId));
}
