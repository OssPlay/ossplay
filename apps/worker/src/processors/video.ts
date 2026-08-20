import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	getProjectWithDestination,
	resolveStorageDriver,
	type StorageDriver,
	type VideoProcessingJob,
} from "@ossplay/core";
import { assets, getDb } from "@ossplay/db";
import type { Job } from "bullmq";
import { eq } from "drizzle-orm";
import sharp from "sharp";
import {
	createVariant,
	ffprobeJson,
	finalizeHlsVariant,
	finalizeVariant,
	markAssetStatus,
	parseFrameRate,
} from "./shared";
import { run } from "./spawn";

// The rendition ladder for on-demand HLS packaging — filtered down to
// heights at or below the source's own resolution at package time (never
// upscale), same fixed-tier philosophy as VariantSpec's video-transcode
// heights.
const HLS_RUNGS = [1080, 720, 480, 360] as const;

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
			if (requestedVariant.spec.kind === "hls-package") {
				await packageHls(inputPath, workDir, requestedVariant.variantAssetId, storage);
				return;
			}
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

// Encodes an HLS rendition ladder + master playlist and hands every file
// (master + each rung's playlist + segments) to finalizeHlsVariant in one
// batch — see MEMORY.md/the plan doc for why this is generated on-demand
// (first real request through the adaptive player) rather than eagerly.
async function packageHls(
	inputPath: string,
	workDir: string,
	variantAssetId: string,
	storage: StorageDriver,
): Promise<void> {
	const probe = await ffprobeJson(inputPath);
	const videoStream = probe.streams?.find((s) => s.codec_type === "video");
	const sourceHeight = videoStream?.height ?? 1080;
	const aspect =
		videoStream?.width && videoStream?.height ? videoStream.width / videoStream.height : 16 / 9;

	const ladder: number[] = HLS_RUNGS.filter((h) => h <= sourceHeight);
	if (ladder.length === 0) ladder.push(sourceHeight);

	const files: { relativePath: string; data: Uint8Array; mimeType: string }[] = [];
	const streamInfLines: string[] = [];

	for (const height of ladder) {
		const rungDir = join(workDir, `${height}p`);
		await mkdir(rungDir, { recursive: true });
		// Forced keyframe interval (-g/-sc_threshold 0) keeps segment
		// boundaries fixed at exactly hls_time regardless of scene cuts —
		// without it, ffmpeg's default GOP placement drifts, which breaks
		// strict HLS clients expecting uniform segment durations.
		await run("ffmpeg", [
			"-y",
			"-i",
			inputPath,
			"-vf",
			`scale=-2:min(${height}\\,ih)`,
			"-c:v",
			"libx264",
			"-preset",
			"veryfast",
			"-crf",
			"23",
			"-g",
			"48",
			"-keyint_min",
			"48",
			"-sc_threshold",
			"0",
			"-c:a",
			"aac",
			"-b:a",
			"128k",
			"-hls_time",
			"6",
			"-hls_playlist_type",
			"vod",
			"-hls_segment_filename",
			join(rungDir, "seg%05d.ts"),
			join(rungDir, "index.m3u8"),
		]);

		const entries = await readdir(rungDir);
		const segmentFiles = entries.filter((f) => f.endsWith(".ts")).sort();
		let rungBytes = 0;
		for (const seg of segmentFiles) {
			const data = await readFile(join(rungDir, seg));
			rungBytes += data.byteLength;
			files.push({ relativePath: `${height}p/${seg}`, data: new Uint8Array(data), mimeType: "video/mp2t" });
		}
		const playlistText = await readFile(join(rungDir, "index.m3u8"), "utf8");
		files.push({
			relativePath: `${height}p/index.m3u8`,
			data: new TextEncoder().encode(playlistText),
			mimeType: "application/vnd.apple.mpegurl",
		});

		const durationSeconds = probe.format?.duration ? Number.parseFloat(probe.format.duration) : null;
		// A real measured bitrate from the actual encoded output, not a
		// guessed constant — falls back only if duration couldn't be probed.
		const bandwidth =
			durationSeconds && durationSeconds > 0 ? Math.round((rungBytes * 8) / durationSeconds) : 2_000_000;
		const width = Math.round((aspect * height) / 2) * 2;
		streamInfLines.push(
			`#EXT-X-STREAM-INF:BANDWIDTH=${bandwidth},RESOLUTION=${width}x${height}\n${height}p/index.m3u8`,
		);
	}

	// ffmpeg only produces each rung's own playlist — the master referencing
	// all of them is assembled here since the rungs were encoded as separate
	// invocations, not one multi-output ffmpeg call.
	const masterText = `#EXTM3U\n#EXT-X-VERSION:3\n${streamInfLines.join("\n")}\n`;
	files.push({
		relativePath: "master.m3u8",
		data: new TextEncoder().encode(masterText),
		mimeType: "application/vnd.apple.mpegurl",
	});

	await finalizeHlsVariant(variantAssetId, storage, files);
}

function replaceExt(filename: string, ext: string, suffix = ""): string {
	const base = filename.replace(/\.[^.]+$/, "");
	return `${base}${suffix}.${ext}`;
}
