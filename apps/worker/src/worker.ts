import { Worker, type Job } from "bullmq";
import {
  connection,
  QUEUE_NAME,
  type JobData,
  type JobName,
} from "@repo/queue";
import { search } from "./jobs/search.ts";
import { siteAudit } from "./jobs/site-audit.ts";

type Handlers = {
  [K in JobName]: (job: Job<Extract<JobData, { job: K }>>) => Promise<string>;
};

const handlers: Handlers = {
  search,
  "site-audit": siteAudit,
};

/**
 * Exit on the first signal instead of draining, for `--watch` restarts that
 * would otherwise block for the length of an agent run. The abandoned job is
 * reclaimed and rerun from the start by the next worker.
 */
const instantExit = process.env.INSTANT_EXIT === "1";

const worker = new Worker<JobData, string, JobName>(
  QUEUE_NAME,
  (job) => {
    console.log("starting job:", job.id);
    // The union is narrowed by the key, which the index signature cannot express.
    const handler = handlers[job.data.job] as (
      job: Job<JobData>,
    ) => Promise<string>;
    if (!handler) throw new Error(`Unknown job type: ${job.data.job}`);
    return handler(job);
  },
  {
    connection,
    // The agent spends most of its time waiting on network calls.
    concurrency: 3,
    // Every restart looks like a stall, so let a job be reclaimed repeatedly
    // rather than failing it the second time.
    ...(instantExit && { maxStalledCount: 1000 }),
  },
);

console.log("Worker started");

for (const signal of ["SIGTERM", "SIGINT"] as const)
  process.once(signal, async () => {
    if (instantExit) process.exit(0);

    // Production: stop taking work and let the running job finish.
    await worker.close();
    // bullmq only closes connections it created; this one is ours.
    await connection.quit();
  });
