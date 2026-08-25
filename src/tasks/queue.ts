import { Queue, QueueEvents } from "bullmq";
import { connection } from "./connection.ts";

export const QUEUE_NAME = "tasks";

export const tasksQueue = new Queue(QUEUE_NAME, { connection });
export const tasksQueueEvents = new QueueEvents(QUEUE_NAME, { connection });
