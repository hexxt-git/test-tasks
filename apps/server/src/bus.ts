import { EventEmitter, setMaxListeners } from "node:events";
import { getJob, listJobs, updateJob, type Job } from "./db.ts";
import type { AuditReport, Progress, Turn } from "@repo/queue";
import { tasksQueue, tasksQueueEvents } from "./queue.ts";

/** Fans queue events out to every subscriber, so QueueEvents keeps one listener each. */
export const bus = new EventEmitter<{ job: [Job] }>();
// One listener per connected client, so the default cap of 10 would warn.
setMaxListeners(0, bus);

/** Emits the whole row, not the patch, so clients can upsert without refetching. */
export const patch = (jobId: string, fields: Partial<Job>) => {
  const job = updateJob(jobId, fields);
  if (job) bus.emit("job", job);
};

const progressOf = (data: unknown): Progress | undefined =>
  typeof data === "object" &&
  data !== null &&
  ("turn" in data || "report" in data)
    ? (data as Progress)
    : undefined;

const turnOf = (data: unknown): Turn | undefined => {
  const progress = progressOf(data);
  return progress && "turn" in progress ? progress.turn : undefined;
};

const reportOf = (data: unknown): AuditReport | undefined => {
  const progress = progressOf(data);
  return progress && "report" in progress ? progress.report : undefined;
};

// An unhandled "error" on an EventEmitter takes the process down, and redis
// hiccups emit one; log it and let ioredis reconnect on its own.
tasksQueueEvents.on("error", (err) =>
  console.error("queue events:", err.message),
);

tasksQueueEvents.on("active", ({ jobId }) =>
  patch(jobId, { status: "running" }),
);
tasksQueueEvents.on("progress", ({ jobId, data }) => {
  const row = getJob(jobId);
  const turn = turnOf(data);
  const report = reportOf(data);
  const turns = row?.turns ?? [];
  patch(jobId, {
    status: "running",
    // Redis replays the last progress value on reconnect, so drop a repeat.
    turns:
      turn && !turns.some((t) => t.index === turn.index)
        ? [...turns, turn]
        : turns,
    // Each report supersedes the last, so a replayed one changes nothing.
    report: report ?? row?.report,
  });
});
tasksQueueEvents.on("completed", ({ jobId, returnvalue }) =>
  patch(jobId, {
    status: "completed",
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
