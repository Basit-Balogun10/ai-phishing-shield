import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildServer } from '../src/index';

describe('observability', () => {
  let app: any;
  beforeAll(async () => { app = await buildServer(); });
  afterAll(async () => { await app.close(); });

  it('readiness probe returns ready', async () => {
    const res = await app.inject({ method: 'GET', url: '/v1/ready' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.ready).toBe(true);
  });

  it('metrics endpoint returns text', async () => {
    const res = await app.inject({ method: 'GET', url: '/metrics' });
    expect(res.statusCode).toBe(200);
    expect(typeof res.payload).toBe('string');
  });
});
