import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildServer } from '../../src/index';
import prisma from '../../src/db/prisma';

describe('outbox edge cases', () => {
  let app: any;
  beforeAll(async () => {
    process.env.AUTH_TOKENS = process.env.AUTH_TOKENS || 'devtoken';
    app = await buildServer();
  });
  afterAll(async () => {
    try { await prisma.outboxEvent.deleteMany({}); } catch (e) {}
    await app.close();
  });

  it('returns 413 for payloads >256KB', async () => {
    const big = 'a'.repeat(300 * 1024);
    const env = { id: 'big-1', channel: 'telemetry', payload: { name: 'x', payload: { blob: big }, timestamp: new Date().toISOString() }, createdAt: new Date().toISOString() };
    const res = await app.inject({ method: 'POST', url: '/v1/outbox', headers: { authorization: 'Bearer devtoken' }, payload: env });
    expect(res.statusCode).toBe(413);
  });

  it('returns 400 for invalid payload', async () => {
    const env = { id: 'bad-1', channel: 'feedback', payload: { foo: 'bar' }, createdAt: new Date().toISOString() };
    const res = await app.inject({ method: 'POST', url: '/v1/outbox', headers: { authorization: 'Bearer devtoken' }, payload: env });
    expect(res.statusCode).toBe(400);
  });

  it('duplicate id with same payload returns 409', async () => {
    const env = { id: 'dup-1', channel: 'feedback', payload: { recordId: 'r1', status: 'confirmed', submittedAt: new Date().toISOString(), source: 'historical', channel: 'sms', score: 0.5 }, createdAt: new Date().toISOString() };
    const res1 = await app.inject({ method: 'POST', url: '/v1/outbox', headers: { authorization: 'Bearer devtoken' }, payload: env });
    expect([200,202]).toContain(res1.statusCode);
    const res2 = await app.inject({ method: 'POST', url: '/v1/outbox', headers: { authorization: 'Bearer devtoken' }, payload: env });
    expect(res2.statusCode).toBe(409);
  });

  it('replace behavior for same id but different payload returns 202', async () => {
    const envA = { id: 'rep-1', channel: 'feedback', payload: { recordId: 'r2', status: 'confirmed', submittedAt: new Date().toISOString(), source: 'historical', channel: 'sms', score: 0.2 }, createdAt: new Date().toISOString() };
    const envB = { ...envA, payload: { ...envA.payload, score: 0.9 } };
    const r1 = await app.inject({ method: 'POST', url: '/v1/outbox', headers: { authorization: 'Bearer devtoken' }, payload: envA });
    expect([200,202]).toContain(r1.statusCode);
  const r2 = await app.inject({ method: 'POST', url: '/v1/outbox', headers: { authorization: 'Bearer devtoken' }, payload: envB });
  // debug removed
  expect(r2.statusCode).toBe(202);
  });
});
