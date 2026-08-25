import { initTRPC } from "@trpc/server";

const t = initTRPC.create();

export const appRouter = t.router({
  hello: t.procedure
    .input((name: unknown) => String(name))
    .query(({ input }) => `Hello ${input}!`),

  subscribe: t.procedure
    .input((name: unknown) => String(name))
    .subscription(async function* ({ input }) {
      yield `Hello ${input}!`;
      await new Promise((resolve) => setTimeout(resolve, 1000));
      yield `Hello again ${input}!`;
    }),
});

export type AppRouter = typeof appRouter;
