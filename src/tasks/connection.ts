import { Redis } from "ioredis";

const redisUrl = process.env.REDIS_URL ?? "redis://localhost:20824";

export const connection = new Redis(redisUrl, {
  // Required by Worker. Downside: commands queue forever while redis is down.
  maxRetriesPerRequest: null,
});
