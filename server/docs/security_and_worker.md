# Security, Worker, and Redis — Operational & Integration Guide

This document describes the security practices, integration patterns, and operational guidance for the server, client, worker, and Redis-based components used in the ai-phishing-shield project.

## Goals

- Protect user data and telemetry in transit and at rest.
- Ensure integrity and idempotency of client-submitted outbox messages.
- Provide a robust processing pipeline (worker) with durable delivery and retries.
- Make rate-limiting and distributed throttling configurable and resilient.
- Provide operational guidance for deploying worker + Redis safely.

## Overview of Components

- Mobile client: collects user activity, feedback, and telemetry and submits envelopes to `/v1/outbox`.
- Server (Fastify + TypeScript): validates, sanitizes, de-duplicates, persists outbox events, exposes model catalog, and enforces rate limits.
- Worker: durable processing of queued outbox events. Uses BullMQ + Redis when available; otherwise a DB poller provides fallback.
- Redis: used for (a) distributed rate limiting and (b) BullMQ job queue for durable processing.

## Transport Security

- Always use TLS (HTTPS) for communication between client and server. Terminate TLS at the load balancer or API gateway.
- For worker-to-upstream communications (UPSTREAM_URL), ensure TLS is enforced and certificate validation is active.
- Avoid sending secrets in query strings. Use headers/bodies and rotate credentials regularly.

## Authentication & Authorization

- Client requests use Bearer tokens (short-lived if possible). The server's `auth` plugin validates tokens per `AUTH_TOKENS` or an external auth service.
- Token scope: limit tokens to minimal needed permissions (outbox submission only).
- Audit all sensitive actions using the `audit` plugin; logs are stored in Prisma `AuditLog` model.

## Input Validation & Sanitization

- All incoming envelopes are validated using Zod schemas. Each channel (feedback, telemetry, report) has dedicated schema rules.
- Sanitization removes/normalizes PII fields and dangerous content before persistence.
- Server rejects invalid envelopes (400) and very large payloads (413 >256KB).

## Idempotency & Deduplication

- The `id` field on the envelope is the client-provided idempotency key.
- Server computes a payload hash (sha256) of sanitized payload; duplicates (same id + same hash) return 409 with a canonical object.
- Replace semantics: same id but different payload will update the canonical row and return 202.
- DB is the source-of-truth for canonical payloads; queue jobs reference DB rows by `outboxId`.

## Rate Limiting & Abuse Mitigation

- Default in-memory rate limiter is provided for development via `@fastify/rate-limit` plugin.
- For production, set `REDIS_URL` and use the `redisRateLimit` plugin to apply distributed limits across instances.
- Rate-limit headers (`X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`, `Retry-After`) are provided when available. The plugin is resilient and falls back to in-memory behavior if Redis is not present.

Recommended production settings:

- `RATE_LIMIT_MAX`: tune per-client quota (e.g., 600 requests/min per token)
- Monitor `rate_limited` responses and adjust thresholds.

## Worker & Durable Delivery

Queueing behavior:

- On accept/update of an outbox row the server persists the canonical record to the DB and attempts to enqueue a job in BullMQ (Redis). If enqueue fails, a DB poller will pick up the queued items.
- Jobs contain `outboxId` and the worker reads the DB canonical row to process payloads. This ensures replace semantics are respected if the row was updated after enqueueing.

Retries and attempts:

- The worker implements exponential backoff for failed deliveries. The DB `attempts` and `availableAt` are used to track retries.
- When using BullMQ, job.attempts can be mapped to DB attempts to keep consistent counters.

Delivery semantics:

- Ideally, `UPSTREAM_URL` should implement idempotent endpoints. The worker will retry transient failures.
- On permanent errors after max attempts, a record is marked `error` and requires manual/operator intervention.

## Secrets and Configuration

- Store secrets (AUTH_TOKENS, REDIS_URL, UPSTREAM_URL credentials) in a secure secrets manager (Vault, AWS Secrets Manager, etc.).
- Use environment variables in runtime only; do not check secrets into source control.
- Rotate keys periodically and provision short-lived tokens where possible.

## Logging & Observability

- Structured logging with pino is used in non-test environments; logs are written to `logs/server.log` by default.
- Prometheus metrics (via `prom-client`) expose counters: `outbox_accepted_total`, `outbox_duplicate_total`, `outbox_invalid_total`, `outbox_processed_total`.
- Add alerting rules for high error rates, sustained retry/backoff counts, and high rate-limited responses.

## Operational Recommendations for Redis & Worker

- Run Redis in a managed/clustered mode for high availability. Avoid single-node Redis in production.
- Use network-level access controls: only application servers and workers should access Redis.
- Monitor Redis metrics: memory usage, eviction events, replication lag, and connection errors.

Worker scaling:

- Use BullMQ worker concurrency to control parallelism.
- Horizontally scale worker processes across instances; BullMQ coordinates job locking.

Shutdown behavior:

- Ensure graceful shutdown calls `queue/worker.close()`, and wait for in-flight jobs to finish or requeue.

## Security Considerations Specific to This Project

- Data minimization: sanitize payloads and avoid persisting unnecessary PII.
- Least privilege: limit token capabilities and separate service accounts for worker vs. client tokens.
- Tamper detection: client may sign envelopes (not yet implemented). Server verifies signatures before accepting high-trust events.
- Replay protection: Idempotency keys plus payload hashing help mitigate replay attacks.

## Troubleshooting & Runbook

- If many outbox events are in `error` state:

- Inspect `lastError` in DB rows to find cause.
- Verify `UPSTREAM_URL` endpoint health and TLS certs.
- Check worker logs for stack traces.

- If Redis is unreachable:

- Server falls back to in-memory limiter and DB poller continues processing. Restore Redis to regain distributed guarantees.

- If rate-limited too frequently:

- Review `RATE_LIMIT_MAX` and client behavior; consider per-client tiers.

## Deployment Checklist

- Configure TLS termination for API endpoints.
- Provision Redis with network ACLs.
- Set `AUTH_TOKENS` and other secrets securely.
- Configure `UPSTREAM_URL` and ensure endpoint idempotency requirements are met.
- Run smoke tests before cutover; monitor metrics for the first 24 hours.

## Appendix: Environment Variables

- `AUTH_TOKENS` — comma-separated tokens for dev. Use an auth provider for production.
- `REDIS_URL` — redis connection string for BullMQ and rate limiter.
- `UPSTREAM_URL` — where worker delivers outbox payloads.
- `RATE_LIMIT_MAX` — requests per timeWindow.
- `RATE_LIMIT_WINDOW_SECONDS` — window seconds for in-memory fallback.
- `OUTBOX_POLL_INTERVAL_MS` — ms between DB poller loops (fallback).
- `OUTBOX_MAX_ATTEMPTS` — max retry attempts before marking error.

## Closing notes

This guide is intentionally pragmatic: the server will work without Redis (it falls back to DB poller and in-memory limiter) but to get full durability, distributed throttling, and worker coordination use Redis + BullMQ in production.

If you'd like, I can:

- Add automated CI steps to run Redis-backed integration tests using a Redis service container.
- Expand the docs to include sample Kubernetes manifests and Helm charts for deploying Redis and the worker with proper RBAC and Secrets hooks.

\*\*\* End of document
