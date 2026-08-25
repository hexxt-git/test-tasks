import { initTRPC } from "@trpc/server";
import { EventEmitter, on, setMaxListeners } from "node:events";
import { z } from "zod";
import { tasksQueue, tasksQueueEvents } from "./tasks/queue.ts";

const t = initTRPC.create();

export type JobEvent =
  | { jobId: string; status: "progress"; progress: number }
  | { jobId: string; status: "completed"; result: string }
  | { jobId: string; status: "failed"; error: string };

/**
 * One emitter fans every queue event out to all subscribers, so we hold three
 * listeners on the QueueEvents instance regardless of how many clients connect.
 */
const bus = new EventEmitter<{ job: [JobEvent] }>();
setMaxListeners(0, bus);

tasksQueueEvents.on("progress", ({ jobId, data }) =>
  bus.emit("job", { jobId, status: "progress", progress: Number(data) }),
);
tasksQueueEvents.on("completed", ({ jobId, returnvalue }) =>
  bus.emit("job", { jobId, status: "completed", result: String(returnvalue) }),
);
tasksQueueEvents.on("failed", ({ jobId, failedReason }) =>
  bus.emit("job", { jobId, status: "failed", error: failedReason }),
);

export const appRouter = t.router({
  greet: t.procedure
    // The client mints the id so it can track the job before the mutation even
    // resolves -- no window where an event arrives for an unknown job.
    .input(z.object({ name: z.string().min(1), jobId: z.uuid() }))
    .mutation(async ({ input }) => {
      await tasksQueue.add(
        "greetJob",
        { job: "greet", name: input.name },
        { jobId: input.jobId, removeOnComplete: 100, removeOnFail: 100 },
      );
      return { jobId: input.jobId };
    }),

  // Broadcasts every job's events; clients filter for the ones they queued.
  subscribe: t.procedure.subscription(async function* ({ signal }) {
    for await (const [event] of on(bus, "job", { signal })) yield event;
  }),
});

export type AppRouter = typeof appRouter;
