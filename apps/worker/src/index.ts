import { QUEUE_NAMES } from "@ossplay/core";
import { Worker } from "bullmq";
import { createRedisConnection } from "./connection";
import { processAudio } from "./processors/audio";
import { processImage } from "./processors/image";
import { processPdf } from "./processors/pdf";
import { withFailureHandling } from "./processors/shared";
import { processVideo } from "./processors/video";

// The recycle-bin-expiry sweep (and every other repeatable/scheduled job)
// lives in apps/jobs, not here — this app is opt-in (the Drive feature's
// media-processing overlay, see infra/docker-compose.worker.yml) and
// scheduled housekeeping needs to run on every instance regardless of
// whether an operator ever opts into Drive processing. See apps/jobs/src/
// index.ts.
const connection = createRedisConnection();

const imageWorker = new Worker(
	QUEUE_NAMES.imageProcessing,
	withFailureHandling(QUEUE_NAMES.imageProcessing, processImage),
	{ connection },
);
const videoWorker = new Worker(
	QUEUE_NAMES.videoProcessing,
	withFailureHandling(QUEUE_NAMES.videoProcessing, processVideo),
	{ connection },
);
const audioWorker = new Worker(
	QUEUE_NAMES.audioProcessing,
	withFailureHandling(QUEUE_NAMES.audioProcessing, processAudio),
	{ connection },
);
const pdfWorker = new Worker(
	QUEUE_NAMES.pdfProcessing,
	withFailureHandling(QUEUE_NAMES.pdfProcessing, processPdf),
	{ connection },
);

for (const worker of [imageWorker, videoWorker, audioWorker, pdfWorker]) {
	worker.on("failed", (job, err) => {
		console.error(`[${worker.name}] job ${job?.id} failed:`, err);
	});
}

console.log(
	`OSSPlay worker listening on ${[
		QUEUE_NAMES.imageProcessing,
		QUEUE_NAMES.videoProcessing,
		QUEUE_NAMES.audioProcessing,
		QUEUE_NAMES.pdfProcessing,
	].join(", ")}`,
);

process.on("SIGTERM", async () => {
	await Promise.all([imageWorker.close(), videoWorker.close(), audioWorker.close(), pdfWorker.close()]);
	process.exit(0);
});
