import { initTRPC } from "@trpc/server";

const t = initTRPC.create();

const events: string[] = [];

export const appRouter = t.router({
  greet: t.procedure
    .input((name: unknown) => String(name))
    .mutation(({ input }) => {
      events.push(input);
      return "event emitted";
    }),

  subscribe: t.procedure.subscription(async function* () {
    while (true) {
      if (events.length) {
        yield events.map((event) => `Hello ${event}!`);
        events.length = 0;
      } else {
        await new Promise((resolve) => setTimeout(resolve, 2000));
      }
    }
  }),
});

export type AppRouter = typeof appRouter;
