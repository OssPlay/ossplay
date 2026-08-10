import { QUEUE_NAMES } from "@ossplay/core";
import { Queue, Worker } from "bullmq";
import { createRedisConnection } from "./connection";
import { processAudio } from "./processors/audio";
import { processImage } from "./processors/image";
import { processPdf } from "./processors/pdf";
import { processRecycleBinExpiry } from "./processors/recycle-bin-expiry";
import { processVideo } from "./processors/video";

const connection = createRedisConnection();

const imageWorker = new Worker(QUEUE_NAMES.imageProcessing, processImage, { connection });
const videoWorker = new Worker(QUEUE_NAMES.videoProcessing, processVideo, { connection });
const audioWorker = new Worker(QUEUE_NAMES.audioProcessing, processAudio, { connection });
const pdfWorker = new Worker(QUEUE_NAMES.pdfProcessing, processPdf, { connection });
const recycleBinWorker = new Worker(QUEUE_NAMES.recycleBinExpiry, processRecycleBinExpiry, { connection });

for (const worker of [imageWorker, videoWorker, audioWorker, pdfWorker, recycleBinWorker]) {
	worker.on("failed", (job, err) => {
		console.error(`[${worker.name}] job ${job?.id} failed:`, err);
	});
}

// Idempotent: BullMQ dedupes repeatable jobs by their (queue, pattern, jobId)
// tuple, so re-adding this on every worker boot doesn't create duplicates —
// it's what makes this survive a restart/redeploy without a separate
// one-time setup step.
const recycleBinQueue = new Queue(QUEUE_NAMES.recycleBinExpiry, { connection });
await recycleBinQueue.add("sweep", {}, { repeat: { pattern: "0 3 * * *" }, jobId: "daily-sweep" });

console.log(
	`OSSPlay worker listening on ${Object.values(QUEUE_NAMES).join(", ")} — daily recycle-bin sweep scheduled for 03:00`,
);

process.on("SIGTERM", async () => {
	await Promise.all([
		imageWorker.close(),
		videoWorker.close(),
		audioWorker.close(),
		pdfWorker.close(),
		recycleBinWorker.close(),
		recycleBinQueue.close(),
	]);
	process.exit(0);
});
