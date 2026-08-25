export type Job = {
  jobId: string;
  name: string;
  status: "queued" | "running" | "completed" | "failed";
  progress: number;
  detail?: string;
};

export const jobs = new Map<string, Job>();
