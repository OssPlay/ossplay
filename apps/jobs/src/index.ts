import { QUEUE_NAMES } from "@ossplay/core";
import { Queue, Worker } from "bullmq";
import { createRedisConnection } from "./connection";
import { processRecycleBinExpiry } from "./processors/recycle-bin-expiry";
import { processS3DestinationConfigCheck } from "./processors/s3-destination-config-check";
import { processUpdateCheck } from "./processors/update-check";

// The one home for every repeatable/scheduled job — always on, unlike the
// opt-in apps/worker (Drive media processing), so recycle-bin expiry, the
// update-check, and S3 destination drift-checking all keep running on
// every self-hosted instance regardless of whether an operator ever opts
// into Drive. See MEMORY.md for why this replaced apps/worker's own
// recycle-bin-expiry job and apps/api's setInterval-based update-check.
const connection = createRedisConnection();

const recycleBinWorker = new Worker(QUEUE_NAMES.recycleBinExpiry, processRecycleBinExpiry, {
	connection,
});
const updateCheckWorker = new Worker(QUEUE_NAMES.updateCheck, processUpdateCheck, { connection });
const s3ConfigCheckWorker = new Worker(
	QUEUE_NAMES.s3DestinationConfigCheck,
	processS3DestinationConfigCheck,
	{ connection },
);

for (const worker of [recycleBinWorker, updateCheckWorker, s3ConfigCheckWorker]) {
	worker.on("failed", (job, err) => {
		console.error(`[${worker.name}] job ${job?.id} failed:`, err);
	});
}

// Idempotent: BullMQ dedupes repeatable jobs by their (queue, pattern,
// jobId) tuple, so re-adding these on every boot doesn't create
// duplicates — what makes this survive a restart/redeploy without a
// separate one-time setup step. Staggered start times, not that it matters
// much at this scale — just avoids three unrelated jobs all waking up at
// once.
const recycleBinQueue = new Queue(QUEUE_NAMES.recycleBinExpiry, { connection });
const updateCheckQueue = new Queue(QUEUE_NAMES.updateCheck, { connection });
const s3ConfigCheckQueue = new Queue(QUEUE_NAMES.s3DestinationConfigCheck, { connection });

await recycleBinQueue.add("sweep", {}, { repeat: { pattern: "0 3 * * *" }, jobId: "daily-sweep" });
await updateCheckQueue.add("check", {}, { repeat: { pattern: "0 4 * * *" }, jobId: "daily-check" });
await s3ConfigCheckQueue.add(
	"check",
	{},
	{ repeat: { pattern: "0 5 * * *" }, jobId: "daily-check" },
);

// The update-check used to also run once immediately on apps/api boot
// (not just every 24h) — preserved here as a one-off job on every apps/jobs
// boot, so a fresh deploy still surfaces an available update right away
// instead of waiting for the next 04:00 tick.
await updateCheckQueue.add("check-on-boot", {});

console.log(
	"OSSPlay jobs listening on recycle-bin-expiry (03:00), update-check (04:00 + on boot), s3-destination-config-check (05:00)",
);

process.on("SIGTERM", async () => {
	await Promise.all([
		recycleBinWorker.close(),
		updateCheckWorker.close(),
		s3ConfigCheckWorker.close(),
		recycleBinQueue.close(),
		updateCheckQueue.close(),
		s3ConfigCheckQueue.close(),
	]);
	process.exit(0);
});
