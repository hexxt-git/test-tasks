# Working on this repo

Context for anyone — human or agent — picking up the research agent. The README
covers what the app is and how to run it; this file covers the parts you cannot
infer from the code, mostly things that cost money or were learned the hard way.

## Layout

```
apps/server/    express + tRPC, owns job state, never runs work
apps/worker/    bullmq worker, runs work, never touches state
apps/web/       react client
packages/queue/ redis connection + shared job types
```

The agent lives in `apps/worker/src`:

| Path               | Role                                                        |
| ------------------ | ----------------------------------------------------------- |
| `jobs/`            | job handlers; `search.ts` wires the agent session and tools |
| `tools/`           | agent-facing: schema, description, formatting, logging      |
| `providers/`       | fetching and mapping; no knowledge of the agent             |
| `providers/apify/` | one file per platform, one Apify actor family each          |

`tools/` holds `web_search`, `read_url`, the profile tools (`social_profile.ts`),
the single-post tools (`social_post.ts`) and `yelp_business` (`business.ts`).
Not every platform supports every shape: LinkedIn, Instagram and TikTok are
profile-only, Reddit and X do both, and Yelp is a business listing whose reviews
are written by other people — which is why reviews are their own type instead of
being crammed into `posts`.

Keep that split. A tool decides what the model sees; a provider decides what the
vendor's payload means. Tools never call `apify-client`, providers never build
tool results.

## The jobs system

One queue, `tasks`, on Redis. A job is `{ job: "search", question }`.

1. `trpc.search` writes the row to `db.ts` **first**, then enqueues, so no worker
   event can land on a row that does not exist yet.
2. The worker runs the agent and calls `job.updateProgress({ turn })` once per
   finished LLM turn — the turn's thinking, answer text, and every tool call with
   its arguments and result.
3. `bus.ts` turns queue events into row patches and emits the **whole row** onto
   one in-process `EventEmitter`, which `subscribe` fans out over SSE.
4. `db.ts` is an append-only JSONL log replayed into a `Map` at boot; last line
   per `jobId` wins.

Things that will bite you:

- **Progress replays.** Redis re-delivers the last progress value on reconnect.
  `bus.ts` drops a turn whose `index` it already has. Keep `index` monotonic.
- **Restarts lose events.** `QueueEvents` does not replay missed events, so
  `reconcile()` re-checks unfinished rows against Redis at boot. A job that has
  been evicted is marked `failed` with "outcome unknown" — never guess success.
- **Worker concurrency is 3**, and the agent is mostly waiting on network calls.
  See the Apify concurrency cap below before raising it.
- **`INSTANT_EXIT=1`** makes the worker exit on the first signal instead of
  draining, so `--watch` restarts do not block for a whole agent run. It also
  raises `maxStalledCount`, because every restart looks like a stall.

## The SearXNG instance

`searxng/` is a two-container compose stack behind `web_search`: SearXNG plus a
Tor container that carries all of its outgoing traffic.

```
docker compose -f searxng/compose.yml up -d
```

- **Five SocksPorts, 9050-9054, in one tor container.** Tor isolates streams
  from different SocksPorts onto different circuits, so the five ports are five
  exit IPs at any moment. SearXNG cycles the list in `outgoing.proxies`
  round-robin, so consecutive engine requests leave from different exits.
- **`MaxCircuitDirtiness 3600`** retires each circuit an hour after first use;
  the next stream through that port builds a fresh one, so the five exit IPs
  rotate hourly. Check them with
  `curl --socks5-hostname 127.0.0.1:9050 https://check.torproject.org/api/ip`.
- **Open and unlimited by choice.** SearXNG has no API key or basic auth of its
  own -- only the limiter's IP allow/blocklists -- and it is published on
  `0.0.0.0:8080` with `limiter: false`, so anything that can reach the host can
  search through it, unthrottled. The tor SocksPorts stay on `127.0.0.1`; an
  open SOCKS proxy is a different kind of exposure. `SEARXNG_API_KEY` is still
  supported by the provider (sent as `Authorization: Bearer`) for a hosted
  instance behind a proxy that checks one; empty for this stack.
- **Access log.** `GRANIAN_LOG_ACCESS_ENABLED` gives one line per request,
  query string included, capped by docker's own rotation (`max-size: 5m`,
  `max-file: 2`, so 10 MB and then the oldest chunk is dropped -- nothing to
  prune by hand). Counting what the instance actually served:
  `docker compose -f searxng/compose.yml logs searxng | grep -c '"GET /search'`.
- **`search.formats` must include `json`** and `limiter` must be off, or the
  worker's `format=json` request gets a 403.
- **Only `google cse` and `bing` are enabled**, via `use_default_settings.engines.keep_only`;
  both ship disabled in the defaults, so `engines:` switches them back on. The
  `google_cse` engine needs no API key -- it uses a public CX and a token it
  fetches from `google.com/cse/cse.js`. Every other engine is dropped because
  most of them refuse Tor exits: Brave, DuckDuckGo and Startpage answered
  `too many requests` / `access denied` / `CAPTCHA` on a live run. These two do
  not, but a Tor exit can still get blocked -- which is why an empty SearXNG
  response falls through to the paid actor rather than being reported as
  "no results".

## Choosing a provider

Every tool is backed by an Apify actor. Picking the actor is the hard part; the
mapping code is easy. Vendors gate free-plan accounts because Apify only pays
developers for **paid-plan** usage. That is permitted, but the rules require the
limit to be disclosed in the README and input schema and surfaced as a status
message — not as a billed dataset item. Many actors break those rules.

Criteria, in priority order:

1. **First-party wins.** `apify/*` actors have never gated us.
2. **Scale.** Prefer high `totalUsers` and `totalUsers30Days`. Read them from
   `client.actor(id).get()` — free. Grade on the category's curve: 4,000
   users/30d is normal for LinkedIn, 180 is the ceiling for Yelp.
3. **Input shape.** Prefer a bare handle / id / URL. An actor whose input is a
   search query cannot do an exact lookup, whatever its docs claim.
4. **One vendor per platform.** Profile and posts from the same seller, like
   `apimaestro` for LinkedIn or `danek` for X. Halves the gating surface.
5. **Price per result, and read the tiers.** The listing's `pricePerUnitUsd` is
   often `undefined`; the real number is
   `pricingInfos.at(-1).pricingPerEvent.actorChargeEvents[event].eventTieredPricingUsd.FREE.tieredEventPriceUsd`.
   Watch for per-run start fees, which dominate single-item lookups.
6. **No undisclosed gate.** Grep the build's readme for "free plan", "free tier",
   "limited to", "upgrade". Reading actor, build and dataset metadata is free —
   only `.call()` costs money.
7. **Prove it with 20 runs.** Every gate that has hit us appeared only under
   repetition. Twenty distinct targets, then decide.

### Vendors that failed, and how

| Vendor                            | Failure                                                                                                                 |
| --------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `harvestapi/*`                    | ~20 runs across both its actors, then hard stop. Undocumented.                                                          |
| `apidojo/*`                       | 5 runs per month, per actor. Documented at least.                                                                       |
| `scraperlink/*`                   | Blocks every free account, disclosed nowhere, **and bills $0.0005 per refusal**.                                        |
| `igolaizola/*`                    | Returns one fake "result" that is an affiliate ad for Apify pricing.                                                    |
| `tri_angle/yelp-scraper`          | `SUCCEEDED` with **zero items** on both direct URL and search, no message, bills the start fee. The worst pattern seen. |
| `delicious_zebu/yelp-…`           | Same silent zero.                                                                                                       |
| `epctex/yelp-business-api`        | "Not available on the Free plan" — disclosed.                                                                           |
| `api-ninja/yelp-ultimate-scraper` | Refuses any run capped below $0.10.                                                                                     |
| `unseenuser/LinkedIn-Profile`     | Works, but returns byte-identical fields to `harvestapi` — the same backend resold.                                     |

## Writing a provider

The recurring bug in this project is **a vendor reporting "not found" as
something that looks like data**. It has happened five separate ways. Assume it
will happen again with the next actor.

- **Never fall back to the requested value.** `str(profile.publicIdentifier) ?? handle`
  once fabricated a valid-looking LinkedIn profile for a handle that does not
  exist. Take the identity from the response or throw.
- **Always compare request to response.** Every profile provider rejects a body
  whose handle is not the one asked for. Compare lowercased.
- **Learn each actor's miss shape, and handle all of them.** Seen so far: an
  `error` field on the item (`instagram`), a `{ profile_input, message }` item on
  a `SUCCEEDED` run (`apimaestro`), an `ABORTED` run (`apimaestro`, `danek`), an
  all-null stub item (`danek`), and an empty dataset (`fatihtahta`, `web_wanderer`).
  One actor can use several — `apimaestro` and `danek` each use two.
- **`ActorRunError` carries `status`** so an `ABORTED` run can be reported as
  "not found" while a genuine failure still surfaces. Never blanket-catch: that
  turns a cap-block into a false "this profile does not exist".
- **Never index blindly.** `videos[0].authorMeta ?? {}` produced whole profiles of
  nulls. Use `.find()` for the first item that actually has the field, and throw
  if none does.
- **An empty result is ambiguous.** For Reddit a missing user and a silent user
  look identical, so the error says so rather than picking one.
- **Best-effort second calls stay sequential.** LinkedIn fetches posts only after
  the profile is confirmed, so a typo does not pay for both actors, and logs the
  failure instead of swallowing it. Do not "optimise" this into `Promise.all`.
- **Post-count constants live in the provider** (`MAX_POSTS`, `MAX_COMMENTS`),
  not in the tool, because each one is a per-vendor price knob.
- Use `num()` / `str()` from `providers/util.ts` to narrow untrusted payloads,
  `compact()` to drop empty keys from `extras`, and keep `extras` an explicit
  object literal — no generic `pick()` helper, no chains of small helpers.
- Field names drift between an actor's own modes. `danek` returns `likes`/`id`
  for a post lookup and `favorites`/`tweet_id` for a profile listing, and the
  avatar is `image` in one and `avatar` in the other. Check both.

### The Apify concurrency cap

**The free plan allows 5 concurrent actor runs.** Exceeding it throws
`By launching this job you will exceed your limit of 5 concurrent Actor runs`
rather than queueing. Worker concurrency is 3, and `linkedin_profile` and
`tiktok_profile` each fire two runs, so three parallel jobs can already breach
it. There is no semaphore in `runActor` yet — this is a known gap.

## Costs

Per call, on the free tier. `read_url` is the only free tool.

| Tool                | Actor                                           | Cost                 |
| ------------------- | ----------------------------------------------- | -------------------- |
| `web_search`        | SearXNG, else `apify/google-search-scraper`     | free, else $0.0055   |
| `read_url`          | direct fetch + Defuddle                         | free                 |
| `linkedin_profile`  | `apimaestro/linkedin-profile-detail` + `-posts` | $0.025 (4 posts)     |
| `instagram_profile` | `apify/instagram-scraper`                       | $0.0027              |
| `tiktok_profile`    | `scraptik/tiktok-api` (2 runs)                  | $0.0040              |
| `reddit_profile`    | `fatihtahta/reddit-scraper-search-fast`         | $0.015 (10 items)    |
| `x_profile`         | `danek/twitter-scraper`                         | $0.0030 (10 posts)   |
| `reddit_post`       | `fatihtahta/reddit-scraper-search-fast`         | $0.016 (10 comments) |
| `x_post`            | `danek/twitter-scraper`                         | $0.0003              |
| `yelp_business`     | `web_wanderer/yelp-reviews-scraper`             | $0.0030 (10 reviews) |

Charges settle asynchronously — often minutes late. Reading account usage right
after a run understates it. Per-run truth is `client.run(id).get().usageTotalUsd`.

**Do not burn credits on verification loops.** Capture a payload once, then
iterate against the captured sample with typecheck and offline checks. Batch what
must be live into one run covering several cases.

## tool-debug

`tool-debug/` (gitignored) holds one input/output pair per tool case, for
eyeballing what the agent actually receives:

```
tool-debug/<tool_name>/NN-case.json        { tool, input, output }
tool-debug/<tool_name>/NN-case.parse.json  just the parsed payload
```

`.parse.json` is the tool's text content run through `JSON.parse`, or the raw
string when it is not JSON — so a failure case shows its error message.

**Regenerate it without paying**, by replaying past Apify runs. Reading runs,
their `INPUT` key-value record, and their datasets is free. There is no generator
in the repo by design; build it in a scratch directory:

1. **Collect.** Walk `client.runs().list()`, keep `SUCCEEDED` runs of the actors
   you care about, and store `{ actor, input, items }` for each. Keep zero-item
   runs — they are how not-found cases replay correctly.
2. **Patch.** Copy `src/` into the scratch dir and replace `runActor` in the
   copied `providers/apify/client.ts` with a cache lookup. Copy rather than
   inject, so the real client is never touched.
3. **Match strictly.** Score candidates by how many `path=value` leaves they
   share with the request, but _require_ every identifying (non-numeric,
   non-boolean) leaf to match exactly. A loose matcher will happily serve a
   different profile's run for a not-found case and write a fixture describing
   behaviour that never happens.
4. **Run the tools, not the providers**, so descriptions, formatting and error
   text are all exercised. `tool.execute({}, input)` — note the context argument
   comes first.
5. Delete the scratch dir afterwards.

Only `read_url` hits the network during a regeneration, and it is free.

Cases worth keeping for every tool: two or three healthy lookups, one not-found,
and one malformed input. The failure fixtures are the point — they are where the
bugs listed above would show up.
