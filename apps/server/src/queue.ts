import { Queue, QueueEvents } from "bullmq";
import {
  connection,
  QUEUE_NAME,
  type JobData,
  type JobName,
} from "@repo/queue";

export const tasksQueue = new Queue<JobData, string, JobName>(QUEUE_NAME, {
  connection,
});
export const tasksQueueEvents = new QueueEvents(QUEUE_NAME, { connection });
