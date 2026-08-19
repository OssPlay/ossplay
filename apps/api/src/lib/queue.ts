import type { JobPayloadByQueue, QueueName } from "@ossplay/core";
import { Queue } from "bullmq";
import IORedis from "ioredis";

// Same REDIS_URL/maxRetriesPerRequest convention as apps/worker/src/
// connection.ts (BullMQ requires that option on the underlying connection)
// — kept duplicated rather than shared, since apps/worker isn't part of
// this app's dependency graph and a two-line connection factory doesn't
// justify pulling in a cross-app import.
function createRedisConnection(): IORedis {
	const url = process.env.REDIS_URL;
	if (!url) throw new Error("REDIS_URL is not set");
	return new IORedis(url, { maxRetriesPerRequest: null });
}

let connection: IORedis | null = null;
const queues = new Map<QueueName, Queue>();

// Every processing job dispatch (assets.ts's confirm/variant routes, v1.ts's
// upload route) passes this — a handful of automatic, fast retries for a
// transient failure (a momentary S3/network blip, a DB hiccup) without
// waiting on apps/jobs' much slower failed-asset retry cron. That cron
// exists for the class of failure these can't fix (the environment itself
// was broken, e.g. a missing system binary) — the two are deliberately
// layered, not redundant.
export const PROCESSING_JOB_OPTS = {
	attempts: 3,
	backoff: { type: "exponential" as const, delay: 5000 },
};

// Producer-side only — apps/api never consumes a job, it just enqueues one
// for apps/worker to pick up. One Queue instance per name, memoized, so a
// route handler firing repeatedly doesn't open a new connection per call.
export function getQueue<Name extends QueueName>(name: Name): Queue<JobPayloadByQueue[Name]> {
	connection ??= createRedisConnection();
	let queue = queues.get(name);
	if (!queue) {
		queue = new Queue(name, { connection });
		queues.set(name, queue);
	}
	return queue as Queue<JobPayloadByQueue[Name]>;
}

// The same memoized connection getQueue() uses — exposed for the bulk zip
// download ticket flow (assets.ts's POST/GET .../bulk/download), which
// needs a plain Redis SET/GET/EXPIRE, not a BullMQ queue. Reusing this
// connection avoids opening a second one just for that.
export function getRedisConnection(): IORedis {
	connection ??= createRedisConnection();
	return connection;
}
