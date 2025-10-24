import { beforeAll, afterAll, describe, it, expect } from 'vitest';
import { buildServer } from '../../src/index';
import prisma from '../../src/db/prisma';

describe('token issuance and JWT flow', () => {
  let app: any;
  beforeAll(async () => {
    process.env.AUTH_TOKENS = process.env.AUTH_TOKENS || 'admintoken';
    process.env.AUTH_JWT_SECRET = process.env.AUTH_JWT_SECRET || 'testsecret2';
    try { await prisma.token.deleteMany({}); } catch (e) {}
    try { await prisma.outboxEvent.deleteMany({}); } catch (e) {}
    app = await buildServer();
  });

  afterAll(async () => {
    try { await prisma.token.deleteMany({}); } catch (e) {}
    try { await prisma.outboxEvent.deleteMany({}); } catch (e) {}
    await app.close();
  });

  it('creates a token, issues a JWT, and accepts JWT-authenticated requests', async () => {
    // create token
    const res = await app.inject({ method: 'POST', url: '/v1/admin/tokens', headers: { authorization: 'Bearer admintoken' }, payload: { name: 'test' } });
    if (res.statusCode !== 201) {
      // helpful during debugging to see the server-side error payload
       
      console.error('token create response payload:', res.payload);
    }
    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.payload);
    const tokenId = body.id;

    // issue jwt
    const res2 = await app.inject({ method: 'POST', url: `/v1/admin/tokens/${tokenId}/issue`, headers: { authorization: 'Bearer admintoken' } });
    expect(res2.statusCode).toBe(200);
    const jwtBody = JSON.parse(res2.payload);
    expect(jwtBody.jwt).toBeDefined();

    // use jwt to post outbox
  const envelope = { id: 'issued-1', channel: 'telemetry', payload: { name: 'evt', payload: { x: 1 }, timestamp: new Date().toISOString() }, createdAt: new Date().toISOString() };
    const res3 = await app.inject({ method: 'POST', url: '/v1/outbox', headers: { authorization: `Bearer ${jwtBody.jwt}` }, payload: envelope });
    expect(res3.statusCode).toBe(202);

    const row = await prisma.outboxEvent.findUnique({ where: { id: 'issued-1' } });
    expect(row).toBeTruthy();
  });
});
