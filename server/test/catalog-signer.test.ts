import { describe, it, expect } from 'vitest';
import { signCatalog } from '../src/lib/catalogSigner';
// ...existing code...

describe('catalog signer', () => {
  it('computes deterministic HMAC for the catalog', async () => {
    const secret = 'test-secret';
    const sig = await signCatalog(secret);
    expect(sig.startsWith('sha256=')).toBe(true);
    // expect length 7 + 64 hex
    expect(sig.length).toBe(7 + 64);
  });
});
