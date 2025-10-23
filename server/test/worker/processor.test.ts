import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import prisma from '../../src/db/prisma';
import { startProcessor } from '../../src/worker/processor';

describe('worker processor', () => {
  beforeAll(async () => {
    await prisma.outboxEvent.deleteMany({});
  });

  afterAll(async () => {
    await prisma.outboxEvent.deleteMany({});
    await prisma.$disconnect();
  });

  it('processes queued outbox items when UPSTREAM_URL is unset', async () => {
    process.env.UPSTREAM_URL = '';
    const id = 'worker-test-1';
    await prisma.outboxEvent.create({ data: { id, channel: 'telemetry', payload: JSON.stringify({ foo: 'bar' }), createdAt: new Date(), receivedAt: new Date(), status: 'queued', hash: 'h', attempts: 0 } });

    const { stop, close } = startProcessor() as any;
    // allow processor loop to pick it up
    await new Promise((r) => setTimeout(r, 500));

    const row = await prisma.outboxEvent.findUnique({ where: { id } });
    expect(row?.status).toBe('processed');

    stop();
    await close();
  });
});
