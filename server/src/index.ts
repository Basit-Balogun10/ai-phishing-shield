import Fastify from 'fastify';
import helmet from '@fastify/helmet';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import { outboxRoutes } from './routes/outbox';
import { modelsRoutes } from './routes/models';
import { healthRoutes } from './routes/health';
import { configRoutes } from './routes/config';
import { metricsRoutes } from './routes/metrics';
import { auditsRoutes } from './routes/audits';
import { authPlugin } from './plugins/auth';
import { auditPlugin } from './plugins/audit';
import { redisRateLimitPlugin } from './plugins/redisRateLimit';
import prisma from './db/prisma';
import { startProcessor } from './worker/processor';
import pino from 'pino';
import fs from 'fs';
import path from 'path';
// prom-client will be dynamically imported so the package is optional in tests
import type { Registry as PromRegistryType } from 'prom-client';
import { tokenRoutes } from './routes/tokens';

// Use Fastify's built-in pino configuration object
export const buildServer = async () => {
  // Configure logger: silence in test to keep test output clean and avoid
  // passing a pino instance directly into Fastify (Fastify expects a
  // configuration object). In non-test environments we'll use Fastify's
  // internal logger with a simple config. If needed later we can wire a
  // dedicated pino destination/transport.
  const isTest = process.env.NODE_ENV === 'test' || process.env.VITEST === '1';
  let fastifyLogger: any = { level: process.env.LOG_LEVEL ?? 'info' };
  if (isTest) fastifyLogger = false;

  const app = Fastify({ logger: fastifyLogger });

  app.register(helmet);
  app.register(cors, { origin: true });

  // rate limit: default in-memory limiter for dev; can be configured to use Redis in prod
  app.register(rateLimit, {
    max: Number(process.env.RATE_LIMIT_MAX ?? 600),
    timeWindow: '1 minute',
    keyGenerator: (request) => {
      const auth = request.headers['authorization'];
      if (typeof auth === 'string' && auth.startsWith('Bearer ')) {
        return auth.slice(7).trim();
      }
      return request.ip;
    },
  });

  // optional Redis-backed rate limit (if REDIS_URL provided)
  app.register(redisRateLimitPlugin);

  app.register(authPlugin);
  app.register(auditPlugin);

  app.register(outboxRoutes, { prefix: '/v1' });
  app.register(tokenRoutes, { prefix: '/v1' });
  app.register(auditsRoutes, { prefix: '/v1' });
  app.register(healthRoutes, { prefix: '/v1' });
  app.register(configRoutes, { prefix: '/v1' });
  app.register(modelsRoutes, { prefix: '/models' });
  app.register(metricsRoutes, { prefix: '/metrics' });

  // readiness probe
  app.get('/v1/ready', async () => ({ ready: true }));

  // Try to load prom-client to create a registry and labeled counters. If the
  // package is not available (test envs), create no-op placeholders so routes
  // can still call .inc() without throwing.
  let registry: PromRegistryType | null = null;
  let accepted: any = { inc: (_labels?: any) => {} };
  let duplicate: any = { inc: (_labels?: any) => {} };
  let invalid: any = { inc: (_labels?: any) => {} };
  let processed: any = { inc: (_labels?: any) => {} };
  try {
    // dynamic import so prom-client is optional
    const mod = await import('prom-client');
    registry = new mod.Registry();
    const labels = ['channel', 'status'];
    accepted = new mod.Counter({
      name: 'outbox_accepted_total',
      help: 'Total accepted outbox entries',
      labelNames: labels,
      registers: [registry],
    });
    duplicate = new mod.Counter({
      name: 'outbox_duplicate_total',
      help: 'Total duplicate outbox entries',
      labelNames: labels,
      registers: [registry],
    });
    invalid = new mod.Counter({
      name: 'outbox_invalid_total',
      help: 'Total invalid outbox requests',
      labelNames: labels,
      registers: [registry],
    });
    processed = new mod.Counter({
      name: 'outbox_processed_total',
      help: 'Processed outbox events',
      labelNames: ['channel'],
      registers: [registry],
    });
    // collect defaults optionally
  const collectDefault = mod.collectDefaultMetrics;
  if (collectDefault) collectDefault({ register: registry });
  } catch {
    // leave placeholders as no-ops
  }

  // make registry and counters available to routes via decorators
  app.decorate('metricsRegistry', registry as any);
  app.decorate('metricAccepted', accepted as any);
  app.decorate('metricDuplicate', duplicate as any);
  app.decorate('metricInvalid', invalid as any);
  app.decorate('metricProcessed', processed as any);

  // Configure file-based pino logger for non-test environments. We do not pass
  // the pino instance directly to Fastify (to avoid the logger-options shape
  // issue). Instead, create a file destination and write request/response
  // summaries to it via Fastify hooks.
  if (!isTest) {
    const logDir = path.join(__dirname, '..', '..', 'logs');
    try {
      fs.mkdirSync(logDir, { recursive: true });
    } catch {}
    const logFile = path.join(logDir, 'server.log');
    const pinoDest = pino.destination({ dest: logFile, sync: false });
    const fileLogger = pino({ level: process.env.LOG_LEVEL ?? 'info' }, pinoDest);

    app.addHook('onRequest', async (request: any, reply: any) => {
      request.logStart = process.hrtime();
      fileLogger.info(
        { reqId: request.id, method: request.method, url: request.url, ip: request.ip },
        'req.start'
      );
    });

    app.addHook('onResponse', async (request: any, reply: any) => {
      const diff = request.logStart ? process.hrtime(request.logStart) : [0, 0];
      const ms = Math.round((diff[0] * 1e9 + diff[1]) / 1e6);
      fileLogger.info(
        {
          reqId: request.id,
          method: request.method,
          url: request.url,
          status: reply.statusCode,
          durationMs: ms,
        },
        'req.done'
      );
    });
  }

  // connect to prisma but do not start background processors when used in test mode
  await prisma.$connect();

  // In test environments, ensure the SQLite database schema is applied by
  // running any SQL migration files found under prisma/migrations. This
  // keeps tests hermetic without requiring the external `prisma` CLI.
  if (isTest) {
    try {
      const migDir = path.join(process.cwd(), 'prisma', 'migrations');
      const entries = fs
        .readdirSync(migDir, { withFileTypes: true })
        .filter((d) => d.isDirectory())
        .map((d) => d.name)
        .sort();
      for (const entry of entries) {
        const sqlPath = path.join(migDir, entry, 'migration.sql');
        try {
          if (fs.existsSync(sqlPath)) {
            const sql = fs.readFileSync(sqlPath, 'utf8');
            // execute migration SQL; use raw execution since Prisma CLI is not
            // available in the test harness

            await prisma.$executeRawUnsafe(sql);
          }
        } catch (mErr) {
          // non-fatal in case migrations already applied or SQL incompatible
          app.log.debug({ err: mErr, file: sqlPath }, 'migration apply failed (continuing)');
        }
      }
    } catch (e) {
      // ignore if migrations folder doesn't exist
      app.log.debug({ err: e }, 'no migrations to apply');
    }
  }

  // Start background processor only when not in test mode. Keep reference to
  // the controller so we can close queues/workers during shutdown.
  let processorController: any = null;
  if (!isTest) {
    processorController = startProcessor();
    // ensure we close on app shutdown
    app.addHook('onClose', async () => {
      try {
        await processorController?.close?.();
      } catch {}
    });
  }

  // expose for diagnostics
  (app as any).processorController = processorController;

  return app;
};

const start = async () => {
  try {
    const port = Number(process.env.PORT ?? 4000);
    const app = await buildServer();
    startProcessor();
    await app.listen({ port, host: '0.0.0.0' });
    console.log(`Server listening on ${port}`);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
};

// ES modules entry check
if (import.meta.url === `file://${process.argv[1]}`) {
  void start();
}
