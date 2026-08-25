import { Worker } from "bullmq";
import { connection } from "./connection.ts";

new Worker(
  "tasks",
  async (job: { data: { job: string } & any }) => {
    switch (job.data.job) {
      case "greet":
        console.log(`greeting ${job.data.name}`);
        await new Promise((resolve) =>
          setTimeout(resolve, Math.random() * 2000 + 1000),
        );
        if (Math.random() < 0.2) {
          throw new Error("Random failure");
        }
        console.log(`greeted ${job.data.name}`);
        return `Hello ${job.data.name}!`;
      default:
        throw new Error(`Unknown job type: ${job.data.job}`);
    }
  },
  { connection, concurrency: 3 },
);

console.log("Worker started");
