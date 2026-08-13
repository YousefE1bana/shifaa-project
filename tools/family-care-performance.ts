import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { performance } from 'node:perf_hooks';

import { buildApp } from '../services/api/src/app.ts';
import { loadConfig } from '../services/api/src/config.ts';
import postgres from 'postgres';

const samples = 100;
const ownerUrl = 'postgresql://shifaa_owner:synthetic_owner_only@127.0.0.1:5432/shifaa';
const apiUrl = 'postgresql://shifaa_api:synthetic_api_only@127.0.0.1:5432/shifaa';
const p95 = (values: number[]) =>
  [...values].sort((left, right) => left - right)[Math.ceil(values.length * 0.95) - 1] ?? Infinity;
const uuidExpression = (run: string, label: string) => `md5('${run}:${label}:' || i::text)::uuid`;

async function main() {
  const run = randomUUID();
  const owner = postgres(ownerUrl, { max: 2 });
  const people = await owner<
    { id: string }[]
  >`select ${owner.unsafe(uuidExpression(run, 'person'))} id from generate_series(1,100) i`;
  const patients = await owner<
    { id: string }[]
  >`select ${owner.unsafe(uuidExpression(run, 'patient'))} id from generate_series(1,100) i`;
  await owner.begin(async (sql) => {
    await sql.unsafe(`
      alter table identity.care_relationships disable trigger user;
      alter table identity.care_relationship_permissions disable trigger user;
      alter table identity.emergency_contacts disable trigger user;
      insert into identity.people(id,user_id,display_name,nationality_code,preferred_locale,profile_status)
      select ${uuidExpression(run, 'person')},${uuidExpression(run, 'user')},'Synthetic performance '||i,'EG','en-EG','active'
      from generate_series(1,100) i;
      insert into identity.patients(id,person_id,medical_record_number)
      select ${uuidExpression(run, 'patient')},${uuidExpression(run, 'person')},'SYN-PERF-${run}-'||i
      from generate_series(1,100) i;
      insert into identity.care_relationships(id,subject_patient_id,actor_person_id,relationship_type,status,valid_from,created_by_person_id)
      select ${uuidExpression(run, 'self-rel')},${uuidExpression(run, 'patient')},${uuidExpression(run, 'person')},'self','active','2026-01-01T00:00:00Z',${uuidExpression(run, 'person')}
      from generate_series(1,100) i;
      insert into identity.private_evidence_objects(id,bucket_code,object_key,owner_person_id,resource_patient_id,sha256,mime_type,size_bytes,scan_status,released_at)
      select ${uuidExpression(run, 'evidence')},'guardianship-evidence','synthetic/performance/${run}/'||i,md5('${run}:person:'||((i%100)+1)::text)::uuid,${uuidExpression(run, 'patient')},md5('${run}:evidence-sha-a:'||i)||md5('${run}:evidence-sha-b:'||i),'application/pdf',1,'released','2026-01-01T00:00:00Z'
      from generate_series(1,100) i;
      insert into identity.care_relationships(id,subject_patient_id,actor_person_id,relationship_type,status,purpose_code,valid_from,valid_until,created_by_person_id,version)
      select ${uuidExpression(run, 'revoked-rel')},md5('${run}:patient:'||(((i-1)%100)+1)::text)::uuid,md5('${run}:person:'||((i%100)+1)::text)::uuid,'delegation','revoked','perf_${run}_'||i,'2026-01-01T00:00:00Z','2100-01-01T00:00:00Z',md5('${run}:person:'||(((i-1)%100)+1)::text)::uuid,2
      from generate_series(1,4800) i;
      insert into identity.care_relationships(id,subject_patient_id,actor_person_id,relationship_type,status,purpose_code,valid_from,valid_until,created_by_person_id,evidence_object_id,reviewed_by_person_id,reviewed_at,decision_reason_code,version)
      select ${uuidExpression(run, 'guardian-rel')},${uuidExpression(run, 'patient')},md5('${run}:person:'||((i%100)+1)::text)::uuid,'guardianship','active','perf_${run}_guardian','2026-01-01T00:00:00Z','2100-01-01T00:00:00Z',md5('${run}:person:'||((i%100)+1)::text)::uuid,${uuidExpression(run, 'evidence')},md5('${run}:person:'||(((i+1)%100)+1)::text)::uuid,'2026-01-01T00:00:00Z','synthetic_approved',2
      from generate_series(1,100) i;
      insert into identity.care_relationship_permissions(relationship_id,permission_code,created_by_person_id)
      select ${uuidExpression(run, 'revoked-rel')},p.code,md5('${run}:person:'||(((i-1)%100)+1)::text)::uuid
      from generate_series(1,4800) i cross join (values('profile.view'),('appointment.manage'),('record.view'),('sos.activate')) p(code);
      insert into identity.care_relationship_permissions(relationship_id,permission_code,created_by_person_id)
      select ${uuidExpression(run, 'guardian-rel')},p.code,md5('${run}:person:'||((i%100)+1)::text)::uuid
      from generate_series(1,100) i cross join (values('profile.view'),('appointment.manage'),('record.view'),('medication.manage'),('sos.activate'),('sos.share'),('complaint.create'),('symptom_routing.use')) p(code);
      insert into identity.emergency_contacts(id,subject_patient_id,created_by_person_id,display_name_ciphertext,display_name_nonce,display_name_authentication_tag,display_name_key_version,phone_ciphertext,phone_nonce,phone_authentication_tag,phone_key_version,masked_phone,phone_blind_index,preferred_locale,location_precision,status,invite_token_digest,invite_key_version,invite_expires_at,revoked_by_person_id,revoked_at,decision_reason_code,version)
      select ${uuidExpression(run, 'contact')},md5('${run}:patient:'||(((i-1)%100)+1)::text)::uuid,md5('${run}:person:'||(((i-1)%100)+1)::text)::uuid,decode('01','hex'),decode(repeat('02',12),'hex'),decode(repeat('03',16),'hex'),1,decode('04','hex'),decode(repeat('05',12),'hex'),decode(repeat('06',16),'hex'),1,'+999••••0000',decode(md5('${run}:phone:'||i)||md5('${run}:phone-b:'||i),'hex'),'en-EG','coarse','revoked',decode(md5('${run}:invite:'||i)||md5('${run}:invite-b:'||i),'hex'),1,'2100-01-01T00:00:00Z',md5('${run}:person:'||(((i-1)%100)+1)::text)::uuid,'2090-01-01T00:00:00Z','synthetic_revoked',2
      from generate_series(1,5000) i;
      alter table identity.care_relationships enable trigger user;
      alter table identity.care_relationship_permissions enable trigger user;
      alter table identity.emergency_contacts enable trigger user;
    `);
  });
  const [capacity] = await owner<any[]>`select
    (select count(*)::int from identity.care_relationships where purpose_code like ${`perf_${run}%`} or id in (select md5(${run}||':self-rel:'||i)::uuid from generate_series(1,100)i)) relationships,
    (select count(*)::int from identity.care_relationship_permissions where relationship_id in (select id from identity.care_relationships where purpose_code like ${`perf_${run}%`})) permissions,
    (select count(*)::int from identity.emergency_contacts where created_by_person_id=any(${people.map((item) => item.id)}::uuid[])) contacts`;
  assert.deepEqual(capacity, { relationships: 5000, permissions: 20000, contacts: 5000 });

  const base = loadConfig({ NODE_ENV: 'test' });
  const { app } = await buildApp({
    config: { ...base, repositoryAdapter: 'postgres', databaseUrl: apiUrl },
    // Forced-RLS uses PostgreSQL transaction time for current authority. Keep the
    // load harness on the same clock so app-created validity windows are current.
    clock: { now: () => new Date() },
  });
  try {
    const mutations = await Promise.all(
      people.map(async ({ id: personId }, index) => {
        const started = performance.now();
        const response = await app.inject({
          method: 'POST',
          url: `/v1/patients/${patients[index]!.id}/delegations`,
          headers: {
            authorization: `Bearer synthetic-person:${personId}`,
            'x-shifaa-patient-context': patients[index]!.id,
            'idempotency-key': `family-performance-${run}-${index}`,
          },
          payload: {
            delegate_person_id: people[(index + 1) % samples]!.id,
            purpose_code: `synthetic_load_${run}_${index}`,
            permissions: ['record.view'],
            valid_until: '2100-08-11T09:00:00.000Z',
          },
        });
        assert.equal(response.statusCode, 201, response.body);
        return performance.now() - started;
      }),
    );
    const reads = await Promise.all(
      people.map(async ({ id: personId }, index) => {
        const started = performance.now();
        const response = await app.inject({
          method: 'GET',
          url: `/v1/patients/${patients[index]!.id}/relationships?limit=100`,
          headers: { authorization: `Bearer synthetic-person:${personId}` },
        });
        assert.equal(response.statusCode, 200, response.body);
        return performance.now() - started;
      }),
    );
    const [leaks] = await owner<any[]>`select
      (select count(*)::int from platform.idempotency_records where idempotency_key like ${`family-performance-${run}-%`} and response_body::text ~* 'invitation_token|synthetic_load') idempotency,
      (select count(*)::int from platform.outbox_events o join identity.care_relationships r on r.id=o.aggregate_id where r.purpose_code like ${`synthetic_load_${run}%`} and o.payload::text ~* 'token|phone|diagnos|medicat|lab|evidence') outbox`;
    assert.deepEqual(leaks, { idempotency: 0, outbox: 0 });
    const mutationP95 = p95(mutations);
    const readP95 = p95(reads);
    const evidence = {
      generated_at: new Date().toISOString(),
      mode: 'seeded-synthetic PostgreSQL + forced RLS, 5k relationships / 20k permissions / 5k contacts / 100 concurrent sessions',
      samples,
      capacity,
      thresholds_ms: { read_p95: 400, mutation_p95: 800 },
      measured_ms: {
        read_p95: Number(readP95.toFixed(2)),
        mutation_p95: Number(mutationP95.toFixed(2)),
      },
      prohibited_sentinel_scan: 'PASS',
      result: readP95 <= 400 && mutationP95 <= 800 ? 'PASS' : 'FAIL',
    };
    await writeFile(
      new URL('../specs/004-family-care-relationships/evidence/performance.json', import.meta.url),
      `${JSON.stringify(evidence, null, 2)}\n`,
      'utf8',
    );
    assert.equal(evidence.result, 'PASS');
    process.stdout.write(`${JSON.stringify(evidence)}\n`);
  } finally {
    await app.close();
    await owner.begin(async (sql) => {
      await sql`create temporary table performance_request_ids on commit drop as select u.request_id::uuid id from identity.relationship_authorization_uses u join identity.care_relationships r on r.id=u.relationship_id where r.purpose_code like ${`perf_${run}%`} or r.purpose_code like ${`synthetic_load_${run}%`} or r.id in (select md5(${run}||':self-rel:'||i)::uuid from generate_series(1,100)i)`;
      // Owner-only teardown of this run's synthetic immutable evidence. Runtime
      // roles keep append-only triggers and have no UPDATE/DELETE grants.
      await sql`alter table identity.relationship_authorization_uses disable trigger user`;
      await sql`alter table audit.events disable trigger user`;
      await sql`delete from audit.events where request_id in (select id from performance_request_ids)`;
      await sql`delete from identity.relationship_authorization_uses where request_id::uuid in (select id from performance_request_ids)`;
      await sql`alter table audit.events enable trigger user`;
      await sql`alter table identity.relationship_authorization_uses enable trigger user`;
      await sql`delete from platform.idempotency_records where idempotency_key like ${`family-performance-${run}-%`}`;
      await sql`delete from platform.outbox_events where aggregate_id in (select id from identity.care_relationships where purpose_code like ${`perf_${run}%`} or purpose_code like ${`synthetic_load_${run}%`})`;
      await sql`delete from identity.care_relationship_permissions where relationship_id in (select id from identity.care_relationships where purpose_code like ${`perf_${run}%`} or purpose_code like ${`synthetic_load_${run}%`})`;
      await sql`delete from identity.emergency_contacts where created_by_person_id=any(${people.map((item) => item.id)}::uuid[])`;
      await sql`delete from identity.care_relationships where purpose_code like ${`perf_${run}%`} or purpose_code like ${`synthetic_load_${run}%`} or id in (select md5(${run}||':self-rel:'||i)::uuid from generate_series(1,100)i)`;
      await sql`delete from identity.private_evidence_objects where object_key like ${`synthetic/performance/${run}/%`}`;
      await sql`delete from identity.patients where id=any(${patients.map((item) => item.id)}::uuid[])`;
      await sql`delete from identity.people where id=any(${people.map((item) => item.id)}::uuid[])`;
    });
    await owner.end({ timeout: 5 });
  }
}

void main();
