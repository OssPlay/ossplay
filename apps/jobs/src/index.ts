import { QUEUE_NAMES } from "@ossplay/core";
import { Queue, Worker } from "bullmq";
import { createRedisConnection } from "./connection";
import { processFailedAssetRetry } from "./processors/failed-asset-retry";
import { processRecycleBinExpiry } from "./processors/recycle-bin-expiry";
import { processS3DestinationConfigCheck } from "./processors/s3-destination-config-check";
import { processServerIpCheck } from "./processors/server-ip-check";
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
const serverIpCheckWorker = new Worker(QUEUE_NAMES.serverIpCheck, processServerIpCheck, {
	connection,
});
const failedAssetRetryWorker = new Worker(
	QUEUE_NAMES.failedAssetRetry,
	processFailedAssetRetry,
	{ connection },
);

for (const worker of [
	recycleBinWorker,
	updateCheckWorker,
	s3ConfigCheckWorker,
	serverIpCheckWorker,
	failedAssetRetryWorker,
]) {
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
const serverIpCheckQueue = new Queue(QUEUE_NAMES.serverIpCheck, { connection });
const failedAssetRetryQueue = new Queue(QUEUE_NAMES.failedAssetRetry, { connection });

await recycleBinQueue.add("sweep", {}, { repeat: { pattern: "0 3 * * *" }, jobId: "daily-sweep" });
await updateCheckQueue.add("check", {}, { repeat: { pattern: "0 4 * * *" }, jobId: "daily-check" });
await s3ConfigCheckQueue.add(
	"check",
	{},
	{ repeat: { pattern: "0 5 * * *" }, jobId: "daily-check" },
);
// Hourly, not daily like the others above — a server's public IP rarely
// changes, but unlike update-availability it's used for concrete
// domain/TLS setup guidance where staleness is more noticeable, so it's
// worth refreshing more often than once a day.
await serverIpCheckQueue.add("check", {}, { repeat: { pattern: "0 * * * *" }, jobId: "hourly-check" });
// Every 30 minutes, not hourly — this is a recovery path (see failed-asset-
// retry.ts's own comment), and a stuck-processing asset is more noticeable
// to a waiting user than a slightly-stale IP/update-check value.
await failedAssetRetryQueue.add(
	"retry",
	{},
	{ repeat: { pattern: "*/30 * * * *" }, jobId: "half-hourly-retry" },
);

// The update-check used to also run once immediately on apps/api boot
// (not just every 24h) — preserved here as a one-off job on every apps/jobs
// boot, so a fresh deploy still surfaces an available update right away
// instead of waiting for the next 04:00 tick. serverIpCheck gets the same
// treatment so GET /instance/overview isn't stuck showing "unknown" for up
// to an hour after a fresh deploy.
await updateCheckQueue.add("check-on-boot", {});
await serverIpCheckQueue.add("check-on-boot", {});

console.log(
	"OSSPlay jobs listening on recycle-bin-expiry (03:00), update-check (04:00 + on boot), s3-destination-config-check (05:00), server-ip-check (hourly + on boot), failed-asset-retry (every 30min)",
);

process.on("SIGTERM", async () => {
	await Promise.all([
		recycleBinWorker.close(),
		updateCheckWorker.close(),
		s3ConfigCheckWorker.close(),
		serverIpCheckWorker.close(),
		failedAssetRetryWorker.close(),
		recycleBinQueue.close(),
		updateCheckQueue.close(),
		s3ConfigCheckQueue.close(),
		serverIpCheckQueue.close(),
		failedAssetRetryQueue.close(),
	]);
	process.exit(0);
});
