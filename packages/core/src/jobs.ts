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
} as const;

export type QueueName = (typeof QUEUE_NAMES)[keyof typeof QUEUE_NAMES];

type BaseAssetJob = {
	assetId: string;
	projectId: string;
	s3Path: string;
	mimeType: string;
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

export type JobPayloadByQueue = {
	[QUEUE_NAMES.imageProcessing]: ImageProcessingJob;
	[QUEUE_NAMES.videoProcessing]: VideoProcessingJob;
	[QUEUE_NAMES.audioProcessing]: AudioProcessingJob;
	[QUEUE_NAMES.pdfProcessing]: PdfProcessingJob;
	[QUEUE_NAMES.recycleBinExpiry]: RecycleBinExpiryJob;
	[QUEUE_NAMES.updateCheck]: UpdateCheckJob;
	[QUEUE_NAMES.s3DestinationConfigCheck]: S3DestinationConfigCheckJob;
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
