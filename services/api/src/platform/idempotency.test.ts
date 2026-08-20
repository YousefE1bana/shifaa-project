import { describe, expect, it, vi } from 'vitest';

import { InMemoryIdempotencyStore, hashRequest, preauthPrincipal } from './idempotency.js';

describe('atomic idempotency policy', () => {
  it('returns one stored result for the same principal/key/body', async () => {
    const store = new InMemoryIdempotencyStore();
    const work = vi.fn(async () => ({ status: 201, headers: {}, body: { id: 'one' } }));
    const input = {
      principal: 'patient-one',
      method: 'POST',
      route: '/privacy/consents',
      key: 'same-key-0000001',
      body: { decision: 'granted' },
      work,
    };
    const [first, second] = await Promise.all([store.execute(input), store.execute(input)]);
    expect(first).toEqual(second);
    expect(work).toHaveBeenCalledTimes(1);
  });

  it('rejects the same key when the body changes', async () => {
    const store = new InMemoryIdempotencyStore();
    const base = {
      principal: 'patient-one',
      method: 'POST',
      route: '/privacy/consents',
      key: 'same-key-0000002',
      work: async () => ({ status: 201, headers: {}, body: { id: 'one' } }),
    };
    await store.execute({ ...base, body: { decision: 'granted' } });
    await expect(store.execute({ ...base, body: { decision: 'refused' } })).rejects.toMatchObject({
      code: 'idempotency-key-reused',
    });
  });

  it('uses canonical hashing and a non-reversible pre-auth principal', () => {
    expect(hashRequest({ b: 2, a: 1 })).toBe(hashRequest({ a: 1, b: 2 }));
    expect(hashRequest(undefined)).toMatch(/^[a-f0-9]{64}$/);
    expect(hashRequest(undefined)).not.toBe(hashRequest(null));
    const principal = preauthPrincipal('Patient@Synthetic.Shifaa.Test', Buffer.alloc(32, 7));
    expect(principal).not.toContain('patient');
    expect(principal).toHaveLength(43);
  });
});
