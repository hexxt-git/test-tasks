import { EventEmitter, setMaxListeners } from "node:events";
import { listJobs, updateJob, type Job } from "./db.ts";
import { tasksQueue, tasksQueueEvents } from "./tasks/queue.ts";

/** Fans queue events out to every subscriber, so QueueEvents keeps one listener each. */
export const bus = new EventEmitter<{ job: [Job] }>();
// One listener per connected client, so the default cap of 10 would warn.
setMaxListeners(0, bus);

/** Emits the whole row, not the patch, so clients can upsert without refetching. */
export const patch = (jobId: string, fields: Partial<Job>) => {
  const job = updateJob(jobId, fields);
  if (job) bus.emit("job", job);
};

/** The worker reports `{ percent, ... }`; older jobs may carry a bare number. */
const percentOf = (data: unknown) =>
  typeof data === "object" && data !== null && "percent" in data
    ? Number(data.percent)
    : Number(data);

tasksQueueEvents.on("active", ({ jobId }) =>
  patch(jobId, { status: "running" }),
);
tasksQueueEvents.on("progress", ({ jobId, data }) =>
  patch(jobId, { status: "running", progress: percentOf(data) }),
);
tasksQueueEvents.on("completed", ({ jobId, returnvalue }) =>
  patch(jobId, {
    status: "completed",
    progress: 100,
    detail: String(returnvalue),
  }),
);
tasksQueueEvents.on("failed", ({ jobId, failedReason }) =>
  patch(jobId, { status: "failed", detail: failedReason }),
);

/**
 * QueueEvents does not replay missed `$` events after a restart; reconcile against
 * Redis to recover finished jobs before they expire.
 */
const reconcile = async () => {
  for (const row of listJobs()) {
    if (row.status === "completed" || row.status === "failed") continue;

    const job = await tasksQueue.getJob(row.jobId);
    if (!job) {
      // Eviction looks identical for a success and a failure, so claim neither.
      patch(row.jobId, {
        status: "failed",
        detail: "outcome unknown: job no longer in the queue",
      });
      continue;
    }

    const state = await job.getState();
    if (state === "completed") {
      patch(row.jobId, {
        status: "completed",
        progress: 100,
        detail: String(job.returnvalue),
      });
    } else if (state === "failed") {
      patch(row.jobId, { status: "failed", detail: job.failedReason });
    }
  }
};

// Not awaited: redis commands queue forever while it is down, which would hang boot.
reconcile().catch((err: Error) =>
  console.error("reconcile failed:", err.message),
);
