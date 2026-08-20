import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	getProjectWithDestination,
	resolveStorageDriver,
	type VideoProcessingJob,
} from "@ossplay/core";
import { assets, getDb } from "@ossplay/db";
import type { Job } from "bullmq";
import { eq } from "drizzle-orm";
import sharp from "sharp";
import {
	createVariant,
	ffprobeJson,
	finalizeVariant,
	markAssetStatus,
	parseFrameRate,
} from "./shared";
import { run } from "./spawn";

// Upload-time processing is thumbnail-only by design (see the plan's
// per-mimetype variant matrix) — the eager HLS packaging this used to do
// (segments/manifest/key per upload) is gone; on-demand transcoding (the
// `requestedVariant` branch below, mp4 or webm depending on the requested
// spec) replaces it. ProjectRules' `hlsSegmentDuration`/`drmAes128` fields
// are left in the schema but are still unreachable — a deliberate, flagged
// gap, not a silent removal; true adaptive-bitrate HLS/DASH streaming and
// DRM remain a further follow-up, not something the embed feature
// (2026-08-20) repurposes these fixed-rendition fields for.
export async function processVideo(job: Job<VideoProcessingJob>): Promise<void> {
	const { assetId, projectId, requestedVariant } = job.data;

	const project = await getProjectWithDestination(projectId);
	if (!project) throw new Error(`Project ${projectId} not found`);

	const [original] = await getDb().select().from(assets).where(eq(assets.id, assetId));
	if (!original) throw new Error(`Asset ${assetId} not found`);

	const storage = resolveStorageDriver(project);
	const bytes = await storage.downloadObject(original.s3Path);

	const workDir = await mkdtemp(join(tmpdir(), "ossplay-video-"));
	try {
		const inputPath = join(workDir, "input");
		await writeFile(inputPath, bytes);

		if (requestedVariant) {
			if (requestedVariant.spec.kind !== "video-transcode") {
				throw new Error(`Unexpected variant kind for video asset: ${requestedVariant.spec.kind}`);
			}
			const { height, format } = requestedVariant.spec;
			const scaleFilter = `scale=-2:min(${height}\\,ih)`;
			const outputPath = join(workDir, `output.${format}`);
			await run(
				"ffmpeg",
				format === "webm"
					? [
							"-y",
							"-i",
							inputPath,
							"-vf",
							scaleFilter,
							"-c:v",
							"libvpx-vp9",
							"-crf",
							"32",
							"-b:v",
							"0",
							"-c:a",
							"libopus",
							outputPath,
						]
					: [
							"-y",
							"-i",
							inputPath,
							"-vf",
							scaleFilter,
							"-c:v",
							"libx264",
							"-crf",
							"23",
							"-c:a",
							"aac",
							"-movflags",
							"+faststart",
							outputPath,
						],
			);
			const output = await readFile(outputPath);
			await finalizeVariant(requestedVariant.variantAssetId, storage, new Uint8Array(output));
			return;
		}

		const probe = await ffprobeJson(inputPath);
		const videoStream = probe.streams?.find((s) => s.codec_type === "video");
		const durationSeconds = probe.format?.duration
			? Number.parseFloat(probe.format.duration)
			: null;
		// Avoids grabbing a black/title-card frame at 0 — halfway into the
		// clip (capped at 3s for anything short) is a much more
		// representative preview.
		const frameTimestamp = durationSeconds ? Math.min(3, durationSeconds / 2) : 0;

		// ffmpeg outputs a PNG frame, then sharp converts it to webp — not
		// ffmpeg's own webp encoder directly, since ffmpeg only has one when
		// built with libwebp linked in (Homebrew's default ffmpeg formula
		// doesn't), while sharp always bundles its own. Same split PDF
		// thumbnailing already uses (pdftoppm renders, sharp converts).
		const framePath = join(workDir, "frame.png");
		await run("ffmpeg", [
			"-y",
			"-ss",
			String(frameTimestamp),
			"-i",
			inputPath,
			"-frames:v",
			"1",
			"-vf",
			"scale=512:-1",
			framePath,
		]);
		const frameBytes = await readFile(framePath);
		// The `scale=512:-1` filter above already caps width, but preserves
		// aspect ratio unconditionally — an extreme-aspect-ratio source (e.g.
		// a very tall vertical clip) could still push height past WebP's
		// 16383px-per-side ceiling. Same defensive cap as pdf.ts/audio.ts.
		const thumbWebp = await sharp(frameBytes)
			.resize(1024, 1024, { fit: "inside", withoutEnlargement: true })
			.webp()
			.toBuffer();
		await createVariant({
			projectId,
			folderId: original.folderId,
			parentAssetId: assetId,
			filename: replaceExt(original.filename, "webp", "-thumb"),
			mimeType: "image/webp",
			storage,
			data: thumbWebp,
			metadata: { variant: "thumbnail", frameTimestamp },
		});

		await markAssetStatus(assetId, "ready", {
			width: videoStream?.width ?? null,
			height: videoStream?.height ?? null,
			codec: videoStream?.codec_name ?? null,
			frameRate: parseFrameRate(videoStream?.r_frame_rate),
			durationSeconds,
			bitrate: probe.format?.bit_rate ? Number.parseInt(probe.format.bit_rate, 10) : null,
		});
	} finally {
		await rm(workDir, { force: true, recursive: true });
	}
}

function replaceExt(filename: string, ext: string, suffix = ""): string {
	const base = filename.replace(/\.[^.]+$/, "");
	return `${base}${suffix}.${ext}`;
}
