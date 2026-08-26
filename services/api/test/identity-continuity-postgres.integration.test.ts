import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';

import postgres from 'postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { PostgresIdempotencyStore } from '../src/adapters/postgres/idempotency-store.js';
import { PostgresIdentityRepository } from '../src/adapters/postgres/identity-repository.js';

interface SupabaseStatus {
  DB_URL: string;
}

const enabled = process.env['SHIFAA_RUN_IDENTITY_CONTINUITY_SESSIONS'] === 'true';
const standaloneEnabled = process.env['SHIFAA_RUN_IDENTITY_CONTINUITY_POSTGRES'] === 'true';

function localStatus(): SupabaseStatus {
  const command = process.platform === 'win32' ? (process.env['ComSpec'] ?? 'cmd.exe') : 'corepack';
  const args =
    process.platform === 'win32'
      ? ['/d', '/s', '/c', 'corepack pnpm exec supabase status -o json']
      : ['pnpm', 'exec', 'supabase', 'status', '-o', 'json'];
  return JSON.parse(execFileSync(command, args, { encoding: 'utf8' })) as SupabaseStatus;
}

describe.skipIf(!standaloneEnabled)(
  'identity continuity standalone PostgreSQL compatibility',
  () => {
    it('migrates the continuity schema without fabricating a native Auth schema', async () => {
      const sql = postgres('postgresql://shifaa_owner:synthetic_owner_only@127.0.0.1:5432/shifaa', {
        max: 1,
      });
      try {
        const [shape] = await sql`
          select
            to_regclass('identity.continuity_cases') is not null as continuity_table,
            to_regprocedure('platform.auth_session_is_current(uuid,uuid)') is null as native_helper_absent,
            not exists(select 1 from information_schema.schemata where schema_name='auth') as auth_schema_absent
        `;
        expect(shape).toEqual({
          continuity_table: true,
          native_helper_absent: true,
          auth_schema_absent: true,
        });
      } finally {
        await sql.end({ timeout: 5 });
      }
    });
  },
);

describe.skipIf(!enabled).sequential('007 PostgreSQL staged idempotency', () => {
  let repository: PostgresIdentityRepository;

  beforeAll(async () => {
    const url = new URL(localStatus().DB_URL);
    url.username = 'shifaa_api';
    url.password = 'synthetic_api_only';
    repository = new PostgresIdentityRepository(url.toString());
    await repository.ready();
  });

  afterAll(async () => repository.close());

  it('resumes after a native-success/database-failure boundary without repeating native work', async () => {
    const principal = `logout:${randomUUID()}`;
    const key = `staged-logout-${randomUUID()}`;
    const route = '/v1/auth/logout';
    const store = new PostgresIdempotencyStore(repository, Buffer.alloc(32, 21));
    let prepareCalls = 0;
    let commitCalls = 0;
    let failCommit = true;
    const input = {
      principal,
      method: 'POST',
      route,
      key,
      body: { allSessions: true },
      prepare: async () => {
        prepareCalls += 1;
        return {
          result: { scope: 'all', revokedAt: '2026-08-26T00:00:00.000Z' },
          audit: { action: 'identity.session.logged_out', outcome: 'succeeded' },
        };
      },
      work: async (prepared: {
        result: { scope: string; revokedAt: string };
        audit: { action: string; outcome: string };
      }) => {
        commitCalls += 1;
        if (failCommit) throw new Error('synthetic database commit failure');
        return { status: 200, headers: {}, body: prepared.result };
      },
    };

    await expect(store.execute(input)).rejects.toThrow('synthetic database commit failure');
    expect(prepareCalls).toBe(1);
    expect(commitCalls).toBe(1);

    failCommit = false;
    await expect(store.execute(input)).resolves.toMatchObject({
      status: 200,
      body: { scope: 'all' },
    });
    await expect(store.execute(input)).resolves.toMatchObject({
      status: 200,
      body: { scope: 'all' },
    });
    expect(prepareCalls).toBe(1);
    expect(commitCalls).toBe(2);

    await expect(store.execute({ ...input, body: { allSessions: false } })).rejects.toMatchObject({
      code: 'idempotency-key-reused',
      status: 409,
    });

    const record = await repository.withRawTransaction(async (sql) => {
      await sql`select set_config('shifaa.principal',${principal},true)`;
      const [row] = await sql<
        { state: string; resource_type: string | null; response_body: unknown }[]
      >`select state,resource_type,response_body from platform.idempotency_records
        where principal=${principal} and method='POST' and route=${route} and idempotency_key=${key}`;
      return row;
    });
    expect(record).toMatchObject({ state: 'completed', resource_type: null });
    expect(JSON.stringify(record?.response_body)).not.toContain('identity.session.logged_out');
  });
});
