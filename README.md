# webhook-gateway

Self-hosted, MIT-licensed webhook reliability gateway. Verify signatures, persist to Postgres, fan out to your services, retry with exponential backoff, replay from a UI.

Same shape as Hookdeck / Svix Cloud — minus the price tag and the third party. TypeScript-native, Docker-Compose to start, Pulumi to scale.

```
external sender  ──HTTPS──▶  /in/:source   ──BullMQ──▶   ┌─ POST target A
                              ▲                          ├─ POST target B  ──retry w/ backoff──▶ ok / dead
                              │                          └─ POST target C
                       signature verify                        ▲
                       (Stripe / GitHub /                      │
                        Slack / Shopify / HMAC)        per-target retry policy
```

## Status

Phases 0-7 shipped. Live ingress, fan-out, plugins, admin UI, stats, Pulumi deploy. v0.1 ready.

## Two-minute quick start

```bash
git clone https://github.com/mateokadiu/webhook-gateway.git
cd webhook-gateway
cp .env.example .env
echo "ADMIN_BEARER=$(openssl rand -hex 32)" >> .env

pnpm install
pnpm compose:up
pnpm db:migrate

open http://localhost:5000     # admin UI → /pair → paste your ADMIN_BEARER
```

## End-to-end: receive Stripe events, fan out to your services

**1. Configure a target** in the admin UI (`/targets`) — your own internal API endpoint:

```
label:          orders-service
url:            https://orders.internal.example.com/webhooks/stripe
signing secret: (optional) — gateway re-signs with X-WG-Signature
```

**2. Configure a Stripe source** (`/sources`):

```
slug:           stripe-prod
label:          Stripe production
plugin id:      stripe
signing secret: whsec_xxx   (from Stripe dashboard → Developers → Webhooks → Signing secret)
```

Attach the target to the source via the API (admin UI edit landing in v0.2):

```bash
curl -X PATCH http://localhost:5001/api/sources/stripe-prod \
  -H "authorization: Bearer $ADMIN_BEARER" \
  -H 'content-type: application/json' \
  -d "{\"targetIds\":[\"<target-uuid>\"]}"
```

**3. Point Stripe at the gateway.** In the Stripe dashboard, set the webhook URL to:

```
https://hooks.your-domain.com/in/stripe-prod
```

(`/in/stripe-prod` is the slug-derived path. Use Cloudflare Tunnel, ngrok, or your reverse proxy to terminate TLS in front of port `5001`.)

**4. Watch traffic.** Events show up in `/events` in real-time (the list auto-refreshes every 5s). Click into one to see the body, deliveries per target, retry attempts. Hit **Replay** to re-fan-out without re-receiving.

## Architecture

| Layer | Tech |
|---|---|
| api | NestJS 11 + Fastify (raw-body for HMAC verify) |
| ORM | Drizzle (Postgres 16, JSONB headers, BYTEA bodies) |
| queue | BullMQ + Redis 7, per-target backoff schedules |
| processor | Same Node process as api; toggle off via `WORKER_MODE=off` |
| admin | Next.js 15 + React 19 + Tailwind v4 + TanStack Query v5 |
| plugins | `@webhook-gateway/plugin-*` packages — one verifier each |
| deploy | Docker Compose locally; Pulumi → Oracle Cloud Always Free ($0/mo) |

Two BullMQ queues: `events` (one job per inbound event, fans out to deliveries) and `deliveries` (one job per `(event, target)` attempt). Failures re-enqueue with explicit delay from `targets.backoff_schedule`. Status rolls up on the parent event once all deliveries terminal.

See [`PLAN.md`](./PLAN.md) for the full schema, signal flows, and decisions log.

## First-party plugins

| Package | Signature scheme |
|---|---|
| `@webhook-gateway/plugin-stripe` | `Stripe-Signature` (`t=…,v1=…`) with tolerance, rotating-key support |
| `@webhook-gateway/plugin-github` | `X-Hub-Signature-256` |
| `@webhook-gateway/plugin-slack` | `X-Slack-Signature` (`v0=…`) + `X-Slack-Request-Timestamp` |
| `@webhook-gateway/plugin-shopify` | `X-Shopify-Hmac-Sha256` (base64) |
| `@webhook-gateway/plugin-hmac` | Generic HMAC SHA-256 — header / prefix / encoding configurable per source |

Each ships as a 30-50 line npm package with table-driven tests. Tell the api which plugins to load via env:

```bash
WEBHOOK_GATEWAY_PLUGINS=@webhook-gateway/plugin-stripe,@webhook-gateway/plugin-github
```

## Writing a plugin

Plugins implement one interface and ship as their own npm package — no fork required.

```ts
// my-org-plugin/src/index.ts
import { createHmac, timingSafeEqual } from 'node:crypto';
import { pickHeader, type SignatureVerifier } from '@webhook-gateway/plugin-sdk';

export const myOrgPlugin: SignatureVerifier = {
  id: 'my-org',
  verify({ rawBody, headers, secret }) {
    const sig = pickHeader(headers, 'x-myorg-signature');
    if (!sig) return false;
    const expected = createHmac('sha256', secret).update(rawBody).digest('hex');
    return sig.length === expected.length && timingSafeEqual(Buffer.from(sig), Buffer.from(expected));
  },
  extractIdempotencyKey({ headers }) {
    return pickHeader(headers, 'x-myorg-event-id');
  },
};

export default myOrgPlugin;
```

```bash
WEBHOOK_GATEWAY_PLUGINS=@webhook-gateway/plugin-hmac,my-org-plugin
```

The api dynamic-imports each listed package on boot and registers by `id`. Sources reference your plugin via `pluginId: 'my-org'`.

## Outbound signing

When you set a `signing_secret` on a target, the gateway signs every outbound POST as:

```
X-WG-Signature: v1,t=<unix-ts>,s=<hex-sha256-of-(t.body)>
```

Your downstream service verifies with the same secret, gets a clean idempotency story (timestamps + body hash). The format is borrowed from Stripe — the verification helper is two lines of code on the consumer side.

## Stats

```
GET /api/stats?hours=24
```

Returns events/min, success rates, p95 delivery latency, top sources, top targets. Useful for an oncall dashboard.

## Deploy ($0/month)

Two options, both genuinely free:

- **Local Mac / VM**: `pnpm compose:up` + a launchd plist or systemd unit. Works fine for personal use.
- **Oracle Cloud Always Free**: ARM A1.Flex (4 OCPU / 24 GB, forever free). `ops/pulumi/` has the IaC. Public ingress via Cloudflare Tunnel.

See `ops/pulumi/README.md` for the cloud path.

## Comparisons

| | Hookdeck | Svix Cloud | Svix Server | webhook-gateway |
|---|---|---|---|---|
| License | proprietary | proprietary | Apache 2.0 | MIT |
| Self-host | ✗ | ✗ | ✓ Rust | ✓ TypeScript |
| Plugin model | proprietary | proprietary | source-baked | npm packages |
| Admin UI | ✓ | ✓ | ✓ | ✓ |
| Free tier | limited | limited | n/a | n/a — free |

Differentiator: TypeScript-native plugin model + actually $0 self-hosted.

## Status

Phase 7 of the v0.1 roadmap shipped. See [PLAN.md §10](./PLAN.md) for what's coming in v0.2 (filter rules engine, transformation, multi-tenant ops).

## Contributing

```bash
pnpm install
pnpm build
pnpm typecheck
pnpm test         # 37 tests across the plugin packages
```

PRs welcome. Plugin contributions especially welcome — open an issue first so we can claim the npm name in the `@webhook-gateway` scope.

## License

MIT.
