import { initTRPC } from "@trpc/server";
import { EventEmitter, on, setMaxListeners } from "node:events";
import { z } from "zod";
import { jobs, type Job } from "./db.ts";
import { tasksQueue, tasksQueueEvents } from "./tasks/queue.ts";

const t = initTRPC.create();

/**
 * One emitter fans every queue event out to all subscribers, so we hold a
 * handful of listeners on the QueueEvents instance regardless of how many
 * clients connect.
 */
const bus = new EventEmitter<{ job: [Job] }>();
setMaxListeners(0, bus);

/** Writes the row, then ships the whole row so clients upsert instead of refetch. */
const patch = (jobId: string, fields: Partial<Job>) => {
  const job = jobs.get(jobId);
  if (job) bus.emit("job", Object.assign(job, fields));
};

/**
 * ioredis retries forever (maxRetriesPerRequest: null, which Worker requires),
 * so an unreachable redis hangs the request instead of failing it.
 */
const withTimeout = <T>(work: Promise<T>, message: string) =>
  Promise.race([
    work,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(message)), 5000),
    ),
  ]);

tasksQueueEvents.on("active", ({ jobId }) =>
  patch(jobId, { status: "running" }),
);
tasksQueueEvents.on("progress", ({ jobId, data }) =>
  patch(jobId, { status: "running", progress: Number(data) }),
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

export const appRouter = t.router({
  list: t.procedure.query(() => [...jobs.values()]),

  greet: t.procedure
    .input(z.object({ name: z.string().min(1) }))
    .mutation(async ({ input }) => {
      // Stored before it is queued, so no worker event can land on a missing row.
      const job: Job = {
        jobId: crypto.randomUUID(),
        name: input.name,
        status: "queued",
        progress: 0,
      };

      jobs.set(job.jobId, job);
      bus.emit("job", job);

      await withTimeout(
        tasksQueue.add(
          "greetJob",
          { job: "greet", name: input.name },
          { jobId: job.jobId, removeOnComplete: 100, removeOnFail: 100 },
        ),
        "Queue unreachable",
      ).catch((err: Error) => {
        // Otherwise the row sits at "queued" forever with nothing queued.
        patch(job.jobId, { status: "failed", detail: err.message });
        throw err;
      });
    }),

  // Broadcasts every job's events; clients patch their cached list with them.
  subscribe: t.procedure.subscription(async function* ({ signal }) {
    for await (const [job] of on(bus, "job", { signal })) yield job;
  }),
});

export type AppRouter = typeof appRouter;
