export const QUEUE_NAME = "tasks";

/** The job kinds the worker knows how to run. */

export type SearchJob = { job: "search"; question: string };

export type JobData = SearchJob;
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

/** Progress payload the worker reports once per finished turn. */
export type Progress = { turn: Turn };
