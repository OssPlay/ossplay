import { type ImageProcessingJob, getProjectWithDestination, resolveStorageDriver } from "@ossplay/core";
import { assets, getDb } from "@ossplay/db";
import { eq } from "drizzle-orm";
import type { Job } from "bullmq";
import sharp from "sharp";
import { createVariant, markAssetStatus } from "./shared";

const THUMBNAIL_MAX_DIMENSION = 512;

// Scoped down from the full PRD §3 image rule set: `format`
// (webp/avif/original) and a thumbnail are implemented; `splitTiles`
// (DeepZoom-style zoomable tile pyramid) is a materially different,
// larger feature — sharp can produce one (`.tile()`), but that outputs a
// whole directory tree, which doesn't map onto this project's flat
// per-asset S3 key convention without the same kind of manifest-rewrite
// work video.ts's HLS packaging needed. Left as a documented follow-up
// rather than a half-built pyramid; every image still gets a real
// thumbnail and a real format conversion regardless of this rule.
export async function processImage(job: Job<ImageProcessingJob>): Promise<void> {
	const { assetId, projectId, mimeType } = job.data;

	const project = await getProjectWithDestination(projectId);
	if (!project) throw new Error(`Project ${projectId} not found`);

	const [original] = await getDb().select().from(assets).where(eq(assets.id, assetId));
	if (!original) throw new Error(`Asset ${assetId} not found`);

	const storage = resolveStorageDriver(project);
	const bytes = await storage.downloadObject(original.s3Path);

	const image = sharp(bytes);
	const meta = await image.metadata();

	const thumbnailBuffer = await sharp(bytes)
		.resize(THUMBNAIL_MAX_DIMENSION, THUMBNAIL_MAX_DIMENSION, { fit: "inside", withoutEnlargement: true })
		.webp()
		.toBuffer();
	await createVariant({
		projectId,
		folderId: original.folderId,
		parentAssetId: assetId,
		filename: replaceExt(original.filename, "webp", "-thumb"),
		mimeType: "image/webp",
		storage,
		data: thumbnailBuffer,
		metadata: { variant: "thumbnail", width: meta.width, height: meta.height },
	});

	const rules = project.rules.image;
	if (rules.format !== "original") {
		const converted =
			rules.format === "avif" ? await sharp(bytes).avif().toBuffer() : await sharp(bytes).webp().toBuffer();
		await createVariant({
			projectId,
			folderId: original.folderId,
			parentAssetId: assetId,
			filename: replaceExt(original.filename, rules.format),
			mimeType: `image/${rules.format}`,
			storage,
			data: converted,
			metadata: { variant: "converted", width: meta.width, height: meta.height },
		});
	}

	await markAssetStatus(assetId, "ready", {
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
