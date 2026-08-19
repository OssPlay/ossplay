import { type BaseAssetJob, buildAssetKey, type StorageDriver } from "@ossplay/core";
import { type Asset, assets, getDb, systemLogs } from "@ossplay/db";
import type { Job } from "bullmq";
import { eq, sql } from "drizzle-orm";
import { runCapture } from "./spawn";

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

// The on-demand counterpart to createVariant: the `assets` row already
// exists (a placeholder the API route inserted synchronously so it has an
// id/key to return before bytes exist — see assets.ts's POST
// .../variants), so this uploads bytes to that row's already-known key
// and flips it to ready, rather than inserting a fresh row.
export async function finalizeVariant(
	variantAssetId: string,
	storage: StorageDriver,
	data: Uint8Array,
): Promise<void> {
	const [existing] = await getDb().select().from(assets).where(eq(assets.id, variantAssetId));
	if (!existing) throw new Error(`Variant asset ${variantAssetId} not found`);
	await storage.uploadObject(existing.s3Path, data, { mimeType: existing.mimeType });
	await getDb()
		.update(assets)
		.set({ size: data.byteLength, status: "ready" })
		.where(eq(assets.id, variantAssetId));
}

export async function markAssetStatus(
	assetId: string,
	status: "ready" | "failed",
	metadata?: Record<string, unknown>,
): Promise<void> {
	// Merged via a jsonb `||`, not replaced — withFailureHandling's
	// reprocessAttempts-style bookkeeping (set by apps/jobs' failed-asset
	// retry cron before re-dispatching) needs to survive a subsequent
	// failure's own metadata write, and every existing success-path caller
	// here is still writing an original asset's very first metadata anyway,
	// so this is a no-op behavior change for them.
	await getDb()
		.update(assets)
		.set({
			status,
			...(metadata !== undefined && {
				metadata: sql`coalesce(${assets.metadata}, '{}'::jsonb) || ${JSON.stringify(metadata)}::jsonb`,
			}),
		})
		.where(eq(assets.id, assetId));
}

// Wraps a queue processor so a thrown error also marks the asset it was
// working on "failed" (instead of leaving it stuck at "processing" forever
// — nothing else ever moves it off that status) and logs to systemLogs
// (instance-error-logs.ts's route, and therefore the dashboard's Error Logs
// page — previously nothing ever wrote there for a processing failure,
// only apps/api's own request-handling code did). Re-throws afterward so
// BullMQ's own failure event/attempts/backoff tracking is unaffected.
export function withFailureHandling<T extends BaseAssetJob>(
	source: string,
	processor: (job: Job<T>) => Promise<void>,
): (job: Job<T>) => Promise<void> {
	return async (job) => {
		try {
			await processor(job);
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);
			const failedAssetId = job.data.requestedVariant?.variantAssetId ?? job.data.assetId;
			await markAssetStatus(failedAssetId, "failed", { error: message.slice(0, 2000) });
			await getDb()
				.insert(systemLogs)
				.values({
					source,
					message: `Processing failed for asset ${failedAssetId}: ${message}`,
					metadata: { assetId: failedAssetId, projectId: job.data.projectId, jobId: job.id },
				});
			throw err;
		}
	};
}

export interface FfprobeStream {
	codec_type?: string;
	codec_name?: string;
	width?: number;
	height?: number;
	r_frame_rate?: string;
	sample_rate?: string;
	channels?: number;
	bit_rate?: string;
}

export interface FfprobeOutput {
	format?: { duration?: string; bit_rate?: string };
	streams?: FfprobeStream[];
}

// Shared by video.ts and audio.ts — same ffprobe invocation and JSON shape
// either way, only which stream (video vs audio) each caller pulls fields
// from differs. Populates the real source-file metadata (dimensions,
// codec, duration, bitrate, frame rate) that markAssetStatus persists on
// the ORIGINAL asset row, distinct from each derived variant's own
// metadata (thumbnail dimensions, etc).
export async function ffprobeJson(inputPath: string): Promise<FfprobeOutput> {
	const stdout = await runCapture("ffprobe", [
		"-v",
		"quiet",
		"-print_format",
		"json",
		"-show_format",
		"-show_streams",
		inputPath,
	]);
	return JSON.parse(stdout) as FfprobeOutput;
}

// "30000/1001" -> 29.97, "25/1" -> 25 — ffprobe reports frame rate as a
// rational string, not a plain number.
export function parseFrameRate(rate: string | undefined): number | null {
	if (!rate) return null;
	const [num, den] = rate.split("/").map(Number);
	if (!num || !den) return null;
	return Math.round((num / den) * 100) / 100;
}
