import { useState } from "react";
import { trpc } from "./trpc-client";
import { useSubscription } from "@trpc/tanstack-react-query";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion } from "motion/react";
import type { Job } from "server/db";

export default function App() {
  const [name, setName] = useState("world");
  const queryClient = useQueryClient();
  const { data: jobs = [] } = useQuery(trpc.list.queryOptions());

  const subscription = useSubscription(
    trpc.subscribe.subscriptionOptions(undefined, {
      onData(job) {
        // Upsert by jobId -- no invalidate, no refetch.
        queryClient.setQueryData(trpc.list.queryKey(), (prev: Job[] = []) => [
          ...new Map([...prev, job].map((j) => [j.jobId, j])).values(),
        ]);
      },
      // Reconnects replay nothing, so re-sync. Also covers the gap between the
      // initial list fetch and the stream attaching.
      onConnectionStateChange(state) {
        if (state.state === "pending")
          queryClient.invalidateQueries({ queryKey: trpc.list.queryKey() });
      },
    }),
  );

  const mutation = useMutation(trpc.greet.mutationOptions());

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    mutation.mutate({ name });
  };

  return (
    <section className="flex flex-col items-center gap-8 h-svh justify-center">
      <div className="w-full max-w-lg space-y-1">
        <form className="flex gap-2" onSubmit={handleSubmit}>
          <input
            value={name}
            required
            onChange={(e) => setName(e.target.value)}
            className="rounded bg-code px-3 py-2 text-heading outline-none focus:border-accent w-full"
          />
          <button
            disabled={mutation.isPending}
            className="rounded bg-accent px-3 py-2 text-heading disabled:opacity-50"
          >
            {mutation.isPending ? "Queueing" : "Submit"}
          </button>
        </form>
        {mutation.error && (
          <p className="text-sm text-red-400">{mutation.error.message}</p>
        )}
      </div>

      <div className="w-full max-w-lg space-y-1">
        <div className="flex justify-between items-baseline">
          <h2>jobs</h2>
          <span className="text-xs opacity-60">{subscription.status}</span>
        </div>
        <div className="flex flex-col gap-2 w-full bg-code/30 rounded p-2 h-96 overflow-y-auto">
          <AnimatePresence mode="sync">
            {jobs.toReversed().map((job) => (
              <motion.div
                key={job.jobId}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 10 }}
                layout
                className="rounded bg-code px-3 py-2 text-heading space-y-2"
              >
                <div className="flex justify-between gap-2 text-sm">
                  <span className="truncate">
                    {job.detail ?? `greeting ${job.name}`}
                  </span>
                  <span
                    className={
                      job.status === "failed"
                        ? "text-red-400"
                        : job.status === "completed"
                          ? "text-green-400"
                          : "opacity-60"
                    }
                  >
                    <span className="text-xs opacity-60 text-heading/60">
                      {job.jobId.split("-").at(-1)}{" "}
                    </span>
                    {job.status}
                  </span>
                </div>
                <div className="h-1 w-full rounded bg-black/30 overflow-hidden">
                  <motion.div
                    className={`h-full ${job.status === "failed" ? "bg-red-400" : "bg-accent"}`}
                    animate={{ width: `${job.progress}%` }}
                    initial={{ width: 0 }}
                  />
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      </div>
    </section>
  );
}
