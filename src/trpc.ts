import { initTRPC } from "@trpc/server";
import { tasksQueue, tasksQueueEvents } from "./tasks/queue.ts";
import { z } from "zod";
import { on } from "node:events";

const t = initTRPC.create();

export const appRouter = t.router({
  greet: t.procedure
    .input(z.object({ name: z.string() }))
    .mutation(async ({ input }) => {
      const job = await tasksQueue.add("greetJob", {
        job: "greet",
        name: input.name,
      });
      if (!job.id) throw new Error("Failed to add job to the queue");
      return { job: job.id };
    }),

  subscribe: t.procedure
    .input(z.object({ jobs: z.array(z.object({ jobId: z.string() })) }))
    .subscription(async function* ({ input }) {
      for await (const [event] of on(tasksQueueEvents, "completed")) {
        if (input.jobs.some((job) => job.jobId === event.jobId)) {
          yield { data: event.returnvalue, jobId: event.jobId };
        }
      }
      for await (const [event] of on(tasksQueueEvents, "failed")) {
        if (input.jobs.some((job) => job.jobId === event.jobId)) {
          yield { data: event.failedReason, jobId: event.jobId };
        }
      }
    }),
});

export type AppRouter = typeof appRouter;
