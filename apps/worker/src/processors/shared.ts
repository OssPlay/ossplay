import { type AttachAudioTrackJob, type BaseAssetJob, publishEvent, type StorageDriver } from "@ossplay/core";
import { type Asset, assets, getDb, systemLogs } from "@ossplay/db";
import type { Job } from "bullmq";
import { eq, sql } from "drizzle-orm";
import { getRedisConnection } from "../connection";
import { runCapture } from "./spawn";

// One insert-then-upload helper, reused by every processor (image
// thumbnail + format conversion, video segments + manifest, pdf
// thumbnail) — each derived output is its own `assets` row with
// `parentAssetId` set to the original, matching the existing convention
// (see project.schema.ts's assets.parentAssetId comment). `key` is built by
// the caller (buildThumbnailKey/buildSubtitleKey/...) rather than derived
// here, since this one helper is shared across leaf conventions that don't
// have anything else in common.
export async function createVariant(opts: {
	projectId: string;
	folderId: string | null;
	parentAssetId: string;
	key: string;
	filename: string;
	mimeType: string;
	storage: StorageDriver;
	data: Uint8Array;
	metadata?: Record<string, unknown>;
}): Promise<Asset> {
	const id = crypto.randomUUID();
	await opts.storage.uploadObject(opts.key, opts.data, { mimeType: opts.mimeType });
	const [asset] = await getDb()
		.insert(assets)
		.values({
			id,
			projectId: opts.projectId,
			folderId: opts.folderId,
			filename: opts.filename,
			mimeType: opts.mimeType,
			s3Path: opts.key,
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
	await publishEvent(getRedisConnection(), {
		type: "asset.status",
		projectId: existing.projectId,
		assetId: variantAssetId,
		status: "ready",
	});
}

// The hls-package counterpart to finalizeVariant: an HLS package is many
// small files (master playlist, per-rendition playlists, segments) instead
// of one blob, so each gets uploaded to its own key under the placeholder
// row's s3Path (already an HLS prefix, not a single-file key — see
// buildHlsPrefix). `size` is the sum of every file, not just the manifest,
// so storage-usage reporting stays accurate.
export async function finalizeHlsVariant(
	variantAssetId: string,
	storage: StorageDriver,
	files: { relativePath: string; data: Uint8Array; mimeType: string }[],
	// Merged into the row's existing metadata (not replaced), same as
	// markAssetStatus below — packageHls uses this to stamp
	// `audioGroupCapable: true` on every hls-package variant it finalizes,
	// since that's now unconditionally true for every rendition this code
	// produces (see video.ts's own comment on why). A package finalized
	// before that change has no such field, which is exactly the signal
	// assets.ts's audio-tracks route uses to detect a stale package that
	// needs repackaging before a manual track can be safely attached.
	metadata?: Record<string, unknown>,
): Promise<void> {
	const [existing] = await getDb().select().from(assets).where(eq(assets.id, variantAssetId));
	if (!existing) throw new Error(`Variant asset ${variantAssetId} not found`);
	let totalSize = 0;
	for (const file of files) {
		await storage.uploadObject(`${existing.s3Path}/${file.relativePath}`, file.data, {
			mimeType: file.mimeType,
		});
		totalSize += file.data.byteLength;
	}
	await getDb()
		.update(assets)
		.set({
			size: totalSize,
			status: "ready",
			...(metadata
				? {
						metadata: sql`coalesce(${assets.metadata}, '{}'::jsonb) || ${JSON.stringify(metadata)}::jsonb`,
					}
				: {}),
		})
		.where(eq(assets.id, variantAssetId));
	await publishEvent(getRedisConnection(), {
		type: "asset.status",
		projectId: existing.projectId,
		assetId: variantAssetId,
		status: "ready",
	});
}

export async function markAssetStatus(
	assetId: string,
	projectId: string,
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
	await publishEvent(getRedisConnection(), { type: "asset.status", projectId, assetId, status });
}

// Wraps a queue processor so a thrown error also marks the asset it was
// working on "failed" (instead of leaving it stuck at "processing" forever
// — nothing else ever moves it off that status) and logs to systemLogs
// (instance-error-logs.ts's route, and therefore the dashboard's Error Logs
// page — previously nothing ever wrote there for a processing failure,
// only apps/api's own request-handling code did). Re-throws afterward so
// BullMQ's own failure event/attempts/backoff tracking is unaffected.
//
// AttachAudioTrackJob doesn't extend BaseAssetJob (its input is a
// separately-uploaded file, not the original asset's own bytes — see
// jobs.ts's own comment), so the id/projectId to report against is pulled
// from whichever shape the job data actually is.
export function withFailureHandling<T extends BaseAssetJob | AttachAudioTrackJob>(
	source: string,
	processor: (job: Job<T>) => Promise<void>,
): (job: Job<T>) => Promise<void> {
	return async (job) => {
		try {
			await processor(job);
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);
			const data = job.data;
			const { failedAssetId, projectId } =
				"attachAudioTrack" in data
					? { failedAssetId: data.attachAudioTrack.trackAssetId, projectId: data.attachAudioTrack.projectId }
					: {
							failedAssetId: data.requestedVariant?.variantAssetId ?? data.assetId,
							projectId: data.projectId,
						};
			await markAssetStatus(failedAssetId, projectId, "failed", { error: message.slice(0, 2000) });
			await getDb()
				.insert(systemLogs)
				.values({
					source,
					message: `Processing failed for asset ${failedAssetId}: ${message}`,
					metadata: { assetId: failedAssetId, projectId, jobId: job.id },
				});
			throw err;
		}
	};
}

export interface FfprobeStream {
	/** Absolute stream index within the file — what `-map 0:N` expects, needed to pull a single subtitle/audio stream out of a multi-track container (e.g. MKV) by itself. */
	index?: number;
	codec_type?: string;
	codec_name?: string;
	width?: number;
	height?: number;
	r_frame_rate?: string;
	sample_rate?: string;
	channels?: number;
	bit_rate?: string;
	tags?: { language?: string; title?: string };
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

// A minority of real-world containers (some Matroska files in particular —
// including this repo's own MKV test fixtures, deliberately muxed as
// validation edge cases) omit Segment Duration from their metadata
// entirely: ffprobe then reports no format.duration and no per-stream
// duration either, even though the file plays back and has a perfectly
// well-defined length. Every duration-dependent step (the eager
// thumbnail's frame timestamp, HLS's measured-bitrate calc, the scrub
// sprite's tile count) used to just take `undefined`/fall back to a
// constant for this case — except packageScrubThumbnails, which threw
// outright, previously only surfaced if someone happened to open a
// preview for one of these specific files, now hit on every such upload
// once video processing went eager. Prefers the free, already-probed
// value; only pays for a full decode pass (rare) when that's missing.
export async function resolveDurationSeconds(
	inputPath: string,
	probe: FfprobeOutput,
): Promise<number | null> {
	const reported = probe.format?.duration ? Number.parseFloat(probe.format.duration) : null;
	if (reported && reported > 0) return reported;

	// -c copy remuxes instead of decoding, so this reads through the file at
	// close to disk speed, not real playback speed, even for a large source.
	// ffmpeg writes its progress (including a running `time=`) to stderr as
	// it goes; the last such line reflects how far it actually got, which is
	// the file's real duration once it reaches EOF.
	const proc = Bun.spawn(["ffmpeg", "-i", inputPath, "-map", "0", "-c", "copy", "-f", "null", "-"], {
		stdout: "ignore",
		stderr: "pipe",
	});
	const [stderr] = await Promise.all([new Response(proc.stderr).text(), proc.exited]);
	const matches = [...stderr.matchAll(/time=(\d+):(\d\d):(\d\d(?:\.\d+)?)/g)];
	const last = matches.at(-1);
	if (!last) return null;
	const [, hours, minutes, seconds] = last;
	return Number(hours) * 3600 + Number(minutes) * 60 + Number(seconds);
}

// "30000/1001" -> 29.97, "25/1" -> 25 — ffprobe reports frame rate as a
// rational string, not a plain number.
export function parseFrameRate(rate: string | undefined): number | null {
	if (!rate) return null;
	const [num, den] = rate.split("/").map(Number);
	if (!num || !den) return null;
	return Math.round((num / den) * 100) / 100;
}
