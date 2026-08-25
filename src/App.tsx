import { useState } from "react";
import { trpc } from "./trpc-client";
import { useSubscription } from "@trpc/tanstack-react-query";
import { useMutation } from "@tanstack/react-query";
import { AnimatePresence, motion } from "motion/react";

type Job = {
  jobId: string;
  name: string;
  status: "queued" | "running" | "completed" | "failed";
  progress: number;
  detail?: string;
};

export default function App() {
  const [name, setName] = useState("world");
  const [jobs, setJobs] = useState<Job[]>([]);

  const subscription = useSubscription(
    trpc.subscribe.subscriptionOptions(undefined, {
      onData(event) {
        setJobs((prev) =>
          prev.map((job) => {
            if (job.jobId !== event.jobId) return job;
            switch (event.status) {
              case "progress":
                return { ...job, status: "running", progress: event.progress };
              case "completed":
                return {
                  ...job,
                  status: "completed",
                  progress: 100,
                  detail: event.result,
                };
              case "failed":
                return { ...job, status: "failed", detail: event.error };
              default:
                return job;
            }
          }),
        );
      },
    }),
  );

  const mutation = useMutation(trpc.greet.mutationOptions());

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const jobId = crypto.randomUUID();
    setJobs((prev) => [
      ...prev,
      { jobId, name, status: "queued", progress: 0 },
    ]);
    mutation.mutateAsync({ name, jobId }).catch((err) => {
      setJobs((prev) =>
        prev.map((job) =>
          job.jobId === jobId
            ? { ...job, status: "failed", detail: err.message }
            : job,
        ),
      );
    });
  };

  return (
    <section className="flex flex-col items-center gap-8 h-svh justify-center">
      <form className="flex gap-2 w-full max-w-lg" onSubmit={handleSubmit}>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="rounded bg-code px-3 py-2 text-heading outline-none focus:border-accent w-full"
        />
        <button className="rounded bg-accent px-3 py-2 text-heading">
          Submit
        </button>
      </form>

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
