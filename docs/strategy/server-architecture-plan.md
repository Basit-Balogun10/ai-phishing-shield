# Server Architecture Plan

## Mobile integration recap

- **Outbox events** – The Expo client buffers feedback, telemetry, and manual phishing reports in `lib/services/networkOutbox.ts` and attempts to POST each entry to `EXPO_PUBLIC_FEEDBACK_ENDPOINT` as soon as connectivity is available. Each envelope includes a stable `id`, channel discriminator, payload JSON, and device timestamp.
- **Model manager** – `lib/modelManager.ts` syncs the downloadable TensorFlow Lite catalog from `EXPO_PUBLIC_MODEL_CATALOG_URL` and installs binaries to local storage. The client falls back to a dummy catalog if the remote request exceeds the 8s timeout.
- **Diagnostics** – The dashboard, onboarding gate, and developer tools surface telemetry that is useful for a `/v1/health` and `/v1/config` response (shield paused state, feature flags, maintenance windows, minimum supported app version, etc.).

These contracts ensure the server stays optional for core detection while enabling feedback loops, analytics, and model distribution.

## Goals derived from requirements

1. **Unified outbox intake** (`POST {EXPO_PUBLIC_FEEDBACK_ENDPOINT}`) with per-channel validation, idempotency, and 202-acknowledged queuing.
2. **Model catalog hosting** (`GET /models/catalog.json` and static HTTPS downloads) with predictable latency and resumable transfers.
3. **Diagnostics endpoints** (`/v1/health`, `/v1/config`) for monitoring and configuration distribution.
4. **Operational guardrails** – Bearer-token authentication, 600 req/min rate limiting per token, 256 KB payload ceiling, structured logging, and audit trails.

## Proposed stack

| Concern               | Choice                                                          | Notes                                                                                  |
| --------------------- | --------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| Runtime               | Node.js 20 LTS                                                  | Broad support; pairs well with Expo ecosystem.                                         |
| Framework             | Fastify 5 + TypeScript                                          | High-throughput, schema-first validation, native JSON logging.                         |
| Validation            | Zod via `fastify-type-provider-zod`                             | Mirrors the mobile-side TypeScript shapes and keeps schemas co-located.                |
| Persistence           | SQLite (dev) via Prisma ORM, with Postgres target in production | Simple local setup; migrate to managed Postgres (Neon, Supabase) without code changes. |
| Background processing | Lightweight in-process queue (Prisma status fields)             | Adequate for MVP; can be upgraded to BullMQ + Redis when throughput demands.           |
| Auth                  | Static bearer token middleware                                  | Exact header match now; extend to JWT later.                                           |
| Rate limiting         | `@fastify/rate-limit` backed by Redis (Upstash/Elasticache)     | Windowed 600 req/min per token; fallback to in-memory limiter for local dev.           |
| Config                | `dotenv-flow`                                                   | Supports environment layering and secrets management.                                  |
| Tooling               | PNPM workspace, ESLint/Prettier, Vitest for unit tests          | Aligns with existing repo conventions.                                                 |

## API surface

### `POST /v1/outbox`

- Consumes the envelope defined in `docs/strategy/server-integration-requirements.md`.
- Validates base envelope + per-channel payload using Zod schemas that mirror the mobile contract.
- Enforces `Content-Length <= 262144` bytes.
- Requires `Authorization: Bearer <token>`; rejects missing/invalid tokens with `401`.
- Returns `202 Accepted` with `{ "queued": true, "id": "..." }` on success.
- Returns `409 Conflict` when the incoming payload matches an existing event (same `id` + unchanged checksum).
- Returns `400 Bad Request` with machine-readable errors on validation failure.
- Persists the event in `outbox_events` with columns:
  - `id` (PK, stable device identifier)
  - `channel` (`feedback | telemetry | report`)
  - `payload` (JSONB)
  - `created_at` (device timestamp)
  - `received_at` (server timestamp)
  - `status` (`queued | processing | processed | error`)
  - `hash` (SHA-256 of payload for dedupe/audit)
  - `attempts` (retry counter)

Channel-specific fan-out will be handled by async workers that can evolve into message brokers later.

### `GET /models/catalog.json`

- Reads from `model_catalog_entries` table (or falls back to a versioned JSON file stored under `server/catalog/catalog.json`).
- Returns an array sorted by `released_at DESC`.
- Adds ETag/`Cache-Control: max-age=60` for caching.
- Served over HTTPS in production (reverse proxy / CDN). Range requests are delegated to the underlying static assets (hosted in object storage like Cloudflare R2 or S3).

### `GET /v1/health`

- Lightweight check: `{ "status": "ok", "uptime": number, "commit": string }`.

### `GET /v1/config`

- Returns feature-flag payload consumed by the app, e.g.:

```json
{
  "minAppVersion": "1.0.0",
  "maintenance": null,
  "featureFlags": {
    "manualReportsEnabled": true,
    "modelDownloads": "live"
  }
}
```

- Fetched anonymously but still rate limited to deter abuse.

## Data model sketch

```text
outbox_events
  id TEXT PRIMARY KEY
  channel TEXT CHECK channel IN ('feedback','telemetry','report')
  payload JSONB NOT NULL
  created_at TIMESTAMP WITH TIME ZONE NOT NULL
  received_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
  status TEXT NOT NULL DEFAULT 'queued'
  hash TEXT NOT NULL
  attempts INTEGER NOT NULL DEFAULT 0
  last_error TEXT

model_catalog_entries
  id SERIAL PRIMARY KEY
  version TEXT UNIQUE NOT NULL
  released_at TIMESTAMP WITH TIME ZONE NOT NULL
  size_mb REAL NOT NULL
  checksum TEXT NOT NULL
  changelog JSONB NOT NULL
  download_url TEXT NOT NULL
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
```

Audit logging can be appended via Prisma middleware that captures `token`, IP, and route for every write operation.

## Infrastructure & deployment

- **Local dev** – `pnpm --filter @aphish/server dev` runs Fastify with hot reload, SQLite, and in-memory rate limiter.
- **Production** – Containerized via Docker. Recommended stack: Fastify app + Prisma -> Postgres, Redis for rate limiting, object storage for model binaries, served behind Fly.io/Render/Cloud Run with HTTPS termination.
- **Environment variables**
  - `PORT` (default `4000`)
  - `APP_ENV` (`development`, `staging`, `production`)
  - `AUTH_TOKENS` (comma-separated list of bearer tokens)
  - `DATABASE_URL`
  - `REDIS_URL` (optional; switches limiter to Redis)
  - `MODEL_CATALOG_PATH` (fallback JSON file location)
  - `LOG_LEVEL` (`info` default)

## Operational considerations

- **Rate limiting** – Configure 600 requests per minute per token (10 requests/sec) with burst handling. Retry headers: `Retry-After` and `X-RateLimit-Reset`.
- **Payload sanitization** – Strip high-risk fields before logging; rely on Prisma JSON serialization for storage. Consider `dompurify` or custom sanitizers before indexing into analytics.
- **Validation errors** – Standardize `{ "error": "invalid_payload", "field": "status", "details": "..." }` responses for client debugging.
- **Testing** – Vitest suites for schema validation, endpoint contracts, and auth middleware. Supertest (or Fastify inject) for integration tests.
- **Observability** – Pino logs shipped to Loki/Datadog. Add `/metrics` (Prometheus) later if needed.

## Next steps

1. Scaffold the Fastify + TypeScript project inside `server/` with PNPM workspace support.
2. Implement auth, rate limiting, and schema validation middleware.
3. Create Prisma schema & migrations for `outbox_events` and `model_catalog_entries`.
4. Stub controllers for `/v1/outbox`, `/v1/health`, `/v1/config`, `/models/catalog.json` with unit tests.
5. Wire local configuration and developer documentation for running the server alongside the Expo app.
