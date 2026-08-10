import { mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import type { Job } from "bullmq";
import { type VideoProcessingJob, getProjectWithDestination, resolveStorageDriver } from "@ossplay/core";
import { assets, getDb } from "@ossplay/db";
import { eq } from "drizzle-orm";
import { createVariant, ffprobeJson, markAssetStatus, parseFrameRate } from "./shared";
import { run } from "./spawn";

// Scoped down from the full `resolutions: string[]` ladder — packages a
// single rendition (the first configured resolution, or source resolution
// if none configured) rather than a full adaptive-bitrate multi-rendition
// set. A real multi-rendition master playlist is a meaningfully bigger
// feature (per-rendition segment sets, a master .m3u8 selecting between
// them); flagged as a follow-up, not silently dropped.
export async function processVideo(job: Job<VideoProcessingJob>): Promise<void> {
	const { assetId, projectId } = job.data;

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

		const rules = project.rules.video;
		const targetHeight = parseResolutionHeight(rules.resolutions[0]);
		const playlistPath = join(workDir, "stream.m3u8");
		const segmentPattern = join(workDir, "segment_%05d.ts");

		const args = ["-y", "-i", inputPath];
		if (targetHeight) args.push("-vf", `scale=-2:${targetHeight}`);
		args.push(
			"-hls_time",
			String(rules.hlsSegmentDuration),
			"-hls_playlist_type",
			"vod",
			"-hls_segment_filename",
			segmentPattern,
		);

		let keyInfoPath: string | null = null;
		let keyBytes: Uint8Array | null = null;
		if (rules.drmAes128) {
			keyBytes = randomBytes(16);
			const iv = randomBytes(16).toString("hex");
			const keyPath = join(workDir, "key.bin");
			await writeFile(keyPath, keyBytes);
			keyInfoPath = join(workDir, "key.keyinfo");
			// ffmpeg's hls_key_info_file format: key URI (written into the
			// manifest as-is), local key file path (for ffmpeg to read the
			// actual key bytes), IV. The URI here is a placeholder rewritten
			// below, same as segment filenames — the real key asset's URL
			// isn't known until after upload.
			await writeFile(keyInfoPath, `KEY_URI_PLACEHOLDER\n${keyPath}\n${iv}\n`);
			args.push("-hls_key_info_file", keyInfoPath);
		}
		args.push(playlistPath);

		await run("ffmpeg", args);

		const files = await readdir(workDir);
		const segmentFiles = files.filter((f) => f.endsWith(".ts")).sort();
		const segmentKeyByFilename = new Map<string, string>();

		for (const segmentFile of segmentFiles) {
			const segmentBytes = await readFile(join(workDir, segmentFile));
			const variant = await createVariant({
				projectId,
				folderId: original.folderId,
				parentAssetId: assetId,
				filename: segmentFile,
				mimeType: "video/mp2t",
				storage,
				data: new Uint8Array(segmentBytes),
				metadata: { variant: "hls-segment" },
			});
			segmentKeyByFilename.set(segmentFile, variant.s3Path);
		}

		let keyUrl: string | null = null;
		if (rules.drmAes128 && keyBytes) {
			const keyVariant = await createVariant({
				projectId,
				folderId: original.folderId,
				parentAssetId: assetId,
				filename: "key.bin",
				mimeType: "application/octet-stream",
				storage,
				data: keyBytes,
				// The key object itself is stored like any other variant, but
				// unlike segments/manifest it must NOT be handed out through the
				// same unauthenticated-by-mimeType content route — real access
				// control for this key (short-lived signed URL per viewer, not a
				// stable public link) is follow-up work, not yet wired.
				metadata: { variant: "hls-key", accessControlPending: true },
			});
			keyUrl = storage.createDownloadUrl(keyVariant.s3Path, { static: false });
		}

		let playlistText = await readFile(playlistPath, "utf8");
		for (const [filename, key] of segmentKeyByFilename) {
			const url = storage.createDownloadUrl(key, { static: false });
			playlistText = playlistText.replaceAll(filename, url);
		}
		if (keyUrl) playlistText = playlistText.replace("KEY_URI_PLACEHOLDER", keyUrl);

		await createVariant({
			projectId,
			folderId: original.folderId,
			parentAssetId: assetId,
			filename: "stream.m3u8",
			mimeType: "application/vnd.apple.mpegurl",
			storage,
			data: new TextEncoder().encode(playlistText),
			metadata: { variant: "hls-manifest", segmentCount: segmentFiles.length },
		});

		const probe = await ffprobeJson(inputPath);
		const videoStream = probe.streams?.find((s) => s.codec_type === "video");
		await markAssetStatus(assetId, "ready", {
			segmentCount: segmentFiles.length,
			targetHeight: targetHeight ?? null,
			width: videoStream?.width ?? null,
			height: videoStream?.height ?? null,
			codec: videoStream?.codec_name ?? null,
			frameRate: parseFrameRate(videoStream?.r_frame_rate),
			durationSeconds: probe.format?.duration ? Number.parseFloat(probe.format.duration) : null,
			bitrate: probe.format?.bit_rate ? Number.parseInt(probe.format.bit_rate, 10) : null,
		});
	} finally {
		await rm(workDir, { force: true, recursive: true });
	}
}

function parseResolutionHeight(resolution: string | undefined): number | null {
	if (!resolution) return null;
	const match = resolution.match(/(\d+)p?$/i);
	return match?.[1] ? Number.parseInt(match[1], 10) : null;
}
