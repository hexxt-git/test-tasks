import type { Job } from "bullmq";
import type { GoodbyeJob } from "@repo/queue";

/** Knob for exercising the failure path in the UI. */
const FAILURE_RATE = 0.25;
const STEPS = 5;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export const goodbye = async (job: Job<GoodbyeJob>) => {
  // job.log writes to redis; the bull board Logs tab reads it back.
  await job.log(`saying goodbye to ${job.data.name}`);
  for (let step = 1; step <= STEPS; step++) {
    await sleep(200 + Math.random() * 400);
    if (Math.random() < FAILURE_RATE / STEPS) {
      throw new Error(`Failed while saying goodbye to ${job.data.name}`);
    }
    // Object, not a bare number: bull board only renders structured progress.
    await job.updateProgress({
      percent: Math.round((step / STEPS) * 100),
      step,
      of: STEPS,
      name: job.data.name,
    });
    await job.log(`step ${step}/${STEPS} done`);
  }
  await job.log(`finished saying goodbye to ${job.data.name}`);
  return `Goodbye ${job.data.name}! ${job.data.rating < 3 ? "you suck" : "you were chill"}`;
};
