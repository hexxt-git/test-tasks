# test-tasks

Submit a name, a BullMQ worker processes it, and the UI streams status and progress live over tRPC subscriptions.

React 19 + Vite + Tailwind, tRPC on Express, TanStack Query, BullMQ on Redis.

## Run

Needs Redis on `redis://localhost:20824` (override with `REDIS_URL`).

```sh
pnpm install
pnpm dev      # turbo runs all three: web :5173, server :5050, worker
```

`pnpm dev:web` / `pnpm dev:server` / `pnpm dev:worker` run one at a time. `PORT` overrides the server port; the vite client proxies `/trpc` to it.

After `pnpm build`, the server also serves `apps/web/dist`, so the client runs from :5050 alone. Queue dashboard (Bull Board): http://localhost:5050/admin/queues.

## Architecture

A turborepo of three apps sharing one Redis: the vite client, the express/tRPC server, and the worker. The server owns job state and never runs work; the worker runs work and never touches state.

```
client ──mutation──▶ server ──add──▶ redis ──▶ worker
   ▲                    ▲                        │
   └───SSE stream───────┴──── QueueEvents ◀──────┘
```

- `greet` writes a job row first, then enqueues it, so no worker event can land on a missing row.
- `QueueEvents` (active / progress / completed / failed) patch that row and emit onto one in-process `EventEmitter` in `bus.ts`, so listener count stays flat as clients come and go.
- `subscribe` fans the bus out to every client, which upserts its cached list instead of refetching.
- The stream pings every 2s and clients reconnect after 5s of silence; each reconnect invalidates the list, so a dropped stream self-heals without replay.
- `db.ts` is an append-only JSONL log replayed into a `Map` at boot — last line per `jobId` wins.

The worker fails ~25% of jobs on purpose to exercise the failure path (`FAILURE_RATE` in `apps/worker/src/worker.ts`).

## Files

| Path                       | What                                  |
| -------------------------- | ------------------------------------- |
| `apps/web/`                | UI (`src/App.tsx`, vite + tailwind)    |
| `apps/server/src/server.ts` | express host for tRPC + bull board     |
| `apps/server/src/trpc.ts`  | router (`list`, `greet`, `subscribe`) |
| `apps/server/src/bus.ts`   | event bus + queue-event wiring        |
| `apps/server/src/db.ts`    | job store (jsonl log + map)           |
| `apps/worker/`             | job worker                            |
| `packages/queue/`          | queue + redis connection, shared      |

The web app imports `AppRouter` and `Job` from `server` type-only; both are erased at build time, so no server code reaches the bundle.
