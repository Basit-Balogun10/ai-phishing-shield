import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

import AsyncStorage from '@react-native-async-storage/async-storage';

// import the module under test
import * as outbox from '../../lib/services/networkOutbox';

const STORAGE_KEY = '@ai-phishing-shield/network/outbox';

const mockFetch = (status: number, headers: Record<string, string> = {}) => {
  return vi.fn().mockResolvedValue({ ok: status >= 200 && status < 300, status, headers: { get: (k: string) => headers[k.toLowerCase()] ?? null } });
};

describe('networkOutbox client', () => {
  beforeEach(async () => {
    vi.resetAllMocks();
    // clear AsyncStorage
    await AsyncStorage.removeItem(STORAGE_KEY);
  });

  afterEach(async () => {
    await AsyncStorage.removeItem(STORAGE_KEY);
  });

  it('drops entry on 202 OK', async () => {
    const f = mockFetch(202);
    // @ts-ignore
    global.fetch = f;

    const e = await outbox.enqueueOutboxEntry({ channel: 'telemetry', payload: { a: 1 }, id: 'ok-1' });
    await outbox.flushOutbox();

    const snap = await outbox.getOutboxSnapshot();
    expect(snap.find((s) => s.id === 'ok-1')).toBeUndefined();
  });

  it('drops entry on 409 Conflict (duplicate)', async () => {
    const f = mockFetch(409);
    // @ts-ignore
    global.fetch = f;

    await outbox.enqueueOutboxEntry({ channel: 'feedback', payload: { b: 2 }, id: 'dup-1' });
    await outbox.flushOutbox();

    const snap = await outbox.getOutboxSnapshot();
    expect(snap.find((s) => s.id === 'dup-1')).toBeUndefined();
  });

  it('drops entry on 400/413 permanent failure', async () => {
    const f400 = mockFetch(400);
    // @ts-ignore
    global.fetch = f400;
    await outbox.enqueueOutboxEntry({ channel: 'report', payload: { c: 3 }, id: 'bad-1' });
    await outbox.flushOutbox();
    const snap400 = await outbox.getOutboxSnapshot();
    expect(snap400.find((s) => s.id === 'bad-1')).toBeUndefined();

    const f413 = mockFetch(413);
    // @ts-ignore
    global.fetch = f413;
    await outbox.enqueueOutboxEntry({ channel: 'report', payload: { c: 3 }, id: 'big-1' });
    await outbox.flushOutbox();
    const snap413 = await outbox.getOutboxSnapshot();
    expect(snap413.find((s) => s.id === 'big-1')).toBeUndefined();
  });

  it('honors Retry-After on 429 and schedules nextAttemptAt', async () => {
    const ra = '5';
    const f = mockFetch(429, { 'retry-after': ra });
    // @ts-ignore
    global.fetch = f;

    await outbox.enqueueOutboxEntry({ channel: 'telemetry', payload: { d: 4 }, id: 'rate-1' });
    await outbox.flushOutbox();

    const snap = await outbox.getOutboxSnapshot();
    const entry = snap.find((s) => s.id === 'rate-1');
    expect(entry).toBeDefined();
    expect(entry?.nextAttemptAt).toBeDefined();
    // nextAttemptAt should be in the future
    expect(new Date(entry!.nextAttemptAt!).getTime()).toBeGreaterThan(Date.now());
  });

  it('retries on 5xx and increments retryCount', async () => {
    const f = mockFetch(502);
    // @ts-ignore
    global.fetch = f;

    await outbox.enqueueOutboxEntry({ channel: 'telemetry', payload: { e: 5 }, id: 'retry-1' });
    await outbox.flushOutbox();

    const snap = await outbox.getOutboxSnapshot();
    const entry = snap.find((s) => s.id === 'retry-1');
    expect(entry).toBeDefined();
    expect(entry?.retryCount).toBeGreaterThanOrEqual(1);
    expect(entry?.nextAttemptAt).toBeDefined();
  });

  it('sends Authorization header when configured', async () => {
    const calls: any[] = [];
    // capture headers
    // @ts-ignore
    global.fetch = vi.fn().mockImplementation((url: string, opts: any) => {
      calls.push(opts?.headers ?? {});
      return Promise.resolve({ ok: true, status: 202, headers: { get: () => null } });
    });

    outbox.setAuthToken('test-token-123');
    await outbox.enqueueOutboxEntry({ channel: 'telemetry', payload: { f: 6 }, id: 'auth-1' });
    await outbox.flushOutbox();

    expect(calls.length).toBeGreaterThan(0);
    const h = calls[0];
    expect(h['Authorization'] || h['authorization']).toBe(`Bearer test-token-123`);
  });
});
