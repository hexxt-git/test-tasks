import { Queue, QueueEvents } from "bullmq";
import { connection } from "./connection.ts";

export const tasksQueue = new Queue("tasks", { connection });
export const tasksQueueEvents = new QueueEvents("tasks", { connection });
