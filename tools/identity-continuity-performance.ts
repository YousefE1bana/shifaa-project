import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { performance } from 'node:perf_hooks';

import { PostgresIdentityContinuityService } from '../services/api/src/adapters/postgres/identity-continuity-service.ts';
import { PostgresIdentityRepository } from '../services/api/src/adapters/postgres/identity-repository.ts';
import { LocalSyntheticMessagingAdapter } from '../services/worker/src/adapters/local-synthetic-messaging.ts';
import { PostgresIdentityNotificationProcessor } from '../services/worker/src/identity-continuity.ts';
import postgres from 'postgres';

const requireFromApi = createRequire(new URL('../services/api/package.json', import.meta.url));
const { createClient } = requireFromApi('@supabase/supabase-js') as {
  createClient(url: string, key: string, options: unknown): any;
};

const sessionCount = 100;
const peopleCount = 5_000;
const sessionCheckCount = 5_000;
const recoveryCount = 1_000;
const transitionCount = 1_000;
const apiPoolConnections = 20;
const requestConcurrency = 100;
const password = 'Synthetic-007-Performance!';

interface Runtime {
  API_URL: string;
  DB_URL: string;
  SECRET_KEY: string;
}

interface NativeSession {
  userId: string;
  sessionId: string;
}

const p95 = (values: readonly number[]) =>
  [...values].sort((left, right) => left - right)[Math.ceil(values.length * 0.95) - 1] ?? Infinity;

const uuidExpression = (run: string, label: string, indexExpression = 'i::text') =>
  `overlay(overlay(md5('${run}:${label}:' || ${indexExpression}) placing '4' from 13) placing 'a' from 17)::uuid`;

function deterministicUuid(run: string, label: string, index: number): string {
  const hex = createHash('md5').update(`${run}:${label}:${index}`).digest('hex');
  const shaped = `${hex.slice(0, 12)}4${hex.slice(13, 16)}a${hex.slice(17)}`;
  return `${shaped.slice(0, 8)}-${shaped.slice(8, 12)}-${shaped.slice(12, 16)}-${shaped.slice(16, 20)}-${shaped.slice(20)}`;
}

function status(): Runtime {
  const command = process.platform === 'win32' ? (process.env['ComSpec'] ?? 'cmd.exe') : 'corepack';
  const args =
    process.platform === 'win32'
      ? ['/d', '/s', '/c', 'corepack pnpm exec supabase status -o json']
      : ['pnpm', 'exec', 'supabase', 'status', '-o', 'json'];
  return JSON.parse(execFileSync(command, args, { encoding: 'utf8' })) as Runtime;
}

function roleUrl(databaseUrl: string, role: string, rolePassword: string): string {
  const url = new URL(databaseUrl);
  url.username = role;
  url.password = rolePassword;
  return url.toString();
}

function sessionId(accessToken: string): string {
  const payload = JSON.parse(
    Buffer.from(accessToken.split('.')[1] ?? '', 'base64url').toString('utf8'),
  ) as { session_id?: string };
  assert.match(payload.session_id ?? '', /^[0-9a-f-]{36}$/i);
  return payload.session_id!;
}

async function inBatches<T, R>(
  values: readonly T[],
  concurrency: number,
  work: (value: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results: R[] = [];
  for (let start = 0; start < values.length; start += concurrency) {
    const batch = values.slice(start, start + concurrency);
    const settled = await Promise.allSettled(
      batch.map((value, offset) => work(value, start + offset)),
    );
    const failure = settled.find(
      (result): result is PromiseRejectedResult => result.status === 'rejected',
    );
    if (failure) throw failure.reason;
    results.push(...settled.map((result) => (result as PromiseFulfilledResult<R>).value));
  }
  return results;
}

async function createNativeSessions(runtime: Runtime, run: string): Promise<NativeSession[]> {
  const admin = createClient(runtime.API_URL, runtime.SECRET_KEY, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
  });
  return inBatches(
    Array.from({ length: sessionCount }, (_, index) => index),
    20,
    async (index) => {
      const email = `perf-007-${run}-${index}@synthetic.shifaa.test`;
      const created = await admin.auth.admin.createUser({ email, password, email_confirm: true });
      if (created.error || !created.data.user)
        throw created.error ?? new Error('Auth user missing.');
      const client = createClient(runtime.API_URL, runtime.SECRET_KEY, {
        auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
      });
      const signedIn = await client.auth.signInWithPassword({ email, password });
      if (signedIn.error || !signedIn.data.session) {
        throw signedIn.error ?? new Error('Native session missing.');
      }
      return {
        userId: created.data.user.id as string,
        sessionId: sessionId(signedIn.data.session.access_token as string),
      };
    },
  );
}

async function seedDataset(
  owner: postgres.Sql,
  run: string,
  nativeSessions: readonly NativeSession[],
): Promise<void> {
  const nativeUserIds = nativeSessions.map((session) => session.userId);
  await owner.begin(async (sql) => {
    await sql.unsafe(`
      insert into identity.people(
        id,user_id,display_name,email_normalized,birth_date,nationality_code,preferred_locale,profile_status
      )
      select ${uuidExpression(run, 'person')},${uuidExpression(run, 'auth')},
        'Synthetic 007 performance '||i,
        'perf-007-${run}-person-'||i||'@synthetic.shifaa.test',
        case when i<=1000 then (current_date-interval '21 years')::date else null end,
        'EG',case when i%2=0 then 'ar-EG' else 'en-EG' end,'active'
      from generate_series(1,${peopleCount}) i;

      insert into identity.patients(id,person_id,medical_record_number)
      select ${uuidExpression(run, 'patient')},${uuidExpression(run, 'person')},
        'SYN-007-PERF-${run}-'||i
      from generate_series(1,${peopleCount}) i;
    `);
    await sql`
      update identity.people p set user_id=m.user_id
      from unnest(${nativeUserIds}::uuid[]) with ordinality m(user_id,i)
      where p.id=overlay(overlay(md5(${`${run}:person:`}||m.i::text) placing '4' from 13) placing 'a' from 17)::uuid`;

    await sql`alter table identity.admin_role_grants disable trigger user`;
    await sql.unsafe(`
      insert into identity.admin_role_grants(
        id,person_id,role_code,status,valid_from,valid_until,proposed_by,decided_by,decision_reason
      ) values(
        md5('${run}:reviewer-grant')::uuid,${uuidExpression(run, 'person', "'5000'")},
        'support_admin','active',statement_timestamp()-interval '1 day',
        statement_timestamp()+interval '1 year',${uuidExpression(run, 'person', "'4999'")},
        ${uuidExpression(run, 'person', "'4998'")},'synthetic.performance'
      );
    `);
    await sql`alter table identity.admin_role_grants enable trigger user`;

    await sql.unsafe(`
      insert into identity.private_evidence_objects(
        id,bucket_code,object_key,owner_person_id,resource_patient_id,sha256,mime_type,
        size_bytes,scan_status,released_at
      )
      select ${uuidExpression(run, 'evidence')},'guardianship-evidence',
        'synthetic/007-performance/${run}/'||i,
        ${uuidExpression(run, 'person', '(i+3000)::text')},
        ${uuidExpression(run, 'patient')},repeat('8',64),'application/pdf',512,'released',statement_timestamp()
      from generate_series(1,${transitionCount}) i;
    `);

    await sql`alter table identity.care_relationships disable trigger user`;
    await sql.unsafe(`
      insert into identity.care_relationships(
        id,subject_patient_id,actor_person_id,relationship_type,status,valid_from,valid_until,
        created_by_person_id,purpose_code,evidence_object_id,reviewed_by_person_id,reviewed_at,
        decision_reason_code
      )
      select ${uuidExpression(run, 'relationship')},${uuidExpression(run, 'patient')},
        ${uuidExpression(run, 'person', '(i+3000)::text')},'guardianship','active',current_date-1,
        current_date+interval '1 year',${uuidExpression(run, 'person', '(i+3000)::text')},
        'dependent_care',${uuidExpression(run, 'evidence')},
        ${uuidExpression(run, 'person', "'5000'")},statement_timestamp(),'synthetic.performance'
      from generate_series(1,${transitionCount}) i;
    `);
    await sql`alter table identity.care_relationships enable trigger user`;

    await sql.unsafe(`
      insert into identity.identities(
        id,person_id,identity_type,ciphertext,nonce,authentication_tag,key_version,blind_index,
        masked_value,issuing_country,expires_on,verification_status
      )
      select ${uuidExpression(run, 'identity')},${uuidExpression(run, 'person')},
        'egyptian_national_id',decode('01','hex'),decode(repeat('02',12),'hex'),
        decode(repeat('03',16),'hex'),1,decode(md5('${run}:blind:'||i::text)||md5('${run}:blind-b:'||i::text),'hex'),
        '••••007','EG',current_date+interval '5 years','verified'
      from generate_series(1,${transitionCount}) i;

      insert into identity.verification_cases(
        id,identity_id,provider,state,assigned_reviewer_person_id,reviewer_person_id,reason_code,decided_at
      )
      select ${uuidExpression(run, 'verification')},${uuidExpression(run, 'identity')},
        'manual','verified',${uuidExpression(run, 'person', "'5000'")},${uuidExpression(run, 'person', "'5000'")},
        'synthetic.performance',statement_timestamp()
      from generate_series(1,${transitionCount}) i;
    `);
  });
}

async function cleanup(
  owner: postgres.Sql,
  runtime: Runtime,
  run: string,
  nativeSessions: readonly NativeSession[],
): Promise<void> {
  await owner.begin(async (sql) => {
    await sql`alter table platform.notification_delivery_attempts disable trigger user`;
    await sql`alter table audit.events disable trigger user`;
    await sql`alter table identity.care_relationships disable trigger user`;
    await sql.unsafe(`
      delete from platform.notification_delivery_attempts
      where source_event_id in (
        select e.id from platform.outbox_events e join identity.continuity_cases c on c.id=e.aggregate_id
        where c.relationship_id in (
          select ${uuidExpression(run, 'relationship')} from generate_series(1,${transitionCount}) i
        )
      );
      delete from platform.notifications
      where source_event_id in (
        select e.id from platform.outbox_events e join identity.continuity_cases c on c.id=e.aggregate_id
        where c.relationship_id in (
          select ${uuidExpression(run, 'relationship')} from generate_series(1,${transitionCount}) i
        )
      );
      delete from platform.event_receipts where event_id in (
        select e.id from platform.outbox_events e join identity.continuity_cases c on c.id=e.aggregate_id
        where c.relationship_id in (
          select ${uuidExpression(run, 'relationship')} from generate_series(1,${transitionCount}) i
        )
      );
      delete from platform.outbox_events where aggregate_id in (
        select id from identity.continuity_cases where relationship_id in (
          select ${uuidExpression(run, 'relationship')} from generate_series(1,${transitionCount}) i
        )
      );
      delete from audit.events where resource_id in (
        select id from identity.continuity_cases where relationship_id in (
          select ${uuidExpression(run, 'relationship')} from generate_series(1,${transitionCount}) i
        )
      );
      delete from platform.idempotency_records where idempotency_key like 'perf-007-${run}-%';
      delete from identity.continuity_cases where relationship_id in (
        select ${uuidExpression(run, 'relationship')} from generate_series(1,${transitionCount}) i
      ) or id in (
        select ${uuidExpression(run, 'recovery')} from generate_series(1,${recoveryCount}) i
      );
      delete from identity.verification_cases where id in (
        select ${uuidExpression(run, 'verification')} from generate_series(1,${transitionCount}) i
      );
      delete from identity.identities where id in (
        select ${uuidExpression(run, 'identity')} from generate_series(1,${transitionCount}) i
      );
      delete from identity.care_relationships where id in (
        select ${uuidExpression(run, 'relationship')} from generate_series(1,${transitionCount}) i
      );
      delete from identity.private_evidence_objects where id in (
        select ${uuidExpression(run, 'evidence')} from generate_series(1,${transitionCount}) i
      );
      delete from identity.admin_role_grants where id=md5('${run}:reviewer-grant')::uuid;
      delete from identity.patients where id in (
        select ${uuidExpression(run, 'patient')} from generate_series(1,${peopleCount}) i
      );
      delete from identity.people where id in (
        select ${uuidExpression(run, 'person')} from generate_series(1,${peopleCount}) i
      );
    `);
    await sql`alter table identity.care_relationships enable trigger user`;
    await sql`alter table audit.events enable trigger user`;
    await sql`alter table platform.notification_delivery_attempts enable trigger user`;
  });
  const admin = createClient(runtime.API_URL, runtime.SECRET_KEY, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
  });
  await inBatches(nativeSessions, 20, async (session) => {
    const deleted = await admin.auth.admin.deleteUser(session.userId);
    if (deleted.error) throw deleted.error;
  });
}

async function main(): Promise<void> {
  const runtime = status();
  const run = randomUUID();
  const owner = postgres(runtime.DB_URL, { max: 2 });
  const apiUrl = roleUrl(runtime.DB_URL, 'shifaa_api', 'synthetic_api_only');
  const workerUrl = roleUrl(runtime.DB_URL, 'shifaa_worker', 'synthetic_worker_only');
  const repository = new PostgresIdentityRepository(apiUrl);
  const continuity = new PostgresIdentityContinuityService(repository, Buffer.alloc(32, 77), 'ci');
  let nativeSessions: NativeSession[] = [];

  try {
    nativeSessions = await createNativeSessions(runtime, run);
    assert.equal(nativeSessions.length, sessionCount);
    await seedDataset(owner, run, nativeSessions);
    await repository.ready();

    const warmup = await Promise.all(
      Array.from({ length: apiPoolConnections }, (_, index) =>
        repository.withRawTransaction(async (sql) => {
          await sql`select pg_sleep(0.15)`;
          return continuity.isNativeSessionCurrent(
            nativeSessions[index]!.sessionId,
            nativeSessions[index]!.userId,
            1,
          );
        }),
      ),
    );
    assert.ok(warmup.every(Boolean), 'A native session failed during pool warmup.');
    const [pool] = await owner<{ connections: number }[]>`
      select count(*)::integer connections from pg_stat_activity
      where datname=current_database() and usename='shifaa_api'`;
    assert.equal(pool?.connections, apiPoolConnections, 'API connection pool did not fully warm');

    const checkInputs = Array.from({ length: sessionCheckCount }, (_, index) => index);
    const readTimes = await inBatches(checkInputs, sessionCount, async (index) => {
      const native = nativeSessions[index % nativeSessions.length]!;
      const started = performance.now();
      assert.equal(
        await continuity.isNativeSessionCurrent(native.sessionId, native.userId, 1),
        true,
      );
      return performance.now() - started;
    });

    const recoveryInputs = Array.from({ length: recoveryCount }, (_, index) => index + 1);
    const recoveryTimes = await inBatches(recoveryInputs, requestConcurrency, async (index) => {
      const started = performance.now();
      await continuity.createRecoveryIntake({
        caseId: deterministicUuid(run, 'recovery', index),
        handleDigest: randomBytes(32),
        caseTokenDigest: randomBytes(32),
        expiresAt: new Date(Date.now() + 15 * 60_000).toISOString(),
      });
      return performance.now() - started;
    });

    const transitionInputs = Array.from({ length: transitionCount }, (_, index) => index + 1);
    const transitionTimes = await inBatches(transitionInputs, requestConcurrency, async (index) => {
      const started = performance.now();
      const result = await continuity.submitTransitionProof({
        relationshipId: deterministicUuid(run, 'relationship', index),
        verificationCaseId: deterministicUuid(run, 'verification', index),
        expectedVersion: 1,
        actorPersonId: deterministicUuid(run, 'person', index),
        idempotencyKey: `perf-007-${run}-transition-${index}`,
        idempotencyPrincipal: `perf-007-${run}-principal-${index}`,
        requestId: randomUUID(),
        occurredAt: new Date().toISOString(),
      });
      assert.equal(result.status, 'review_required');
      return performance.now() - started;
    });

    const adapter = new LocalSyntheticMessagingAdapter(
      Array.from({ length: transitionCount }, () => 'delivered'),
    );
    const worker = new PostgresIdentityNotificationProcessor(workerUrl, adapter, `perf-007-${run}`);
    const workerTimes: number[] = [];
    try {
      for (let index = 0; index < transitionCount; index += 1) {
        const started = performance.now();
        assert.equal(await worker.processNext(), 'delivered');
        workerTimes.push(performance.now() - started);
      }
    } finally {
      await worker.close();
    }

    const readP95 = p95(readTimes);
    const recoveryP95 = p95(recoveryTimes);
    const transitionP95 = p95(transitionTimes);
    const mutationP95 = p95([...recoveryTimes, ...transitionTimes]);
    const workerP95 = p95(workerTimes);
    const evidence = {
      generated_at: new Date().toISOString(),
      result: readP95 <= 400 && mutationP95 <= 800 && workerP95 <= 800 ? 'PASS' : 'FAIL',
      environment: {
        mode: 'local Supabase native Auth + PostgreSQL forced RLS + synthetic local worker',
        node: process.version,
        platform: process.platform,
        architecture: process.arch,
        reference_device:
          'Developer Windows workstation; loopback network. Not formal field-device/network evidence.',
        limitation:
          'OPEN-TECH-003 remains open for reproducible device, browser, network, and accessibility performance acceptance.',
      },
      dataset: {
        concurrent_native_sessions: sessionCount,
        people: peopleCount,
        patients: peopleCount,
        native_session_checks: sessionCheckCount,
        recovery_intake_mutations: recoveryCount,
        dependent_transition_mutations: transitionCount,
        transition_worker_deliveries: workerTimes.length,
      },
      pool_warmup: {
        configured_connections: apiPoolConnections,
        observed_connections: pool!.connections,
        warmup_requests: warmup.length,
        excluded_from_samples: true,
      },
      thresholds_ms: { read_p95: 400, mutation_p95: 800, worker_mutation_p95: 800 },
      measured_ms: {
        native_session_check_read_p95: Number(readP95.toFixed(2)),
        recovery_intake_mutation_p95: Number(recoveryP95.toFixed(2)),
        dependent_transition_mutation_p95: Number(transitionP95.toFixed(2)),
        combined_mutation_p95: Number(mutationP95.toFixed(2)),
        transition_worker_mutation_p95: Number(workerP95.toFixed(2)),
      },
    };
    await writeFile(
      new URL(
        '../specs/007-identity-continuity-sessions-mfa-recovery/evidence/performance.json',
        import.meta.url,
      ),
      `${JSON.stringify(evidence, null, 2)}\n`,
      'utf8',
    );
    process.stdout.write(`${JSON.stringify(evidence)}\n`);
    assert.equal(evidence.result, 'PASS');
  } finally {
    await repository.close();
    if (nativeSessions.length > 0) await cleanup(owner, runtime, run, nativeSessions);
    await owner.end({ timeout: 5 });
  }
}

void main();
