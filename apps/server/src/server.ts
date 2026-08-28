import express from "express";
import { fileURLToPath } from "node:url";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { createBullBoard } from "@bull-board/api";
import { BullMQAdapter } from "@bull-board/api/bullMQAdapter";
import { ExpressAdapter } from "@bull-board/express";
import { appRouter } from "./trpc.ts";
import { tasksQueue } from "./queue.ts";

const port = Number(process.env.PORT ?? 5050);

const app = express();

const bullBoard = new ExpressAdapter().setBasePath("/admin/queues");
bullBoard.setUIConfig({
  boardTitle: "test-tasks",
  // Jobs finish in a couple of seconds, so poll fast enough to see them run.
  pollingInterval: { forceInterval: 1, showSetting: true },
  jobDetails: { defaultTab: "Logs" },
  hideDocsLink: true,
});
createBullBoard({
  queues: [new BullMQAdapter(tasksQueue)],
  serverAdapter: bullBoard,
});

app.use(express.json({ limit: "100kb" }));
app.use("/trpc", createExpressMiddleware({ router: appRouter }));
app.use("/admin/queues", bullBoard.getRouter());
// Serves the production build; harmless in dev, where vite serves the client.
app.use(
  express.static(fileURLToPath(new URL("../../web/dist", import.meta.url))),
);

app.listen(port, () =>
  console.log(
    `Server on http://localhost:${port} (queues: http://localhost:${port}/admin/queues)`,
  ),
);
