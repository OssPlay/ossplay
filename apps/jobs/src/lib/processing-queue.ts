import type { JobPayloadByQueue, QueueName } from "@ossplay/core";
import { Queue } from "bullmq";
import { createRedisConnection } from "../connection";

// Same one-Queue-instance-per-name, memoized-connection shape as apps/api's
// lib/queue.ts — kept duplicated rather than shared for the same reason
// that file's own connection factory is duplicated instead of imported:
// apps/jobs isn't part of apps/api's dependency graph, and this is a few
// lines. Needed here (not just producer-side in apps/api) because the
// failed-asset retry cron below is itself a second producer, re-dispatching
// a processing job apps/worker will pick up the same way it does any other.
let connection: ReturnType<typeof createRedisConnection> | null = null;
const queues = new Map<QueueName, Queue>();

// Same options apps/api's lib/queue.ts passes on every processing job
// dispatch — duplicated rather than shared for the same cross-app-boundary
// reason as the connection factory above. Kept in sync manually; a few
// retry-tuning numbers drifting slightly between producers is low-stakes.
export const PROCESSING_JOB_OPTS = {
	attempts: 3,
	backoff: { type: "exponential" as const, delay: 5000 },
};

export function getProcessingQueue<Name extends QueueName>(
	name: Name,
): Queue<JobPayloadByQueue[Name]> {
	connection ??= createRedisConnection();
	let queue = queues.get(name);
	if (!queue) {
		queue = new Queue(name, { connection });
		queues.set(name, queue);
	}
	return queue as Queue<JobPayloadByQueue[Name]>;
}
