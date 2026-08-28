export const QUEUE_NAME = "tasks";

/** The job kinds the worker knows how to run. */

export type GreetJob = { job: "greet"; name: string };
export type GoodbyeJob = { job: "goodbye"; name: string; rating: number };

export type JobData = GreetJob | GoodbyeJob;
export type JobName = JobData["job"];
