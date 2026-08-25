import { useState } from "react";
import { trpc } from "./trpc-client";
import { useSubscription } from "@trpc/tanstack-react-query";
import { useMutation } from "@tanstack/react-query";
import { AnimatePresence, motion } from "motion/react";

export default function App() {
  const [name, setName] = useState("world");
  const [jobs, setJobs] = useState<{ jobId: string }[]>([]);
  const [results, setResults] = useState<{ data: string; id: string }[]>([]);

  useSubscription(
    trpc.subscribe.subscriptionOptions(
      { jobs },
      {
        onData(data) {
          setResults((prevResults) => [
            ...prevResults,
            { data: data.data, id: data.jobId },
          ]);
          setJobs((prevJobs) => [
            ...prevJobs.filter((job) => job.jobId !== data.jobId),
          ]);
        },
      },
    ),
  );

  const mutation = useMutation(trpc.greet.mutationOptions());

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    mutation.mutateAsync({ name }).then((response) => {
      console.log("Response from greet mutation:", response);
      setJobs((prevJobs) => [...prevJobs, { jobId: response.job }]);
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
        <h2>jobs</h2>
        <div className="flex flex-col gap-2 w-full bg-code/30 rounded p-2 h-50 overflow-y-auto overflow-x-hidden">
          <AnimatePresence mode="sync">
            {jobs.toReversed().map((job) => (
              <motion.div
                key={job.jobId}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 10 }}
                layout
                className="rounded bg-code px-3 py-2 text-heading"
              >
                job #{job.jobId}
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      </div>

      <div className="w-full max-w-lg space-y-1">
        <h2>results</h2>
        <div className="flex flex-col gap-2 w-full bg-code/30 rounded p-2 h-50 overflow-y-auto overflow-x-hidden">
          <AnimatePresence mode="sync">
            {results.toReversed().map((item) => (
              <motion.div
                key={item.id}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 10 }}
                layout
                className="rounded bg-code px-3 py-2 text-heading"
              >
                {item.data} #{item.id}
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      </div>
    </section>
  );
}
