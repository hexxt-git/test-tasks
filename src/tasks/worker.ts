import { Worker, type Job } from "bullmq";
import { connection } from "./connection.ts";
import { QUEUE_NAME } from "./queue.ts";

/** Knob for exercising the failure path in the UI. */
const FAILURE_RATE = 0.25;
const STEPS = 5;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

new Worker(
  QUEUE_NAME,
  async (job: Job<{ job: string; name: string }>) => {
    switch (job.data.job) {
      case "greet": {
        for (let step = 1; step <= STEPS; step++) {
          await sleep(200 + Math.random() * 400);
          if (Math.random() < FAILURE_RATE / STEPS) {
            throw new Error(`Failed while greeting ${job.data.name}`);
          }
          await job.updateProgress(Math.round((step / STEPS) * 100));
        }
        return `Hello ${job.data.name}!`;
      }
      default:
        throw new Error(`Unknown job type: ${job.data.job}`);
    }
  },
  { connection, concurrency: 3 },
);

console.log("Worker started");
