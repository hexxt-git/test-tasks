import IORedis from "ioredis";

const redisUrl = "redis://localhost:20824";

if (!redisUrl) {
  throw new Error("REDIS_URL is not defined");
}

export const connection = new IORedis(redisUrl, {
  maxRetriesPerRequest: null,
});
