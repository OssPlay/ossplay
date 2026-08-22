import IORedis from "ioredis";

export function createRedisConnection(): IORedis {
	const url = process.env.REDIS_URL;
	if (!url) {
		throw new Error("REDIS_URL is not set");
	}
	// BullMQ requires this on the underlying ioredis connection.
	return new IORedis(url, { maxRetriesPerRequest: null });
}

let connection: IORedis | null = null;

// Memoized singleton — index.ts's four BullMQ Workers and shared.ts's
// status-event PUBLISH calls share one connection instead of each opening
// their own, same convention as apps/api/src/lib/queue.ts's getQueue.
// Plain PUBLISH is safe here since nothing on this connection ever issues
// SUBSCRIBE (that's apps/api's dedicated connection — see events-bus.ts).
export function getRedisConnection(): IORedis {
	connection ??= createRedisConnection();
	return connection;
}
