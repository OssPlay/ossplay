import {
	buildThumbnailKey,
	getProjectWithDestination,
	type ImageProcessingJob,
	resolveStorageDriver,
	transformImage,
} from "@ossplay/core";
import { assets, getDb } from "@ossplay/db";
import type { Job } from "bullmq";
import { eq } from "drizzle-orm";
import sharp from "sharp";
import { createVariant, finalizeVariant, markAssetStatus } from "./shared";

const THUMBNAIL_MAX_DIMENSION = 512;

// Upload-time processing is thumbnail-only by design (see the plan's
// per-mimetype variant matrix) — format conversion and resize tiers are
// now on-demand only, requested via the download UI and handled by the
// `requestedVariant` branch below. `splitTiles` (DeepZoom-style zoomable
// tile pyramid) remains unimplemented regardless: sharp can produce one
// (`.tile()`), but that outputs a whole directory tree, which would need
// the same kind of manifest-rewrite work video.ts's HLS packaging needed.
export async function processImage(job: Job<ImageProcessingJob>): Promise<void> {
	const { assetId, projectId, mimeType, requestedVariant } = job.data;

	const project = await getProjectWithDestination(projectId);
	if (!project) throw new Error(`Project ${projectId} not found`);

	const [original] = await getDb().select().from(assets).where(eq(assets.id, assetId));
	if (!original) throw new Error(`Asset ${assetId} not found`);

	const storage = resolveStorageDriver(project);
	const bytes = await storage.downloadObject(original.s3Path);

	if (requestedVariant) {
		if (requestedVariant.spec.kind !== "image-format") {
			throw new Error(`Unexpected variant kind for image asset: ${requestedVariant.spec.kind}`);
		}
		const { format, maxDimension } = requestedVariant.spec;
		const dimension = maxDimension === "original" ? null : maxDimension;
		const converted = await transformImage(bytes, {
			format,
			width: dimension,
			height: dimension,
			quality: null,
		});
		await finalizeVariant(requestedVariant.variantAssetId, storage, converted);
		return;
	}

	const image = sharp(bytes);
	const meta = await image.metadata();

	const thumbnailBuffer = await transformImage(bytes, {
		format: "webp",
		width: THUMBNAIL_MAX_DIMENSION,
		height: THUMBNAIL_MAX_DIMENSION,
		quality: null,
	});
	await createVariant({
		projectId,
		folderId: original.folderId,
		parentAssetId: assetId,
		key: buildThumbnailKey(projectId, assetId),
		filename: replaceExt(original.filename, "webp", "-thumb"),
		mimeType: "image/webp",
		storage,
		data: thumbnailBuffer,
		metadata: { variant: "thumbnail", width: meta.width, height: meta.height },
	});

	await markAssetStatus(assetId, projectId, "ready", {
		width: meta.width,
		height: meta.height,
		mimeType,
		format: meta.format,
		// Rounded to 1dp — "12.3MP" reads like a camera spec sheet, the raw
		// division to full float precision doesn't.
		megapixels:
			meta.width && meta.height ? Math.round((meta.width * meta.height) / 100_000) / 10 : null,
		colorSpace: meta.space ?? null,
		hasAlpha: meta.hasAlpha ?? null,
	});
}

function replaceExt(filename: string, ext: string, suffix = ""): string {
	const base = filename.replace(/\.[^.]+$/, "");
	return `${base}${suffix}.${ext}`;
}
