import IORedis from 'ioredis';

export function createRedisConnection(): IORedis {
  const url = process.env.REDIS_URL;
  if (!url) {
    throw new Error('REDIS_URL is not set');
  }
  // BullMQ requires this on the underlying ioredis connection.
  return new IORedis(url, { maxRetriesPerRequest: null });
}
