import { Worker, type Job } from "bullmq";
import {
  connection,
  QUEUE_NAME,
  type JobData,
  type JobName,
} from "@repo/queue";
import { greet } from "./jobs/greet.ts";
import { goodbye } from "./jobs/goodbye.ts";

const handlers: Record<JobName, (job: Job<JobData>) => Promise<string>> = {
  greet,
  goodbye,
};

const worker = new Worker<JobData, string, JobName>(
  QUEUE_NAME,
  (job) => {
    console.log("starting job:", job.id);
    const handler = handlers[job.data.job];
    if (!handler) throw new Error(`Unknown job type: ${job.data.job}`);
    return handler(job);
  },
  { connection, concurrency: 3 },
);

console.log("Worker started");

for (const signal of ["SIGTERM", "SIGINT"] as const)
  process.once(signal, async () => {
    await worker.close();
    // bullmq only closes connections it created; this one is ours.
    await connection.quit();
  });
