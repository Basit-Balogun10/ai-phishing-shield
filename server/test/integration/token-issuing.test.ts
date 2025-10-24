import { beforeAll, afterAll, describe, it, expect } from 'vitest';
import prisma from '../../src/db/prisma';
import { buildServer } from '../../src/index';

describe('token issuance flow', () => {
  let app: any;
  beforeAll(async () => {
    process.env.AUTH_TOKENS = process.env.AUTH_TOKENS || 'devtoken';
    process.env.AUTH_JWT_SECRET = process.env.AUTH_JWT_SECRET || 'testsecret';
    try { await prisma.token.deleteMany({}); } catch (e) {}
    try { await prisma.outboxEvent.deleteMany({}); } catch (e) {}
    app = await buildServer();
  });

  afterAll(async () => {
    try { await prisma.token.deleteMany({}); } catch (e) {}
    try { await prisma.outboxEvent.deleteMany({}); } catch (e) {}
    await app.close();
  });

  it('creates a token, issues a JWT and uses it to post outbox', async () => {
    // create token via admin route
    const resCreate = await app.inject({ method: 'POST', url: '/v1/admin/tokens', headers: { authorization: `Bearer ${process.env.AUTH_TOKENS?.split(',')[0]}` }, payload: { name: 'test' } });
    expect(resCreate.statusCode).toBe(201);
    const body = JSON.parse(resCreate.payload);
    const tokenId = body.id;

    const resIssue = await app.inject({ method: 'POST', url: `/v1/admin/tokens/${tokenId}/issue`, headers: { authorization: `Bearer ${process.env.AUTH_TOKENS?.split(',')[0]}` } });
    expect(resIssue.statusCode).toBe(200);
    const issued = JSON.parse(resIssue.payload);
    expect(issued.jwt).toBeTruthy();

    // use the JWT to post an outbox envelope
  const envelope = { id: 'issued-1', channel: 'telemetry', payload: { name: 'evt', payload: { foo: 'bar' }, timestamp: new Date().toISOString() }, createdAt: new Date().toISOString() };
  const resOut = await app.inject({ method: 'POST', url: '/v1/outbox', headers: { authorization: `Bearer ${issued.jwt}` }, payload: envelope });
    expect(resOut.statusCode).toBe(202);
  });
});
