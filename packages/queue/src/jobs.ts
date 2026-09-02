export const QUEUE_NAME = "tasks";

/** The job kinds the worker knows how to run. */

export type ResearchJob = { job: "research"; question: string };
export type AuditJob = { job: "site-audit"; url: string };

export type JobData = ResearchJob | AuditJob;
export type JobName = JobData["job"];

export type ToolCall = {
  name: string;
  label: string;
  args: Record<string, unknown>;
  result: string;
  isError: boolean;
};

/** One finished LLM turn: what the model thought, said, and called. */
export type Turn = {
  index: number;
  thinking: string;
  text: string;
  tools: ToolCall[];
};

export type AuditReport = {
  url: string;
  /** Deterministic measurements, rendered as JSON. */
  checks: Record<string, unknown>;
  /** The LLM pass; null until one is wired up. */
  review: string | null;
};

/** Progress payload the worker reports: once per LLM turn, or per audit stage. */
export type Progress = { turn: Turn } | { report: AuditReport };
