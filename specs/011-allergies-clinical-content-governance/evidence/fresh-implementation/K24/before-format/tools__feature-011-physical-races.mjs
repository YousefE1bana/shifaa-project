// K07 T028 physical race suite. The parent GREEN dispatcher owns database execution.
import assert from 'node:assert/strict';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { session, marker } from './run-feature-011-concurrency-test.mjs';
import {
  root,
  runtimes,
  sql,
  withDatabase,
  prepare,
  smoke,
  readMigration,
  digest,
  runtimeManifest,
} from './run-feature-011-postgres-test.mjs';
import { checkpointMigrations, storageSlugs, consumerSlugs } from './run-feature-011-storage-test.mjs';
import { acceptedChain, evidenceRoot } from './feature-011-physical-green.mjs';
import { currentPhysicalSourceDigests } from './verify-feature-011-contracts.mjs';

const feature = 'specs/011-allergies-clinical-content-governance';
const runtimeEvidenceDir = resolve(root, evidenceRoot, 'runtime');
const greenPath = resolve(root, evidenceRoot, 'physical-green.json');
const patient = 'f0110000-0000-4000-8100-000000000001';
const facility = 'f0110000-0000-4000-8200-000000000001';
const encounter = 'f0110000-0000-4000-8400-000000000001';
const person = (n) => `f0110000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const quote = (value) => `'${String(value).replaceAll("'", "''")}'`;
const jsonSql = (value) => `${quote(JSON.stringify(value))}::jsonb`;
const pause = () => new Promise((done) => setTimeout(done, 25));
const bindingContract = 'SHIFAA-F011-VERIFIED-EVIDENCE-BINDING/1';
const receiptEnvelope = {
  contractId: 'SHIFAA-F011-RECEIPT-PROTECTED/1',
  keyRef: 'synthetic-kms/receipt/versions/1',
  nonce: '0102030405060708090a0b0c',
  ciphertext: 'aabb',
  authTag: '0102030405060708090a0b0c0d0e0f10',
};
const featureSources = [
  'tools/feature-011-physical-races.mjs',
  'tools/feature-011-physical-green.mjs',
  'tools/verify-feature-011-contracts.mjs',
  'tools/run-feature-011-concurrency-test.mjs',
  'tools/run-feature-011-postgres-test.mjs',
  'tools/run-feature-011-storage-test.mjs',
  'tools/feature-011-consumer-fixtures.mjs',
  'tools/feature-011-predecessor-races.mjs',
  'infra/db/fixtures/feature-011.sql',
  'infra/db/fixtures/feature-011-k06.sql',
  'infra/db/tests/feature-010-api.sql',
  'supabase/migrations/20261006185236_f011_allergy_functions.sql',
  'supabase/migrations/20261006185237_f011_release_functions.sql',
  'supabase/migrations/20261006185239_f011_signing_functions.sql',
  'supabase/migrations/20261006185240_f011_publication_functions.sql',
  'supabase/migrations/20261006185242_f011_receipt_functions.sql',
  'supabase/migrations/20260825000700_identity_continuity_sessions_mfa_recovery.sql',
  'supabase/migrations/20260926001000_encounters_referrals_contextual_chat.sql',
  'supabase/migrations/20260929001004_f010_c13_encounter_completion.sql',
  'supabase/migrations/20260930001001_f010_c26_privacy_guards.sql',
  'supabase/migrations/20261001001002_f010_f04_completion_authority.sql',
  'services/api/src/adapters/postgres/facility-service.ts',
  'services/api/src/adapters/postgres/identity-repository.ts',
  `${feature}/data-model.md`,
  `${feature}/contracts/trusted-release-handoff-v1-vectors.json`,
  `${feature}/contracts/artifact-canonicalization-v1-vectors.json`,
];

function responseContext() {
  return { responseLanguage: 'en-EG', responseRequestId: randomUUID() };
}

function contextSql(n, role, action, input, {
  key = randomUUID(), hash, environment = 'local', testNow,
  personId = person(n), patientId = patient, facilityId, encounterId, purposes = 'synthetic.feature011',
} = {}) {
  const requestHash = hash ?? createHash('sha256').update(JSON.stringify(input)).digest('hex');
  const values = {
    environment,
    ...(testNow ? { test_now: testNow } : {}),
    person_id: personId,
    actor_role: role,
    action,
    aal: '2',
    purposes,
    facility_id: facilityId ?? (role === 'PAT' || role === 'GUA' || role === 'DEL' ? '' : facility),
    encounter_id: encounterId ?? (role === 'CLN' ? encounter : ''),
    request_id: input.responseRequestId,
    idempotency_key: key,
    request_hash: requestHash,
  };
  return {
    key,
    hash: requestHash,
    sql: Object.entries(values)
      .map(([name, value]) => `SELECT set_config(${quote(`shifaa.${name}`)},${quote(value)},true);`)
      .join('\n'),
  };
}

function apiBlock(context, expression, {
  finalize = true, tag, envelope = receiptEnvelope,
  statementTimeout = '25s', lockTimeout = '20s',
} = {}) {
  const finalizer = finalize
    ? `receipt := clinical.f011_finalize_receipt_v1((domain_result->>'receiptId')::uuid,${jsonSql(envelope)});`
    : '';
  return `BEGIN;
SET LOCAL statement_timeout=${quote(statementTimeout)};
SET LOCAL lock_timeout=${quote(lockTimeout)};
${context.sql}
DO $f011_k07_action$
DECLARE domain_result jsonb; receipt jsonb; outcome jsonb; state text; message text;
BEGIN
  BEGIN
    domain_result := ${expression};
    ${finalizer}
    outcome := jsonb_build_object('outcome','success','domain',domain_result,'finalizer',receipt);
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS state = RETURNED_SQLSTATE, message = MESSAGE_TEXT;
    outcome := jsonb_build_object('outcome','error','sqlstate',state,'message',message);
  END;
  PERFORM set_config('shifaa.f011_k07_result',outcome::text,true);
END $f011_k07_action$;
SELECT current_setting('shifaa.f011_k07_result');
${tag ? `SELECT ${quote(tag)};` : ''}`;
}

function unfinalizedDomainBlock(context, expression, markerTag) {
  return `BEGIN;
SET LOCAL statement_timeout='25s';
SET LOCAL lock_timeout='20s';
${context.sql}
SELECT set_config('shifaa.f011_k07_domain_result',(${expression})::text,true);
SELECT current_setting('shifaa.f011_k07_domain_result');
SELECT ${quote(markerTag)};`;
}

function jsonFromOutput(output, predicate = (line) => line.startsWith('{')) {
  const line = output.trim().split(/\r?\n/).findLast(predicate);
  assert.ok(line, `Expected structured PostgreSQL result in output:\n${output}`);
  return JSON.parse(line);
}

function actionResult(connection) {
  return jsonFromOutput(connection.output, (line) => line.startsWith('{') && line.includes('"outcome"'));
}

function closeConnection(connection) {
  if (!connection.ended && !connection.child.stdin.destroyed && !connection.child.stdin.writableEnded) {
    connection.send('ROLLBACK;');
    connection.child.stdin.end();
  }
}

async function identify(connection, expectedUser = 'shifaa_api', { idleTransactionTimeout = '30s' } = {}) {
  connection.send(
    `SET application_name=${quote(connection.label)}; SET statement_timeout='25s'; SET lock_timeout='20s'; SET idle_in_transaction_session_timeout=${quote(idleTransactionTimeout)}; SELECT json_build_object('pid',pg_backend_pid(),'user',current_user,'database',current_database(),'applicationName',current_setting('application_name')); SELECT 'K07_READY';`,
  );
  await marker(connection, 'K07_READY');
  const identity = jsonFromOutput(connection.output);
  assert.equal(identity.user, expectedUser);
  return identity;
}

function executorRoleObservation(runtime, database) {
  const result = sql(runtime, database, `BEGIN;
    SET LOCAL ROLE shifaa_f011_executor;
    SELECT json_build_object('currentUser',current_user,'sessionUser',session_user,
      'superuser',(SELECT rolsuper FROM pg_roles WHERE rolname=current_user),
      'bypassRls',(SELECT rolbypassrls FROM pg_roles WHERE rolname=current_user));
    ROLLBACK;`);
  const observation = JSON.parse(result.stdout.trim());
  assert.equal(observation.currentUser, 'shifaa_f011_executor');
  assert.equal(observation.superuser, false);
  assert.equal(observation.bypassRls, false);
  return {
    observation,
    command: result.command,
    transport: 'owner session using SET LOCAL ROLE; effective database-role observation only, not an authentication claim',
  };
}

async function proveWait(runtime, database, holderPid, contenderPid) {
  assert.ok(Number.isInteger(holderPid) && Number.isInteger(contenderPid) && holderPid !== contenderPid);
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    const observed = sql(
      runtime,
      database,
      `SELECT json_build_object(
        'holderPid',${holderPid},'contenderPid',${contenderPid},
        'blockingPids',pg_blocking_pids(${contenderPid}),
        'waitEventType',(SELECT wait_event_type FROM pg_stat_activity WHERE pid=${contenderPid}),
        'waitEvent',(SELECT wait_event FROM pg_stat_activity WHERE pid=${contenderPid}),
        'locks',(SELECT COALESCE(json_agg(json_build_object('pid',pid,'type',locktype,'mode',mode,'granted',granted,'relation',CASE WHEN relation IS NULL THEN NULL ELSE relation::regclass::text END,'classId',classid,'objId',objid,'objSubId',objsubid) ORDER BY pid,locktype,mode),'[]'::json) FROM pg_locks WHERE pid IN (${holderPid},${contenderPid})));`,
    );
    const facts = JSON.parse(observed.stdout.trim());
    if (
      facts.blockingPids.includes(holderPid) &&
      facts.waitEventType === 'Lock' &&
      facts.locks.some((lock) => lock.pid === contenderPid && !lock.granted)
    )
      return { ...facts, observerCommand: observed.command };
    await pause();
  }
  throw new Error(`${runtime.name}: no real PostgreSQL blocking proof for ${holderPid} -> ${contenderPid}.`);
}

async function finishSession(connection, tag) {
  connection.send(`COMMIT; SELECT ${quote(tag)};`);
  await marker(connection, tag);
  connection.child.stdin.end();
  const closed = await connection.closed;
  assert.equal(closed.code, 0, `${connection.label} exited unsuccessfully: ${closed.output}`);
  return { command: connection.command, output: closed.output, exitCode: closed.code };
}

function assertSuccess(value, message) {
  assert.equal(value.outcome, 'success', `${message}: ${JSON.stringify(value)}`);
  return value.domain;
}

function assertFailure(value, states, messagePattern, message) {
  assert.equal(value.outcome, 'error', `${message}: expected an API denial, got ${JSON.stringify(value)}`);
  assert.ok(states.includes(value.sqlstate), `${message}: unexpected SQLSTATE ${value.sqlstate}: ${value.message}`);
  if (messagePattern) assert.match(value.message, messagePattern, `${message}: unexpected denial reason`);
  return value;
}

function createAllergyInput() {
  return {
    ...responseContext(),
    preparation: {
      allergyId: randomUUID(),
      revisionId: randomUUID(),
      revisionVersion: 1,
      previousRevisionId: null,
      protectedFacts: {
        contractId: 'SHIFAA-F011-ALLERGY-PROTECTED/1',
        keyRef: 'synthetic-kms/facts/versions/1',
        nonce: randomBytes(12).toString('hex'),
        ciphertext: 'aabb',
        authTag: '0102030405060708090a0b0c0d0e0f10',
      },
      protectedReason: null,
      correctsAllergyId: null,
    },
  };
}

function createAllergyExpression(input, patientId = patient) {
  return `clinical.create_allergy_api_v1(${quote(patientId)}::uuid,${jsonSql(input)})`;
}

async function callApi(runtime, database, n, role, action, input, expression, options = {}) {
  const { finalize = true, envelope = receiptEnvelope, ...contextOptions } = options;
  const context = contextSql(n, role, action, input, contextOptions);
  const result = sql(
    runtime,
    database,
    `${apiBlock(context, expression, { finalize, envelope })} COMMIT;`,
    { user: 'shifaa_api' },
  );
  assert.equal(result.exitCode, 0, `${action} SQL session failed: ${result.output}`);
  return {
    api: jsonFromOutput(result.stdout, (line) => line.startsWith('{') && line.includes('"outcome"')),
    command: result.command,
    output: result.output,
    context: { key: context.key, requestHash: context.hash, personId: contextOptions.personId ?? person(n), role, action },
  };
}

function addVerificationSupport(runtime, database, { patientId = patient, allergyId, previousRevisionId, previousVersion = 1, targetStatus = 'clinician_confirmed', actorPersonId = person(2) }) {
  const evidenceRef = randomUUID();
  sql(
    runtime,
    database,
    `INSERT INTO clinical.allergy_verification_support
      (id,patient_id,allergy_id,previous_revision_id,previous_version,target_status,attestor_person_id,source_identity,source_evidence_identity,producer_id,recorded_at,synthetic)
     VALUES(${quote(evidenceRef)}::uuid,${quote(patientId)}::uuid,${quote(allergyId)}::uuid,${quote(previousRevisionId)}::uuid,${previousVersion},${quote(targetStatus)},${quote(actorPersonId)}::uuid,'synthetic.internal_clinician_provenance',${quote(evidenceRef)}::uuid,'f011.allergy_evidence_boundary',clock_timestamp(),true);`,
  );
  return evidenceRef;
}

function verificationInput({ patientId = patient, allergyId, revisionId = randomUUID(), previousRevisionId, previousVersion = 1, targetStatus = 'clinician_confirmed', actorPersonId = person(2), evidenceRef }) {
  return {
    ...responseContext(),
    preparation: {
      protectedRevision: {
        allergyId,
        revisionId,
        revisionVersion: previousVersion + 1,
        previousRevisionId,
        protectedFacts: {
          contractId: 'SHIFAA-F011-ALLERGY-PROTECTED/1',
          keyRef: `synthetic-kms/facts/versions/${previousVersion + 1}`,
          nonce: randomBytes(12).toString('hex'),
          ciphertext: 'c0ffee',
          authTag: '1112131415161718191a1b1c1d1e1f20',
        },
        protectedReason: {
          contractId: 'SHIFAA-F011-ALLERGY-PROTECTED/1',
          keyRef: `synthetic-kms/reason/versions/${previousVersion + 1}`,
          nonce: randomBytes(12).toString('hex'),
          ciphertext: 'abcd',
          authTag: '2122232425262728292a2b2c2d2e2f30',
        },
      },
      verifiedEvidence: {
        contractId: bindingContract,
        profile: 'allergy_verification',
        bindingId: randomUUID(),
        producerId: 'f011.allergy_evidence_boundary',
        verifiedAt: '2026-10-06T10:00:00.000000Z',
        evidenceRef,
        patientId,
        allergyId,
        previousRevisionId,
        previousVersion,
        revisionId,
        revisionVersion: previousVersion + 1,
        targetStatus,
        attestorPersonId: actorPersonId,
        sourceIdentity: 'synthetic.internal_clinician_provenance',
        sourceEvidenceIdentity: evidenceRef,
        synthetic: true,
      },
    },
  };
}

function verifyExpression(input, allergyId, version = 1) {
  return `clinical.verify_allergy_api_v1(${quote(allergyId)}::uuid,${version},${jsonSql(input)})`;
}

function receiptState(runtime, database) {
  const result = sql(
    runtime,
    database,
    `SELECT json_build_object(
      'allergyHeads',(SELECT count(*) FROM clinical.allergy_heads),
      'allergyRevisions',(SELECT count(*) FROM clinical.allergies),
      'verificationBindings',(SELECT count(*) FROM clinical.allergy_verification_bindings),
      'contentSeries',(SELECT count(*) FROM clinical.content_series),
      'contentReleases',(SELECT count(*) FROM clinical.content_releases),
      'signatureEvidence',(SELECT count(*) FROM audit.signature_evidence WHERE resource_type='clinical.content_release'),
      'signatureBindings',(SELECT count(*) FROM clinical.content_signature_bindings),
      'receipts',(SELECT count(*) FROM clinical.mutation_receipts),
      'obligations',(SELECT count(*) FROM clinical.mutation_commit_obligations),
      'completedFeatureIdempotency',(SELECT count(*) FROM platform.idempotency_records WHERE state='completed' AND resource_type IN ('clinical.allergy_revision','clinical.content_release')),
      'auditAllergyEvents',(SELECT count(*) FROM audit.events WHERE action_code IN ('allergy.created','allergy.verified')),
      'auditReleaseEvents',(SELECT count(*) FROM audit.events WHERE action_code IN ('clinical_content_release.created','clinical_content_release.signed','clinical_content_release.published')),
      'outboxFeatureEvents',(SELECT count(*) FROM platform.outbox_events WHERE aggregate_type IN ('clinical.allergy_revision','clinical.content_release')),
      'badReceiptPointers',(SELECT count(*) FROM platform.idempotency_records i JOIN clinical.mutation_receipts r ON r.idempotency_record_id=i.id WHERE i.response_body IS DISTINCT FROM jsonb_build_object('featureReceiptId',r.id::text) OR i.response_headers IS DISTINCT FROM jsonb_build_object('ETag',r.response_etag,'Content-Language',r.response_language,'Cache-Control','private, no-store','X-Request-Id',r.response_request_id::text)));`,
  );
  return JSON.parse(result.stdout.trim());
}

function snapshot(runtime, database) {
  const result = sql(
    runtime,
    database,
    `SELECT json_build_object(
      'allergyHeads',(SELECT md5(COALESCE(string_agg(to_jsonb(t)::text,E'\\n' ORDER BY to_jsonb(t)::text),'')) FROM clinical.allergy_heads t),
      'allergies',(SELECT md5(COALESCE(string_agg(to_jsonb(t)::text,E'\\n' ORDER BY to_jsonb(t)::text),'')) FROM clinical.allergies t),
      'support',(SELECT md5(COALESCE(string_agg(to_jsonb(t)::text,E'\\n' ORDER BY to_jsonb(t)::text),'')) FROM clinical.allergy_verification_support t),
      'bindings',(SELECT md5(COALESCE(string_agg(to_jsonb(t)::text,E'\\n' ORDER BY to_jsonb(t)::text),'')) FROM clinical.allergy_verification_bindings t),
      'receipts',(SELECT md5(COALESCE(string_agg(to_jsonb(t)::text,E'\\n' ORDER BY to_jsonb(t)::text),'')) FROM clinical.mutation_receipts t),
      'obligations',(SELECT md5(COALESCE(string_agg(to_jsonb(t)::text,E'\\n' ORDER BY to_jsonb(t)::text),'')) FROM clinical.mutation_commit_obligations t),
      'idempotency',(SELECT md5(COALESCE(string_agg(to_jsonb(t)::text,E'\\n' ORDER BY to_jsonb(t)::text),'')) FROM platform.idempotency_records t),
      'audit',(SELECT md5(COALESCE(string_agg(to_jsonb(t)::text,E'\\n' ORDER BY to_jsonb(t)::text),'')) FROM audit.events t),
      'outbox',(SELECT md5(COALESCE(string_agg(to_jsonb(t)::text,E'\\n' ORDER BY to_jsonb(t)::text),'')) FROM platform.outbox_events t));`,
  );
  return JSON.parse(result.stdout.trim());
}

async function initFeatureDatabase(runtime, callback, source) {
  let observedDatabase;
  let phase = 'creating exact K07 scratch database';
  try {
    return await withDatabase(
      runtime,
      async (database) => {
        observedDatabase = database;
        const setPhase = (next) => {
          phase = next;
          console.log(`K07 T028 ${runtime.name}/${database}: ${next}`);
        };
        setPhase('fresh baseline and physical health');
        const baseline = prepare(runtime, database);
        const health = smoke(runtime, database);
        assert.ok(health.manifest.serverVersion.startsWith(runtime === runtimes[0] ? '17.11' : '17.6'));
        setPhase('apply accepted physical chain and K06 synthetic fixture');
        const migrationPaths = checkpointMigrations([...storageSlugs, ...consumerSlugs]);
        const migrations = migrationPaths.map((path) => ({
          path,
          sha256: digest(path),
          exitCode: sql(runtime, database, readMigration(path)).exitCode,
        }));
        sql(runtime, database, readFileSync(resolve(root, 'infra/db/fixtures/feature-011-k06.sql'), 'utf8'));
        const before = source ? await source(runtime, database) : null;
        const entrypoints = sql(
          runtime,
          database,
          `SELECT json_build_object('createAllergy',to_regprocedure('clinical.create_allergy_api_v1(uuid,jsonb)') IS NOT NULL,'verifyAllergy',to_regprocedure('clinical.verify_allergy_api_v1(uuid,integer,jsonb)') IS NOT NULL,'createRelease',to_regprocedure('clinical.create_clinical_content_release_api_v1(text,jsonb)') IS NOT NULL,'signRelease',to_regprocedure('clinical.sign_clinical_content_release_api_v1(uuid,integer,jsonb)') IS NOT NULL,'publishRelease',to_regprocedure('clinical.publish_clinical_content_release_api_v1(uuid,integer,jsonb)') IS NOT NULL,'finalizer',to_regprocedure('clinical.f011_finalize_receipt_v1(uuid,jsonb)') IS NOT NULL);`,
        );
        const present = JSON.parse(entrypoints.stdout.trim());
        assert.ok(Object.values(present).every(Boolean), 'K06 setup must expose every approved entrypoint.');
        const executor = executorRoleObservation(runtime, database);
        const featureFixtureSha256 = digest('infra/db/fixtures/feature-011-k06.sql');
        const result = await callback(database, { baseline, health, migrations, featureFixtureSha256, before, executor }, setPhase);
        return { database, baseline, health, migrations, featureFixtureSha256, sourceFixture: before, executor, ...result };
      },
      'K07',
    );
  } catch (error) {
    const failure = error instanceof Error ? error : new Error(String(error));
    failure.physicalRaceContext = {
      runtime: runtime.name,
      database: observedDatabase ?? null,
      phase,
      cleanup: observedDatabase
        ? 'withDatabase finally attempted exact DROP and absence verification without forced termination; cleanup failure replaces this error with an exact-cleanup diagnostic'
        : 'scratch CREATE was not confirmed by callback entry; no cleanup claim',
    };
    throw failure;
  }
}

const f010Person = (n) => `f0101000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const f010Patient = 'f0101000-0000-4000-8100-000000000001';
const f010Facility = 'f0101000-0000-4000-8200-000000000001';
const f010Encounter = 'f0101000-0000-4000-8800-000000000002';
const f010Relationship = 'f0101000-0000-4000-8d00-000000000001';

function prepareFeature010(runtime, database, { continuity = false } = {}) {
  const path = 'infra/db/tests/feature-010-api.sql';
  let prefix = readFileSync(resolve(root, path), 'utf8').split(
    '-- Place the expected red check after all synthetic fixture SQL has parsed and',
  )[0];
  assert.ok(prefix.startsWith('-- Feature 010 C10'));
  const corrupted =
    /ALTER TABLE clinical\.queue_entries DISABLE TRIGGER USER;\r?\nUPDATE clinical\.queue_entries SET queue_scope_id=[\s\S]*?ALTER TABLE clinical\.queue_entries ENABLE TRIGGER USER;/;
  assert.ok(corrupted.test(prefix), 'Fresh F010 source must include its intentionally isolated corrupt queue vector.');
  prefix = prefix.replace(corrupted, '');
  assert.doesNotMatch(prefix, /queue_scope_id='f0101000-0000-4000-8600-000000000002'/);
  sql(runtime, database, `${prefix}\nCOMMIT;`);
  if (continuity) {
    sql(runtime, database, `BEGIN;
      SELECT set_config('shifaa.environment','ci',true),set_config('shifaa.test_now','2030-04-05T08:00:00Z',true),set_config('shifaa.person_id','f0110000-0000-4000-8000-000000000004',true);
      INSERT INTO identity.admin_role_grants(id,person_id,role_code,status,valid_from,valid_until,proposed_by)
      VALUES('f0114000-0000-4000-8000-000000000001','f0110000-0000-4000-8000-000000000008','support_admin','pending','2020-01-01','2035-01-01','f0110000-0000-4000-8000-000000000004');
      SELECT set_config('shifaa.person_id','f0110000-0000-4000-8000-000000000005',true);
      UPDATE identity.admin_role_grants SET status='active',decided_by='f0110000-0000-4000-8000-000000000005',decision_reason='synthetic.k07.assignment' WHERE id='f0114000-0000-4000-8000-000000000001';
      INSERT INTO identity.continuity_cases(id,case_type,subject_person_id,subject_patient_id,relationship_id,status,assigned_reviewer_person_id,created_at)
      VALUES('f0114000-0000-4000-8000-000000000002','dependent_transition',${quote(f010Person(2))}::uuid,${quote(f010Patient)}::uuid,${quote(f010Relationship)}::uuid,'review_required','f0110000-0000-4000-8000-000000000008','2030-04-05T08:00:00Z');
      COMMIT;`);
  }
  return { path, sha256: digest(path), removedCorruptQueueVector: true, continuityCaseSeeded: continuity };
}

function seedF010ClinicianScope(runtime, database) {
  const evidenceId = 'f0101000-0000-4000-8c00-000000000002';
  const licenseId = 'f0101000-0000-4000-8b00-000000000001';
  sql(runtime, database, `BEGIN;
    INSERT INTO identity.private_evidence_objects
      (id,bucket_code,object_key,owner_person_id,facility_id,sha256,mime_type,size_bytes,scan_status,released_at)
    VALUES(${quote(evidenceId)}::uuid,'facility-license-evidence','f010-k07/facility-license.pdf',${quote(f010Person(1))}::uuid,${quote(f010Facility)}::uuid,repeat('c',64),'application/pdf',32,'released',clock_timestamp());
    INSERT INTO identity.facility_licenses
      (id,facility_id,license_type,number_ciphertext,number_hash,issuer,expires_on,licensed_activities,status,evidence_object_id,reviewed_by_person_id,reviewed_at)
    VALUES(${quote(licenseId)}::uuid,${quote(f010Facility)}::uuid,'synthetic-clinic',decode('aabb','hex'),decode(repeat('d',64),'hex'),'Synthetic F010 K07 fixture','2035-12-31',ARRAY['consultation'],'verified',${quote(evidenceId)}::uuid,'f0110000-0000-4000-8000-000000000008',clock_timestamp());
    COMMIT;`);
  return { facilityLicenseId: licenseId, facilityEvidenceId: evidenceId, syntheticStructuralFixture: true };
}

async function prepareF010Allergy(runtime, database) {
  const create = createAllergyInput();
  const createResult = await callApi(runtime, database, 2, 'PAT', 'createAllergy', create,
    createAllergyExpression(create, f010Patient), {
      personId: f010Person(2), patientId: f010Patient, environment: 'ci', testNow: '2030-04-05T08:00:00Z',
    });
  assertSuccess(createResult.api, 'F010 patient synthetic allergy creation');
  const allergyId = create.preparation.allergyId;
  const previousRevisionId = create.preparation.revisionId;
  const evidenceRef = addVerificationSupport(runtime, database, {
    patientId: f010Patient, allergyId, previousRevisionId,
    targetStatus: 'clinician_confirmed', actorPersonId: f010Person(1),
  });
  const input = verificationInput({
    patientId: f010Patient, allergyId, previousRevisionId, actorPersonId: f010Person(1), evidenceRef,
  });
  return {
    create: createResult,
    allergyId,
    previousRevisionId,
    input,
    context: contextSql(1, 'CLN', 'verifyAllergy', input, {
      personId: f010Person(1), patientId: f010Patient,
      facilityId: f010Facility, encounterId: f010Encounter,
      environment: 'ci', testNow: '2030-04-05T08:00:00Z', purposes: 'appointment.scheduling',
    }),
    expression: verifyExpression(input, allergyId),
  };
}

async function startActionSession(runtime, database, label, context, expression, {
  finalize = true, envelope = receiptEnvelope, markerTag,
  statementTimeout = '25s', lockTimeout = '20s', idleTransactionTimeout = '30s',
} = {}) {
  const connection = session(runtime, database, `${database}_${label}`);
  const identity = await identify(connection, 'shifaa_api', { idleTransactionTimeout });
  assert.equal(identity.database, database);
  connection.send(apiBlock(context, expression, {
    finalize, envelope, tag: markerTag, statementTimeout, lockTimeout,
  }));
  return { connection, identity };
}

async function concurrentFeatureAction(runtime, database, first, second, { expectedSecondStates, expectedSecondMessage, firstTag = 'K07_FIRST_ACTION_READY', secondTag = 'K07_SECOND_ACTION_READY' } = {}) {
  const holder = await startActionSession(runtime, database, 'holder', first.context, first.expression, {
    finalize: first.finalize !== false,
    envelope: first.envelope ?? receiptEnvelope,
    markerTag: firstTag,
  });
  let contender;
  try {
    await marker(holder.connection, firstTag);
    const firstResult = actionResult(holder.connection);
    const firstDomain = assertSuccess(firstResult, `${first.id} winner`);
    contender = await startActionSession(runtime, database, 'contender', second.context, second.expression, {
      finalize: second.finalize !== false,
      envelope: second.envelope ?? receiptEnvelope,
      markerTag: secondTag,
    });
    const locks = await proveWait(runtime, database, holder.identity.pid, contender.identity.pid);
    const holderCommit = await finishSession(holder.connection, 'K07_FIRST_COMMITTED');
    await marker(contender.connection, secondTag);
    const secondResult = actionResult(contender.connection);
    const secondFailure = assertFailure(secondResult, expectedSecondStates, expectedSecondMessage, `${second.id} contended outcome`);
    const contenderCommit = await finishSession(contender.connection, 'K07_SECOND_COMMITTED');
    return {
      first: { id: first.id, identity: holder.identity, result: firstResult, committed: holderCommit },
      second: { id: second.id, identity: contender.identity, result: secondResult, committed: contenderCommit },
      locks,
      firstDomain,
      expectedContendedFailure: secondFailure,
    };
  } finally {
    closeConnection(holder.connection);
    if (contender) closeConnection(contender.connection);
    await Promise.allSettled([holder.connection.closed, contender?.connection.closed]);
  }
}

async function concurrentFeatureSuccess(runtime, database, first, second, {
  firstTag = 'K07_ALLOCATION_FIRST_READY',
  secondTag = 'K07_ALLOCATION_SECOND_READY',
} = {}) {
  const holder = await startActionSession(runtime, database, 'holder', first.context, first.expression, {
    markerTag: firstTag,
  });
  let contender;
  try {
    await marker(holder.connection, firstTag);
    const firstResult = actionResult(holder.connection);
    const firstDomain = assertSuccess(firstResult, `${first.id} allocation winner`);
    contender = await startActionSession(runtime, database, 'contender', second.context, second.expression, {
      markerTag: secondTag,
    });
    const locks = await proveWait(runtime, database, holder.identity.pid, contender.identity.pid);
    const holderCommit = await finishSession(holder.connection, 'K07_ALLOCATION_FIRST_COMMITTED');
    await marker(contender.connection, secondTag);
    const secondResult = actionResult(contender.connection);
    const secondDomain = assertSuccess(secondResult, `${second.id} serialized allocation`);
    const contenderCommit = await finishSession(contender.connection, 'K07_ALLOCATION_SECOND_COMMITTED');
    return {
      first: { id: first.id, identity: holder.identity, result: firstResult, committed: holderCommit },
      second: { id: second.id, identity: contender.identity, result: secondResult, committed: contenderCommit },
      firstDomain,
      secondDomain,
      locks,
    };
  } finally {
    closeConnection(holder.connection);
    if (contender) closeConnection(contender.connection);
    await Promise.allSettled([holder.connection.closed, contender?.connection.closed]);
  }
}

async function allergyCasProof(runtime, database) {
  const creation = createAllergyInput();
  const created = await callApi(runtime, database, 1, 'PAT', 'createAllergy', creation, createAllergyExpression(creation));
  const createdDomain = assertSuccess(created.api, 'synthetic patient allergy create');
  assert.equal(createdDomain.resourceVersion, 1);
  const allergyId = creation.preparation.allergyId;
  const previousRevisionId = creation.preparation.revisionId;
  const clinicianEvidence = addVerificationSupport(runtime, database, {
    allergyId,
    previousRevisionId,
    targetStatus: 'clinician_confirmed',
  });
  const refutedEvidence = addVerificationSupport(runtime, database, {
    allergyId,
    previousRevisionId,
    targetStatus: 'refuted',
  });
  const clinicianInput = verificationInput({ allergyId, previousRevisionId, evidenceRef: clinicianEvidence });
  const refutedInput = verificationInput({ allergyId, previousRevisionId, targetStatus: 'refuted', evidenceRef: refutedEvidence });
  const race = await concurrentFeatureAction(
    runtime,
    database,
    {
      id: 'allergy-head-cas-clinician-confirmed',
      context: contextSql(2, 'CLN', 'verifyAllergy', clinicianInput),
      expression: verifyExpression(clinicianInput, allergyId),
    },
    {
      id: 'allergy-head-cas-refuted',
      context: contextSql(2, 'CLN', 'verifyAllergy', refutedInput),
      expression: verifyExpression(refutedInput, allergyId),
    },
    { expectedSecondStates: ['40001'], expectedSecondMessage: /allergy version changed|compare-and-swap/i },
  );
  assert.equal(race.firstDomain.resourceVersion, 2);
  const history = JSON.parse(sql(runtime, database,
    `SELECT json_build_object('revisions',count(*),'versions',array_agg(version ORDER BY version),'statuses',array_agg(verification_status ORDER BY version),'currentVersion',(SELECT current_version FROM clinical.allergy_heads WHERE id=${quote(allergyId)}::uuid),'currentRevision',(SELECT current_revision_id FROM clinical.allergy_heads WHERE id=${quote(allergyId)}::uuid),'supportBindings',(SELECT count(*) FROM clinical.allergy_verification_bindings b JOIN clinical.allergies a ON a.id=b.revision_id WHERE a.allergy_id=${quote(allergyId)}::uuid)) FROM clinical.allergies WHERE allergy_id=${quote(allergyId)}::uuid;`,
  ).stdout.trim());
  assert.equal(history.revisions, 2);
  assert.deepEqual(history.versions, [1, 2]);
  assert.equal(history.currentVersion, 2);
  assert.equal(history.supportBindings, 1);
  const durable = receiptState(runtime, database);
  assert.equal(durable.receipts, durable.obligations);
  assert.equal(durable.receipts, durable.completedFeatureIdempotency);
  assert.equal(durable.badReceiptPointers, 0);
  return {
    category: 'allergy-head-cas',
    result: 'PASS',
    actualApiCalls: [created, race.first, race.second],
    barriers: [race.locks],
    assertions: [
      { id: 'allergy-head-cas-one-winner', result: 'PASS', winnerVersion: race.firstDomain.resourceVersion },
      { id: 'allergy-head-cas-stale-contender-40001', result: 'PASS', sqlstate: race.expectedContendedFailure.sqlstate },
      { id: 'allergy-head-cas-immutable-history', result: 'PASS', history },
      { id: 'allergy-head-cas-all-five-receipt-commit', result: 'PASS', durable },
    ],
    identities: [race.first.identity, race.second.identity],
    commandEvidence: { create: created.command, holder: race.first.committed.command, contender: race.second.committed.command },
    outputs: { create: created.output, holder: race.first.committed.output, contender: race.second.committed.output },
  };
}

async function idempotencyReplayProof(runtime, database) {
  const input = createAllergyInput();
  const shared = contextSql(1, 'PAT', 'createAllergy', input, { key: randomUUID() });
  const before = receiptState(runtime, database);
  const holder = await startActionSession(runtime, database, 'holder', shared, createAllergyExpression(input), { markerTag: 'K07_REPLAY_FIRST_READY' });
  let contender;
  try {
    await marker(holder.connection, 'K07_REPLAY_FIRST_READY');
    const firstResult = actionResult(holder.connection);
    const firstDomain = assertSuccess(firstResult, 'original idempotent mutation');
    contender = await startActionSession(runtime, database, 'contender', contextSql(1, 'PAT', 'createAllergy', input, { key: shared.key, hash: shared.hash }), createAllergyExpression(input), { finalize: false, markerTag: 'K07_REPLAY_CONTENDER_READY' });
    const locks = await proveWait(runtime, database, holder.identity.pid, contender.identity.pid);
    const holderCommit = await finishSession(holder.connection, 'K07_REPLAY_FIRST_COMMITTED');
    await marker(contender.connection, 'K07_REPLAY_CONTENDER_READY');
    const replayResult = actionResult(contender.connection);
    const replay = assertSuccess(replayResult, 'serialized replay');
    assert.equal(replay.replay, true);
    assert.equal(replay.resourceVersion, firstDomain.resourceVersion);
    const contenderCommit = await finishSession(contender.connection, 'K07_REPLAY_CONTENDER_COMMITTED');
    const after = receiptState(runtime, database);
    assert.equal(after.receipts - before.receipts, 1);
    assert.equal(after.receipts, after.obligations);
    assert.equal(after.receipts, after.completedFeatureIdempotency);
    assert.equal(after.badReceiptPointers, 0);
    return {
      category: 'idempotency-replay',
      result: 'PASS',
      actualApiCalls: [firstResult, replayResult],
      barriers: [locks],
      assertions: [
        { id: 'idempotency-replay-one-effect', result: 'PASS', before, after },
        { id: 'idempotency-replay-original-tuple', result: 'PASS', replay: { replay: replay.replay, resourceVersion: replay.resourceVersion, responseLanguage: replay.responseLanguage, responseRequestId: replay.responseRequestId } },
        { id: 'idempotency-replay-all-five-commit', result: 'PASS', receipts: after.receipts, obligations: after.obligations, completed: after.completedFeatureIdempotency },
      ],
      identities: [holder.identity, contender.identity],
      commandEvidence: { holder: holderCommit.command, contender: contenderCommit.command },
      outputs: { holder: holderCommit.output, contender: contenderCommit.output },
    };
  } finally {
    closeConnection(holder.connection);
    if (contender) closeConnection(contender.connection);
    await Promise.allSettled([holder.connection.closed, contender?.connection.closed]);
  }
}

async function receiptFaultProof(runtime, database) {
  const input = createAllergyInput();
  const invalidEnvelope = { ...receiptEnvelope, extra: 'closed-contract-violation' };
  const before = snapshot(runtime, database);
  const fault = await callApi(runtime, database, 1, 'PAT', 'createAllergy', input, createAllergyExpression(input), {
    envelope: invalidEnvelope,
  });
  const result = assertFailure(fault.api, ['22023'], /envelope|contract|field|^Feature 011 object has missing or unknown members$/i, 'malformed receipt envelope');
  const after = snapshot(runtime, database);
  assert.deepEqual(after, before, 'Malformed finalization must roll back all domain, receipt, audit, idempotency and outbox effects.');
  const retryInput = createAllergyInput();
  const sharedContext = contextSql(1, 'PAT', 'createAllergy', retryInput, { key: randomUUID() });
  const retryExpression = createAllergyExpression(retryInput);
  const beforeRace = receiptState(runtime, database);
  const holder = session(runtime, database, `${database}_holder`);
  const holderIdentity = await identify(holder);
  holder.send(unfinalizedDomainBlock(sharedContext, retryExpression, 'K07_RECEIPT_DOMAIN_READY'));
  let contender, locks, holderClose, contenderCommit, winner, unfinalizedDomain, finalizerFault;
  try {
    await marker(holder, 'K07_RECEIPT_DOMAIN_READY');
    unfinalizedDomain = jsonFromOutput(holder.output, (line) => line.startsWith('{') && line.includes('"receiptId"'));
    assert.ok(unfinalizedDomain.receiptId, 'Holder must execute the real mutation and return its receipt obligation before finalization.');
    contender = await startActionSession(runtime, database, 'contender', sharedContext, retryExpression, {
      markerTag: 'K07_RECEIPT_RETRY_DONE',
    });
    locks = await proveWait(runtime, database, holderIdentity.pid, contender.identity.pid);
    holder.send(`DO $f011_k07_receipt_fault$
DECLARE state text; message text;
BEGIN
  BEGIN
    PERFORM clinical.f011_finalize_receipt_v1(
      (current_setting('shifaa.f011_k07_domain_result',true)::jsonb->>'receiptId')::uuid,
      ${jsonSql(invalidEnvelope)});
    RAISE EXCEPTION 'fault injection unexpectedly finalized receipt' USING ERRCODE='P0001';
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS state = RETURNED_SQLSTATE, message = MESSAGE_TEXT;
    PERFORM set_config('shifaa.f011_k07_receipt_fault',jsonb_build_object('sqlstate',state,'message',message)::text,true);
  END;
END $f011_k07_receipt_fault$;
SELECT current_setting('shifaa.f011_k07_receipt_fault');
ROLLBACK;
SELECT 'K07_RECEIPT_FAULT_ROLLED_BACK';`);
    await marker(holder, 'K07_RECEIPT_FAULT_ROLLED_BACK');
    finalizerFault = jsonFromOutput(holder.output, (line) => line.startsWith('{') && line.includes('"sqlstate"'));
    assert.equal(finalizerFault.sqlstate, '22023');
    assert.match(finalizerFault.message, /envelope|contract|field|^Feature 011 object has missing or unknown members$/i);
    holder.child.stdin.end();
    holderClose = await holder.closed;
    assert.equal(holderClose.code, 0, `Unfinalized receipt holder did not roll back cleanly: ${holderClose.output}`);
    await marker(contender.connection, 'K07_RECEIPT_RETRY_DONE');
    const winnerResult = actionResult(contender.connection);
    winner = assertSuccess(winnerResult, 'same-key mutation after unfinalized receipt rollback');
    assert.ok(winnerResult.finalizer, 'Contender must successfully finalize the one durable receipt.');
    contenderCommit = await finishSession(contender.connection, 'K07_RECEIPT_RETRY_COMMITTED');
  } finally {
    closeConnection(holder);
    if (contender) closeConnection(contender.connection);
    await Promise.allSettled([holder.closed, contender?.connection.closed]);
  }
  const afterRace = receiptState(runtime, database);
  assert.equal(afterRace.allergyHeads - beforeRace.allergyHeads, 1);
  assert.equal(afterRace.allergyRevisions - beforeRace.allergyRevisions, 1);
  assert.equal(afterRace.receipts - beforeRace.receipts, 1);
  assert.equal(afterRace.obligations - beforeRace.obligations, 1);
  assert.equal(afterRace.completedFeatureIdempotency - beforeRace.completedFeatureIdempotency, 1);
  assert.equal(afterRace.auditAllergyEvents - beforeRace.auditAllergyEvents, 1);
  assert.equal(afterRace.outboxFeatureEvents - beforeRace.outboxFeatureEvents, 1);
  assert.equal(afterRace.receipts, afterRace.obligations);
  assert.equal(afterRace.receipts, afterRace.completedFeatureIdempotency);
  assert.equal(afterRace.badReceiptPointers, 0);
  const durableHistory = JSON.parse(sql(runtime, database,
    `SELECT json_build_object('revisions',count(*),'versions',array_agg(version ORDER BY version),'currentVersion',(SELECT current_version FROM clinical.allergy_heads WHERE id=${quote(retryInput.preparation.allergyId)}::uuid),'currentRevision',(SELECT current_revision_id FROM clinical.allergy_heads WHERE id=${quote(retryInput.preparation.allergyId)}::uuid),'receipts',(SELECT count(*) FROM clinical.mutation_receipts WHERE resource_id=${quote(retryInput.preparation.allergyId)}::uuid)) FROM clinical.allergies WHERE allergy_id=${quote(retryInput.preparation.allergyId)}::uuid;`,
  ).stdout.trim());
  assert.equal(durableHistory.revisions, 1);
  assert.deepEqual(durableHistory.versions, [1]);
  assert.equal(durableHistory.currentVersion, 1);
  assert.equal(durableHistory.receipts, 1);
  return {
    category: 'receipt-fault-atomicity',
    result: 'PASS',
    actualApiCall: { malformedEnvelope: fault, unfinalizedHolderDomain: unfinalizedDomain, retriedWinner: winner },
    barriers: [locks],
    assertions: [
      { id: 'receipt-fault-exact-22023', result: 'PASS', sqlstate: result.sqlstate, message: result.message },
      { id: 'receipt-fault-no-durable-effect', result: 'PASS', before, after },
      { id: 'receipt-fault-unfinalized-holder-waiter', result: 'PASS', holderSqlstate: finalizerFault.sqlstate, durableHistory, beforeRace, afterRace },
      { id: 'receipt-fault-exactly-one-all-five-commit', result: 'PASS', receipts: afterRace.receipts, obligations: afterRace.obligations, completed: afterRace.completedFeatureIdempotency },
    ],
    identities: { malformedApi: { user: 'shifaa_api', personId: person(1), role: 'PAT', command: fault.command }, holder: holderIdentity, contender: contender?.identity },
    commandEvidence: { malformedApi: fault.command, holder: holder.command, contender: contenderCommit?.command },
    outputs: { malformedApi: fault.output, holder: holderClose?.output, contender: contenderCommit?.output },
  };
}

function trustedHandoffVectors() {
  const path = resolve(root, feature, 'contracts/trusted-release-handoff-v1-vectors.json');
  return JSON.parse(readFileSync(path, 'utf8')).fullHandoffPositive;
}

function databaseNow(runtime, database) {
  return sql(runtime, database,
    `SELECT to_char(clock_timestamp() AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"');`,
  ).stdout.trim();
}

function buildDraftInput(runtime, database, {
  vectorId = 'HND-P01',
  releaseId = randomUUID(),
  artifactVersion,
  predecessorId,
  effectiveAt,
} = {}) {
  const vector = trustedHandoffVectors().find((item) => item.id === vectorId);
  assert.ok(vector, `Approved full handoff vector missing: ${vectorId}`);
  const handoff = structuredClone(vector.handoff);
  handoff.allocation.releaseId = releaseId;
  if (artifactVersion !== undefined) handoff.allocation.artifactVersion = artifactVersion;
  if (predecessorId) {
    handoff.artifactFacts.predecessor = { initial: false, supersedesReleaseId: predecessorId };
  }
  if (effectiveAt) handoff.artifactFacts.effectiveAt = effectiveAt;
  handoff.protectedBody.nonce = randomBytes(12).toString('hex');
  const facts = JSON.stringify(handoff.artifactFacts);
  const canonical = sql(runtime, database,
    `SELECT encode(audit.sha256_v1(clinical.f011_artifact_canonical_bytes_v1(${quote(facts)}::jsonb)),'hex');`,
  ).stdout.trim();
  handoff.declaredDigest = canonical;
  const verifiedAt = databaseNow(runtime, database);
  const materialBindings = Object.fromEntries(
    ['content', 'code', 'testVectors'].map((kind) => [
      kind,
      {
        contractId: bindingContract,
        profile: { content: 'content_material', code: 'code_material', testVectors: 'test_vector_material' }[kind],
        bindingId: randomUUID(),
        producerId: 'f011.evidence_port',
        verifiedAt,
        releaseId,
        artifactVersion: handoff.allocation.artifactVersion,
        evidenceRef: handoff.trustedEvidence[kind].reference,
        verifiedSha256: handoff.trustedEvidence[kind].verifiedSha256,
      },
    ]),
  );
  return { ...responseContext(), handoff, materialBindings };
}

function createReleaseExpression(input) {
  return `clinical.create_clinical_content_release_api_v1('synthetic',${jsonSql(input)})`;
}

async function createRelease(runtime, database, { input, actor = 5 } = {}) {
  const result = await callApi(runtime, database, actor, 'ADM-MEDICAL', 'createClinicalContentRelease', input, createReleaseExpression(input));
  const domain = assertSuccess(result.api, 'createClinicalContentRelease');
  assert.equal(domain.resourceVersion, 1);
  return { ...result, releaseId: input.handoff.allocation.releaseId, digest: input.handoff.declaredDigest, artifactVersion: input.handoff.allocation.artifactVersion };
}

function signingBasis(runtime, database, actor) {
  const query = sql(runtime, database,
    `SELECT json_build_object(
      'credential',json_build_object('id',c.id,'version',c.version,'person_id',c.person_id,'profession',c.profession,'status',c.status,'expires_on',c.expires_on,'issuer',c.issuer,'evidence_object_id',c.evidence_object_id,'reviewed_by_person_id',c.reviewed_by_person_id,'reviewed_at',CASE WHEN c.reviewed_at IS NULL THEN NULL ELSE to_char(c.reviewed_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') END),
      'designation',json_build_object('id',d.id,'version',d.version,'person_id',d.person_id,'professional_license_id',d.professional_license_id,'reviewer_capacity',d.reviewer_capacity,'evidence_ref',d.evidence_ref,'designated_by',d.designated_by,'status',d.status,'valid_from',to_char(d.valid_from AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),'valid_until',CASE WHEN d.valid_until IS NULL THEN NULL ELSE to_char(d.valid_until AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') END,'source_identity',d.source_identity,'source_evidence_identity',d.source_evidence_identity,'source_evidence_version',d.source_evidence_version,'source_evidence_sha256',CASE WHEN d.source_evidence_sha256 IS NULL THEN NULL ELSE encode(d.source_evidence_sha256,'hex') END,'evidence_producer_id',d.evidence_producer_id,'evidence_verified_at',to_char(d.evidence_verified_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"')),
      'authority',json_build_object('id',a.id,'version',a.version,'person_id',a.person_id,'action',a.action,'capacity',a.capacity,'content_type',a.content_type,'governed_content_key',a.governed_content_key,'effective_scope_key',a.effective_scope_key,'facility_id',a.facility_id,'issued_by',a.issued_by,'evidence_ref',a.evidence_ref,'status',a.status,'valid_from',to_char(a.valid_from AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),'valid_until',CASE WHEN a.valid_until IS NULL THEN NULL ELSE to_char(a.valid_until AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') END,'source_identity',a.source_identity,'source_evidence_identity',a.source_evidence_identity,'source_evidence_version',a.source_evidence_version,'source_evidence_sha256',CASE WHEN a.source_evidence_sha256 IS NULL THEN NULL ELSE encode(a.source_evidence_sha256,'hex') END,'evidence_producer_id',a.evidence_producer_id,'evidence_verified_at',to_char(a.evidence_verified_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"')))
     FROM identity.professional_licenses c
     JOIN clinical.content_reviewer_designations d ON d.professional_license_id=c.id AND d.person_id=c.person_id
     JOIN clinical.content_governance_authorities a ON a.person_id=c.person_id AND a.action='signClinicalContentRelease' AND a.capacity=d.reviewer_capacity AND a.content_type='synthetic' AND a.governed_content_key='neutral-series' AND a.effective_scope_key='synthetic-scope'
     WHERE c.person_id=${quote(person(actor))}::uuid;`,
  );
  const raw = JSON.parse(query.stdout.trim());
  assert.ok(raw?.credential && raw?.designation && raw?.authority, `Valid K06 signer basis missing for ${person(actor)}.`);
  const c = raw.credential, d = raw.designation, a = raw.authority;
  return {
    credentialBasis: {
      id: c.id, version: c.version, personId: c.person_id, profession: c.profession, status: c.status,
      expiresOn: c.expires_on, issuer: c.issuer, evidenceObjectId: c.evidence_object_id,
      reviewedByPersonId: c.reviewed_by_person_id, reviewedAt: c.reviewed_at,
    },
    designationBasis: {
      id: d.id, version: d.version, personId: d.person_id, professionalLicenseId: d.professional_license_id,
      capacity: d.reviewer_capacity, evidenceRef: d.evidence_ref, designatedBy: d.designated_by,
      status: d.status, validFrom: d.valid_from, validUntil: d.valid_until,
      sourceIdentity: d.source_identity, sourceEvidenceIdentity: d.source_evidence_identity,
      sourceEvidenceVersion: d.source_evidence_version, sourceEvidenceSha256: d.source_evidence_sha256,
      evidenceProducerId: d.evidence_producer_id, evidenceVerifiedAt: d.evidence_verified_at,
    },
    authorityBasis: {
      id: a.id, version: a.version, personId: a.person_id, action: a.action, capacity: a.capacity,
      contentType: a.content_type, governedContentKey: a.governed_content_key, effectiveScopeKey: a.effective_scope_key,
      facilityId: a.facility_id, issuedBy: a.issued_by, evidenceRef: a.evidence_ref, status: a.status,
      validFrom: a.valid_from, validUntil: a.valid_until, sourceIdentity: a.source_identity,
      sourceEvidenceIdentity: a.source_evidence_identity, sourceEvidenceVersion: a.source_evidence_version,
      sourceEvidenceSha256: a.source_evidence_sha256, evidenceProducerId: a.evidence_producer_id,
      evidenceVerifiedAt: a.evidence_verified_at,
    },
  };
}

function signingInput(runtime, database, release, actor) {
  const physician = actor === 2;
  return {
    ...responseContext(),
    signing: {
      contractId: bindingContract,
      profile: 'signing',
      bindingId: randomUUID(),
      producerId: 'f011.signing_port',
      verifiedAt: databaseNow(runtime, database),
      releaseId: release.releaseId,
      artifactVersion: release.artifactVersion,
      artifactDigest: release.digest,
      signerPersonId: person(actor),
      capacity: physician ? 'physician' : 'pharmacist',
      decision: 'approved',
      evidenceRef: randomUUID(),
      sourceIdentity: 'synthetic.signing',
      sourceEvidenceIdentity: randomUUID(),
      sourceEvidenceVersion: null,
      sourceEvidenceSha256: null,
      ...signingBasis(runtime, database, actor),
    },
  };
}

function signExpression(releaseId, version, input) {
  return `clinical.sign_clinical_content_release_api_v1(${quote(releaseId)}::uuid,${version},${jsonSql(input)})`;
}

async function signRelease(runtime, database, release, actor, version) {
  const role = actor === 2 ? 'CLN' : 'PHA';
  const input = signingInput(runtime, database, release, actor);
  const result = await callApi(runtime, database, actor, role, 'signClinicalContentRelease', input, signExpression(release.releaseId, version, input));
  const domain = assertSuccess(result.api, 'signClinicalContentRelease');
  return { ...result, domain, input, actor, version };
}

function admitRelease(runtime, database, release) {
  const approval = randomUUID();
  const admissionBinding = randomUUID();
  sql(runtime, database, `BEGIN;
    SELECT id FROM clinical.content_series WHERE id=(SELECT series_id FROM clinical.content_releases WHERE id=${quote(release.releaseId)}::uuid) FOR UPDATE;
    SELECT id FROM clinical.content_releases WHERE id=${quote(release.releaseId)}::uuid FOR UPDATE;
    INSERT INTO clinical.content_admissibility_evidence
      (id,release_id,artifact_version,artifact_digest,content_type,governed_content_key,effective_scope_key,policy_ref,policy_version,policy_sha256,source_admission_ref,category_admission_ref,code_admission_ref,test_vector_admission_ref,source_identity,source_evidence_identity,source_evidence_version,source_evidence_sha256,synthetic,status,valid_from,valid_until,version)
    VALUES(${quote(approval)}::uuid,${quote(release.releaseId)}::uuid,${release.artifactVersion},decode(${quote(release.digest)},'hex'),'synthetic','neutral-series','synthetic-scope',${quote(randomUUID())}::uuid,'synthetic-policy-k07',decode(repeat('b',64),'hex'),${quote(randomUUID())}::uuid,${quote(randomUUID())}::uuid,${quote(randomUUID())}::uuid,${quote(randomUUID())}::uuid,'synthetic.k07.admission',${quote(randomUUID())},NULL,NULL,true,'active','2020-01-01T00:00:00Z',NULL,1);
    INSERT INTO clinical.content_artifact_admissibility_bindings
      (binding_id,binding_contract_id,release_id,artifact_version,artifact_digest,approval_id,approval_version,content_type,governed_content_key,effective_scope_key,policy_ref,policy_version,policy_sha256,source_admission_ref,category_admission_ref,code_admission_ref,test_vector_admission_ref,source_identity,source_evidence_identity,source_evidence_version,source_evidence_sha256,producer_id,verified_at,synthetic,approval_status,approval_valid_from,approval_valid_until)
    SELECT ${quote(admissionBinding)}::uuid,${quote(bindingContract)},release_id,artifact_version,artifact_digest,id,version,content_type,governed_content_key,effective_scope_key,policy_ref,policy_version,policy_sha256,source_admission_ref,category_admission_ref,code_admission_ref,test_vector_admission_ref,source_identity,source_evidence_identity,source_evidence_version,source_evidence_sha256,'f011.governance_provisioner',${quote(databaseNow(runtime, database))}::timestamptz,synthetic,status,valid_from,valid_until FROM clinical.content_admissibility_evidence WHERE id=${quote(approval)}::uuid;
    COMMIT;`);
  return { approvalId: approval, bindingId: admissionBinding };
}

async function signAndAdmit(runtime, database, release, { raceIndependent = false } = {}) {
  let first, second;
  if (raceIndependent) {
    const doctorInput = signingInput(runtime, database, release, 2);
    const pharmacistInput = signingInput(runtime, database, release, 3);
    const race = await concurrentFeatureAction(runtime, database,
      { id: 'signature-independence-physician', context: contextSql(2, 'CLN', 'signClinicalContentRelease', doctorInput), expression: signExpression(release.releaseId, 1, doctorInput) },
      { id: 'signature-independence-pharmacist-stale-version', context: contextSql(3, 'PHA', 'signClinicalContentRelease', pharmacistInput), expression: signExpression(release.releaseId, 1, pharmacistInput) },
      { expectedSecondStates: ['40001'], expectedSecondMessage: /workflow version is stale|stale or terminal/i },
    );
    first = { ...race.first, domain: race.firstDomain, input: doctorInput };
    const retry = await signRelease(runtime, database, release, 3, 2);
    second = { ...race.second, expectedRetry: retry, domain: retry.domain };
    first.raceLocks = race.locks;
    first.retryCommands = retry.command;
    first.retryOutput = retry.output;
  } else {
    first = await signRelease(runtime, database, release, 2, 1);
    second = await signRelease(runtime, database, release, 3, 2);
  }
  const signatures = JSON.parse(sql(runtime, database,
    `SELECT json_build_object('count',count(*),'people',count(DISTINCT signer_person_id),'roles',array_agg(DISTINCT signer_role ORDER BY signer_role),'decisions',array_agg(decision ORDER BY signer_role)) FROM audit.signature_evidence WHERE resource_type='clinical.content_release' AND resource_id=${quote(release.releaseId)}::uuid;`,
  ).stdout.trim());
  assert.equal(signatures.count, 2);
  assert.equal(signatures.people, 2);
  assert.deepEqual(signatures.roles.sort(), ['pharmacist', 'physician']);
  const admission = admitRelease(runtime, database, release);
  return { signatures, first, second, admission };
}

function publishExpression(release, expectedWorkflowVersion, input) {
  return `clinical.publish_clinical_content_release_api_v1(${quote(release.releaseId)}::uuid,${expectedWorkflowVersion},${jsonSql(input)})`;
}

function publishInput(release) {
  return { ...responseContext(), artifactVersion: release.artifactVersion, artifactDigest: release.digest, confirmPublication: true };
}

async function publishRelease(runtime, database, release, expectedWorkflowVersion) {
  const input = publishInput(release);
  const result = await callApi(runtime, database, 6, 'ADM-MEDICAL', 'publishClinicalContentRelease', input, publishExpression(release, expectedWorkflowVersion, input));
  const domain = assertSuccess(result.api, 'publishClinicalContentRelease');
  return { ...result, domain, releaseId: release.releaseId, input };
}

async function contentLineageRaces(runtime, database, onPhase = () => {}) {
  onPhase('signature-independence');
  const rootA = await createRelease(runtime, database, {
    input: buildDraftInput(runtime, database, { vectorId: 'HND-P01', releaseId: '11111111-1111-4111-8111-111111111111', artifactVersion: 1 }),
  });
  const rootB = await createRelease(runtime, database, {
    input: buildDraftInput(runtime, database, { vectorId: 'HND-P01', releaseId: randomUUID(), artifactVersion: 1 }),
  });
  const rootASetup = await signAndAdmit(runtime, database, rootA, { raceIndependent: true });
  const rootBSetup = await signAndAdmit(runtime, database, rootB);
  const rootPublishInputA = publishInput(rootA);
  const rootPublishInputB = publishInput(rootB);
  onPhase('initial-published-root');
  const rootPublishRace = await concurrentFeatureAction(runtime, database,
    { id: 'initial-published-root-first', context: contextSql(6, 'ADM-MEDICAL', 'publishClinicalContentRelease', rootPublishInputA), expression: publishExpression(rootA, 3, rootPublishInputA) },
    { id: 'initial-published-root-competing', context: contextSql(6, 'ADM-MEDICAL', 'publishClinicalContentRelease', rootPublishInputB), expression: publishExpression(rootB, 3, rootPublishInputB) },
    { expectedSecondStates: ['23514', '40001'], expectedSecondMessage: /initial release is not the first published lineage|initial artifact allocation or lineage is stale|release is stale/i },
  );
  assert.equal(rootPublishRace.firstDomain.resourceVersion, 4);
  const rootState = JSON.parse(sql(runtime, database,
    `SELECT json_build_object('publishedRoots',(SELECT count(*) FROM clinical.content_releases WHERE is_initial AND status='published'),'rootAStatus',(SELECT status FROM clinical.content_releases WHERE id=${quote(rootA.releaseId)}::uuid),'rootBStatus',(SELECT status FROM clinical.content_releases WHERE id=${quote(rootB.releaseId)}::uuid),'publishedCount',(SELECT count(*) FROM clinical.content_releases WHERE status='published'));`,
  ).stdout.trim());
  assert.equal(rootState.publishedRoots, 1);
  assert.equal(rootState.rootAStatus, 'published');
  assert.equal(rootState.rootBStatus, 'draft');

  const childInputA = buildDraftInput(runtime, database, {
    vectorId: 'HND-P02', releaseId: randomUUID(), artifactVersion: 2, predecessorId: rootA.releaseId,
  });
  const childInputB = buildDraftInput(runtime, database, {
    vectorId: 'HND-P02', releaseId: randomUUID(), artifactVersion: 2, predecessorId: rootA.releaseId,
  });
  onPhase('release-allocation-version');
  const allocationRace = await concurrentFeatureSuccess(runtime, database,
    {
      id: 'same-predecessor-allocation-first',
      context: contextSql(5, 'ADM-MEDICAL', 'createClinicalContentRelease', childInputA),
      expression: createReleaseExpression(childInputA),
    },
    {
      id: 'same-predecessor-allocation-contender',
      context: contextSql(5, 'ADM-MEDICAL', 'createClinicalContentRelease', childInputB),
      expression: createReleaseExpression(childInputB),
    },
  );
  const childA = {
    api: allocationRace.first.result, command: allocationRace.first.committed.command,
    output: allocationRace.first.committed.output, domain: allocationRace.firstDomain,
    releaseId: childInputA.handoff.allocation.releaseId, digest: childInputA.handoff.declaredDigest,
    artifactVersion: childInputA.handoff.allocation.artifactVersion,
  };
  const childB = {
    api: allocationRace.second.result, command: allocationRace.second.committed.command,
    output: allocationRace.second.committed.output, domain: allocationRace.secondDomain,
    releaseId: childInputB.handoff.allocation.releaseId, digest: childInputB.handoff.declaredDigest,
    artifactVersion: childInputB.handoff.allocation.artifactVersion,
  };
  assert.equal(childA.artifactVersion, childB.artifactVersion);
  const childASetup = await signAndAdmit(runtime, database, childA);
  const childBSetup = await signAndAdmit(runtime, database, childB);
  const childPublishInputA = publishInput(childA);
  const childPublishInputB = publishInput(childB);
  onPhase('published-successor-lineage');
  const childPublishRace = await concurrentFeatureAction(runtime, database,
    { id: 'published-successor-lineage-first', context: contextSql(6, 'ADM-MEDICAL', 'publishClinicalContentRelease', childPublishInputA), expression: publishExpression(childA, 3, childPublishInputA) },
    { id: 'published-successor-lineage-competing', context: contextSql(6, 'ADM-MEDICAL', 'publishClinicalContentRelease', childPublishInputB), expression: publishExpression(childB, 3, childPublishInputB) },
    { expectedSecondStates: ['23514', '40001'], expectedSecondMessage: /successor does not replace|release is stale/i },
  );
  assert.equal(childPublishRace.firstDomain.resourceVersion, 4);
  const childState = JSON.parse(sql(runtime, database,
    `SELECT json_build_object('version2Drafts',(SELECT count(*) FROM clinical.content_releases WHERE artifact_version=2 AND supersedes_release_id=${quote(rootA.releaseId)}::uuid),'version2Published',(SELECT count(*) FROM clinical.content_releases WHERE artifact_version=2 AND supersedes_release_id=${quote(rootA.releaseId)}::uuid AND status='published'),'lineage',(SELECT json_agg(json_build_object('id',id,'version',artifact_version,'status',status,'predecessor',supersedes_release_id) ORDER BY id) FROM clinical.content_releases WHERE series_id=(SELECT series_id FROM clinical.content_releases WHERE id=${quote(rootA.releaseId)}::uuid) AND artifact_version IN (1,2)));`,
  ).stdout.trim());
  assert.equal(childState.version2Drafts, 2);
  assert.equal(childState.version2Published, 1);
  const selectedChild = childA.releaseId;

  const futureAt = sql(runtime, database,
    `SELECT to_char((clock_timestamp()+interval '30 seconds') AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"');`,
  ).stdout.trim();
  const future = await createRelease(runtime, database, {
    input: buildDraftInput(runtime, database, { vectorId: 'HND-P02', releaseId: randomUUID(), artifactVersion: 3, predecessorId: selectedChild, effectiveAt: futureAt }),
  });
  const futureSetup = await signAndAdmit(runtime, database, future);
  const futurePublication = await publishRelease(runtime, database, future, 3);
  assert.equal(futurePublication.domain.resourceVersion, 4);
  const grandchild = await createRelease(runtime, database, {
    input: buildDraftInput(runtime, database, { vectorId: 'HND-P02', releaseId: randomUUID(), artifactVersion: 4, predecessorId: future.releaseId }),
  });
  const grandchildSetup = await signAndAdmit(runtime, database, grandchild);
  onPhase('effective-time-after-wait');
  // Owner-only orchestration holds the series lock; the contender remains shifaa_api.
  const seriesLock = session(runtime, database, `${database}_holder`, runtime.user);
  const lockIdentity = await identify(seriesLock, runtime.user, { idleTransactionTimeout: '90s' });
  seriesLock.send(`BEGIN; SELECT id FROM clinical.content_series WHERE content_type='synthetic' AND governed_content_key='neutral-series' AND effective_scope_key='synthetic-scope' FOR UPDATE; SELECT 'K07_EFFECTIVE_SERIES_HELD';`);
  await marker(seriesLock, 'K07_EFFECTIVE_SERIES_HELD');
  const grandchildPublishInput = publishInput(grandchild);
  const pending = await startActionSession(runtime, database, 'contender', contextSql(6, 'ADM-MEDICAL', 'publishClinicalContentRelease', grandchildPublishInput), publishExpression(grandchild, 3, grandchildPublishInput), { markerTag: 'K07_EFFECTIVE_PUBLISH_DONE', statementTimeout: '70s', lockTimeout: '65s' });
  let locks;
  try {
    locks = await proveWait(runtime, database, lockIdentity.pid, pending.identity.pid);
    const deadline = Date.now() + 55000;
    let observedAt;
    while (Date.now() < deadline) {
      const now = sql(runtime, database,
        `WITH clock AS (SELECT clock_timestamp() AS observed) SELECT json_build_object('crossed',observed>=${quote(futureAt)}::timestamptz,'observedAt',to_char(observed AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"')) FROM clock;`,
      ).stdout.trim();
      const clock = JSON.parse(now);
      if (clock.crossed) { observedAt = clock.observedAt; break; }
      await pause();
    }
    assert.ok(observedAt, `database clock never crossed approved effectiveAt ${futureAt}`);
    const holderCommit = await finishSession(seriesLock, 'K07_EFFECTIVE_SERIES_RELEASED');
    await marker(pending.connection, 'K07_EFFECTIVE_PUBLISH_DONE');
    const waitedResult = actionResult(pending.connection);
    const waitedDomain = assertSuccess(waitedResult, 'publication after predecessor effectiveAt');
    const contenderCommit = await finishSession(pending.connection, 'K07_EFFECTIVE_PUBLISH_COMMITTED');
    assert.equal(waitedDomain.resourceVersion, 4);
    const publishedLineage = JSON.parse(sql(runtime, database,
      `SELECT json_agg(json_build_object('id',id,'version',artifact_version,'status',status,'effectiveAt',to_char(effective_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),'predecessor',supersedes_release_id) ORDER BY artifact_version) FROM clinical.content_releases WHERE series_id=(SELECT series_id FROM clinical.content_releases WHERE id=${quote(rootA.releaseId)}::uuid) AND status='published';`,
    ).stdout.trim());
    assert.equal(publishedLineage.length, 4);
    assert.equal(publishedLineage.find((item) => item.id === future.releaseId).effectiveAt, futureAt);
    const durable = receiptState(runtime, database);
    assert.equal(durable.receipts, durable.obligations);
    assert.equal(durable.receipts, durable.completedFeatureIdempotency);
    assert.equal(durable.badReceiptPointers, 0);
    const signatureCount = durable.signatureEvidence;
    assert.ok(signatureCount >= 8, 'Distinct reviewer signatures must remain durable across lineage races.');
    return {
      categories: [
        {
          category: 'signature-independence', result: 'PASS',
          actualApiCalls: [rootASetup.first, rootASetup.second], barriers: [rootASetup.first.raceLocks],
          assertions: [
            { id: 'signature-independent-concurrent-cas', result: 'PASS', expectedSqlstate: '40001', retryCommand: rootASetup.first.retryCommands },
            { id: 'signature-independent-distinct-signers', result: 'PASS', signatures: rootASetup.signatures },
          ],
          outputs: { retry: rootASetup.first.retryOutput },
        },
        {
          category: 'initial-published-root', result: 'PASS',
          actualApiCalls: [rootPublishRace.first, rootPublishRace.second], barriers: [rootPublishRace.locks],
          assertions: [
            { id: 'initial-root-one-published-winner', result: 'PASS', rootState },
            { id: 'initial-root-contender-stale', result: 'PASS', sqlstate: rootPublishRace.expectedContendedFailure.sqlstate },
          ], identities: [rootPublishRace.first.identity, rootPublishRace.second.identity],
          commandEvidence: { holder: rootPublishRace.first.committed.command, contender: rootPublishRace.second.committed.command },
          outputs: { holder: rootPublishRace.first.committed.output, contender: rootPublishRace.second.committed.output },
        },
        {
          category: 'release-allocation-version', result: 'PASS',
          actualApiCalls: [allocationRace.first, allocationRace.second],
          barriers: [allocationRace.locks], identities: [allocationRace.first.identity, allocationRace.second.identity],
          commandEvidence: { first: allocationRace.first.committed.command, second: allocationRace.second.committed.command },
          outputs: { first: allocationRace.first.committed.output, second: allocationRace.second.committed.output },
          assertions: [{ id: 'two-valid-same-version-successor-allocations', result: 'PASS', releaseIds: [childA.releaseId, childB.releaseId], artifactVersion: 2, predecessorId: rootA.releaseId, durableDrafts: childState.version2Drafts, sameVersionCandidatesBothCommitted: true }],
        },
        {
          category: 'published-successor-lineage', result: 'PASS',
          actualApiCalls: [childPublishRace.first, childPublishRace.second], barriers: [childPublishRace.locks],
          assertions: [
            { id: 'successor-one-current-child', result: 'PASS', childState, winner: childA.releaseId },
            { id: 'successor-contender-not-published', result: 'PASS', sqlstate: childPublishRace.expectedContendedFailure.sqlstate },
          ], identities: [childPublishRace.first.identity, childPublishRace.second.identity],
          commandEvidence: { holder: childPublishRace.first.committed.command, contender: childPublishRace.second.committed.command },
          outputs: { holder: childPublishRace.first.committed.output, contender: childPublishRace.second.committed.output },
        },
        {
          category: 'effective-time-after-wait', result: 'PASS',
          actualApiCalls: [futurePublication, waitedResult], barriers: [locks],
          assertions: [
            { id: 'future-predecessor-published-structurally', result: 'PASS', effectiveAt: futureAt, publishResult: futurePublication.api },
            { id: 'publication-resumed-after-database-clock-threshold', result: 'PASS', effectiveAt: futureAt, databaseClockObservedAt: observedAt, waiterPid: pending.identity.pid, waitedDomain },
            { id: 'effective-lineage-immutable-publication-history', result: 'PASS', publishedLineage },
          ], identities: [lockIdentity, pending.identity],
          commandEvidence: { holder: holderCommit.command, contender: contenderCommit.command },
          outputs: { holder: holderCommit.output, contender: contenderCommit.output },
        },
      ],
      assertions: [
        { id: 'content-lineage-all-five-receipts', result: 'PASS', durable },
        { id: 'content-lineage-signatures-remain-immutable', result: 'PASS', signatureCount },
      ],
      fixtures: { canonicalVectorFile: `${feature}/contracts/trusted-release-handoff-v1-vectors.json`, rootA: rootA.releaseId, rootB: rootB.releaseId, childA: childA.releaseId, childB: childB.releaseId, future: future.releaseId, grandchild: grandchild.releaseId },
      setup: { rootASetup, rootBSetup, allocationRace, childASetup, childBSetup, futureSetup, grandchildSetup },
    };
  } finally {
    closeConnection(seriesLock);
    closeConnection(pending.connection);
    await Promise.allSettled([seriesLock.closed, pending.connection.closed]);
  }
}

function seedContinuityWriter(runtime, database) {
  const fixture = prepareFeature010(runtime, database, { continuity: true });
  return { ...fixture, writer: 'platform.decide_dependent_transition(uuid,integer,text,text,text)', relationshipId: f010Relationship };
}

function continuityWriterSql(database) {
  return `SET LOCAL statement_timeout='60s';
    SELECT set_config('shifaa.environment','ci',true),set_config('shifaa.test_now','2030-04-05T08:00:00Z',true),set_config('shifaa.aal','2',true);
    SELECT set_config('shifaa.person_id','f0110000-0000-4000-8000-000000000008',true),set_config('shifaa.actor_role','ADM-SUPPORT',true),set_config('shifaa.action','transitionDependent',true),set_config('shifaa.purposes','guardianship_review',true),set_config('shifaa.factor_amr_at','2030-04-05T07:59:00Z',true);
    SELECT platform.decide_dependent_transition(${quote(f010Relationship)}::uuid,1,'approve','synthetic.k07.transition',NULL);
    SELECT 'K07_ACTUAL_WRITER_DONE';`;
}

function encounterWriterSql() {
  return `SET LOCAL statement_timeout='60s';
    SELECT set_config('shifaa.environment','ci',true),set_config('shifaa.test_now','2030-04-05T08:00:00Z',true),set_config('shifaa.aal','2',true);
    SELECT set_config('shifaa.person_id',${quote(f010Person(1))},true),set_config('shifaa.actor_role','CLN',true),set_config('shifaa.action','completeEncounter',true),set_config('shifaa.purposes','appointment.scheduling',true),set_config('shifaa.request_id',${quote(randomUUID())},true),set_config('shifaa.trace_id','f011-k07-actual-encounter-writer',true),set_config('shifaa.idempotency_key',${quote(randomUUID())},true),set_config('shifaa.request_hash',${quote(createHash('sha256').update(randomUUID()).digest('hex'))},true);
    SELECT clinical.complete_encounter_api_v1(${quote(f010Encounter)}::uuid,1,'{"summary":"Synthetic K07 actual predecessor writer","structuralConfirmation":true}'::jsonb);
    SELECT 'K07_ACTUAL_WRITER_DONE';`;
}

async function startSqlWriter(runtime, database, statement, label) {
  const connection = session(runtime, database, `${database}_${label}`);
  const identity = await identify(connection);
  connection.send(`BEGIN; ${statement}`);
  return { connection, identity };
}

async function waitMarker(connection, tag, milliseconds = 30000) {
  const deadline = Date.now() + milliseconds;
  while (Date.now() < deadline) {
    if (connection.output.split(/\r?\n/).includes(tag)) return;
    if (connection.ended) throw new Error(`${connection.label} exited before ${tag}: ${connection.output}`);
    await pause();
  }
  throw new Error(`${connection.label}: bounded writer barrier timeout ${tag}`);
}

async function startAuthorityRevoker(runtime, database, authorityId, label) {
  const connection = session(runtime, database, `${database}_${label}`, runtime.user);
  const identity = await identify(connection, runtime.user);
  connection.send(`BEGIN;
    SET LOCAL statement_timeout='60s';
    SET LOCAL lock_timeout='55s';
    SELECT id FROM clinical.content_governance_authorities WHERE id=${quote(authorityId)}::uuid FOR UPDATE;
    UPDATE clinical.content_governance_authorities
      SET status='revoked',version=version+1,updated_at=clock_timestamp()
      WHERE id=${quote(authorityId)}::uuid
      RETURNING json_build_object('id',id,'status',status,'version',version);
    SELECT 'K07_AUTHORITY_REVOKED_READY';`);
  return { connection, identity, authorityId, transport: 'runtime database-owner connection performing versioned offline authority revocation; no API/native-auth claim' };
}

function signatureHistory(runtime, database, releaseId) {
  const result = sql(runtime, database, `SELECT json_build_object(
    'count',count(*),'ids',array_agg(signature.id ORDER BY signature.id),
    'signers',array_agg(signature.signer_person_id ORDER BY signature.signer_person_id),
    'roles',array_agg(signature.signer_role ORDER BY signature.signer_role),
    'resourceVersions',array_agg(signature.resource_version ORDER BY signature.id),
    'digests',array_agg(encode(signature.artifact_digest,'hex') ORDER BY signature.id),
    'bindings',(SELECT array_agg(binding.binding_id ORDER BY binding.binding_id)
      FROM clinical.content_signature_bindings binding JOIN audit.signature_evidence s
        ON s.id=binding.signature_evidence_id
      WHERE s.resource_type='clinical.content_release' AND s.resource_id=${quote(releaseId)}::uuid))
    FROM audit.signature_evidence signature
    WHERE signature.resource_type='clinical.content_release' AND signature.resource_id=${quote(releaseId)}::uuid;`);
  return JSON.parse(result.stdout.trim());
}

async function actualCurrentAuthorityRace(runtime, database, schedule) {
  const release = await createRelease(runtime, database, {
    input: buildDraftInput(runtime, database, { vectorId: 'HND-P01', releaseId: randomUUID(), artifactVersion: 1 }),
  });
  const signatureSetup = await signAndAdmit(runtime, database, release);
  const authorityId = signatureSetup.first.input.signing.authorityBasis.id;
  assert.ok(authorityId, 'Current signer authority ID must be read from the approved K06 setup basis.');
  const publishInputValue = publishInput(release);
  const publishContext = contextSql(6, 'ADM-MEDICAL', 'publishClinicalContentRelease', publishInputValue);
  const publishCall = publishExpression(release, 3, publishInputValue);
  const before = receiptState(runtime, database);
  const signaturesBefore = signatureHistory(runtime, database, release.releaseId);
  assert.equal(signaturesBefore.count, 2);
  let action, writer, locks, actionCommit, writerCommit, actionValue;
  try {
    if (schedule === 'action-first') {
      action = await startActionSession(runtime, database, 'holder', publishContext, publishCall, {
        markerTag: 'K07_AUTHORITY_PUBLISH_READY',
      });
      await marker(action.connection, 'K07_AUTHORITY_PUBLISH_READY');
      actionValue = assertSuccess(actionResult(action.connection), 'publish before signer-authority revocation');
      writer = await startAuthorityRevoker(runtime, database, authorityId, 'contender');
      locks = await proveWait(runtime, database, action.identity.pid, writer.identity.pid).catch((error) => { throw writer.error?.() ?? error; });
      actionCommit = await finishSession(action.connection, 'K07_AUTHORITY_PUBLISH_COMMITTED');
      await marker(writer.connection, 'K07_AUTHORITY_REVOKED_READY');
      writerCommit = await finishSession(writer.connection, 'K07_AUTHORITY_REVOKER_COMMITTED');
    } else {
      writer = await startAuthorityRevoker(runtime, database, authorityId, 'holder');
      await marker(writer.connection, 'K07_AUTHORITY_REVOKED_READY');
      action = await startActionSession(runtime, database, 'contender', publishContext, publishCall, {
        markerTag: 'K07_AUTHORITY_PUBLISH_DONE',
      });
      locks = await proveWait(runtime, database, writer.identity.pid, action.identity.pid);
      writerCommit = await finishSession(writer.connection, 'K07_AUTHORITY_REVOKER_COMMITTED');
      await marker(action.connection, 'K07_AUTHORITY_PUBLISH_DONE');
      actionValue = assertFailure(actionResult(action.connection), ['42501'], /release is stale, ineligible, or not independently publishable/i,
        'publication after current signer-authority revocation');
      actionCommit = await finishSession(action.connection, 'K07_AUTHORITY_PUBLISH_COMMITTED');
    }
    const durable = JSON.parse(sql(runtime, database, `SELECT json_build_object(
      'releaseStatus',(SELECT status FROM clinical.content_releases WHERE id=${quote(release.releaseId)}::uuid),
      'releaseVersion',(SELECT workflow_version FROM clinical.content_releases WHERE id=${quote(release.releaseId)}::uuid),
      'authority',(SELECT json_build_object('status',status,'version',version) FROM clinical.content_governance_authorities WHERE id=${quote(authorityId)}::uuid),
      'currentEligibility',clinical.f011_release_current_eligibility_v1(${quote(release.releaseId)}::uuid));`).stdout.trim());
    assert.equal(durable.authority.status, 'revoked');
    assert.equal(durable.authority.version, 2);
    assert.equal(durable.releaseStatus, schedule === 'action-first' ? 'published' : 'draft');
    assert.equal(durable.releaseVersion, schedule === 'action-first' ? 4 : 3);
    assert.equal(durable.currentEligibility, false);
    const signaturesAfter = signatureHistory(runtime, database, release.releaseId);
    assert.deepEqual(signaturesAfter, signaturesBefore, 'Signer revocation must not rewrite immutable signature history.');
    const after = receiptState(runtime, database);
    assert.equal(after.receipts - before.receipts, schedule === 'action-first' ? 1 : 0);
    assert.equal(after.receipts, after.obligations);
    assert.equal(after.receipts, after.completedFeatureIdempotency);
    assert.equal(after.badReceiptPointers, 0);
    return {
      category: 'current-authority-revoke-first-action-first', result: 'PASS', schedule,
      actualApiCall: { result: actionValue, command: actionCommit.command, output: actionCommit.output, context: { action: 'publishClinicalContentRelease', actorPersonId: person(6), requestId: publishInputValue.responseRequestId } },
      actualAuthorityWriter: { source: 'versioned offline revocation of the exact signer content_governance_authorities row', authorityId, identity: writer.identity, transport: writer.transport, result: writerCommit },
      identities: { featureApi: action.identity, authorityWriter: writer.identity },
      barriers: [locks], durable: { before, after, publication: durable, signaturesBefore, signaturesAfter },
      commandEvidence: { featureApi: actionCommit.command, authorityWriter: writerCommit.command },
      assertions: [
        { id: 'current-signer-authority-linearization', schedule, result: 'PASS', expectedPublication: schedule === 'action-first' ? 'published' : 'draft', sqlstate: actionValue.outcome === 'error' ? actionValue.sqlstate : null },
        { id: 'immutable-signature-history-after-revocation', result: 'PASS', signaturesBefore, signaturesAfter },
        { id: 'authority-race-all-five-receipt-atomicity', result: 'PASS', receiptDelta: after.receipts - before.receipts, receipts: after.receipts, obligations: after.obligations },
      ],
      setup: { release, signatureSetup, authorityId },
    };
  } finally {
    if (action) closeConnection(action.connection);
    if (writer) closeConnection(writer.connection);
    await Promise.allSettled([action?.connection.closed, writer?.connection.closed]);
  }
}

async function actualContinuityRace(runtime, database, schedule) {
  const fixture = seedContinuityWriter(runtime, database);
  const input = responseContext();
  const listContext = contextSql(4, 'GUA', 'listAllergies', input, {
    personId: f010Person(4), patientId: f010Patient,
    environment: 'ci', testNow: '2030-04-05T08:00:00Z', purposes: 'appointment.scheduling',
  });
  const readExpression = `clinical.list_allergies_api_v1(${quote(f010Patient)}::uuid,'{}'::jsonb)`;
  const before = receiptState(runtime, database);
  const writerStatement = continuityWriterSql(database);
  let reader, writer, locks, writerCommit, readerCommit, readResult;
  try {
    if (schedule === 'action-first') {
      reader = await startActionSession(runtime, database, 'holder', listContext, readExpression, {
        finalize: false, markerTag: 'K07_GUA_READ_READY',
      });
      await marker(reader.connection, 'K07_GUA_READ_READY');
      readResult = assertSuccess(actionResult(reader.connection), 'authorized F010 guardian allergy read');
      writer = await startSqlWriter(runtime, database, writerStatement, 'contender');
      locks = await proveWait(runtime, database, reader.identity.pid, writer.identity.pid);
      readerCommit = await finishSession(reader.connection, 'K07_GUA_READ_COMMITTED');
      await waitMarker(writer.connection, 'K07_ACTUAL_WRITER_DONE');
      writerCommit = await finishSession(writer.connection, 'K07_GUA_WRITER_COMMITTED');
    } else {
      writer = await startSqlWriter(runtime, database, writerStatement, 'holder');
      await waitMarker(writer.connection, 'K07_ACTUAL_WRITER_DONE');
      reader = await startActionSession(runtime, database, 'contender', listContext, readExpression, {
        finalize: false, markerTag: 'K07_GUA_READ_DONE',
      });
      locks = await proveWait(runtime, database, writer.identity.pid, reader.identity.pid);
      writerCommit = await finishSession(writer.connection, 'K07_GUA_WRITER_COMMITTED');
      await marker(reader.connection, 'K07_GUA_READ_DONE');
      readResult = assertFailure(actionResult(reader.connection), ['42501'], /allergy authority denied/i,
        'guardian allergy read after actual relationship revocation');
      readerCommit = await finishSession(reader.connection, 'K07_GUA_READ_COMMITTED');
    }
    const relationship = JSON.parse(sql(runtime, database,
      `SELECT json_build_object('status',status,'version',version,'reviewer',reviewed_by_person_id,'reviewedAt',reviewed_at) FROM identity.care_relationships WHERE id=${quote(f010Relationship)}::uuid;`,
    ).stdout.trim());
    assert.equal(relationship.status, 'revoked');
    const after = receiptState(runtime, database);
    assert.deepEqual(
      { receipts: after.receipts, obligations: after.obligations, completed: after.completedFeatureIdempotency, allergyEvents: after.auditAllergyEvents, releaseEvents: after.auditReleaseEvents, featureOutbox: after.outboxFeatureEvents },
      { receipts: before.receipts, obligations: before.obligations, completed: before.completedFeatureIdempotency, allergyEvents: before.auditAllergyEvents, releaseEvents: before.auditReleaseEvents, featureOutbox: before.outboxFeatureEvents },
      'Continuity reader must never produce a mutation receipt or Feature 011 write.',
    );
    return {
      category: 'actual-continuity-writer', result: 'PASS', schedule,
      actualApiCall: readResult, actualWriter: { source: fixture.writer, relationshipId: f010Relationship, result: 'approve guardian transition to revoked' },
      identities: { featureApi: reader.identity, predecessorWriter: writer.identity },
      barriers: [locks], durable: { relationship, before, after },
      commandEvidence: { reader: readerCommit.command, writer: writerCommit.command },
      outputs: { reader: readerCommit.output, writer: writerCommit.output },
      fixture, feature011Mutation: false,
    };
  } finally {
    if (reader) closeConnection(reader.connection);
    if (writer) closeConnection(writer.connection);
    await Promise.allSettled([reader?.connection.closed, writer?.connection.closed]);
  }
}

async function actualEncounterRace(runtime, database, schedule) {
  const feature010 = prepareFeature010(runtime, database);
  const scope = seedF010ClinicianScope(runtime, database);
  const mutation = await prepareF010Allergy(runtime, database);
  const before = receiptState(runtime, database);
  let action, writer, locks, writerCommit, actionCommit, actionValue;
  try {
    if (schedule === 'action-first') {
      // In action-first, the API connection owns the encounter SHARE lock before the actual F010 writer starts.
      action = await startActionSession(runtime, database, 'holder', mutation.context, mutation.expression, {
        markerTag: 'K07_F010_VERIFY_READY',
      });
      await marker(action.connection, 'K07_F010_VERIFY_READY');
      actionValue = assertSuccess(actionResult(action.connection), 'Feature 011 verification before F010 completion');
      writer = await startSqlWriter(runtime, database, encounterWriterSql(), 'contender');
      locks = await proveWait(runtime, database, action.identity.pid, writer.identity.pid).catch((error) => { throw writer.error?.() ?? error; });
      actionCommit = await finishSession(action.connection, 'K07_F010_VERIFY_COMMITTED');
      await waitMarker(writer.connection, 'K07_ACTUAL_WRITER_DONE');
      writerCommit = await finishSession(writer.connection, 'K07_F010_WRITER_COMMITTED');
      const state = JSON.parse(sql(runtime, database,
        `SELECT json_build_object('encounterStatus',e.status,'encounterVersion',e.version,'appointmentStatus',a.status,'queueStatus',q.state) FROM clinical.encounters e JOIN clinical.appointments a ON a.id=e.appointment_id JOIN clinical.queue_entries q ON q.appointment_id=a.id WHERE e.id=${quote(f010Encounter)}::uuid;`,
      ).stdout.trim());
      assert.equal(state.encounterStatus, 'completed');
      assert.equal(state.appointmentStatus, 'completed');
      assert.equal(state.queueStatus, 'completed');
      const after = receiptState(runtime, database);
      assert.equal(after.receipts - before.receipts, 1);
      assert.equal(after.receipts, after.obligations);
      assert.equal(after.receipts, after.completedFeatureIdempotency);
      assert.equal(after.badReceiptPointers, 0);
      return {
        category: 'actual-encounter-writer', result: 'PASS', schedule,
        actualApiCall: { creation: mutation.create, verification: actionValue },
        actualWriter: { source: 'clinical.complete_encounter_api_v1(uuid,integer,jsonb)', result: 'complete encounter' },
        identities: { featureApi: action.identity, predecessorWriter: writer.identity },
        barriers: [locks], durable: { state, before, after },
        commandEvidence: { featureApi: actionCommit.command, predecessorWriter: writerCommit.command },
        outputs: { featureApi: actionCommit.output, predecessorWriter: writerCommit.output },
        fixture: { feature010, scope, patientId: f010Patient, encounterId: f010Encounter },
      };
    }
    writer = await startSqlWriter(runtime, database, encounterWriterSql(), 'holder');
    await waitMarker(writer.connection, 'K07_ACTUAL_WRITER_DONE');
    action = await startActionSession(runtime, database, 'contender', mutation.context, mutation.expression, {
      markerTag: 'K07_F010_VERIFY_DONE',
    });
    locks = await proveWait(runtime, database, writer.identity.pid, action.identity.pid);
    writerCommit = await finishSession(writer.connection, 'K07_F010_WRITER_COMMITTED');
    await marker(action.connection, 'K07_F010_VERIFY_DONE');
    actionValue = assertSuccess(actionResult(action.connection), 'Feature 011 verification after actual F010 completion');
    actionCommit = await finishSession(action.connection, 'K07_F010_VERIFY_COMMITTED');
    const state = JSON.parse(sql(runtime, database,
      `SELECT json_build_object('encounterStatus',e.status,'encounterVersion',e.version,'appointmentStatus',a.status,'queueStatus',q.state) FROM clinical.encounters e JOIN clinical.appointments a ON a.id=e.appointment_id JOIN clinical.queue_entries q ON q.appointment_id=a.id WHERE e.id=${quote(f010Encounter)}::uuid;`,
    ).stdout.trim());
    assert.equal(state.encounterStatus, 'completed');
    assert.equal(state.appointmentStatus, 'completed');
    assert.equal(state.queueStatus, 'completed');
    const after = receiptState(runtime, database);
    assert.equal(after.receipts - before.receipts, 1);
    assert.equal(after.receipts, after.obligations);
    assert.equal(after.receipts, after.completedFeatureIdempotency);
    assert.equal(after.badReceiptPointers, 0);
    return {
      category: 'actual-encounter-writer', result: 'PASS', schedule,
      actualApiCall: { creation: mutation.create, verification: actionValue },
      actualWriter: { source: 'clinical.complete_encounter_api_v1(uuid,integer,jsonb)', result: 'complete encounter' },
      identities: { featureApi: action.identity, predecessorWriter: writer.identity },
      barriers: [locks], durable: { state, before, after },
      commandEvidence: { featureApi: actionCommit.command, predecessorWriter: writerCommit.command },
      outputs: { featureApi: actionCommit.output, predecessorWriter: writerCommit.output },
      fixture: { feature010, scope, patientId: f010Patient, encounterId: f010Encounter },
    };
  } finally {
    if (action) closeConnection(action.connection);
    if (writer) closeConnection(writer.connection);
    await Promise.allSettled([action?.connection.closed, writer?.connection.closed]);
  }
}

async function startFacilityServiceWriter(runtime, database, schedule) {
  const { tsImport } = await import(
    pathToFileURL(resolve(root, 'services/api/node_modules/tsx/dist/esm/api/index.mjs')).href,
  );
  const { PostgresIdentityRepository } = await tsImport(
    pathToFileURL(resolve(root, 'services/api/src/adapters/postgres/identity-repository.ts')).href,
    import.meta.url,
  );
  const { PostgresFacilityOnboardingService } = await tsImport(
    pathToFileURL(resolve(root, 'services/api/src/adapters/postgres/facility-service.ts')).href,
    import.meta.url,
  );
  const port = runtime === runtimes[0] ? 5432 : 54322;
  const repository = new PostgresIdentityRepository(
    `postgres://shifaa_api:synthetic_api_only@127.0.0.1:${port}/${database}`,
  );
  const membership = JSON.parse(sql(runtime, database,
    `SELECT json_build_object('id',id,'version',version) FROM identity.facility_memberships WHERE facility_id=${quote(facility)}::uuid AND person_id=${quote(person(2))}::uuid AND membership_status='active';`,
  ).stdout.trim());
  assert.ok(membership?.id, 'Feature 011 doctor membership must be current before facility writer starts.');
  const service = new PostgresFacilityOnboardingService(
    repository, new Uint8Array(32).fill(17), new Uint8Array(32).fill(23),
  );
  let releaseTransaction, writerIdentity, writerResult, held = false, writerError;
  const release = new Promise((done) => { releaseTransaction = done; });
  const writerPromise = repository.withRawTransaction(async (tx) => {
    await tx`SET statement_timeout='60s'`;
    await tx`select set_config('application_name',${`${database}_${schedule === 'action-first' ? 'contender' : 'holder'}`},false)`;
    [writerIdentity] = await tx`SELECT pg_backend_pid() AS pid,current_user AS "user",current_database() AS database,current_setting('application_name') AS "applicationName"`;
    writerResult = await service.endMembership(
      { personId: person(2), principal: 'synthetic-k07', adminRole: 'facility_approver', aal: 2, purpose: 'professional_license_review', requestId: randomUUID() },
      facility, membership.id, { reason: 'synthetic.k07.revoke' }, membership.version,
    );
    held = true;
    await release;
  });
  writerPromise.catch((error) => { writerError = error; });
  const deadline = Date.now() + 30000;
  while (!writerIdentity && !writerError && Date.now() < deadline) await pause();
  if (writerError) {
    releaseTransaction();
    await Promise.allSettled([writerPromise, repository.close()]);
    throw writerError;
  }
  assert.ok(writerIdentity, 'Actual facility service backend did not start.');
  return {
    identity: writerIdentity,
    membership,
    result: () => writerResult,
    source: 'PostgresFacilityOnboardingService.endMembership',
    sourceSha256: digest('services/api/src/adapters/postgres/facility-service.ts'),
    held: () => held,
    error: () => writerError,
    async waitHeld() {
      const until = Date.now() + 30000;
      while (!held && !writerError && Date.now() < until) await pause();
      if (writerError) throw writerError;
      assert.ok(held, 'Actual facility service did not reach the uncommitted membership update barrier.');
    },
    async commit() {
      releaseTransaction();
      await writerPromise;
    },
    async close() {
      releaseTransaction();
      await Promise.allSettled([writerPromise, repository.close()]);
    },
  };
}

async function actualFacilityRace(runtime, database, schedule) {
  const create = createAllergyInput();
  const createResult = await callApi(runtime, database, 1, 'PAT', 'createAllergy', create,
    createAllergyExpression(create));
  assertSuccess(createResult.api, 'Feature 011 patient allergy creation for facility writer race');
  const allergyId = create.preparation.allergyId;
  const previousRevisionId = create.preparation.revisionId;
  const evidenceRef = addVerificationSupport(runtime, database, { allergyId, previousRevisionId, targetStatus: 'clinician_confirmed' });
  const input = verificationInput({ allergyId, previousRevisionId, evidenceRef });
  const context = contextSql(2, 'CLN', 'verifyAllergy', input, { environment: 'ci', purposes: 'appointment.scheduling' });
  const expression = verifyExpression(input, allergyId);
  const before = receiptState(runtime, database);
  let action, writer, locks, writerCommit, actionCommit, actionValue;
  try {
    if (schedule === 'action-first') {
      action = await startActionSession(runtime, database, 'holder', context, expression, { markerTag: 'K07_FACILITY_VERIFY_READY' });
      await marker(action.connection, 'K07_FACILITY_VERIFY_READY');
      actionValue = assertSuccess(actionResult(action.connection), 'Feature 011 verification before actual facility membership revocation');
      writer = await startFacilityServiceWriter(runtime, database, schedule);
      locks = await proveWait(runtime, database, action.identity.pid, writer.identity.pid).catch((error) => { throw writer.error?.() ?? error; });
      actionCommit = await finishSession(action.connection, 'K07_FACILITY_VERIFY_COMMITTED');
      await writer.waitHeld();
      await writer.commit();
      const closed = await sql(runtime, database,
        `SELECT membership_status FROM identity.facility_memberships WHERE id=${quote(writer.membership.id)}::uuid;`);
      assert.equal(closed.stdout.trim(), 'ended');
      writerCommit = { result: writer.result(), transaction: 'COMMITTED', membershipStatus: closed.stdout.trim(), identity: writer.identity, sourceSha256: writer.sourceSha256 };
    } else {
      writer = await startFacilityServiceWriter(runtime, database, schedule);
      await writer.waitHeld();
      action = await startActionSession(runtime, database, 'contender', context, expression, { markerTag: 'K07_FACILITY_VERIFY_DONE' });
      locks = await proveWait(runtime, database, writer.identity.pid, action.identity.pid);
      await writer.commit();
      writerCommit = { result: writer.result(), transaction: 'COMMITTED', identity: writer.identity, sourceSha256: writer.sourceSha256 };
      await marker(action.connection, 'K07_FACILITY_VERIFY_DONE');
      actionValue = assertFailure(actionResult(action.connection), ['42501'], /allergy authority denied|current clinician authority changed/i,
        'Feature 011 action after committed facility revocation');
      actionCommit = await finishSession(action.connection, 'K07_FACILITY_VERIFY_COMMITTED');
      const status = sql(runtime, database,
        `SELECT membership_status FROM identity.facility_memberships WHERE id=${quote(writer.membership.id)}::uuid;`).stdout.trim();
      assert.equal(status, 'ended');
      writerCommit.membershipStatus = status;
    }
    const after = receiptState(runtime, database);
    if (schedule === 'action-first') assert.equal(after.receipts - before.receipts, 1);
    else assert.equal(after.receipts - before.receipts, 0);
    assert.equal(after.receipts, after.obligations);
    assert.equal(after.receipts, after.completedFeatureIdempotency);
    assert.equal(after.badReceiptPointers, 0);
    const history = JSON.parse(sql(runtime, database,
      `SELECT json_build_object('revisions',count(*),'versions',array_agg(version ORDER BY version),'currentVersion',(SELECT current_version FROM clinical.allergy_heads WHERE id=${quote(allergyId)}::uuid),'bindings',(SELECT count(*) FROM clinical.allergy_verification_bindings b WHERE b.revision_id IN (SELECT id FROM clinical.allergies WHERE allergy_id=${quote(allergyId)}::uuid))) FROM clinical.allergies WHERE allergy_id=${quote(allergyId)}::uuid;`,
    ).stdout.trim());
    assert.equal(history.revisions, schedule === 'action-first' ? 2 : 1);
    assert.equal(history.currentVersion, schedule === 'action-first' ? 2 : 1);
    return {
      category: 'actual-facility-writer', result: 'PASS', schedule,
      actualApiCall: { creation: createResult, verification: actionValue },
      actualWriter: { source: writer.source, membershipId: writer.membership.id, result: 'endMembership' },
      identities: { featureApi: action.identity, predecessorWriter: writer.identity },
      barriers: [locks], durable: { membershipStatus: writerCommit.membershipStatus, history, before, after },
      commandEvidence: { featureApi: actionCommit.command, predecessorWriter: writerCommit.identity },
      outputs: { featureApi: actionCommit.output },
      assertions: [
        { id: 'facility-revocation-linearization-order', schedule, result: 'PASS' },
        { id: 'facility-race-receipt-domain-atomicity', result: 'PASS', history, receipts: after.receipts, obligations: after.obligations },
      ],
    };
  } finally {
    if (action) closeConnection(action.connection);
    if (writer) await writer.close();
    await Promise.allSettled([action?.connection.closed]);
  }
}

const expectedRaceCategories = [
  'allergy-head-cas',
  'signature-independence',
  'current-authority-revoke-first-action-first',
  'initial-published-root',
  'published-successor-lineage',
  'release-allocation-version',
  'effective-time-after-wait',
  'idempotency-replay',
  'receipt-fault-atomicity',
  'actual-facility-writer',
  'actual-continuity-writer',
  'actual-encounter-writer',
];

async function isolatedWriterRun(runtime, writer, schedule, onPhase = () => {}) {
  return initFeatureDatabase(runtime, async (database, _setup, setPhase) => {
    const phase = `actual ${writer} writer / ${schedule}`;
    onPhase(phase);
    setPhase(phase);
    if (writer === 'authority') return actualCurrentAuthorityRace(runtime, database, schedule);
    if (writer === 'facility') return actualFacilityRace(runtime, database, schedule);
    if (writer === 'continuity') return actualContinuityRace(runtime, database, schedule);
    if (writer === 'encounter') return actualEncounterRace(runtime, database, schedule);
    throw new Error(`Unsupported actual writer category ${writer}`);
  });
}

function assertTwoSchedules(category, cases) {
  assert.equal(category.result, 'PASS');
  assert.deepEqual(cases.map((item) => item.schedule).sort(), ['action-first', 'writer-first']);
  for (const item of cases) {
    assert.equal(item.result, 'PASS');
    assert.equal(item.barriers.length, 1);
    assert.ok(item.barriers[0].blockingPids.includes(item.barriers[0].holderPid));
    assert.ok(item.identities.featureApi.pid !== item.identities.predecessorWriter.pid);
    assert.equal(item.identities.featureApi.user, 'shifaa_api');
    assert.equal(item.identities.predecessorWriter.user, 'shifaa_api');
  }
}

function assertAuthoritySchedules(category, cases, runtime) {
  assert.equal(category.result, 'PASS');
  assert.deepEqual(cases.map((item) => item.schedule).sort(), ['action-first', 'writer-first']);
  for (const item of cases) {
    assert.equal(item.result, 'PASS');
    assert.equal(item.barriers.length, 1);
    assert.ok(item.barriers[0].blockingPids.includes(item.barriers[0].holderPid));
    assert.notEqual(item.identities.featureApi.pid, item.identities.authorityWriter.pid);
    assert.equal(item.identities.featureApi.user, 'shifaa_api');
    assert.equal(item.identities.authorityWriter.user, runtime.user);
    assert.equal(item.actualAuthorityWriter.identity.pid, item.identities.authorityWriter.pid);
  }
}

export async function runPhysicalRaces() {
  const migrations = acceptedChain();
  const green = JSON.parse(readFileSync(greenPath, 'utf8'));
  assert.equal(green.checkpoint, 'K07');
  assert.equal(green.task, 'T027');
  assert.equal(green.result, 'PASS');
  assert.equal(green.results.length, runtimes.length);
  // T027 deliberately binds every current physical input except this still-unaccepted T028 source.
  const greenSources = currentPhysicalSourceDigests(root, { includeRaces: false });
  assert.deepEqual(green.sourceDigests, greenSources, 'Fresh T027 source digests must still match before T028 begins.');
  for (const source of featureSources) {
    assert.ok(greenSources[source] || source === 'tools/feature-011-physical-races.mjs', `T027 source digest missing required K07 input ${source}`);
    if (source !== 'tools/feature-011-physical-races.mjs')
      assert.equal(digest(source), greenSources[source], `T027 input drift before T028: ${source}`);
  }
  const raceSources = currentPhysicalSourceDigests(root);
  for (const source of featureSources)
    assert.ok(raceSources[source], `Current race source digest missing required K07 input ${source}`);
  assert.equal(
    digest('tools/feature-011-physical-races.mjs'),
    raceSources['tools/feature-011-physical-races.mjs'],
    'Full race source set must bind this exact T028 module.',
  );
  mkdirSync(runtimeEvidenceDir, { recursive: true });
  const runtimeDetailsList = [];
  for (const runtime of runtimes) {
    let activePhase = 'verify current race inputs before runtime execution';
    let activeDatabase = null;
    const completedCategories = [];
    const setActivePhase = (next) => {
      activePhase = next;
      console.log(`K07 T028 ${runtime.name}: ${next}`);
    };
    try {
      assert.deepEqual(currentPhysicalSourceDigests(root), raceSources, 'Race inputs changed before runtime execution.');
      const core = await initFeatureDatabase(runtime, async (database, setup, setPhase) => {
        activeDatabase = database;
        const mark = (phase) => {
          activePhase = phase;
          setPhase(phase);
        };
        const before = receiptState(runtime, database);
        mark('allergy-head-cas');
        const allergy = await allergyCasProof(runtime, database);
        completedCategories.push(allergy.category);
        const lineage = await contentLineageRaces(runtime, database, mark);
        completedCategories.push(...lineage.categories.map((item) => item.category));
        mark('idempotency-replay');
        const replay = await idempotencyReplayProof(runtime, database);
        completedCategories.push(replay.category);
        mark('receipt-fault-atomicity');
        const receiptFault = await receiptFaultProof(runtime, database);
        completedCategories.push(receiptFault.category);
        const after = receiptState(runtime, database);
        assert.equal(after.receipts, after.obligations);
        assert.equal(after.receipts, after.completedFeatureIdempotency);
        assert.equal(after.badReceiptPointers, 0);
        assert.ok(after.receipts > before.receipts);
        const categories = [allergy, ...lineage.categories, replay, receiptFault];
        return {
          runtime: runtimeManifest(runtime), setup, categories,
          assertions: lineage.assertions,
          receiptState: { before, after },
        };
      });
      activeDatabase = core.database;
      const coreCategoryNames = core.categories.map((item) => item.category).sort();
      const expectedCoreCategories = [
        'allergy-head-cas', 'effective-time-after-wait', 'idempotency-replay',
        'initial-published-root', 'published-successor-lineage', 'receipt-fault-atomicity',
        'release-allocation-version', 'signature-independence',
      ];
      assert.deepEqual(coreCategoryNames, expectedCoreCategories);

      const categoryCases = {};
      const categoryWriters = [
        ['authority', 'current-authority-revoke-first-action-first'],
        ['facility', 'actual-facility-writer'],
        ['continuity', 'actual-continuity-writer'],
        ['encounter', 'actual-encounter-writer'],
      ];
      for (const [writer, categoryName] of categoryWriters) {
        setActivePhase(`${categoryName} / action-first`);
        const first = await isolatedWriterRun(runtime, writer, 'action-first', setActivePhase);
        activeDatabase = first.database;
        setActivePhase(`${categoryName} / writer-first`);
        const second = await isolatedWriterRun(runtime, writer, 'writer-first', setActivePhase);
        activeDatabase = second.database;
        const cases = [first, second];
        const category = { category: categoryName, result: 'PASS', cases };
        if (writer === 'authority') assertAuthoritySchedules(category, cases, runtime);
        else assertTwoSchedules(category, cases);
        categoryCases[writer] = cases;
        completedCategories.push(categoryName);
      }
      const [authorityCategory, facilityCategory, continuityCategory, encounterCategory] = categoryWriters.map(
        ([writer, categoryName]) => ({ category: categoryName, result: 'PASS', cases: categoryCases[writer] }),
      );
      const categories = [
        ...core.categories,
        authorityCategory,
        facilityCategory,
        continuityCategory,
        encounterCategory,
      ];
      assert.deepEqual(categories.map((item) => item.category).sort(), [...expectedRaceCategories].sort());
      assert.deepEqual(completedCategories.slice(-4).sort(), categoryWriters.map(([, name]) => name).sort());
      assert.deepEqual(currentPhysicalSourceDigests(root), raceSources, 'Race source digests changed during T028 database execution.');
      const runtimeDetails = {
        runtime: runtimeManifest(runtime),
        result: 'PASS',
        checkpoint: 'K07', task: 'T028',
        acceptedGreen: { proof: 'physical-green.json', result: green.result, catalogSha256: green.expectedCatalog?.sha256 ?? null },
        sourceDigests: raceSources,
        migrations,
        categories,
        coreSuite: core,
        actualWriterMatrices: {
          authority: categoryCases.authority,
          facility: categoryCases.facility,
          continuity: categoryCases.continuity,
          encounter: categoryCases.encounter,
        },
        completedCategories,
        syntheticStructuralFixturesOnly: true,
        completedAt: new Date().toISOString(),
      };
      runtimeDetailsList.push(runtimeDetails);
      setActivePhase('runtime suite complete; continue to the other PostgreSQL runtime before PASS artifacts');
      assert.deepEqual(currentPhysicalSourceDigests(root), raceSources, 'Full K07 race inputs must remain stable after each runtime.');
    } catch (error) {
      const failure = error instanceof Error ? error : new Error(String(error));
      let observedSourceDigests;
      try {
        observedSourceDigests = currentPhysicalSourceDigests(root);
      } catch (digestError) {
        observedSourceDigests = { captureError: digestError instanceof Error ? digestError.message : String(digestError) };
      }
      const physicalContext = failure.physicalRaceContext ?? null;
      const attempt = {
        formatVersion: 1,
        checkpoint: 'K07', task: 'T028', result: 'FAIL',
        runtime: runtimeManifest(runtime),
        database: physicalContext?.database ?? activeDatabase,
        phase: physicalContext?.phase ?? activePhase,
        cleanup: physicalContext?.cleanup ?? 'No unverified cleanup assertion; use the exact withDatabase cleanup diagnostics if scratch setup was entered.',
        error: { name: failure.name, message: failure.message, stack: failure.stack },
        completedCategories: [...completedCategories],
        sourceDigests: observedSourceDigests,
        expectedSourceDigests: raceSources,
        acceptedGreen: { proof: 'physical-green.json', result: green.result },
        syntheticStructuralFixturesOnly: true,
        t029Asserted: false,
        capturedAt: new Date().toISOString(),
      };
      const attemptPath = resolve(runtimeEvidenceDir, `${runtime.name}-physical-races-attempt.json`);
      writeFileSync(attemptPath, JSON.stringify(attempt, null, 2) + '\n');
      console.error(`K07 T028 ${runtime.name} failed during ${attempt.phase}; attempt evidence: ${attemptPath}`);
      throw failure;
    }
  }
  assert.deepEqual(currentPhysicalSourceDigests(root), raceSources, 'Full K07 race inputs must remain stable until both runtimes finish.');
  // Do not persist a runtime PASS until both engines have completed every required matrix.
  const runtimeArtifacts = runtimeDetailsList.map((runtimeDetails) => {
    const artifactPath = resolve(runtimeEvidenceDir, `${runtimeDetails.runtime.name}-physical-races.json`);
    writeFileSync(artifactPath, JSON.stringify(runtimeDetails, null, 2) + '\n');
    return {
      runtime: runtimeDetails.runtime.name,
      result: 'PASS',
      artifactPath,
      categories: runtimeDetails.categories.map((item) => item.category),
    };
  });
  return {
    formatVersion: 1,
    checkpoint: 'K07', task: 'T028', stage: 'P4', result: 'PASS',
    greenProof: { path: greenPath, result: green.result },
    raceSourceDigests: raceSources,
    migrations,
    categories: expectedRaceCategories,
    runtimeArtifacts,
    runtimeDetails: runtimeDetailsList,
    capturedAt: new Date().toISOString(),
    syntheticStructuralFixturesOnly: true,
    realKmsOrEvidenceAccepted: false,
    t029Asserted: false,
  };
}
