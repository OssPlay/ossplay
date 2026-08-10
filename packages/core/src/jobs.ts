/**
 * BullMQ job contracts shared between the API (producer) and the worker
 * (consumer). A change here must land in both apps/api and apps/worker in the
 * same PR — see ARCHITECTURE.md §2 for why they share this repo.
 */

export const QUEUE_NAMES = {
	imageProcessing: "image-processing",
	videoProcessing: "video-processing",
	audioProcessing: "audio-processing",
	pdfProcessing: "pdf-processing",
	// No per-asset payload — each run sweeps every project's trash for
	// items past the 30-day cutoff (packages/core/src/folders/recycle.ts's
	// sweepExpiredTrash), scheduled as a BullMQ repeatable job rather than
	// dispatched per upload.
	recycleBinExpiry: "recycle-bin-expiry",
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

export type JobPayloadByQueue = {
	[QUEUE_NAMES.imageProcessing]: ImageProcessingJob;
	[QUEUE_NAMES.videoProcessing]: VideoProcessingJob;
	[QUEUE_NAMES.audioProcessing]: AudioProcessingJob;
	[QUEUE_NAMES.pdfProcessing]: PdfProcessingJob;
	[QUEUE_NAMES.recycleBinExpiry]: RecycleBinExpiryJob;
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
