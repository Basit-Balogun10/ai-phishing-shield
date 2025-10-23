import { beforeAll, afterAll, describe, it, expect } from 'vitest';
import { buildServer } from '../../src/index';
import prisma from '../../src/db/prisma';

describe('outbox concurrency/idempotency', () => {
  let app: any;
  beforeAll(async () => {
    process.env.AUTH_TOKENS = process.env.AUTH_TOKENS || 'devtoken';
    try { await prisma.outboxEvent.deleteMany({}); } catch (e) {}
    app = await buildServer();
  });

  afterAll(async () => {
    try {
      await prisma.outboxEvent.deleteMany({});
    } catch (e) {}
    await app.close();
  });

  it('handles concurrent POSTs with same id (idempotent/replace semantics)', async () => {
    const envelope = {
      id: 'concurrent-1',
      channel: 'feedback',
      payload: {
        recordId: 'rec-conc',
        status: 'confirmed',
        submittedAt: new Date().toISOString(),
        source: 'historical',
        channel: 'sms',
        score: 0.5,
      },
      createdAt: new Date().toISOString(),
    };

    // spawn several parallel requests with same payload
    const tasks = new Array(6).fill(0).map(() => {
      return app.inject({
        method: 'POST',
        url: '/v1/outbox',
        headers: {
          authorization: `Bearer ${process.env.AUTH_TOKENS?.split(',')[0] || 'devtoken'}`,
        },
        payload: envelope,
      });
    });

    const results = await Promise.all(tasks);
  const statuses = results.map((r: any) => r.statusCode).sort();
  // debug: output responses when running in CI/combined test suites to diagnose
   
  console.log('concurrent responses', results.map((r: any) => ({ status: r.statusCode, body: r.payload })));
    // Expect that some will be 202 (queued) and any duplicates return 409
  expect(statuses.some((s: number) => s === 202)).toBe(true);
  expect(statuses.every((s: number) => [202, 409].includes(s))).toBe(true);

  // debug removed
  const row = await prisma.outboxEvent.findUnique({ where: { id: 'concurrent-1' } });
    expect(row).toBeTruthy();
    expect(row?.channel).toBe('feedback');
  });
});
