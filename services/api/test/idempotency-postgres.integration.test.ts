import { randomUUID } from 'node:crypto';

import postgres from 'postgres';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { PostgresIdempotencyStore } from '../src/adapters/postgres/idempotency-store.js';
import { PostgresIdentityRepository } from '../src/adapters/postgres/identity-repository.js';
import {
  hashRequest,
  idempotencyPrincipalType,
  idempotencyScopeHash,
} from '../src/platform/idempotency.js';

const enabled = process.env['SHIFAA_RUN_IDEMPOTENCY_POSTGRES'] === 'true';
const ownerUrl = 'postgresql://shifaa_owner:synthetic_owner_only@127.0.0.1:5432/shifaa';
const apiUrl = 'postgresql://shifaa_api:synthetic_api_only@127.0.0.1:5432/shifaa';
const route = '/v1/security/sec-008-idempotency';

describe.skipIf(!enabled).sequential('SEC-008 PostgreSQL idempotency privacy', () => {
  const owner = postgres(ownerUrl, { max: 1 });
  const repository = new PostgresIdentityRepository(apiUrl);

  beforeAll(async () => repository.ready());

  afterAll(async () => {
    await owner`delete from platform.idempotency_records where route_template=${route}`;
    await repository.close();
    await owner.end({ timeout: 5 });
  });

  it('stores only digest scope while preserving replay and changed-body conflict detection', async () => {
    const principal = `patient-${randomUUID()}@synthetic.shifaa.test`;
    const key = `sec008-sensitive-key-${randomUUID()}`;
    const store = new PostgresIdempotencyStore(repository, Buffer.alloc(32, 31));
    const work = vi.fn(async () => ({ status: 201, headers: {}, body: { id: 'one' } }));
    const input = { principal, method: 'POST', route, key, body: { version: 1 }, work };

    const first = await store.execute(input);
    const replay = await store.execute(input);

    expect(replay).toEqual(first);
    expect(work).toHaveBeenCalledTimes(1);
    await expect(store.execute({ ...input, body: { version: 2 } })).rejects.toMatchObject({
      code: 'idempotency-key-reused',
      status: 409,
    });

    const [stored] = await owner<
      Array<{
        principal_type: string;
        principal_hash: string;
        key_hash: string;
        route_template: string;
        request_hash: string;
        state: string;
      }>
    >`select principal_type,principal_hash,key_hash,route_template,request_hash,state
      from platform.idempotency_records
      where principal_hash=${idempotencyScopeHash('principal', principal)}
        and key_hash=${idempotencyScopeHash('key', key)}`;

    expect(stored).toEqual({
      principal_type: idempotencyPrincipalType,
      principal_hash: idempotencyScopeHash('principal', principal),
      key_hash: idempotencyScopeHash('key', key),
      route_template: route,
      request_hash: hashRequest({ version: 1 }),
      state: 'completed',
    });
    expect(JSON.stringify(stored)).not.toContain(principal);
    expect(JSON.stringify(stored)).not.toContain(key);
  });

  it('keeps ambiguous raw boundaries and principal domains collision-safe', async () => {
    const store = new PostgresIdempotencyStore(repository, Buffer.alloc(32, 31));
    const left = {
      principal: 'ab',
      method: 'POST',
      route,
      key: 'c'.repeat(16),
      body: { boundary: 'left' },
      work: async () => ({ status: 200, headers: {}, body: { boundary: 'left' } }),
    };
    const right = {
      principal: 'a',
      method: 'POST',
      route,
      key: `b${'c'.repeat(16)}`,
      body: { boundary: 'right' },
      work: async () => ({ status: 200, headers: {}, body: { boundary: 'right' } }),
    };

    await store.execute(left);
    await store.execute(right);

    const [countRow] = await owner<{ count: number }[]>`
      select count(*)::integer count from platform.idempotency_records
      where route_template=${route}
        and principal_hash in (
          ${idempotencyScopeHash('principal', left.principal)},
          ${idempotencyScopeHash('principal', right.principal)}
        )`;
    expect(countRow?.count).toBe(2);
    expect(idempotencyScopeHash('principal', 'shared')).not.toBe(
      idempotencyScopeHash('key', 'shared'),
    );
  });

  it('retains the canonical expiry reset behavior', async () => {
    let now = new Date('2026-09-08T12:00:00.000Z');
    const store = new PostgresIdempotencyStore(repository, Buffer.alloc(32, 31), () => now);
    const principal = `retention:${randomUUID()}`;
    const key = `sec008-retention-${randomUUID()}`;
    const work = vi.fn(async (version: number) => ({
      status: 200,
      headers: {},
      body: { version },
    }));

    await store.execute({
      principal,
      method: 'POST',
      route,
      key,
      body: { version: 1 },
      retentionMs: 1_000,
      work: () => work(1),
    });
    now = new Date('2026-09-08T12:00:01.001Z');
    const afterExpiry = await store.execute({
      principal,
      method: 'POST',
      route,
      key,
      body: { version: 2 },
      retentionMs: 1_000,
      work: () => work(2),
    });

    expect(afterExpiry.body).toEqual({ version: 2 });
    expect(work).toHaveBeenCalledTimes(2);
    const [countRow] = await owner<{ count: number }[]>`
      select count(*)::integer count from platform.idempotency_records
      where principal_hash=${idempotencyScopeHash('principal', principal)}
        and key_hash=${idempotencyScopeHash('key', key)}`;
    expect(countRow?.count).toBe(1);
  });
});
