import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	getProjectWithDestination,
	type PdfProcessingJob,
	resolveStorageDriver,
} from "@ossplay/core";
import { assets, getDb } from "@ossplay/db";
import type { Job } from "bullmq";
import { eq } from "drizzle-orm";
import sharp from "sharp";
import { createVariant, markAssetStatus } from "./shared";
import { run, runCapture } from "./spawn";

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

		await run("pdftoppm", [
			"-png",
			"-singlefile",
			"-r",
			"150",
			"-f",
			"1",
			"-l",
			"1",
			inputPath,
			outputPrefix,
		]);

		// Converted to webp for consistency with every other mimetype's
		// thumbnail (image/video/audio all produce webp) — pdftoppm itself
		// has no webp output mode, only ppm/png/jpeg. Capped to 1024px on the
		// long edge before encoding — pdftoppm renders at a fixed 150 DPI with
		// no size limit, so an unusually large physical page (or a malformed
		// MediaBox) can render past WebP's hard 16383px-per-side ceiling,
		// which throws instead of clamping. A thumbnail has no reason to keep
		// the full render resolution anyway.
		const rendered = await readFile(`${outputPrefix}.png`);
		const webp = await sharp(rendered)
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
			data: webp,
			metadata: { variant: "thumbnail", page: 1 },
		});

		const info = await runCapture("pdfinfo", [inputPath]);
		const pagesMatch = info.match(/^Pages:\s+(\d+)/m);
		await markAssetStatus(assetId, "ready", {
			pages: pagesMatch?.[1] ? Number.parseInt(pagesMatch[1], 10) : null,
		});
	} finally {
		await rm(workDir, { force: true, recursive: true });
	}
}

function replaceExt(filename: string, ext: string, suffix = ""): string {
	return `${filename.replace(/\.[^.]+$/, "")}${suffix}.${ext}`;
}
