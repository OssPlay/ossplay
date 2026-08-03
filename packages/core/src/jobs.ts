/**
 * BullMQ job contracts shared between the API (producer) and the worker
 * (consumer). A change here must land in both apps/api and apps/worker in the
 * same PR — see ARCHITECTURE.md §2 for why they share this repo.
 */

export const QUEUE_NAMES = {
	imageProcessing: "image-processing",
	videoProcessing: "video-processing",
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

export type JobPayloadByQueue = {
	[QUEUE_NAMES.imageProcessing]: ImageProcessingJob;
	[QUEUE_NAMES.videoProcessing]: VideoProcessingJob;
};
