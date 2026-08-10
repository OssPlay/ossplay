import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type AudioProcessingJob, getProjectWithDestination, resolveStorageDriver } from "@ossplay/core";
import { assets, getDb } from "@ossplay/db";
import type { Job } from "bullmq";
import { eq } from "drizzle-orm";
import { createVariant, markAssetStatus } from "./shared";
import { run } from "./spawn";

// PRD §3 calls for MP3/AAC/OGG transcoding, but ProjectRules has no audio
// section yet (no per-project format choice exists in the schema today) —
// a gap in the current rule surface, not something this processor invents
// around. Produces one broadly-compatible MP3 128kbps variant as a sane
// default until a real per-project audio rule exists.
export async function processAudio(job: Job<AudioProcessingJob>): Promise<void> {
	const { assetId, projectId } = job.data;

	const project = await getProjectWithDestination(projectId);
	if (!project) throw new Error(`Project ${projectId} not found`);

	const [original] = await getDb().select().from(assets).where(eq(assets.id, assetId));
	if (!original) throw new Error(`Asset ${assetId} not found`);

	const storage = resolveStorageDriver(project);
	const bytes = await storage.downloadObject(original.s3Path);

	const workDir = await mkdtemp(join(tmpdir(), "ossplay-audio-"));
	try {
		const inputPath = join(workDir, "input");
		const outputPath = join(workDir, "output.mp3");
		await writeFile(inputPath, bytes);

		await run("ffmpeg", ["-y", "-i", inputPath, "-codec:a", "libmp3lame", "-b:a", "128k", outputPath]);

		const output = await readFile(outputPath);
		await createVariant({
			projectId,
			folderId: original.folderId,
			parentAssetId: assetId,
			filename: replaceExt(original.filename, "mp3"),
			mimeType: "audio/mpeg",
			storage,
			data: new Uint8Array(output),
			metadata: { variant: "converted", bitrate: "128k" },
		});

		await markAssetStatus(assetId, "ready");
	} finally {
		await rm(workDir, { force: true, recursive: true });
	}
}

function replaceExt(filename: string, ext: string): string {
	return `${filename.replace(/\.[^.]+$/, "")}.${ext}`;
}
