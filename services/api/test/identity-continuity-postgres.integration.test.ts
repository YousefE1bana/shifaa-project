import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';

import postgres from 'postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { PostgresIdempotencyStore } from '../src/adapters/postgres/idempotency-store.js';
import { PostgresIdentityContinuityService } from '../src/adapters/postgres/identity-continuity-service.js';
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

    it('stores staged native mutation results encrypted and commits factor evidence atomically', async () => {
      const apiUrl = 'postgresql://shifaa_api:synthetic_api_only@127.0.0.1:5432/shifaa';
      const repository = new PostgresIdentityRepository(apiUrl);
      await repository.ready();
      const continuity = new PostgresIdentityContinuityService(
        repository,
        Buffer.alloc(32, 71),
        'ci',
      );
      const owner = postgres(
        'postgresql://shifaa_owner:synthetic_owner_only@127.0.0.1:5432/shifaa',
        { max: 1 },
      );
      const refreshMarkerKey = 'a'.repeat(64);
      const factorMarkerKey = 'b'.repeat(64);
      const factorId = randomUUID();
      const requestId = randomUUID();
      const expiresAt = new Date(Date.now() + 10 * 60_000).toISOString();
      try {
        await continuity.saveRefreshRotationMarker(refreshMarkerKey, {
          session: {
            accessToken: 'SENTINEL-REFRESH-ACCESS-TOKEN',
            refreshToken: 'SENTINEL-ROTATED-REFRESH-TOKEN',
            sessionId: randomUUID(),
            assurance: 'aal1',
            expiresAt,
          },
          evidenceCommitted: false,
          expiresAt,
        });
        await expect(continuity.findRefreshRotationMarker(refreshMarkerKey)).resolves.toMatchObject(
          {
            session: { refreshToken: 'SENTINEL-ROTATED-REFRESH-TOKEN' },
          },
        );
        const stagedFactor = {
          subjectId: randomUUID(),
          sessionId: randomUUID(),
          factorId,
          personId: '50000000-0000-4000-8000-000000000001',
          expiresAt,
        };
        await continuity.saveFactorRemovalMarker(factorMarkerKey, stagedFactor);
        const result = {
          removedFactorId: factorId,
          assurance: 'aal1' as const,
          removedAt: new Date().toISOString(),
        };
        await continuity.commitFactorRemoval({
          markerKey: factorMarkerKey,
          marker: { ...stagedFactor, result },
          evidence: {
            audit: {
              requestId,
              action: 'identity.factor.removed',
              outcome: 'succeeded',
              occurredAt: result.removedAt,
            },
            event: {
              aggregateId: factorId,
              aggregateVersion: 2,
              eventType: 'identity.factor.changed',
              payload: {
                recipientPersonId: stagedFactor.personId,
                support_action: 'removed',
                action_time: result.removedAt,
              },
            },
          },
        });
        await expect(continuity.findFactorRemovalMarker(factorMarkerKey)).resolves.toMatchObject({
          result: { removedFactorId: factorId },
        });
        const rows = await owner<{ response_body: unknown }[]>`
          select response_body from platform.idempotency_records
          where route in (
            '/v1/auth/session/refresh#rotation-marker',
            '/v1/auth/mfa/factors/:factorId#removal-marker'
          ) and idempotency_key in (${refreshMarkerKey},${factorMarkerKey})`;
        expect(rows).toHaveLength(2);
        expect(JSON.stringify(rows)).not.toMatch(/SENTINEL|refresh-token|access-token/i);
      } finally {
        await owner`
          delete from platform.outbox_events
          where aggregate_type='identity-continuity' and aggregate_id=${factorId}::uuid`;
        await owner`
          delete from platform.idempotency_records
          where route in (
            '/v1/auth/session/refresh#rotation-marker',
            '/v1/auth/mfa/factors/:factorId#removal-marker'
          ) and idempotency_key in (${refreshMarkerKey},${factorMarkerKey})`;
        await repository.close();
        await owner.end({ timeout: 5 });
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

  it('atomically clears the recovery restriction and bound session on replacement enrollment', async () => {
    const status = localStatus();
    const owner = postgres(status.DB_URL, { max: 1 });
    const caseId = randomUUID();
    const nativeSessionId = randomUUID();
    try {
      const [person] = await owner<{ id: string; user_id: string }[]>`
        select id,user_id from identity.people where user_id is not null order by id limit 1`;
      expect(person).toBeDefined();
      await owner`
        insert into identity.continuity_cases(
          id,case_type,subject_person_id,status,restriction_scope,bound_native_session_id,
          public_token_digest,recovery_handle_digest,token_key_version,expires_at
        ) values(
          ${caseId}::uuid,'account_recovery',${person!.id}::uuid,'restricted_enrollment',
          'mfa_enrollment_only',${nativeSessionId}::uuid,decode(repeat('81',32),'hex'),
          decode(repeat('82',32),'hex'),1,now()+interval '15 minutes'
        )`;
      const continuity = new PostgresIdentityContinuityService(
        repository,
        Buffer.alloc(32, 21),
        'ci',
      );
      await continuity.completeRestrictedEnrollmentCase({
        sessionId: nativeSessionId,
        subjectId: person!.user_id,
        requestId: randomUUID(),
        occurredAt: new Date().toISOString(),
      });
      const [completed] = await owner<
        {
          status: string;
          restriction_scope: string | null;
          bound_native_session_id: string | null;
        }[]
      >`select status,restriction_scope,bound_native_session_id::text
        from identity.continuity_cases where id=${caseId}::uuid`;
      expect(completed).toEqual({
        status: 'completed',
        restriction_scope: null,
        bound_native_session_id: null,
      });
    } finally {
      await owner.end({ timeout: 5 });
    }
  });
});
