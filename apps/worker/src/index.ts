import type { ImageProcessingJob, VideoProcessingJob } from "@ossplay/core";
import { QUEUE_NAMES } from "@ossplay/core";
import { Worker } from "bullmq";
import { createRedisConnection } from "./connection";

const connection = createRedisConnection();

// Real FFmpeg/Sharp processing (PRD.md §3) is out of scope for this infra
// scaffold — these stubs only prove the queue wiring boots and jobs can be
// consumed end to end.
const imageWorker = new Worker<ImageProcessingJob>(
	QUEUE_NAMES.imageProcessing,
	async (job) => {
		console.log(`[image-processing] received job ${job.id} for asset ${job.data.assetId}`);
	},
	{ connection },
);

const videoWorker = new Worker<VideoProcessingJob>(
	QUEUE_NAMES.videoProcessing,
	async (job) => {
		console.log(`[video-processing] received job ${job.id} for asset ${job.data.assetId}`);
	},
	{ connection },
);

console.log("OSSPlay worker listening on image-processing and video-processing queues");

process.on("SIGTERM", async () => {
	await Promise.all([imageWorker.close(), videoWorker.close()]);
	process.exit(0);
});
