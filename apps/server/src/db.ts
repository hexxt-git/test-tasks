import { appendFileSync, existsSync, readFileSync } from "node:fs";
import type { AuditReport, JobName, Turn } from "@repo/queue";

export type { AuditReport, ToolCall, Turn } from "@repo/queue";

export type Job = {
  jobId: string;
  kind: JobName;
  /** The job's input: a research question, or the audited URL. */
  question: string;
  status: "queued" | "running" | "completed" | "failed";
  turns: Turn[];
  report?: AuditReport;
  detail?: string;
};

const FILE = new URL("../jobs.jsonl", import.meta.url);

// Append-only log: replaying it leaves the last line per jobId as current state.
const jobs = new Map<string, Job>();
if (existsSync(FILE)) {
  for (const line of readFileSync(FILE, "utf8").split("\n")) {
    if (!line) continue;
    const job = JSON.parse(line) as Job;
    // Rows written before audits existed carry no kind.
    jobs.set(job.jobId, { ...job, kind: job.kind ?? "research" });
  }
}

const write = (job: Job) => {
  jobs.set(job.jobId, job);
  appendFileSync(FILE, `${JSON.stringify(job)}\n`);
  return job;
};

export const listJobs = () => [...jobs.values()];

export const getJob = (jobId: string) => jobs.get(jobId);

export const createJob = (job: Job) => write(job);

export const updateJob = (jobId: string, fields: Partial<Job>) => {
  const job = jobs.get(jobId);
  return job && write({ ...job, ...fields });
};
