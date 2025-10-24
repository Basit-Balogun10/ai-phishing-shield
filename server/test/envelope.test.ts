import { describe, it, expect } from 'vitest';
import { EnvelopeSchema } from '../src/lib/schemas';

describe('EnvelopeSchema', () => {
  it('accepts a valid envelope', () => {
    const valid = {
      id: 'feedback@abc',
      channel: 'feedback',
      payload: { foo: 'bar' },
      createdAt: new Date().toISOString(),
    };

    const parsed = EnvelopeSchema.parse(valid);
    expect(parsed.id).toBe(valid.id);
  });

  it('rejects invalid timestamps', () => {
    const invalid = { id: 'x', channel: 'telemetry', payload: {}, createdAt: 'not-a-date' };
    expect(() => EnvelopeSchema.parse(invalid)).toThrow();
  });
});
