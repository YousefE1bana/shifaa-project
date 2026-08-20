import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { performance } from 'node:perf_hooks';

import { buildApp } from '../services/api/src/app.ts';
import { loadConfig } from '../services/api/src/config.ts';
import { LocalSyntheticMessagingAdapter } from '../services/worker/src/adapters/local-synthetic-messaging.ts';
import { PostgresPrivacyNotificationProcessor } from '../services/worker/src/postgres-privacy-notification-processor.ts';
import postgres from 'postgres';

const ownerUrl = 'postgresql://shifaa_owner:synthetic_owner_only@127.0.0.1:5432/shifaa';
const apiUrl = 'postgresql://shifaa_api:synthetic_api_only@127.0.0.1:5432/shifaa';
const workerUrl = 'postgresql://shifaa_worker:synthetic_worker_only@127.0.0.1:5432/shifaa';
const p95 = (values: number[]) =>
  [...values].sort((left, right) => left - right)[Math.ceil(values.length * 0.95) - 1] ?? Infinity;
const uuid = (run: string, label: string) => `md5('${run}:${label}:'||i::text)::uuid`;

async function main() {
  const run = randomUUID();
  const owner = postgres(ownerUrl, { max: 2 });
  await owner.begin(async (sql) => {
    await sql.unsafe(`
      alter table consent.data_subject_requests disable trigger user;
      insert into identity.people(id,user_id,display_name,nationality_code,preferred_locale,profile_status)
      select ${uuid(run, 'person')},${uuid(run, 'user')},'Synthetic privacy load '||i,'EG',case when i%2=0 then 'ar-EG' else 'en-EG' end,'active' from generate_series(1,100)i;
      insert into identity.patients(id,person_id,medical_record_number)
      select ${uuid(run, 'patient')},${uuid(run, 'person')},'SYN-PRIV-PERF-${run}-'||i from generate_series(1,100)i;
      insert into identity.care_relationships(id,subject_patient_id,actor_person_id,relationship_type,status,valid_from,created_by_person_id)
      select ${uuid(run, 'self')},${uuid(run, 'patient')},${uuid(run, 'person')},'self','active','2026-01-01',${uuid(run, 'person')} from generate_series(1,100)i;
      insert into consent.data_subject_requests(id,person_id,patient_id,submitted_by_person_id,request_type,scope,contact_preference,status,submitted_at,due_at)
      select md5('${run}:request:'||i)::uuid,md5('${run}:person:'||(((i-1)%100)+1)::text)::uuid,md5('${run}:patient:'||(((i-1)%100)+1)::text)::uuid,md5('${run}:person:'||(((i-1)%100)+1)::text)::uuid,'access_export','{"data_category_codes":["profile.demographics"]}'::jsonb,'in_app','submitted',now()-interval '1 day',now()+interval '16 days' from generate_series(1,5000)i;
      alter table consent.data_subject_requests enable trigger user;
      insert into platform.outbox_events(id,aggregate_type,aggregate_id,aggregate_version,event_type,payload)
      select md5('${run}:event:'||i)::uuid,'privacy-dsr',md5('${run}:aggregate:'||i)::uuid,1,'notification.delivery.requested','{}'::jsonb from generate_series(1,100)i;
      insert into platform.notifications(id,source_event_id,template_release_id,recipient_type,recipient_person_id,locale,channel,field_values,rendered_digest)
      select md5('${run}:notification:'||i)::uuid,md5('${run}:event:'||i)::uuid,'54000000-0000-4000-8000-000000000001','patient',md5('${run}:person:'||i)::uuid,case when i%2=0 then 'ar-EG' else 'en-EG' end,'sms',jsonb_build_object('due_date_label','17 days','request_reference','PERF-'||i,'request_type_label','access','submitted_date','2026-08-13','support_path','/privacy/requests'),repeat('a',64) from generate_series(1,100)i;
    `);
  });
  const people = await owner<
    { person: string; patient: string }[]
  >`select ${owner.unsafe(uuid(run, 'person'))} person,${owner.unsafe(uuid(run, 'patient'))} patient from generate_series(1,100)i`;
  const base = loadConfig({ NODE_ENV: 'test' });
  const harness = await buildApp({
    config: { ...base, repositoryAdapter: 'postgres', databaseUrl: apiUrl },
    clock: { now: () => new Date() },
  });
  const mutationTimes = await Promise.all(
    people.map(async ({ person, patient }, index) => {
      const started = performance.now();
      const response = await harness.app.inject({
        method: 'POST',
        url: '/v1/privacy/requests',
        headers: {
          authorization: `Bearer synthetic-person:${person}`,
          'x-shifaa-patient-context': patient,
          'idempotency-key': `privacy-perf-${run}-${index}`,
        },
        payload: {
          request_type: 'restriction',
          scope: { data_category_codes: ['profile.demographics'] },
          contact_preference: 'in_app',
        },
      });
      assert.equal(response.statusCode, 201, response.body);
      return performance.now() - started;
    }),
  );
  const readTimes = await Promise.all(
    people.map(async ({ person, patient }) => {
      const started = performance.now();
      const response = await harness.app.inject({
        method: 'GET',
        url: `/v1/privacy/requests?managed_patient_id=${patient}&limit=100`,
        headers: {
          authorization: `Bearer synthetic-person:${person}`,
          'x-shifaa-patient-context': patient,
        },
      });
      assert.equal(response.statusCode, 200, response.body);
      return performance.now() - started;
    }),
  );
  const adapter = new LocalSyntheticMessagingAdapter(Array(100).fill('delivered'));
  const processor = new PostgresPrivacyNotificationProcessor(workerUrl, adapter);
  const workerTimes: number[] = [];
  for (let index = 0; index < 100; index++) {
    const started = performance.now();
    assert.equal(await processor.processNext(), 'delivered');
    workerTimes.push(performance.now() - started);
  }
  const [leaks] = await owner<any[]>`select
    (select count(*)::int from platform.notifications where id in (select md5(${run}||':notification:'||i)::uuid from generate_series(1,100)i) and field_values::text ~* 'phone|diagnos|token|body|secret') notifications,
    (select count(*)::int from platform.notification_delivery_attempts where notification_id in (select md5(${run}||':notification:'||i)::uuid from generate_series(1,100)i) and coalesce(safe_error_code,'') ~* 'phone|diagnos|token|body|secret') attempts`;
  assert.deepEqual(leaks, { notifications: 0, attempts: 0 });
  const evidence = {
    generated_at: new Date().toISOString(),
    mode: 'seeded-synthetic PostgreSQL forced RLS; 100 sessions; 5,000 DSR rows; 100 worker claims',
    samples: { sessions: 100, dsr_rows: 5000, worker_claims: 100 },
    thresholds_ms: { read_p95: 400, mutation_p95: 800, worker_claim_p95: 800 },
    measured_ms: {
      read_p95: Number(p95(readTimes).toFixed(2)),
      mutation_p95: Number(p95(mutationTimes).toFixed(2)),
      worker_claim_p95: Number(p95(workerTimes).toFixed(2)),
    },
    visible_delivery_count: adapter.visibleMessages.size,
    prohibited_sentinel_scan: 'PASS',
    result:
      p95(readTimes) <= 400 && p95(mutationTimes) <= 800 && p95(workerTimes) <= 800
        ? 'PASS'
        : 'FAIL',
  };
  await writeFile(
    new URL('../specs/005-privacy-dsr-notifications/evidence/performance.json', import.meta.url),
    `${JSON.stringify(evidence, null, 2)}\n`,
    'utf8',
  );
  await processor.close();
  await harness.app.close();
  await owner.end({ timeout: 5 });
  assert.equal(evidence.result, 'PASS');
  process.stdout.write(`${JSON.stringify(evidence)}\n`);
}

void main();
