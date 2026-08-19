import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	type AudioProcessingJob,
	getProjectWithDestination,
	resolveStorageDriver,
} from "@ossplay/core";
import { assets, getDb } from "@ossplay/db";
import type { Job } from "bullmq";
import { eq } from "drizzle-orm";
import sharp from "sharp";
import { createVariant, ffprobeJson, finalizeVariant, markAssetStatus } from "./shared";
import { run } from "./spawn";

// Upload-time processing is thumbnail-only by design (see the plan's
// per-mimetype variant matrix) — the eager 128kbps MP3 transcode this used
// to do is gone; on-demand MP3 transcoding at a requested bitrate (the
// `requestedVariant` branch below) replaces it. The "thumbnail" for audio
// is embedded cover art, if the source has any — silently producing no
// thumbnail row otherwise (thumbnailAssetId is nullable), not a failure.
export async function processAudio(job: Job<AudioProcessingJob>): Promise<void> {
	const { assetId, projectId, requestedVariant } = job.data;

	const project = await getProjectWithDestination(projectId);
	if (!project) throw new Error(`Project ${projectId} not found`);

	const [original] = await getDb().select().from(assets).where(eq(assets.id, assetId));
	if (!original) throw new Error(`Asset ${assetId} not found`);

	const storage = resolveStorageDriver(project);
	const bytes = await storage.downloadObject(original.s3Path);

	const workDir = await mkdtemp(join(tmpdir(), "ossplay-audio-"));
	try {
		const inputPath = join(workDir, "input");
		await writeFile(inputPath, bytes);

		if (requestedVariant) {
			if (requestedVariant.spec.kind !== "audio-transcode") {
				throw new Error(`Unexpected variant kind for audio asset: ${requestedVariant.spec.kind}`);
			}
			const outputPath = join(workDir, "output.mp3");
			await run("ffmpeg", [
				"-y",
				"-i",
				inputPath,
				"-codec:a",
				"libmp3lame",
				"-b:a",
				requestedVariant.spec.bitrate,
				outputPath,
			]);
			const output = await readFile(outputPath);
			await finalizeVariant(requestedVariant.variantAssetId, storage, new Uint8Array(output));
			return;
		}

		// No embedded art is a normal, common case (not every file has a
		// cover) — swallow ffmpeg's failure rather than failing the whole
		// job over a missing optional thumbnail. Extracted as PNG, then
		// converted to webp via sharp rather than ffmpeg's own webp encoder
		// directly — see video.ts's processVideo for why (ffmpeg only has
		// one when built with libwebp linked in, which Homebrew's default
		// formula doesn't do; sharp always bundles its own).
		const coverPath = join(workDir, "cover.png");
		let hasCover = true;
		try {
			await run("ffmpeg", ["-y", "-i", inputPath, "-an", "-vcodec", "png", coverPath]);
		} catch {
			hasCover = false;
		}
		if (hasCover) {
			const coverBytes = await readFile(coverPath);
			const coverWebp = await sharp(coverBytes).webp().toBuffer();
			await createVariant({
				projectId,
				folderId: original.folderId,
				parentAssetId: assetId,
				filename: replaceExt(original.filename, "webp", "-thumb"),
				mimeType: "image/webp",
				storage,
				data: coverWebp,
				metadata: { variant: "thumbnail" },
			});
		}

		const probe = await ffprobeJson(inputPath);
		const audioStream = probe.streams?.find((s) => s.codec_type === "audio");
		await markAssetStatus(assetId, "ready", {
			codec: audioStream?.codec_name ?? null,
			sampleRate: audioStream?.sample_rate ? Number.parseInt(audioStream.sample_rate, 10) : null,
			channels: audioStream?.channels ?? null,
			durationSeconds: probe.format?.duration ? Number.parseFloat(probe.format.duration) : null,
			bitrate: probe.format?.bit_rate ? Number.parseInt(probe.format.bit_rate, 10) : null,
			hasCoverArt: hasCover,
		});
	} finally {
		await rm(workDir, { force: true, recursive: true });
	}
}

function replaceExt(filename: string, ext: string, suffix = ""): string {
	return `${filename.replace(/\.[^.]+$/, "")}${suffix}.${ext}`;
}
