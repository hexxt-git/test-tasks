import { initTRPC } from "@trpc/server";
import { on } from "node:events";
import { z } from "zod";
import { bus, patch } from "./bus.ts";
import { createJob, listJobs, type Job } from "./db.ts";
import { tasksQueue } from "./tasks/queue.ts";

// A dropped SSE stream never errors, so the ping doubles as a liveness signal:
// once it stops arriving the client reconnects on its own.
const t = initTRPC.create({
  sse: {
    ping: { enabled: true, intervalMs: 2000 },
    client: { reconnectAfterInactivityMs: 5000 },
  },
});

/** Without this an unreachable redis hangs the request instead of failing it. */
const withTimeout = <T>(work: Promise<T>, message: string) =>
  Promise.race([
    work,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(message)), 5000),
    ),
  ]);

export const appRouter = t.router({
  list: t.procedure.query(() => listJobs()),

  greet: t.procedure
    .input(z.object({ name: z.string().min(1) }))
    .mutation(async ({ input }) => {
      const job: Job = {
        jobId: crypto.randomUUID(),
        name: input.name,
        status: "queued",
        progress: 0,
      };

      // Stored before it is queued, so no worker event lands on a missing row.
      createJob(job);
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

  // Every job's events, for every client; there is nothing per-client to filter.
  subscribe: t.procedure.subscription(async function* ({ signal }) {
    for await (const [job] of on(bus, "job", { signal })) yield job;
  }),
});

export type AppRouter = typeof appRouter;
