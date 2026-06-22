# `webhook-gateway` — Implementation Plan

> A self-hosted, $0/mo, OSS webhook reliability gateway. Sits between external webhook senders (Stripe, GitHub, Shopify, Slack, etc.) and your internal services. Verifies signatures, persists every event, fans out to consumers, retries with exponential backoff, deduplicates, ships a replay UI. Same shape as Hookdeck / Svix Cloud — minus the price tag and the third party.

**Status:** Draft — pending decisions in §11 before Phase 0 starts.

---

## 1. Goals & non-goals

### Goals
- **Ingress** — accept HTTP webhook posts from any external source. Per-source signature verification via pluggable verifiers. Ack within 50ms; processing is async.
- **Durable outbox** — every event lands in Postgres before we ack the sender. No data loss on worker crash.
- **Fan-out** — one inbound event can deliver to N configured downstream targets (your services, queues, other webhooks).
- **Idempotent processing** — per-source idempotency keys + body-hash dedup, configurable.
- **Retries with exponential backoff** + per-target circuit breaker. Dead-letter after N attempts.
- **Replay UI** — browse events, see attempts, retry one or many, edit-and-replay.
- **Plugin model** — `@webhook-gateway/plugin-*` packages ship signature verifiers + payload schemas for common sources. First-party: Stripe, GitHub, Slack, Shopify, GoPuff. Third-party plugins are just npm packages implementing the interface.
- **Self-host, $0/mo** — Docker Compose for local; Pulumi → Oracle Cloud Always Free for production.
- **OSS, MIT.** Public from day one.
- **Outbound signing** (optional) — when fanning out, gateway re-signs payloads with a per-target HMAC secret so downstream services verify against a known key.

### Non-goals (for v1)
- No event transformation / mapping rules engine. The downstream gets the same shape (possibly re-wrapped) as inbound. v2 territory.
- No bidirectional sync (this is one-way: external → internal).
- No managed SaaS / multi-tenant offering. Self-host only.
- No browser-side UI for end-users — admin UI only.
- No support for non-HTTP sources (no SQS / Kafka / RabbitMQ ingress in v1).
- No alerting integrations baked in (PagerDuty, OpsGenie, etc.) — webhook out + you wire your own.

---

## 2. The problem

External services emit webhooks. You're supposed to:
- verify the signature
- ack within their timeout (Stripe: 5s · GitHub: 10s · Slack: 3s)
- process the payload (which may be slow — DB writes, downstream calls)
- handle retries (the sender will retry on non-2xx, often duplicating)
- de-dupe (sender retries + your own at-least-once consumer = guaranteed dupes)
- recover when your downstream is down (sender abandons after 3 days; you've lost the event)

Doing this right means:
- two-stage processing (accept fast, work slow)
- a durable outbox
- per-source signature verification
- per-target retry policies
- a replay mechanism

This is six packages, four tables, two cron jobs, an admin UI, and a sharp learning curve every team builds in-house. **Productize it.**

---

## 3. Architecture

```
┌────────────────────────────────────────────────────────────────────────────┐
│ External webhook senders (Stripe, GitHub, Shopify, Slack, etc.)            │
└───────────────────────────────┬────────────────────────────────────────────┘
                                │  HTTPS POST
                                ▼
┌────────────────────────────────────────────────────────────────────────────┐
│ api — NestJS + Fastify (Cloud Run / k8s pod)                               │
│                                                                            │
│  POST /in/:source/:topic?                                                  │
│    1. raw-body parser → keep bytes for signature verify                   │
│    2. lookup `sources` row by :source slug                                │
│    3. plugin signature verifier → reject on mismatch                      │
│    4. dedup check (body-hash, optional source-supplied idempotency key)   │
│    5. INSERT events row (status=queued) + enqueue BullMQ job              │
│    6. ACK 200 to sender ◄── target SLO ≤ 50ms p95                         │
│                                                                            │
│  GET /api/events, /api/deliveries, /api/sources, /api/targets   ← admin   │
│  POST /api/events/:id/replay, /api/deliveries/:id/retry                   │
└───────────────────────────────┬────────────────────────────────────────────┘
                                │ BullMQ (Redis)
                                ▼
┌────────────────────────────────────────────────────────────────────────────┐
│ processor — same image as api, worker mode                                 │
│                                                                            │
│  For each queued event:                                                    │
│    1. Resolve fan-out targets (sources.target_ids)                        │
│    2. For each target: create deliveries row (status=pending)             │
│    3. For each delivery: POST to target.url with re-signed body           │
│       - Exp backoff: 30s, 2m, 10m, 1h, 6h, 24h (configurable per target) │
│       - On 2xx: deliveries.status=ok                                     │
│       - On 4xx (non-429): deliveries.status=failed (no retry)            │
│       - On 5xx / timeout / 429: deliveries.status=retrying, re-enqueue   │
│    4. When all deliveries terminal: events.status=ok / partial / failed   │
└────────────────────────────────────────────────────────────────────────────┘
                                                              │
                                                              ▼
                                                ┌─────────────────────────────┐
                                                │ Your internal consumers     │
                                                │  (your services / queues)  │
                                                └─────────────────────────────┘

┌────────────────────────────────────────────────────────────────────────────┐
│ admin — Next.js 15 (separate pod, but bundles into the same Docker image  │
│ in v1 for ops simplicity)                                                  │
│                                                                            │
│ Pages: /events, /events/:id, /deliveries, /sources, /targets, /settings   │
└────────────────────────────────────────────────────────────────────────────┘
```

**Storage**: Postgres 16 (events, deliveries, sources, targets, plugin_state). Redis 7 (BullMQ).

**Determinism**: events get a `uuidv7` id at ingest. Deduplication is by `(source_id, dedup_key)` where `dedup_key` is either the source-supplied idempotency header (if any) or `sha256(body)`. Replay does not re-dedup — it forces a new fan-out cycle.

---

## 4. Tech stack

| Layer | Choice | Why |
|---|---|---|
| Backend | NestJS 11 + Fastify adapter | Module/provider DI fits per-feature modules; matches the user's daily stack |
| Runtime | Node 22 LTS | |
| DB | Postgres 16 | JSONB for headers/payload, partial indexes for queue-status, row-level constraints |
| ORM | Drizzle | Matches the user's other projects; raw-SQL escape hatch for window queries |
| Queue | BullMQ + Redis 7 | Native exp-backoff, native rate limit, built-in DLQ pattern |
| Validation | Zod | Shared types via `packages/shared` |
| Frontend | Next.js 15 + React 19 + Tailwind v4 + shadcn/ui + TanStack Query v5 | Matches the user's other projects |
| Signature verification | per-plugin (Stripe SDK / GitHub SDK / hand-rolled HMAC) | Plugins are small npm packages |
| HTTP client | undici (native fetch) | Built into Node 22; no extra dep |
| Logger | Pino + nestjs-pino | Structured, fast, redaction-aware |
| Auth (admin) | Bearer token (single-user/team) | No need for SSO at v1 |
| Container | Docker Compose | local: postgres + redis + api/processor + admin |
| IaC | Pulumi → Oracle Cloud Always Free | $0/mo per ai-trading-copilot's playbook |
| Monorepo | pnpm + Turborepo | Same shape as the other projects |
| Build | tsup for plugin packages, nest build for api, next build for admin | |
| Tests | Vitest + Testcontainers (PG + Redis) | Integration-first because the whole point is reliability |
| CI | GitHub Actions | lint + typecheck + test (with testcontainers) |
| Release | semantic-release per plugin package | Plugins ship to npm; api+admin ship as Docker image |

---

## 5. Public surface

### 5.1 HTTP — ingress

```
POST /in/:source                        Required path. :source matches sources.slug.
POST /in/:source/:topic                 Optional :topic for routing (e.g. github push vs pr).
   headers:
     X-Forwarded-* (from your reverse proxy, preserved)
     <source-signature-header>          source plugin reads this (e.g. Stripe-Signature)
     Idempotency-Key (optional)         overrides default body-hash dedup
   body: raw bytes (preserved for HMAC verify)

   → 200 OK              { eventId: 'evt_…' }
   → 401                 signature missing / invalid
   → 409                 duplicate (deduped against a prior event)
   → 413                 body too large (configurable cap, default 1 MiB)
   → 503                 ingress disabled (admin can toggle per source)
```

Ingress endpoints are **NOT** bearer-auth protected — the signature IS the auth. Configure your reverse proxy / CDN to expose only `/in/*`.

### 5.2 HTTP — admin (all bearer-protected)

```
GET    /api/events?source=&status=&from=&to=&cursor=&limit=
GET    /api/events/:id
POST   /api/events/:id/replay                                   replay (new fan-out)
POST   /api/events/:id/replay-target?target_id=                 replay to one target
DELETE /api/events/:id                                          tombstone (soft delete)

GET    /api/deliveries?event_id=&target_id=&status=
GET    /api/deliveries/:id
POST   /api/deliveries/:id/retry

GET    /api/sources
POST   /api/sources                                             create
GET    /api/sources/:slug
PATCH  /api/sources/:slug
DELETE /api/sources/:slug

GET    /api/targets
POST   /api/targets
GET    /api/targets/:id
PATCH  /api/targets/:id
DELETE /api/targets/:id

POST   /api/sources/:slug/test                                  inject a synthetic event
                                                                (gates: requires testMode=true)
GET    /api/health
GET    /api/stats                                               event/min, p95 latency, etc.
```

### 5.3 Plugin contract

```ts
// @webhook-gateway/plugin-sdk

export interface SignatureVerifier {
  /** Match a source's pluginId in config (e.g. 'stripe'). */
  readonly id: string;
  /** Verify the inbound request. Returns true to accept, false to reject. */
  verify(input: {
    rawBody: Buffer;
    headers: Record<string, string | string[] | undefined>;
    secret: string;       // per-source signing secret from sources.signing_secret
    tolerance?: number;   // optional time-skew tolerance, seconds
  }): Promise<boolean>;
  /** Optional — extract a source-native idempotency key. Falls back to sha256(body). */
  extractIdempotencyKey?(input: {
    rawBody: Buffer;
    headers: Record<string, string | string[] | undefined>;
  }): string | null;
  /** Optional — pluck a topic from the payload (e.g. Stripe event.type). Used for routing. */
  extractTopic?(input: { rawBody: Buffer }): string | null;
}
```

First-party plugin packages:

| Package | Source signature scheme |
|---|---|
| `@webhook-gateway/plugin-stripe` | `Stripe-Signature` (HMAC SHA-256 with timestamp + tolerance) |
| `@webhook-gateway/plugin-github` | `X-Hub-Signature-256` |
| `@webhook-gateway/plugin-slack` | `X-Slack-Signature` + `X-Slack-Request-Timestamp` |
| `@webhook-gateway/plugin-shopify` | `X-Shopify-Hmac-Sha256` |
| `@webhook-gateway/plugin-svix` | `Svix-Signature` (`v1,…` format) |
| `@webhook-gateway/plugin-hmac` | Generic HMAC SHA-256, header name configurable. Catch-all. |

---

## 6. Project structure

```
webhook-gateway/
├── PLAN.md
├── README.md
├── LICENSE                                MIT
├── package.json                            workspace root
├── pnpm-workspace.yaml
├── turbo.json
├── tsconfig.base.json
├── docker-compose.yml                      postgres + redis + api + processor + admin
├── .env.example
├── .gitignore
├── .nvmrc
├── .github/
│   └── workflows/
│       ├── ci.yml
│       └── release.yml                     publishes plugin packages to npm
├── apps/
│   ├── api/                                NestJS — ingress + admin REST
│   │   ├── src/
│   │   │   ├── main.ts
│   │   │   ├── app.module.ts
│   │   │   ├── config/env.schema.ts
│   │   │   ├── common/
│   │   │   │   ├── drizzle/
│   │   │   │   ├── queue/
│   │   │   │   ├── auth/
│   │   │   │   ├── raw-body/                preserve bytes for signature verify
│   │   │   │   └── plugins/                  loader + registry
│   │   │   ├── modules/
│   │   │   │   ├── ingress/                  POST /in/:source
│   │   │   │   ├── events/                   admin CRUD + replay
│   │   │   │   ├── deliveries/               admin CRUD + retry
│   │   │   │   ├── sources/
│   │   │   │   ├── targets/
│   │   │   │   ├── processor/                BullMQ worker (same process, worker mode)
│   │   │   │   └── health/
│   │   │   └── drizzle/
│   │   │       ├── schema.ts
│   │   │       └── migrations/
│   │   ├── test/
│   │   └── Dockerfile
│   └── admin/                              Next.js 15 admin UI
│       ├── app/
│       │   ├── events/
│       │   ├── deliveries/
│       │   ├── sources/
│       │   ├── targets/
│       │   └── settings/
│       ├── components/
│       ├── lib/
│       └── Dockerfile
├── packages/
│   ├── shared/                             zod schemas + types
│   ├── plugin-sdk/                         SignatureVerifier interface + helpers
│   ├── plugin-stripe/
│   ├── plugin-github/
│   ├── plugin-slack/
│   ├── plugin-shopify/
│   ├── plugin-svix/
│   └── plugin-hmac/
└── ops/
    ├── docker/postgres-init.sql
    ├── scripts/{reset.sh, seed-dev.ts}
    └── pulumi/                             optional Oracle deploy
```

---

## 7. Database schema (Postgres 16 + Drizzle)

```sql
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE sources (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug            TEXT UNIQUE NOT NULL,        -- path component, e.g. 'stripe-prod'
  label           TEXT NOT NULL,
  plugin_id       TEXT NOT NULL,               -- matches a plugin's SignatureVerifier.id
  signing_secret  TEXT NOT NULL,               -- HMAC key etc.
  signature_tolerance_sec INT NOT NULL DEFAULT 300,
  enabled         BOOLEAN NOT NULL DEFAULT TRUE,
  test_mode       BOOLEAN NOT NULL DEFAULT FALSE,
  target_ids      UUID[] NOT NULL DEFAULT '{}',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE targets (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  label           TEXT NOT NULL,
  url             TEXT NOT NULL,
  signing_secret  TEXT,                        -- if set, gateway re-signs outbound with this
  headers         JSONB NOT NULL DEFAULT '{}'::jsonb,  -- extra static headers (auth, etc.)
  timeout_ms      INT NOT NULL DEFAULT 10000,
  max_attempts    INT NOT NULL DEFAULT 6,
  backoff_schedule INT[] NOT NULL DEFAULT ARRAY[30,120,600,3600,21600,86400], -- seconds
  enabled         BOOLEAN NOT NULL DEFAULT TRUE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE events (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id       UUID NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
  topic           TEXT,                        -- nullable; from path or plugin.extractTopic
  dedup_key       TEXT NOT NULL,
  body            BYTEA NOT NULL,
  body_hash       TEXT NOT NULL,               -- sha256, lowercase hex
  headers         JSONB NOT NULL,
  size_bytes      INT NOT NULL,
  status          TEXT NOT NULL CHECK (status IN ('queued','processing','ok','partial','failed','tombstoned')),
  fan_out         INT NOT NULL DEFAULT 0,      -- count of deliveries created
  fan_out_ok      INT NOT NULL DEFAULT 0,
  fan_out_failed  INT NOT NULL DEFAULT 0,
  received_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at    TIMESTAMPTZ,
  UNIQUE (source_id, dedup_key)
);
CREATE INDEX events_received_idx ON events (received_at DESC);
CREATE INDEX events_source_status_idx ON events (source_id, status, received_at DESC);

CREATE TABLE deliveries (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id        UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  target_id       UUID NOT NULL REFERENCES targets(id) ON DELETE CASCADE,
  attempt         INT NOT NULL DEFAULT 0,
  next_attempt_at TIMESTAMPTZ,
  status          TEXT NOT NULL CHECK (status IN ('pending','retrying','ok','failed','dead')),
  last_status_code INT,
  last_response_excerpt TEXT,                  -- first 2KB; for debugging
  last_attempt_at TIMESTAMPTZ,
  total_duration_ms INT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at    TIMESTAMPTZ
);
CREATE INDEX deliveries_event_idx ON deliveries (event_id);
CREATE INDEX deliveries_status_idx ON deliveries (status, next_attempt_at);

CREATE TABLE source_stats_daily (
  source_id       UUID NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
  date            DATE NOT NULL,
  events_received INT NOT NULL DEFAULT 0,
  events_ok       INT NOT NULL DEFAULT 0,
  events_failed   INT NOT NULL DEFAULT 0,
  PRIMARY KEY (source_id, date)
);
```

Notes:
- `events.body` is BYTEA (raw bytes — preserves the exact payload for signature re-verify on replay).
- `deliveries.last_response_excerpt` is capped at 2KB; large bodies are truncated to keep table size sane.
- `(source_id, dedup_key)` unique constraint enforces dedup at the DB level — an ingest after dedup wins or returns 409 immediately, no race.

---

## 8. Key flows

### 8.1 Ingest

```
1. POST /in/:source[/:topic] arrives.
2. raw-body parser keeps the bytes.
3. Lookup sources.slug = ':source'. If missing → 404.
4. If !source.enabled → 503.
5. Plugin lookup by source.plugin_id. If missing → 503 "plugin not loaded".
6. plugin.verify({ rawBody, headers, secret: source.signing_secret, tolerance }):
   - false → 401 "invalid signature"
   - throws → 401 "signature verify error"
7. dedup_key:
   - if request has Idempotency-Key header → that
   - elif plugin.extractIdempotencyKey → that
   - else → sha256(rawBody)
8. INSERT events (source_id, dedup_key, body, body_hash, headers, size_bytes, status='queued')
   ON CONFLICT (source_id, dedup_key) DO NOTHING RETURNING id.
   If no row returned → 409 "duplicate".
9. Enqueue BullMQ job: { eventId: id }
10. ACK 200 { eventId }
```

Target latency: p95 ≤ 50ms. The two slow steps are signature verify and the INSERT; everything else is microseconds. We do NOT enrich, transform, or call out to other services on the ingest path.

### 8.2 Fan-out

```
Worker picks job { eventId }:

1. SELECT event + source. If event.status != 'queued' → done (was replayed/handled).
2. UPDATE events SET status='processing'.
3. For each target_id in source.target_ids:
   - If target.enabled → INSERT deliveries (event_id, target_id, status='pending')
4. For each delivery: enqueue per-delivery BullMQ job.

Worker picks per-delivery job:

5. SELECT delivery + target + event.body.
6. If delivery.status not in ('pending','retrying') → done (already terminal).
7. POST target.url with:
   - method POST
   - headers: target.headers merged with { 'content-type': event.headers['content-type'] }
   - if target.signing_secret → add 'X-WG-Signature: v1,t=<ts>,s=<hmac-sha256>'
   - body: event.body (bytes, unchanged)
   - timeout target.timeout_ms
8. On 2xx → UPDATE delivery status='ok', completed_at=now, last_status_code, last_response_excerpt.
9. On 4xx (≠ 408,429) → status='failed', no retry.
10. On 5xx / 408 / 429 / network error / timeout:
    - attempt += 1
    - if attempt >= target.max_attempts → status='dead'
    - else: status='retrying', next_attempt_at = now + backoff_schedule[attempt-1]
    - re-enqueue with `delay = next_attempt_at - now`
11. After every delivery transition: re-check parent event:
    - all ok → events.status='ok', completed_at, fan_out_ok += 1
    - all terminal (mix of ok / failed / dead) → 'partial' if any ok, 'failed' if none
    - else still in flight → no event update
```

### 8.3 Replay

- **Full replay** (`POST /api/events/:id/replay`): clones the event's fan-out targets (current `source.target_ids` at replay time, NOT the ones used originally), creates new deliveries, enqueues. Original deliveries are kept for history; replay deliveries get a `parent_delivery_id` (optional column, deferred).
- **Single-target replay** (`POST /api/events/:id/replay-target?target_id=`): same but for one target.
- **Delivery retry** (`POST /api/deliveries/:id/retry`): re-enqueues an existing delivery from its current attempt count. Useful when the upstream consumer has been fixed and you want to skip the natural backoff.

Replays NEVER re-dedup. They are explicit operator actions.

### 8.4 DLQ

A delivery hits `status='dead'` after `max_attempts`. No automatic action — it sits in the UI under "dead deliveries" with the last response excerpt visible. Operators decide: ack-and-forget (tombstone the event), retry once the downstream is fixed, or patch the consumer and replay.

---

## 9. Plugin model

A plugin is a small npm package that:
1. Exports a `SignatureVerifier` (and optionally an `extractIdempotencyKey` / `extractTopic`).
2. Has zero non-peer runtime deps where possible — verifiers are usually 30-50 lines of HMAC.

The api process loads plugins listed in `WEBHOOK_GATEWAY_PLUGINS` env (CSV) — dynamic `import()` on boot, registers each by `id`. Sources reference plugins by `plugin_id`.

Example — Stripe plugin:

```ts
// @webhook-gateway/plugin-stripe
import { createHmac, timingSafeEqual } from 'node:crypto';
import type { SignatureVerifier } from '@webhook-gateway/plugin-sdk';

export const stripePlugin: SignatureVerifier = {
  id: 'stripe',
  async verify({ rawBody, headers, secret, tolerance = 300 }) {
    const header = pickHeader(headers, 'stripe-signature');
    if (!header) return false;
    const parts = parseSignatureHeader(header); // { t, v1: [hex…] }
    if (!parts.t || parts.v1.length === 0) return false;
    if (Math.abs(Date.now() / 1000 - Number(parts.t)) > tolerance) return false;
    const expected = createHmac('sha256', secret)
      .update(`${parts.t}.`)
      .update(rawBody)
      .digest('hex');
    return parts.v1.some(
      (sig) => sig.length === expected.length && timingSafeEqual(Buffer.from(sig), Buffer.from(expected)),
    );
  },
  extractIdempotencyKey({ rawBody }) {
    try {
      return JSON.parse(rawBody.toString('utf-8')).id ?? null;
    } catch {
      return null;
    }
  },
  extractTopic({ rawBody }) {
    try {
      return JSON.parse(rawBody.toString('utf-8')).type ?? null;
    } catch {
      return null;
    }
  },
};
```

Each plugin ships a README with the source's docs link + a snippet showing how to configure a `source` for it.

---

## 10. Build phases

| Phase | Scope | Effort |
|---|---|---|
| **0** | Workspace scaffold: pnpm + Turborepo, NestJS api with Fastify + raw-body parser + Drizzle + initial schema, Next.js admin shell, Docker Compose (postgres + redis + api + admin), CI, MIT | 2 evenings |
| **1** | Ingress: `/in/:source/:topic`, sources CRUD, plugin-sdk + plugin-hmac (generic baseline), idempotency, raw-body persistence, end-to-end "sent + 200 + saved" test via testcontainers | 2 evenings |
| **2** | Fan-out worker: BullMQ wiring, delivery POSTer with exp-backoff + circuit per target, status rollup on parent event, DLQ status, integration test "send + fan-out to 2 mock targets + verify" | 3 evenings |
| **3** | First-party plugins: `plugin-stripe`, `plugin-github`, `plugin-slack`, `plugin-shopify`, `plugin-svix`. Each: 30-50 line verifier + idempotency + topic, table-driven tests against canonical payloads | 2 evenings |
| **4** | Admin UI: events list + filter, event detail w/ deliveries + payload viewer, deliveries list, source/target CRUD, replay + retry buttons, settings | 3 evenings |
| **5** | Outbound signing (per-target HMAC), replay flows incl. single-target, `/api/sources/:slug/test` test-mode synth-event injection | 2 evenings |
| **6** | Observability: `/api/stats` (events/min, p95 latency, success rates per source/target), pino redaction policies, Prometheus `/metrics` endpoint | 2 evenings |
| **7** | Pulumi → Oracle Cloud Always Free deploy (same approach as ai-trading-copilot Phase 7), `PUBLISHING.md` for the plugin packages | 1 evening |
| **8** | Docs site (mintlify-flavored single-file Markdown initially), `examples/stripe-end-to-end/`, screenshots in README | 2 evenings |

**Total v1**: ~19 evenings. 5-7 weeks at a sustainable cadence.

---

## 11. Decisions to confirm before Phase 0

| # | Decision | Default | Alt |
|---|---|---|---|
| 1 | Project name / GH repo | `webhook-gateway` | `webhookd`, `relayhouse`, `gatewatch` |
| 2 | npm scope | `@webhook-gateway/*` (org-style, matches `@temporal-stripe/*`) | `@mateokadiu/webhook-gateway-*` |
| 3 | Repo location | `~/Desktop/development/personal/webhook-gateway/` (folder already exists, empty) | other |
| 4 | api + processor: same process (worker mode toggle) or two services from day one? | **Same process** — simpler ops; split when you can prove a need | Two services with their own Dockerfiles |
| 5 | Admin UI shape | **Bearer-token paired**, single-user (matches the other projects) | Add minimal users table + login form |
| 6 | First-party plugins shipped in v0.1 | Stripe, GitHub, Slack, Shopify, generic HMAC | Drop one of those |
| 7 | Outbound signing format | Stripe-style `v1,t=<ts>,s=<hmac-sha256>` | Different scheme |
| 8 | Storage of `events.body` | **BYTEA** (bytes, max 1 MiB default cap) | TEXT + base64 |
| 9 | Schedule for first npm publish | After Phase 3 — plugin packages can ship before api+admin are polished | Wait for v0.1.0 across the board |
| 10 | Initial v0.1 scope | **Phases 0-4** (ingress, fan-out, plugins, admin UI) | Smaller — phases 0-2 only |

---

## 12. Out of scope (explicit)

- Transformation / mapping rules engine. v2.
- Filter rules ("only forward Stripe `invoice.*` events to target X"). v2.
- Multi-tenant SaaS. Not planned.
- Event sourcing / replay-from-any-point. The DB is the log; replay starts from there.
- Compliance certifications (SOC2 etc.) — self-host means it's the operator's responsibility.

---

## 13. Prior art & differentiators

| Tool | License | Self-host | Stack | Verdict |
|---|---|---|---|---|
| [Hookdeck](https://hookdeck.com) | Closed | No | proprietary SaaS | nice product, paid |
| [Svix Server](https://github.com/svix/svix-webhooks) | Apache 2.0 | Yes | Rust | great but ops-heavy and customisation requires Rust |
| [Smee.io](https://smee.io) | MIT | Yes | Node | tunnel, not a gateway |
| [Inngest](https://inngest.com) | Apache 2.0 | Partial | TS/Go | event-driven workflows, not webhook-shaped |
| **`webhook-gateway`** | MIT | Yes | TS / NestJS / Next.js | TS-native, plugin model, simple ops, $0 deploy path |

The differentiator: **operator-friendly + TS-native + actually $0 self-hosted**. Same shape as Hookdeck, simpler stack than Svix, with a real admin UI.

---

## 14. References

- Stripe — webhook reliability: https://stripe.com/docs/webhooks/best-practices
- GitHub — webhook signature: https://docs.github.com/en/webhooks/using-webhooks/validating-webhook-deliveries
- Shopify — verifying HMAC: https://shopify.dev/docs/apps/build/webhooks/subscribe/verify-webhook-hmac
- Slack — request verification: https://api.slack.com/authentication/verifying-requests-from-slack
- Svix — design docs: https://docs.svix.com/
