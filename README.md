# test-tasks

Ask a research question, a BullMQ worker runs an LLM agent on it, and the UI streams the agent's chain of thought — every turn's reasoning, tool calls and tool output — live over tRPC subscriptions. Rows start collapsed; the header expands one into its transcript, and each tool call expands into its raw output.

React 19 + Vite + Tailwind, tRPC on Express, TanStack Query, BullMQ on Redis.

## Run

Needs Redis on `redis://localhost:20824` (override with `REDIS_URL`) and a root `.env` (see `.env.example`) holding `DEEPSEEK_API_KEY` and `APIFY_TOKEN`, plus an optional `SEARXNG_ENDPOINT` (and `SEARXNG_API_KEY` if the instance is behind auth) that `web_search` tries before the paid Apify SERP actor (`docker compose -f searxng/compose.yml up -d` runs one locally on `http://localhost:8080`); the worker loads it with `node --env-file`.

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

- `search` writes a job row first, then enqueues it, so no worker event can land on a missing row.
- The worker reports progress once per finished LLM turn, carrying that turn's thinking, answer text and tool calls; `bus.ts` appends it to the row, so the row is the whole transcript so far.
- `QueueEvents` (active / progress / completed / failed) patch that row and emit onto one in-process `EventEmitter` in `bus.ts`, so listener count stays flat as clients come and go.
- `subscribe` fans the bus out to every client, which upserts its cached list instead of refetching.
- The stream pings every 2s and clients reconnect after 5s of silence; each reconnect invalidates the list, so a dropped stream self-heals without replay.
- `db.ts` is an append-only JSONL log replayed into a `Map` at boot — last line per `jobId` wins.

There is no meaningful percentage to report — the number of turns is unknowable up front — so a row shows a spinner while it is queued or running and its turn count as it grows.

## Files

| Path                          | What                                     |
| ----------------------------- | ---------------------------------------- |
| `apps/web/`                   | UI (`src/App.tsx`, vite + tailwind)      |
| `apps/server/src/server.ts`   | express host for tRPC + bull board       |
| `apps/server/src/trpc.ts`     | router (`list`, `search`, `subscribe`)   |
| `apps/server/src/bus.ts`      | event bus + queue-event wiring           |
| `apps/server/src/db.ts`       | job store (jsonl log + map)              |
| `apps/worker/src/jobs/search.ts` | the agent run, one progress report per turn |
| `apps/worker/src/tools/`      | agent tools (search, read url, profiles) |
| `packages/queue/`             | queue, redis connection and job types    |

The web app imports `AppRouter` and `Job` from `server` type-only; both are erased at build time, so no server code reaches the bundle.
