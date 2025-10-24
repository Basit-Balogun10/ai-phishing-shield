import { describe, it, expect } from 'vitest';
import { sanitizePayload } from '../src/lib/sanitize';

describe('sanitizePayload', () => {
  it('truncates long strings and preserves small fields', () => {
    const long = 'a'.repeat(40000);
    const input = { short: 'ok', long };
    const out = sanitizePayload(input as any);
    expect(out.short).toBe('ok');
    expect(typeof out.long).toBe('string');
    expect((out.long as string).length).toBeLessThan(33000);
  });
});
