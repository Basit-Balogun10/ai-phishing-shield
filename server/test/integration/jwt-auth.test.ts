import { beforeAll, afterAll, describe, it, expect } from 'vitest';
import jwt from 'jsonwebtoken';
import { buildServer } from '../../src/index';
import prisma from '../../src/db/prisma';

describe('jwt authentication', () => {
  let app: any;
  beforeAll(async () => {
    process.env.AUTH_JWT_SECRET = process.env.AUTH_JWT_SECRET || 'testsecret';
    process.env.AUTH_TOKENS = '';
    try { await prisma.outboxEvent.deleteMany({}); } catch (e) {}
    app = await buildServer();
  });

  afterAll(async () => {
    try { await prisma.outboxEvent.deleteMany({}); } catch (e) {}
    await app.close();
  });

  it('accepts requests with a valid JWT', async () => {
    const token = jwt.sign({ sub: 'device-123', scope: 'outbox' }, process.env.AUTH_JWT_SECRET as string, { expiresIn: '1h' });

    const envelope = {
      id: 'jwt-1',
      channel: 'telemetry',
      payload: { name: 'x', payload: { foo: 'bar' }, timestamp: new Date().toISOString() },
      createdAt: new Date().toISOString(),
    };

    const res = await app.inject({ method: 'POST', url: '/v1/outbox', headers: { authorization: `Bearer ${token}` }, payload: envelope });
    expect(res.statusCode).toBe(202);

    const row = await prisma.outboxEvent.findUnique({ where: { id: 'jwt-1' } });
    expect(row).toBeTruthy();
  });
});
