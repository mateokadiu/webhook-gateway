# Changelog

All notable changes to webhook-gateway are documented here. Format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versions adhere to
[Semantic Versioning](https://semver.org).

## 1.0.0 — 2026-05-30

First stable release. Everything in 0.1 plus the routing layer, event search,
bulk ops, and Stripe-compatible outbound signing.

### Added

- **Per-pair routes** — new `routes` table joining `(source, target)` with
  optional filter rules, JSONata transform, and outbound signing format.
  Missing route means "forward everything in the WG signature format" — the
  v0.1 default behavior is preserved.
- **Filter rules DSL** — `{ where: { …operators }, drop: false }` evaluated
  in the processor before delivery rows are created. Operators: `eq`, `neq`,
  `in`, `nin`, `gt`, `gte`, `lt`, `lte`, `contains`, `regex`, `exists`. Paths
  resolve against `topic`, `headers.<name>` (case-insensitive), and
  `body.<dot.path>` (JSON-parsed body). All clauses AND'd.
- **JSONata transforms** — per-route `transform` column. Expression is
  evaluated against the JSON-parsed body, result is re-serialized as the
  outbound payload. Failures (parse, compile, evaluate, serialize) log a
  warning and fall back to the original body — they never drop the event.
- **Stripe-compatible outbound signing** — per-route `signing_format` of
  `'wg'` (default) or `'stripe'`. `stripe` emits
  `Stripe-Signature: t=…,v1=…` so downstream services can verify with the
  standard Stripe SDK against the same secret.
- **Postgres full-text search on events** — new `events.tsv` tsvector
  column populated by trigger from `topic`, `dedup_key`, and the UTF-8 body.
  `GIN` index for speed. Surfaced via `/api/events?q=…` and the admin UI
  search box. Supports prefix (`foo*`) and negation (`-bar`).
- **Bulk operations** — `POST /api/events/bulk/replay` and
  `POST /api/events/bulk/tombstone` (max 500 ids per call) plus the admin
  UI's multi-select checkboxes and action bar.

### Changed

- All workspace packages bumped to `1.0.0`.
- `DeliveryClient.post` now takes an optional `signingFormat`.
- Admin events page reorganised around a checkbox column and bulk action
  toolbar; search bar lives alongside the status filter.
- Processor `processEvent` consults the routes table per delivery target;
  filter-skip deliveries are not persisted (event rolls up with `fanOut`
  reflecting only the targets that actually shipped).

### Migrations

- `0001_events_tsvector.sql` — adds `events.tsv`, the GIN index, the
  `events_tsv_update` trigger function, the BEFORE INSERT/UPDATE trigger,
  and a one-time backfill for existing rows.
- `0002_routes.sql` — adds the `routes` table, FKs, unique constraint on
  `(source_id, target_id)`, indexes, and a backfill that creates a default
  route for every existing entry in `sources.target_ids`.

Run `pnpm db:migrate` after pulling 1.0.

## 0.1.0 — 2026-06-27

Initial release. Phases 0-7 from `PLAN.md` shipped:

- Live ingress with signature verification (Stripe, GitHub, Slack, Shopify,
  generic HMAC).
- Persistence to Postgres with idempotent dedup.
- BullMQ fan-out worker with per-target retry policies.
- Admin UI (events, sources, targets, pair) with single-event replay /
  retry endpoints.
- Stats endpoint (events/min, success rates, p95 latency).
- Pulumi IaC for Oracle Cloud Always Free deployment.
- First-party plugin packages published from `packages/plugin-*`.
