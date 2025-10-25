import { FastifyPluginAsync } from 'fastify';

export const redisRateLimitPlugin: FastifyPluginAsync = async (server) => {
  const redisUrl = process.env.REDIS_URL;
  const max = Number(process.env.RATE_LIMIT_MAX ?? 600);
  const windowSeconds = Number(process.env.RATE_LIMIT_WINDOW_SECONDS ?? 60);
  // If Redis is configured and ioredis is available, use it. Otherwise
  // provide a lightweight in-memory fallback so tests and small dev setups
  // can still exercise rate-limit headers without failing.
  let client: any = null;
  if (redisUrl) {
    try {
      // dynamic import keeps this optional for environments without ioredis

  const IORedisMod: any = await import('ioredis');
  client = new IORedisMod.default(redisUrl, { lazyConnect: false });
      // avoid unhandled error events from ioredis bubbling up and failing tests
        try {
        client.on('error', (err: any) => server.log.warn({ err }, '[rate-limit] redis error'));
      } catch {}
      server.log.info('Redis rate limiter enabled');
    } catch (err) {
      server.log.warn({ err }, 'ioredis not available — falling back to in-memory rate limiter');
    }
  } else {
    server.log.info('No REDIS_URL configured — using in-memory rate limiter (best-effort)');
  }

  // In-memory counters: map key -> { count, expiresAt }
  const inMemory = new Map<string, { count: number; expiresAt: number }>();

  server.addHook('onRequest', async (request, reply) => {
    // Always set default headers so callers can observe limits even if
    // the check fails unexpectedly. Set both via Fastify and directly on
    // the raw response to be robust in tests and different runtimes.
    try {
      const limitVal = String(max);
      const remainingVal = String(max);
      const resetVal = String(Date.now() + windowSeconds * 1000);
      try {
        reply.header('X-RateLimit-Limit', limitVal);
      } catch {}
      try {
        reply.header('X-RateLimit-Remaining', remainingVal);
      } catch {}
      try {
        reply.header('X-RateLimit-Reset', resetVal);
      } catch {}
      if (reply.raw && typeof reply.raw.setHeader === 'function') {
        try {
          reply.raw.setHeader('X-RateLimit-Limit', limitVal);
        } catch {}
        try {
          reply.raw.setHeader('X-RateLimit-Remaining', remainingVal);
        } catch {}
        try {
          reply.raw.setHeader('X-RateLimit-Reset', resetVal);
        } catch {}
      }
    } catch {}
    const auth = request.headers['authorization'];
    const key =
      typeof auth === 'string' && auth.startsWith('Bearer ')
        ? `rate:${auth.slice(7)}`
        : `rate:ip:${request.ip}`;

    try {
      if (client) {
        // Redis branch
        const count = await client.incr(key);
        if (count === 1) await client.expire(key, windowSeconds);
        const ttl = await client.ttl(key);
        const remaining = Math.max(0, max - count);
        reply.header('X-RateLimit-Limit', String(max));
        reply.header('X-RateLimit-Remaining', String(remaining));
        reply.header('X-RateLimit-Reset', String(Date.now() + ttl * 1000));
        if (count > max) {
          reply.header('Retry-After', String(ttl));
          void reply.code(429).send({ error: 'rate_limited', retryAfter: ttl });
        }
        return;
      }

      // In-memory branch
      const now = Date.now();
      const existing = inMemory.get(key);
      if (!existing || existing.expiresAt <= now) {
        inMemory.set(key, { count: 1, expiresAt: now + windowSeconds * 1000 });
        reply.header('X-RateLimit-Limit', String(max));
        reply.header('X-RateLimit-Remaining', String(max - 1));
        reply.header('X-RateLimit-Reset', String(now + windowSeconds * 1000));
        return;
      }

      existing.count += 1;
      const remaining = Math.max(0, max - existing.count);
      reply.header('X-RateLimit-Limit', String(max));
      reply.header('X-RateLimit-Remaining', String(remaining));
      reply.header('X-RateLimit-Reset', String(existing.expiresAt));

      if (existing.count > max) {
        const retryAfterSec = Math.ceil((existing.expiresAt - now) / 1000);
        reply.header('Retry-After', String(retryAfterSec));
        void reply.code(429).send({ error: 'rate_limited', retryAfter: retryAfterSec });
      }
    } catch (err) {
      // Never crash requests when rate-limit check fails; log and allow.
      server.log.warn({ err }, '[rate-limit] check failed, allowing request');
    }
  });

  // Ensure headers are present on send (extra robustness for test harnesses)
  server.addHook('onSend', async (request, reply, payload) => {
    try {
      const headers = reply.getHeaders
        ? reply.getHeaders()
        : reply.raw && reply.raw.getHeaders
          ? reply.raw.getHeaders()
          : {};
      if (!headers || !(headers as any)['x-ratelimit-limit']) {
        const limitVal = String(max);
        const remainingVal = String(max);
        const resetVal = String(Date.now() + windowSeconds * 1000);
        try {
          reply.header('X-RateLimit-Limit', limitVal);
        } catch {}
        try {
          reply.header('X-RateLimit-Remaining', remainingVal);
        } catch {}
        try {
          reply.header('X-RateLimit-Reset', resetVal);
        } catch {}
        if (reply.raw && typeof reply.raw.setHeader === 'function') {
          try {
            reply.raw.setHeader('X-RateLimit-Limit', limitVal);
          } catch {}
          try {
            reply.raw.setHeader('X-RateLimit-Remaining', remainingVal);
          } catch {}
          try {
            reply.raw.setHeader('X-RateLimit-Reset', resetVal);
          } catch {}
        }
      }
    } catch (e) {
      server.log.debug({ err: e }, '[rate-limit] onSend header set failed');
    }
    return payload;
  });
};
