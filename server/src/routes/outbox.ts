import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import prisma from '../db/prisma.js';
import { getQueue, enqueueOutbox } from '../queue/outboxQueue.js';
import crypto from 'crypto';
import { sanitizePayload } from '../lib/sanitize.js';
import {
  FeedbackPayloadSchema,
  TelemetryPayloadSchema,
  ReportPayloadSchema,
} from '../lib/channelSchemas.js';
// Metrics are provided by the server via Fastify decorators if available.
// These helpers will no-op if the decorators are not present (e.g., some test environments).
const getCounters = (server: any) => ({
  accepted: server.metricAccepted ?? { inc: (_labels?: any) => {} },
  duplicate: server.metricDuplicate ?? { inc: (_labels?: any) => {} },
  invalid: server.metricInvalid ?? { inc: (_labels?: any) => {} },
  processed: server.metricProcessed ?? { inc: (_labels?: any) => {} },
});

const EnvelopeSchema = z.object({
  id: z.string(),
  channel: z.union([z.literal('feedback'), z.literal('telemetry'), z.literal('report')]),
  payload: z.record(z.any()),
  createdAt: z
    .string()
    .refine((s) => !Number.isNaN(Date.parse(s)), { message: 'invalid timestamp' }),
});

export const outboxRoutes: FastifyPluginAsync = async (server) => {
  server.post('/outbox', async (request, reply) => {
    const start = process.hrtime();
    const contentLength = Number(request.headers['content-length'] ?? 0);
    if (contentLength > 256 * 1024) {
      return reply.code(413).send({ error: 'payload_too_large' });
    }

    let body: unknown = request.body;
    try {
      const parsed = EnvelopeSchema.parse(body);

      // channel-specific validation
      try {
        if (parsed.channel === 'feedback') {
          FeedbackPayloadSchema.parse(parsed.payload);
        } else if (parsed.channel === 'telemetry') {
          TelemetryPayloadSchema.parse(parsed.payload);
        } else if (parsed.channel === 'report') {
          ReportPayloadSchema.parse(parsed.payload);
        }
      } catch (validationErr) {
        const counters = getCounters(server);
        try {
          counters.invalid.inc({ channel: parsed.channel, status: 'invalid' });
        } catch {}
        return reply
          .code(400)
          .send({ error: 'invalid_payload', details: (validationErr as Error).message });
      }

      const sanitized = sanitizePayload(parsed.payload);
      const payloadString = JSON.stringify(sanitized);
      const hash = crypto.createHash('sha256').update(payloadString).digest('hex');

      const existing = await prisma.outboxEvent.findUnique({ where: { id: parsed.id } });
      if (existing) {
        if (existing.hash === hash && existing.channel === parsed.channel) {
          // duplicate, no change — return canonical representation with parsed payload
          const counters = getCounters(server);
          try {
            counters.duplicate.inc({ channel: parsed.channel, status: 'duplicate' });
          } catch {}
          const canon = {
            ...existing,
            payload: (() => {
              try {
                return JSON.parse(existing.payload);
              } catch {
                return existing.payload;
              }
            })(),
          };
          return reply.code(409).send({ error: 'conflict', canonical: canon });
        }
        // replace behavior: update payload and reset attempts
        const updated = await prisma.outboxEvent.update({
          where: { id: parsed.id },
          data: {
            payload: payloadString,
            createdAt: new Date(parsed.createdAt),
            receivedAt: new Date(),
            status: 'queued',
            hash,
            attempts: 0,
          },
        });
        try {
          server.metricAccepted.inc({ channel: parsed.channel, status: 'replaced' });
        } catch {}
        // enqueue for durable processing if Redis queue available
        try {
          const q = getQueue();
          if (q) await enqueueOutbox({ outboxId: updated.id });
        } catch (err) {
          request.log?.warn({ err }, 'failed to enqueue outbox job after replace');
        }
        return reply.code(202).send({ queued: true, id: updated.id });
      }

      try {
        const created = await prisma.outboxEvent.create({
          data: {
            id: parsed.id,
            channel: parsed.channel,
            payload: payloadString,
            createdAt: new Date(parsed.createdAt),
            receivedAt: new Date(),
            status: 'queued',
            hash,
            attempts: 0,
          },
        });
        try {
          server.metricAccepted.inc({ channel: parsed.channel, status: 'accepted' });
        } catch {}

        // trigger a background attempt to flush/process (worker/deferred)
        void prisma.$connect();

        // enqueue for durable processing if Redis queue available
        try {
          const q = getQueue();
          if (q) await enqueueOutbox({ outboxId: created.id });
        } catch (err) {
          request.log?.warn({ err }, 'failed to enqueue outbox job after create');
        }
      } catch (e: any) {
        // If create failed for any reason, check if another request created the
        // same id concurrently. If so, apply duplicate/replace semantics. If
        // not, rethrow the original error so the outer handler returns 400.
        // Sometimes under concurrent load the create may fail while the
        // row is still in-flight; retry a few times to allow the other
        // transaction to commit and become visible.
        let existingAfter = await prisma.outboxEvent.findUnique({ where: { id: parsed.id } });
        let attempts = 0;
        while (!existingAfter && attempts < 5) {
          // small backoff

          await new Promise((res) => setTimeout(res, 25));

          existingAfter = await prisma.outboxEvent.findUnique({ where: { id: parsed.id } });
          attempts += 1;
        }
        if (existingAfter) {
          if (existingAfter.hash === hash && existingAfter.channel === parsed.channel) {
            const counters = getCounters(server);
            try {
              counters.duplicate.inc({ channel: parsed.channel, status: 'duplicate' });
            } catch {}
            const canon = {
              ...existingAfter,
              payload: (() => {
                try {
                  return JSON.parse(existingAfter.payload);
                } catch {
                  return existingAfter.payload;
                }
              })(),
            };
            return reply.code(409).send({ error: 'conflict', canonical: canon });
          }
          // replace existing row with new payload
          const updated = await prisma.outboxEvent.update({
            where: { id: parsed.id },
            data: {
              payload: payloadString,
              createdAt: new Date(parsed.createdAt),
              receivedAt: new Date(),
              status: 'queued',
              hash,
              attempts: 0,
            },
          });
          try {
            server.metricAccepted.inc({ channel: parsed.channel, status: 'replaced' });
          } catch {}
          try {
            const q = getQueue();
            if (q) await enqueueOutbox({ outboxId: updated.id });
          } catch (err) {
            request.log?.warn({ err }, 'failed to enqueue outbox job after concurrent replace');
          }
          return reply.code(202).send({ queued: true, id: updated.id });
        }
        // rethrow original error when no concurrent row exists
        throw e;
      }

      const diff = process.hrtime(start);
      const ms = Math.round((diff[0] * 1e9 + diff[1]) / 1e6);
      try {
        server.metricProcessed.inc({ channel: parsed.channel });
      } catch {}

      // include processing latency in a header for visibility (non-sensitive)
      reply.header('x-processing-ms', String(ms));
      return reply.code(202).send({ queued: true, id: parsed.id });
    } catch (err) {
      return reply.code(400).send({ error: 'invalid_payload', details: (err as Error).message });
    }
  });
};
