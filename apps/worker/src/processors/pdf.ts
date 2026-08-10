import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type PdfProcessingJob, getProjectWithDestination, resolveStorageDriver } from "@ossplay/core";
import { assets, getDb } from "@ossplay/db";
import type { Job } from "bullmq";
import { eq } from "drizzle-orm";
import { createVariant, markAssetStatus } from "./shared";
import { run } from "./spawn";

// Thumbnail/preview only — PRD §3 explicitly rules out a PDF transcoding
// pipeline ("stored and served as-is"). First page only, rendered via
// poppler-utils' pdftoppm (needs `apk add poppler-utils` in
// runner-worker's Dockerfile stage, see infra/ossplay/Dockerfile).
export async function processPdf(job: Job<PdfProcessingJob>): Promise<void> {
	const { assetId, projectId } = job.data;

	const project = await getProjectWithDestination(projectId);
	if (!project) throw new Error(`Project ${projectId} not found`);

	const [original] = await getDb().select().from(assets).where(eq(assets.id, assetId));
	if (!original) throw new Error(`Asset ${assetId} not found`);

	const storage = resolveStorageDriver(project);
	const bytes = await storage.downloadObject(original.s3Path);

	const workDir = await mkdtemp(join(tmpdir(), "ossplay-pdf-"));
	try {
		const inputPath = join(workDir, "input.pdf");
		const outputPrefix = join(workDir, "thumb");
		await writeFile(inputPath, bytes);

		await run("pdftoppm", ["-png", "-singlefile", "-r", "150", "-f", "1", "-l", "1", inputPath, outputPrefix]);

		const output = await readFile(`${outputPrefix}.png`);
		await createVariant({
			projectId,
			folderId: original.folderId,
			parentAssetId: assetId,
			filename: replaceExt(original.filename, "png", "-thumb"),
			mimeType: "image/png",
			storage,
			data: new Uint8Array(output),
			metadata: { variant: "thumbnail", page: 1 },
		});

		await markAssetStatus(assetId, "ready");
	} finally {
		await rm(workDir, { force: true, recursive: true });
	}
}

function replaceExt(filename: string, ext: string, suffix = ""): string {
	return `${filename.replace(/\.[^.]+$/, "")}${suffix}.${ext}`;
}
