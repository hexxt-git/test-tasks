import { useState } from "react";
import { trpc } from "./trpc-client";
import { useSubscription } from "@trpc/tanstack-react-query";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion } from "motion/react";
import type { Job, ToolCall, Turn } from "server/db";

function Caret({ open, className = "" }: { open: boolean; className?: string }) {
  return (
    <motion.svg
      viewBox="0 0 8 8"
      aria-hidden
      animate={{ rotate: open ? 90 : 0 }}
      transition={{ duration: 0.2, ease: "easeOut" }}
      className={`size-2.5 shrink-0 fill-current ${className}`}
    >
      <path d="M2 0 7 4 2 8Z" />
    </motion.svg>
  );
}

const statusColor = (status: Job["status"]) =>
  status === "failed"
    ? "text-red-400"
    : status === "completed"
      ? "text-green-400"
      : "opacity-60";

function ToolCallView({ tool }: { tool: ToolCall }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded bg-bg/60 px-2 py-1 font-mono text-xs">
      <button
        className="flex w-full items-center gap-2 text-left hover:opacity-80"
        onClick={() => setOpen(!open)}
      >
        <Caret open={open} className="opacity-60" />
        <span className={tool.isError ? "text-red-400" : "text-accent"}>
          {tool.label}
        </span>
        <span className="truncate opacity-60">
          {Object.values(tool.args).map(String).join(" ")}
        </span>
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
            className="overflow-hidden"
          >
            <pre className="mt-1 max-h-64 overflow-auto whitespace-pre-wrap border-t border-line pt-1 opacity-70">
              {tool.result || "(no output)"}
            </pre>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function TurnView({ turn }: { turn: Turn }) {
  return (
    <div className="space-y-1 border-l border-line pl-3">
      {turn.thinking && (
        <p className="whitespace-pre-wrap text-xs italic opacity-50">
          {turn.thinking}
        </p>
      )}
      {turn.text && <p className="whitespace-pre-wrap text-sm">{turn.text}</p>}
      {turn.tools.map((tool, i) => (
        <ToolCallView key={i} tool={tool} />
      ))}
    </div>
  );
}

function JobRow({ job }: { job: Job }) {
  const [open, setOpen] = useState(false);
  const pending = job.status === "queued" || job.status === "running";

  return (
    <motion.div
      initial={{ opacity: 0, x: -10 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 10 }}
      // "position" only: a full layout animation scale-transforms the box, which
      // stretches the contents while an expanded row grows.
      layout="position"
      className="rounded bg-code px-3 py-2 text-heading"
    >
      {/* Only the header toggles, so clicking into the transcript below (to read
          or select it) does not collapse the row. */}
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full justify-between gap-2 text-left text-sm"
      >
        <span className="flex min-w-0 items-center gap-2">
          <Caret open={open} className="opacity-60" />
          <span className={open ? "" : "truncate"}>{job.question}</span>
        </span>
        <span className={`flex shrink-0 items-center gap-2 ${statusColor(job.status)}`}>
          <span className="text-xs text-heading/60">
            {job.turns.length} turns
          </span>
          {job.status}
          {pending && (
            <span className="size-3 animate-spin rounded-full border-2 border-current border-t-transparent" />
          )}
        </span>
      </button>

      {/* Height animates on the wrapper while the content keeps its own size, so
          nothing is squashed on the way open. */}
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
            className="overflow-hidden"
          >
            <div className="space-y-3 pt-3 pl-4">
              {job.turns.map((turn) => (
                <TurnView key={turn.index} turn={turn} />
              ))}
              {job.detail && job.detail !== job.turns.at(-1)?.text && (
                <p
                  className={`whitespace-pre-wrap text-sm ${job.status === "failed" ? "text-red-400" : ""}`}
                >
                  {job.detail}
                </p>
              )}
              {!job.turns.length && !job.detail && (
                <p className="text-sm opacity-60">waiting for the first turn</p>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

export default function App() {
  const [question, setQuestion] = useState("");
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

  const mutation = useMutation(trpc.search.mutationOptions());

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    mutation.mutate({ question });
    setQuestion("");
  };

  return (
    <section className="mx-auto flex h-svh max-w-2xl flex-col justify-center gap-8 p-4">
      <div className="space-y-1">
        <form className="flex gap-2" onSubmit={handleSubmit}>
          <input
            value={question}
            required
            placeholder="ask a research question"
            onChange={(e) => setQuestion(e.target.value)}
            className="w-full rounded bg-code px-3 py-2 text-heading outline-none focus:border-accent"
          />
          <button
            disabled={mutation.isPending}
            className="rounded bg-accent px-3 py-2 text-heading disabled:opacity-50"
          >
            {mutation.isPending ? "Queueing" : "Search"}
          </button>
        </form>
        {mutation.error && (
          <p className="text-sm text-red-400">{mutation.error.message}</p>
        )}
      </div>

      <div className="space-y-1">
        <div className="flex items-baseline justify-between">
          <h2>searches</h2>
          <span className="text-xs opacity-60">{subscription.status}</span>
        </div>
        <div className="flex h-[32rem] w-full flex-col gap-2 overflow-y-auto rounded bg-code/30 p-2">
          <AnimatePresence mode="sync">
            {jobs.toReversed().map((job) => (
              <JobRow key={job.jobId} job={job} />
            ))}
          </AnimatePresence>
        </div>
      </div>
    </section>
  );
}
