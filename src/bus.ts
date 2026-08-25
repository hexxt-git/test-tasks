import { EventEmitter, setMaxListeners } from "node:events";
import { updateJob, type Job } from "./db.ts";
import { tasksQueueEvents } from "./tasks/queue.ts";

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
