import { beforeAll, afterAll, describe, it, expect } from 'vitest';
import { buildServer } from '../../src/index';
import prisma from '../../src/db/prisma';

describe('outbox integration', () => {
  let app: any;

  beforeAll(async () => {
    // ensure a token is available for authPlugin checks
    process.env.AUTH_TOKENS = process.env.AUTH_TOKENS || 'devtoken';
    app = await buildServer();
  });

  afterAll(async () => {
    try {
      await prisma.outboxEvent.deleteMany({});
    } catch (e) {
      // ignore
    }
    await app.close();
  });

  it('accepts a valid envelope and creates a DB row', async () => {
    const envelope = {
      id: 'test-1',
      channel: 'feedback',
      payload: {
        recordId: 'rec-1',
        status: 'confirmed',
        submittedAt: new Date().toISOString(),
        source: 'historical',
        channel: 'sms',
        score: 0.8,
      },
      createdAt: new Date().toISOString(),
    };

    const res = await app.inject({
      method: 'POST',
      url: '/v1/outbox',
      headers: { authorization: `Bearer ${process.env.AUTH_TOKENS?.split(',')[0] || 'devtoken'}` },
      payload: envelope,
    });

    expect([200, 202]).toContain(res.statusCode);

    const row = await prisma.outboxEvent.findUnique({ where: { id: 'test-1' } });
    expect(row).toBeTruthy();
    expect(row?.channel).toBe('feedback');
  });
});
