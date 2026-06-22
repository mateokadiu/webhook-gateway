# webhook-gateway

Self-hosted, MIT-licensed webhook reliability gateway. Verify signatures, persist to Postgres, fan out to your services, retry with exponential backoff, replay from a UI.

Think Hookdeck / Svix Cloud, minus the price tag and the third-party. TypeScript-native, Docker-Compose to start, Pulumi to scale.

## Stack

- **api** — NestJS 11 + Fastify (raw-body for signature verify) + Drizzle + Postgres 16 + BullMQ + Redis 7
- **admin** — Next.js 15 + React 19 + Tailwind v4 + TanStack Query v5
- **plugins** — small npm packages per source: `@webhook-gateway/plugin-stripe`, `…/plugin-github`, `…/plugin-slack`, `…/plugin-shopify`, `…/plugin-hmac` (generic)

## Quick start

```bash
cp .env.example .env
# generate a bearer for the admin UI:
echo "ADMIN_BEARER=$(openssl rand -hex 32)" >> .env

pnpm install
pnpm compose:up               # postgres + redis + api + admin
pnpm db:migrate

open http://localhost:5000    # admin UI on :5000, ingress + api on :5001
```

Send a test event:

```bash
curl -X POST http://localhost:5001/in/example \
  -H 'content-type: application/json' \
  -d '{"hello":"world"}'
# → 401 (no source configured yet — set one up in the admin UI)
```

See [`PLAN.md`](./PLAN.md) for the full architecture, schema, plugin contract, and phase roadmap.

## License

MIT.
