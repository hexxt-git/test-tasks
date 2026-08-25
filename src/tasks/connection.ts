import { Redis } from "ioredis";

const redisUrl = process.env.REDIS_URL ?? "redis://localhost:20824";

export const connection = new Redis(redisUrl, {
  maxRetriesPerRequest: null,
});
