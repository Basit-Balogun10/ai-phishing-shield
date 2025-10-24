import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildServer } from '../src/index';

describe('OpenAPI spec', () => {
  let app: any;
  beforeAll(async () => { app = await buildServer(); });
  afterAll(async () => { await app.close(); });

  it('serves openapi.json with /v1/outbox', async () => {
    const res = await app.inject({ method: 'GET', url: '/models/docs/openapi.json' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.paths['/v1/outbox']).toBeTruthy();
  });
});
