/**
 * BullMQ job contracts shared between producers (apps/api) and consumers
 * (apps/worker for the four media-processing queues; apps/jobs for
 * recycleBinExpiry, updateCheck, and s3DestinationConfigCheck — every
 * repeatable/scheduled queue, kept in the always-on apps/jobs role rather
 * than the opt-in apps/worker). A change here must land in both the
 * producer and consumer app in the same PR — see ARCHITECTURE.md §2 for why
 * they share this repo.
 */

export const QUEUE_NAMES = {
	imageProcessing: "image-processing",
	videoProcessing: "video-processing",
	audioProcessing: "audio-processing",
	pdfProcessing: "pdf-processing",
	// No per-asset payload — each run sweeps every project's trash for
	// items past the 30-day cutoff (packages/core/src/folders/recycle.ts's
	// sweepExpiredTrash). Scheduled as a BullMQ repeatable job by apps/jobs,
	// not dispatched per upload.
	recycleBinExpiry: "recycle-bin-expiry",
	// Replaces the old apps/api setInterval — moved here so it runs from
	// the always-on apps/jobs role instead of tying background scheduling
	// to the HTTP-serving process.
	updateCheck: "update-check",
	// Re-verifies every s3Destinations row's real bucket permissions
	// (packages/core/src/s3-config.ts's verifyBucketConfig) against its
	// declared visibility, catching drift from changes made outside
	// OSSPlay.
	s3DestinationConfigCheck: "s3-destination-config-check",
	// Moves detectServerIp()'s external ipify.org call off the request path —
	// GET /instance/overview used to call it live on every load (see
	// server-info.ts), which meant every dashboard visit to that page waited
	// on a 3s-timeout best-effort outbound fetch. Same fix as updateCheck:
	// a periodic job writes the result to InstanceConfig, the route just
	// reads it.
	serverIpCheck: "server-ip-check",
} as const;

export type QueueName = (typeof QUEUE_NAMES)[keyof typeof QUEUE_NAMES];

// The on-demand conversion menu: format+size tiers for images, a single
// H.264/MP3 target for video/audio (see the plan's "Firm technical
// decisions" — H.264/MP3 over WebM/VP9 for actually-universal playback,
// not the more exotic option). Every field is a closed set, not a free
// `number`/`string`, so a spec can't silently drift from what the
// worker/UI actually support.
export type VariantSpec =
	| {
			kind: "image-format";
			format: "webp" | "avif" | "jpeg" | "png" | "original";
			maxDimension: 1024 | 2048 | 4096 | "original";
	  }
	| { kind: "video-transcode"; height: 480 | 720 | 1080 }
	| { kind: "audio-transcode"; bitrate: "96k" | "128k" | "192k" | "320k" };

// Canonical cache key for a spec — two different requested combos must
// never collide, and the same combo requested twice must always produce
// the same key. Colocated with VariantSpec so the API (cache lookup before
// enqueueing) and worker (cache write via finalizeVariant's metadata) can
// never derive it differently.
export function computeSpecKey(spec: VariantSpec): string {
	switch (spec.kind) {
		case "image-format":
			return `${spec.format}-${spec.maxDimension}`;
		case "video-transcode":
			return `${spec.height}p-mp4`;
		case "audio-transcode":
			return `${spec.bitrate}-mp3`;
	}
}

type BaseAssetJob = {
	assetId: string;
	projectId: string;
	s3Path: string;
	mimeType: string;
	// Present only for on-demand jobs (enqueued with job name "variant",
	// vs eager upload-time jobs' "process") — variantAssetId is the
	// placeholder `assets` row the API route inserts synchronously before
	// bytes exist (see assets.ts's POST .../variants), which
	// finalizeVariant (worker/processors/shared.ts) uploads bytes into and
	// marks ready, rather than createVariant inserting a fresh row.
	requestedVariant?: { variantAssetId: string; spec: VariantSpec };
};

export type ImageProcessingJob = BaseAssetJob;

export type VideoProcessingJob = BaseAssetJob;

export type AudioProcessingJob = BaseAssetJob;

// Thumbnail/preview generation only — PRD.md §3 explicitly rules out a PDF
// transcoding pipeline ("stored and served as-is"), so this job exists to
// make the drive UI's preview grid useful, not to alter the original file.
export type PdfProcessingJob = BaseAssetJob;

export type RecycleBinExpiryJob = Record<string, never>;

// Neither has a per-item payload either — updateCheck checks the one
// running instance, s3DestinationConfigCheck sweeps every s3Destinations
// row in one run, same shape as recycleBinExpiry's own trash sweep.
export type UpdateCheckJob = Record<string, never>;
export type S3DestinationConfigCheckJob = Record<string, never>;
export type ServerIpCheckJob = Record<string, never>;

export type JobPayloadByQueue = {
	[QUEUE_NAMES.imageProcessing]: ImageProcessingJob;
	[QUEUE_NAMES.videoProcessing]: VideoProcessingJob;
	[QUEUE_NAMES.audioProcessing]: AudioProcessingJob;
	[QUEUE_NAMES.pdfProcessing]: PdfProcessingJob;
	[QUEUE_NAMES.recycleBinExpiry]: RecycleBinExpiryJob;
	[QUEUE_NAMES.updateCheck]: UpdateCheckJob;
	[QUEUE_NAMES.s3DestinationConfigCheck]: S3DestinationConfigCheckJob;
	[QUEUE_NAMES.serverIpCheck]: ServerIpCheckJob;
};

// mimeType -> the queue its confirm-upload processing job goes to, or null
// for "no processing, mark ready immediately" (every non-image/video/audio/
// pdf mimeType — archives, office docs, and anything else PRD.md §3 says
// is "stored and served as-is"). A single, deliberate, short table — not a
// general-purpose plugin registry — matching how QUEUE_NAMES itself is a
// short fixed list, not something meant to grow per-mimeType indefinitely.
export function queueForMimeType(mimeType: string): QueueName | null {
	if (mimeType.startsWith("image/")) return QUEUE_NAMES.imageProcessing;
	if (mimeType.startsWith("video/")) return QUEUE_NAMES.videoProcessing;
	if (mimeType.startsWith("audio/")) return QUEUE_NAMES.audioProcessing;
	if (mimeType === "application/pdf") return QUEUE_NAMES.pdfProcessing;
	return null;
}
