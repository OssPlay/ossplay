import type { JobPayloadByQueue, QueueName } from "@ossplay/core";
import IORedis from "ioredis";
import { Queue } from "bullmq";

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
