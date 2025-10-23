# AI Phishing Shield — Server (Scaffold)

This folder contains a minimal TypeScript Fastify server scaffold used by the mobile app for:

- Unified outbox intake (`POST /v1/outbox`)
- Model catalog (`GET /models/catalog.json`)
- Diagnostics (`GET /v1/health`, `GET /v1/config`)

Important: Do NOT modify `package.json` by hand from the root. Install dependencies using pnpm from the repository root:

```bash
cd server
pnpm install
pnpm dev
```

The scaffold expects you to install the dependencies listed in the architecture plan (Fastify, Zod, Prisma, etc.). See `package.json` created by `pnpm init` after you run `pnpm install`.

Environment variables

- Copy `.env.example` to `.env` and set `AUTH_TOKENS`, `DATABASE_URL`, etc.

Prisma

- A `prisma/schema.prisma` file is provided for local development (SQLite) and production (Postgres). After installing, run:

```bash
pnpm prisma generate
pnpm prisma migrate dev --name init
```

Next steps

- Run `pnpm install` to populate `package.json` and install packages.
- Start the dev server with `pnpm dev`.

Quick curl examples

Post a telemetry envelope:

```bash
curl -X POST "http://localhost:4000/v1/outbox" \
	-H "Authorization: Bearer devtoken123" \
	-H "Content-Type: application/json" \
	-d '{"id":"telemetry@1","channel":"telemetry","payload":{"name":"dashboard.shield_toggled","payload":{"paused":false}},"createdAt":"2025-10-22T08:00:00Z"}'
```

Post a manual report envelope:

```bash
curl -X POST "http://localhost:4000/v1/outbox" \
	-H "Authorization: Bearer devtoken123" \
	-H "Content-Type: application/json" \
	-d '{"id":"rep-1","channel":"report","payload":{"reportId":"rep-1","message":{"sender":"+234...","channel":"sms","body":"claim prize"},"category":"phishing","createdAt":"2025-10-22T08:01:00Z"},"createdAt":"2025-10-22T08:01:00Z"}'
```

Get model catalog:

```bash
curl http://localhost:4000/models/catalog.json
```
