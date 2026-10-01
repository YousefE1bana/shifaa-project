import assert from 'node:assert/strict';
import { randomBytes, createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { performance } from 'node:perf_hooks';

const migrationHead = '20261001001002_f010_f04_completion_authority.sql';
const c26Head = '20260930001001_f010_c26_privacy_guards.sql';
const checkpointHead = '20260930001000_f010_c23_realtime_hint.sql';
const c26RestatedFunctions = new Set([
  'clinical.update_encounter_api_v1',
  'clinical.sign_encounter_note_api_v1',
  'clinical.complete_encounter_api_v1',
  'clinical.create_referral_api_v1',
  'clinical.accept_referral_api_v1',
]);
const checks = [
  'authorized-read',
  'foreign-denied',
  'ended-denied',
  'completed-denied',
  'direct-table-denied',
  'c26-update-ordering',
  'c26-note-ordering',
  'c26-complete-ordering',
  'c26-referral-create-ordering',
  'c26-referral-accept-ordering',
];
const runtimes = [
  {
    name: 'shifaa-local-postgres',
    container: 'shifaa-local-postgres-postgres-1',
    user: 'shifaa_owner',
    admin: 'shifaa',
  },
  {
    name: 'shifaa-local-supabase',
    container: 'supabase_db_shifaa-local-supabase',
    user: 'supabase_admin',
    admin: 'postgres',
  },
];

export function verifyRestoreProof(proof) {
  assert.ok(Number.isFinite(proof.restoreMs) && proof.restoreMs > 0, 'missing real restore timing');
  assert.ok(Number.isInteger(proof.backupBytes) && proof.backupBytes > 0, 'missing actual backup');
  assert.equal(proof.migrationHead, migrationHead);
  for (const snapshot of [proof.source, proof.restored]) {
    assert.match(snapshot.dataDigest, /^[a-f0-9]{32}$/);
    assert.match(snapshot.securityDigest, /^[a-f0-9]{32}$/);
    assert.equal(snapshot.relationshipsValid, true);
    assert.equal(snapshot.f009Compatible, true, 'F009 restore invariants failed');
    for (const key of [
      'appointments',
      'queue',
      'encounters',
      'signedNotes',
      'corrections',
      'acceptedReferrals',
      'messages',
      'outbox',
      'responses',
      'f009Appointments',
      'f009QueueEntries',
      'f009Schedules',
      'f009BlockedExceptions',
      'f009AuditEvents',
      'f009Idempotency',
    ]) {
      assert.ok(
        Number.isInteger(snapshot.counts[key]) && snapshot.counts[key] > 0,
        `missing representative ${key}`,
      );
    }
  }
  assert.deepEqual(proof.restored, proof.source, 'restore changed data or security');
  assert.equal(proof.forwardUpgrade, 'C23-to-C26-populated-data-preserved');
  assert.deepEqual(
    [...new Set(proof.changedC26Functions)].sort(),
    [...c26RestatedFunctions].sort(),
    'forward upgrade did not evidence all five C26 function restatements',
  );
  assert.equal(proof.apiCompatibility, 'PASS', 'restored API compatibility checks are missing');
  assert.deepEqual(proof.apiCompatibilityChecks, {
    authorizedDecryption: 'PASS',
    signedCorrectionLink: 'PASS',
    privateNoteFiltering: 'PASS',
    foreignDenied: 'PASS',
  });
  assert.equal(proof.c26RestoredReplay, 'PASS', 'restored C26 replay evidence is missing');
  assert.deepEqual(proof.changedF04Functions, ['clinical.complete_encounter_v1']);
  assert.equal(proof.f04ForwardUpgrade, 'C26-to-F04-populated-data-preserved');
  assert.equal(proof.f04RestoredReplay, 'PASS', 'restored F04 replay evidence is missing');
  assert.deepEqual(
    proof.authorizationChecks,
    checks,
    'post-restore live authorization evidence incomplete',
  );
  return {
    ...proof,
    productionAvailability: 'UNAVAILABLE-AS-PRODUCTION-EVIDENCE',
    productionRpoRto: 'UNAVAILABLE-AS-PRODUCTION-EVIDENCE',
  };
}

// Test-only receipts model forward deployment in disposable databases. Applied
// historical SQL is never replayed over later append-only event/history rows.
export function pendingForwardMigrations(manifest, receipts, through = manifest.length) {
  assert.ok(Number.isInteger(through) && through >= 0 && through <= manifest.length);
  assert.equal(new Set(manifest.map((entry) => entry.path)).size, manifest.length);
  for (const receipt of receipts) {
    const entry = manifest.find((entry) => entry.path === receipt.path);
    assert.ok(entry && entry.digest === receipt.digest, 'applied migration changed or disappeared');
  }
  assert.equal(new Set(receipts.map((entry) => entry.path)).size, receipts.length);
  assert.deepEqual(
    receipts.map((entry) => entry.path),
    manifest.slice(0, receipts.length).map((entry) => entry.path),
    'migration receipts are not a forward prefix',
  );
  assert.ok(receipts.length <= through, 'migration checkpoint would move behind applied receipts');
  return manifest.slice(receipts.length, through);
}

// C26 restates only its five privacy-sensitive API functions. Existing rows,
// relationships, F009 scheduling state, and every other security object must
// remain unchanged when the C26 forward migration is applied.
export function verifyForwardUpgrade(before, after) {
  for (const snapshot of [before, after]) {
    assert.equal(snapshot.relationshipsValid, true, 'forward upgrade has invalid relationships');
    assert.equal(snapshot.f009Compatible, true, 'F009 compatibility failed during forward upgrade');
  }
  assert.equal(before.dataDigest, after.dataDigest, 'C26 changed populated data');
  assert.deepEqual(before.counts, after.counts, 'C26 changed representative row counts');
  for (const part of ['tableDigests', 'constraintDigests', 'triggerDigests', 'policyDigests']) {
    assert.deepEqual(after[part], before[part], `C26 unexpectedly changed ${part}`);
  }

  const beforeFunctions = before.functionDigests;
  const afterFunctions = after.functionDigests;
  const functionKeys = Object.keys(beforeFunctions).sort();
  assert.deepEqual(
    Object.keys(afterFunctions).sort(),
    functionKeys,
    'C26 changed the function set',
  );
  const changedC26Functions = [];
  for (const key of functionKeys) {
    const functionName = key.slice(0, key.indexOf('('));
    if (c26RestatedFunctions.has(functionName)) {
      assert.ok(
        beforeFunctions[key] && afterFunctions[key],
        `missing C26 restatement ${functionName}`,
      );
      if (beforeFunctions[key] !== afterFunctions[key]) changedC26Functions.push(functionName);
    } else {
      assert.equal(
        afterFunctions[key],
        beforeFunctions[key],
        `C26 changed unrelated function ${functionName}`,
      );
    }
  }
  assert.deepEqual(
    [...new Set(changedC26Functions)].sort(),
    [...c26RestatedFunctions].sort(),
    'C26 must restate all five approved privacy-sensitive API functions',
  );
  assert.notEqual(
    before.securityDigest,
    after.securityDigest,
    'C26 security restatement was not observed',
  );
  return changedC26Functions;
}

export function verifyF04ForwardUpgrade(before, after) {
  assert.equal(after.relationshipsValid, true);
  assert.equal(after.f009Compatible, true);
  assert.equal(after.dataDigest, before.dataDigest, 'F04 changed populated data');
  assert.deepEqual(after.counts, before.counts, 'F04 changed representative row counts');
  for (const part of ['tableDigests', 'constraintDigests', 'triggerDigests', 'policyDigests']) {
    assert.deepEqual(after[part], before[part], `F04 unexpectedly changed ${part}`);
  }
  const keys = Object.keys(before.functionDigests).sort();
  assert.deepEqual(Object.keys(after.functionDigests).sort(), keys, 'F04 changed the function set');
  const changed = keys.filter((key) => before.functionDigests[key] !== after.functionDigests[key]);
  assert.deepEqual(changed, [
    'clinical.complete_encounter_v1(p_encounter_id uuid, p_expected_version integer, p_input jsonb)',
  ]);
  assert.notEqual(after.securityDigest, before.securityDigest, 'F04 producer restatement missing');
  return ['clinical.complete_encounter_v1'];
}

function docker(runtime, args, input, binary = false) {
  const result = spawnSync('docker', ['exec', '-i', runtime.container, ...args], {
    input,
    encoding: binary ? undefined : 'utf8',
    maxBuffer: 64 * 1024 * 1024,
    windowsHide: true,
  });
  // Never include raw SQL, clinical data, environment values or connection strings in diagnostics.
  if (result.error || result.status !== 0)
    throw new Error(
      `C28 docker boundary failed (${args[0]}, ${runtime.name}, exit ${result.status}); SQLSTATE ${result.stderr?.toString().match(/ERROR:\s+([A-Z0-9]{5}):/)?.[1] ?? 'unavailable'}; routine ${
        result.stderr
          ?.toString()
          .match(/PL\/pgSQL function ([a-z_0-9.]+\([^\n]*?\)) line (\d+)/)
          ?.slice(1)
          .join(':') ?? 'unavailable'
      }`,
    );
  return result.stdout;
}

function sql(runtime, database, input) {
  return docker(
    runtime,
    [
      'psql',
      '-X',
      '-qAt',
      '-v',
      'ON_ERROR_STOP=1',
      '-v',
      'VERBOSITY=verbose',
      '-U',
      runtime.user,
      '-d',
      database,
    ],
    input,
  ).trim();
}

function migration(runtime, database, path) {
  let input = readFileSync(path, 'utf8');
  input = input.replace(/^\\ir\s+(\S+)\s*$/gm, (_, include) =>
    readFileSync(resolve(path, '..', include), 'utf8'),
  );
  if (/^\\ir\s/m.test(input)) throw new Error('C28 nested migration include unsupported');
  sql(runtime, database, input);
}

function databaseRoleClock(runtime, database) {
  assert.match(database, /^f010_c28_restore_[a-f0-9]{16}_(src|dst)$/);
  sql(
    runtime,
    database,
    `ALTER ROLE shifaa_api IN DATABASE "${database}" SET shifaa.test_now TO '2030-04-05T08:00:00Z';`,
  );
}

function restoreApiFixture(runtime, database, mode, fixtureIds) {
  assert.ok(mode === 'seed' || mode === 'verify');
  const portResult = spawnSync('docker', ['port', runtime.container, '5432/tcp'], {
    encoding: 'utf8',
    windowsHide: true,
  });
  if (portResult.error || portResult.status !== 0)
    throw new Error(
      `${runtime.name} C28 restore API fixture could not resolve its PostgreSQL port`,
    );
  const port = portResult.stdout.trim().split(/\r?\n/)[0]?.split(':').at(-1);
  assert.match(port ?? '', /^\d+$/, `${runtime.name} has no usable host-mapped PostgreSQL port`);

  const env = {
    ...process.env,
    SHIFAA_F010_RESTORE_DATABASE: database,
    SHIFAA_PG_PORT: port,
  };
  if (mode === 'seed') delete env['SHIFAA_F010_RESTORE_API_FIXTURE'];
  else env['SHIFAA_F010_RESTORE_API_FIXTURE'] = JSON.stringify(fixtureIds);
  const result = spawnSync(
    process.execPath,
    ['--import', 'tsx', resolve('tools/feature-010-restore-api-fixture.ts'), mode],
    {
      cwd: process.cwd(),
      env,
      encoding: 'utf8',
      maxBuffer: 1024 * 1024,
      windowsHide: true,
    },
  );
  if (result.error || result.status !== 0)
    throw new Error(
      `${runtime.name} C28 restore API fixture ${mode} failed at ${result.stderr?.match(/failed at ([a-z-]+);/)?.[1] ?? 'unavailable'}`,
    );
  let report;
  try {
    report = JSON.parse(result.stdout.trim());
  } catch {
    throw new Error(`${runtime.name} C28 restore API fixture ${mode} returned invalid evidence`);
  }
  if (mode === 'seed') {
    const expected = ['encounterId', 'privateNoteId', 'visibleNoteId', 'correctionId', 'messageId'];
    assert.deepEqual(Object.keys(report).sort(), expected.sort());
    assert.ok(Object.values(report).every((id) => /^[0-9a-f-]{36}$/.test(id)));
    return report;
  }
  assert.deepEqual(report, {
    authorizedDecryption: 'PASS',
    signedCorrectionLink: 'PASS',
    privateNoteFiltering: 'PASS',
    foreignDenied: 'PASS',
  });
  return report;
}

function fixture() {
  const update = readFileSync('infra/db/tests/feature-010-update.sql', 'utf8');
  const setupEnd = update.indexOf('DO $feature_010_c11_boundary$');
  assert.ok(setupEnd > 0, 'C28 C11 fixture setup boundary is missing');
  const updateSetup = update.slice(0, setupEnd);
  assert.ok(updateSetup.includes('f0101000-0000-4000-8e00-000000000001'));
  assert.ok(updateSetup.includes("'consulting_clinician','2030-04-05T07:05:00Z'"));
  const notes = readFileSync('infra/db/tests/feature-010-notes.sql', 'utf8');
  const revokedStart = notes.indexOf('DO $feature_010_c12_revoked_authority$');
  const revokedEnd = notes.indexOf('$feature_010_c12_revoked_authority$;', revokedStart);
  assert.ok(revokedStart > 0 && revokedEnd > revokedStart);
  // This source is deliberately pre-C26: the old signer denied revoked actors
  // with 42501. C26's stricter hidden-resource ordering is asserted after upgrade.
  const revoked = notes.slice(revokedStart, revokedEnd);
  assert.ok(revoked.includes('EXCEPTION WHEN no_data_found THEN denied := true;'));
  const priorCheckpointNotes =
    notes.slice(0, revokedStart) +
    revoked.replace(
      'EXCEPTION WHEN no_data_found THEN denied := true;',
      'EXCEPTION WHEN no_data_found OR insufficient_privilege THEN denied := true;',
    ) +
    notes.slice(revokedEnd);
  const acceptance = readFileSync('infra/db/tests/feature-010-referral-accept.sql', 'utf8');
  const fixtureEnd = acceptance.indexOf(
    '$feature_010_c18_acceptance_fixture$;',
    acceptance.indexOf('END'),
  );
  assert.ok(fixtureEnd > 0);
  return (
    updateSetup +
    `
SELECT set_config('shifaa.person_id','f0101000-0000-4000-8000-000000000001',true),
 set_config('shifaa.actor_role','CLN',true),set_config('shifaa.action','updateEncounter',true),
 set_config('shifaa.aal','2',true),set_config('shifaa.purposes','appointment.scheduling',true),
 set_config('shifaa.request_id','f0101000-0000-4000-9000-000000000028',true),set_config('shifaa.trace_id','f0101000-0000-4000-9000-000000000028',true),
 set_config('shifaa.idempotency_key','c28-c23-seed-update',true),set_config('shifaa.request_hash',repeat('d',64),true);
SET SESSION AUTHORIZATION shifaa_api;
DO $$ DECLARE result jsonb; BEGIN
 SELECT clinical.update_encounter_api_v1('f0101000-0000-4000-8800-000000000002',1,
  jsonb_build_object('conditionIds',jsonb_build_array('f0101000-0000-4000-8e00-000000000001','f0101000-0000-4000-8e00-000000000002'),
   'participantIntervalsEnd',jsonb_build_array(jsonb_build_object('personId','f0101000-0000-4000-8000-000000000003',
    'roleCode','consulting_clinician','startedAt','2030-04-05T07:05:00Z')))) INTO result;
 IF result IS NULL OR (result->>'version')::integer<>2 THEN RAISE EXCEPTION 'C28 C23 fixture update did not create versioned state'; END IF;
END $$;
RESET SESSION AUTHORIZATION;
` +
    priorCheckpointNotes +
    acceptance.slice(0, fixtureEnd + '$feature_010_c18_acceptance_fixture$;'.length) +
    `
SET SESSION AUTHORIZATION shifaa_api;
SELECT set_config('shifaa.environment','local',true),set_config('shifaa.test_now','2030-04-05T08:00:00Z',true),
 set_config('shifaa.person_id','f0101000-0000-4000-8000-000000000002',true),set_config('shifaa.actor_role','PAT',true),
 set_config('shifaa.action','acceptReferral',true),set_config('shifaa.aal','2',true),set_config('shifaa.purposes','appointment.scheduling',true),
 set_config('shifaa.idempotency_key','c28-restore-accept',true),set_config('shifaa.request_hash',repeat('a',64),true);
DO $$ BEGIN
 PERFORM clinical.accept_referral_api_v1('f0101000-0000-4000-8a00-000000000001',1,
  jsonb_build_object('authorizedFieldCodes',jsonb_build_array('reason_summary','encounter_type'),'targetSlot',jsonb_build_object(
   'facilityId','f0101000-0000-4000-8200-000000000001','doctorId','f0101000-0000-4000-8000-000000000003',
   'startsAt','2030-04-05T11:00:00Z','endsAt','2030-04-05T11:30:00Z','timezone','Africa/Cairo','civilDate','2030-04-05',
   'availabilityVersion',current_setting('shifaa.test_c18_schedule_version')::integer)));
 PERFORM set_config('shifaa.action','sendContextMessage',true);
 PERFORM set_config('shifaa.idempotency_key','c28-restore-message',true);
 PERFORM set_config('shifaa.request_hash',repeat('b',64),true);
 -- Existing SQL vector sealed-envelope fixture; its opaque bytes must survive backup exactly.
 PERFORM trust.send_context_message_api_v1('f0101000-0000-4000-8500-000000000004',
  jsonb_build_object('bodyCiphertext',encode(decode('01'||repeat('a1',12)||repeat('b2',16)||repeat('c3',24),'hex'),'base64')));
END $$;
RESET SESSION AUTHORIZATION;
COMMIT;
`
  );
}

const snapshotSql = `
-- Reparse CHECK definitions using PostgreSQL itself: pg_dump/restore flattens
-- nested associative AND nodes. Preserve precedence rather than stripping parentheses.
DO $$ DECLARE r record; definition text; digests jsonb:='{}'; BEGIN
 FOR r IN SELECT oid,conrelid,conname,contype FROM pg_constraint WHERE connamespace IN ('clinical'::regnamespace,'trust'::regnamespace) LOOP
  definition:=pg_get_constraintdef(r.oid);
  IF r.contype='c' THEN
   EXECUTE format('CREATE TEMP TABLE f010_c28_constraint_probe (LIKE %s)',r.conrelid::regclass);
   EXECUTE 'ALTER TABLE f010_c28_constraint_probe ADD CONSTRAINT f010_c28_probe '||definition;
   SELECT pg_get_constraintdef(oid) INTO definition FROM pg_constraint WHERE conrelid='pg_temp.f010_c28_constraint_probe'::regclass AND conname='f010_c28_probe';
   DROP TABLE pg_temp.f010_c28_constraint_probe;
  END IF;
  digests:=digests||jsonb_build_object(r.conrelid::regclass::text||'.'||r.conname,md5(definition));
 END LOOP;
 PERFORM set_config('shifaa.c28_constraints',digests::text,false);
END $$;
DO $$ DECLARE r record; digests text:=''; digest text; BEGIN
 FOR r IN SELECT n.nspname,c.relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
  WHERE c.relkind='r' AND n.nspname IN ('identity','clinical','trust','platform','audit') ORDER BY 1,2 LOOP
  EXECUTE format('SELECT md5(coalesce(string_agg(to_jsonb(t)::text,CHR(10) ORDER BY to_jsonb(t)::text),'''')) FROM %I.%I t',r.nspname,r.relname) INTO digest;
  digests:=digests||r.nspname||'.'||r.relname||':'||digest||';';
 END LOOP;
 PERFORM set_config('shifaa.c28_data_digest',md5(digests),false);
END $$;
SELECT jsonb_build_object(
 'functionDigests',(SELECT jsonb_object_agg(n.nspname||'.'||p.proname||'('||pg_get_function_identity_arguments(p.oid)||')',md5(pg_get_functiondef(p.oid)||coalesce((SELECT string_agg(grantee::text||privilege_type||is_grantable::text,',' ORDER BY grantee,privilege_type,is_grantable) FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) WHERE grantee<>p.proowner),''))) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname IN ('clinical','trust')),
 'tableDigests',(SELECT jsonb_object_agg(n.nspname||'.'||c.relname,md5(c.relrowsecurity::text||c.relforcerowsecurity::text||coalesce((SELECT string_agg(grantee::text||privilege_type||is_grantable::text,',' ORDER BY grantee,privilege_type,is_grantable) FROM aclexplode(coalesce(c.relacl,acldefault('r',c.relowner))) WHERE grantee<>c.relowner),''))) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE c.relkind='r' AND n.nspname IN ('clinical','trust')),
 'constraintDigests',current_setting('shifaa.c28_constraints')::jsonb,
 'triggerDigests',(SELECT jsonb_object_agg(tgrelid::regclass::text||'.'||tgname,md5(pg_get_triggerdef(oid)||tgenabled::text)) FROM pg_trigger WHERE NOT tgisinternal AND tgrelid IN (SELECT oid FROM pg_class WHERE relnamespace IN ('clinical'::regnamespace,'trust'::regnamespace))),
 'policyDigests',(SELECT jsonb_object_agg(polrelid::regclass::text||'.'||polname,md5(polcmd::text||polpermissive::text||polroles::text||coalesce(pg_get_expr(polqual,polrelid),'')||coalesce(pg_get_expr(polwithcheck,polrelid),''))) FROM pg_policy WHERE polrelid IN (SELECT oid FROM pg_class WHERE relnamespace IN ('clinical'::regnamespace,'trust'::regnamespace))),
 'dataDigest',current_setting('shifaa.c28_data_digest'),
 'securityDigest',md5((SELECT string_agg(pg_get_functiondef(p.oid)||coalesce((SELECT string_agg(grantee::text||privilege_type||is_grantable::text,',' ORDER BY grantee,privilege_type,is_grantable) FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) WHERE grantee<>p.proowner),''),';' ORDER BY n.nspname,p.proname,pg_get_function_identity_arguments(p.oid))
  FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname IN ('clinical','trust')) ||
  (SELECT string_agg(n.nspname||c.relname||c.relrowsecurity::text||c.relforcerowsecurity::text||coalesce((SELECT string_agg(grantee::text||privilege_type||is_grantable::text,',' ORDER BY grantee,privilege_type,is_grantable) FROM aclexplode(coalesce(c.relacl,acldefault('r',c.relowner))) WHERE grantee<>c.relowner),''),';' ORDER BY n.nspname,c.relname)
   FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE c.relkind='r' AND n.nspname IN ('clinical','trust')) ||
  current_setting('shifaa.c28_constraints') ||
  (SELECT string_agg(pg_get_triggerdef(oid)||tgenabled::text,';' ORDER BY tgrelid::regclass::text,tgname) FROM pg_trigger WHERE NOT tgisinternal AND tgrelid IN (SELECT oid FROM pg_class WHERE relnamespace IN ('clinical'::regnamespace,'trust'::regnamespace))) ||
  (SELECT string_agg(polname::text||polcmd::text||polpermissive::text||polroles::text||coalesce(pg_get_expr(polqual,polrelid),'')||coalesce(pg_get_expr(polwithcheck,polrelid),''),';' ORDER BY polname,polrelid::regclass::text) FROM pg_policy WHERE polrelid IN (SELECT oid FROM pg_class WHERE relnamespace IN ('clinical'::regnamespace,'trust'::regnamespace)))),
 'counts',jsonb_build_object('appointments',(SELECT count(*) FROM clinical.appointments),'queue',(SELECT count(*) FROM clinical.queue_entries),
  'encounters',(SELECT count(*) FROM clinical.encounters),'signedNotes',(SELECT count(*) FROM clinical.clinical_notes WHERE signed_at IS NOT NULL),
  'corrections',(SELECT count(*) FROM clinical.clinical_notes WHERE supersedes_id IS NOT NULL),
  'acceptedReferrals',(SELECT count(*) FROM clinical.referrals WHERE status='accepted' AND resulting_appointment_id IS NOT NULL),
  'messages',(SELECT count(*) FROM trust.messages WHERE attachment IS NULL),
  'outbox',(SELECT count(*) FROM platform.outbox_events),'responses',(SELECT count(*) FROM platform.idempotency_records WHERE state='completed' AND response_body IS NOT NULL),
  'f009Appointments',(SELECT count(*) FROM clinical.appointments WHERE id='f0090000-0000-4000-8300-000000000010'),
  'f009QueueEntries',(SELECT count(*) FROM clinical.queue_entries WHERE appointment_id='f0090000-0000-4000-8300-000000000010'),
  'f009Schedules',(SELECT count(*) FROM clinical.schedules WHERE id='f0090000-0000-4000-8200-000000000010'),
  'f009BlockedExceptions',(SELECT count(*) FROM clinical.schedule_exceptions WHERE schedule_id='f0090000-0000-4000-8200-000000000010' AND exception_type='blocked'),
  'f009AuditEvents',(SELECT count(*) FROM audit.events WHERE resource_id='f0090000-0000-4000-8200-000000000010' AND action_code='schedule.restore.seed'),
  'f009Idempotency',(SELECT count(*) FROM platform.idempotency_records WHERE method='POST' AND route_template='/v1/clinic/restore' AND state='completed' AND response_body IS NOT NULL)),
 'relationshipsValid',NOT EXISTS(SELECT 1 FROM clinical.referrals r LEFT JOIN clinical.appointments a ON a.id=r.resulting_appointment_id WHERE r.status='accepted' AND (a.id IS NULL OR a.source_referral_id IS DISTINCT FROM r.id OR a.currency_code<>'EGP' OR a.payment_method<>'cash_on_arrival' OR a.fee_minor_units<>12500))
 AND NOT EXISTS(SELECT 1 FROM pg_constraint WHERE connamespace IN ('clinical'::regnamespace,'trust'::regnamespace) AND NOT convalidated),
 'f009Compatible',EXISTS(
   SELECT 1 FROM clinical.schedules s
   JOIN clinical.appointments a ON a.schedule_id=s.id
   JOIN clinical.queue_entries q ON q.appointment_id=a.id
   JOIN clinical.schedule_exceptions e ON e.schedule_id=s.id
   WHERE s.id='f0090000-0000-4000-8200-000000000010' AND s.version=2
    AND a.id='f0090000-0000-4000-8300-000000000010' AND a.fee_minor_units=s.fee_minor_units
    AND a.currency_code=s.currency_code AND a.currency_code='EGP'
    AND e.exception_type='blocked'
    AND q.id='f0090000-0000-4000-8500-000000000010' AND q.queue_number=1 AND q.waiting_order=1 AND q.state='waiting'
 )
 AND EXISTS(SELECT 1 FROM audit.events WHERE resource_id='f0090000-0000-4000-8200-000000000010' AND action_code='schedule.restore.seed')
 AND EXISTS(SELECT 1 FROM platform.outbox_events WHERE aggregate_id='f0090000-0000-4000-8200-000000000010'
  AND event_type='clinical.schedule.changed.v1' AND aggregate_version=2)
 AND EXISTS(SELECT 1 FROM platform.idempotency_records WHERE method='POST' AND route_template='/v1/clinic/restore'
  AND state='completed' AND response_body='{"resource_id":"f0090000-0000-4000-8300-000000000010"}'::jsonb));
`;

const securitySql = `DO $$ DECLARE r record; BEGIN
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname IN ('shifaa_api','shifaa_worker') AND (rolsuper OR rolbypassrls)) THEN RAISE EXCEPTION 'C28 online role bypasses RLS'; END IF;
 IF (SELECT count(*) FROM pg_class WHERE oid IN ('clinical.encounters'::regclass,'clinical.encounter_participants'::regclass,'clinical.clinical_notes'::regclass,'clinical.conditions'::regclass,'clinical.referrals'::regclass,'trust.messages'::regclass) AND relrowsecurity AND relforcerowsecurity)<>6 THEN RAISE EXCEPTION 'C28 FORCE RLS failed'; END IF;
 FOR r IN SELECT p.oid,p.prosecdef,p.proconfig FROM pg_proc p WHERE p.oid IN (
 'clinical.update_encounter_api_v1(uuid,integer,jsonb)'::regprocedure,'clinical.sign_encounter_note_api_v1(uuid,jsonb)'::regprocedure,
 'clinical.complete_encounter_api_v1(uuid,integer,jsonb)'::regprocedure,'clinical.create_referral_api_v1(uuid,jsonb)'::regprocedure,
 'clinical.accept_referral_api_v1(uuid,integer,jsonb)'::regprocedure) LOOP
  IF NOT r.prosecdef OR NOT ('search_path=""'=ANY(r.proconfig)) OR NOT has_function_privilege('shifaa_api',r.oid,'EXECUTE')
   OR EXISTS(SELECT 1 FROM pg_roles blocked WHERE blocked.rolname IN ('anon','authenticated','service_role','shifaa_worker') AND has_function_privilege(blocked.oid,r.oid,'EXECUTE'))
   OR EXISTS(SELECT 1 FROM aclexplode(coalesce((SELECT proacl FROM pg_proc WHERE oid=r.oid),acldefault('f',10))) WHERE grantee=0 AND privilege_type='EXECUTE') THEN RAISE EXCEPTION 'C28 function security failed'; END IF;
 END LOOP;
END $$;`;

function authorizationSql() {
  const setup = `BEGIN;
SELECT set_config('shifaa.environment','local',true),set_config('shifaa.test_now','2030-04-05T08:00:00Z',true),
 set_config('shifaa.person_id','f0101000-0000-4000-8000-000000000002',true),set_config('shifaa.actor_role','PAT',true),
 set_config('shifaa.action','listContextMessages',true),set_config('shifaa.aal','2',true),set_config('shifaa.purposes','appointment.scheduling',true);
SET SESSION AUTHORIZATION shifaa_api;
`;
  const denied = `DO $$ DECLARE denied boolean:=false; BEGIN
 BEGIN PERFORM trust.list_context_messages_api_v1('f0101000-0000-4000-8500-000000000004',NULL,NULL,20);
 EXCEPTION WHEN no_data_found OR insufficient_privilege OR serialization_failure THEN denied:=true; END;
 IF NOT denied THEN RAISE EXCEPTION 'C28 protected history remained accessible'; END IF;
 PERFORM set_config('shifaa.action','sendContextMessage',true); PERFORM set_config('shifaa.idempotency_key','c28-denied-send',true); PERFORM set_config('shifaa.request_hash',repeat('c',64),true);
 denied:=false;
 BEGIN PERFORM trust.send_context_message_api_v1('f0101000-0000-4000-8500-000000000004',jsonb_build_object('bodyCiphertext',encode(decode('01'||repeat('a1',12)||repeat('b2',16)||repeat('c3',24),'hex'),'base64')));
 EXCEPTION WHEN no_data_found OR insufficient_privilege OR serialization_failure THEN denied:=true; END;
 IF NOT denied THEN RAISE EXCEPTION 'C28 denied send succeeded'; END IF;
END $$;`;
  return (
    setup +
    `DO $$ BEGIN
 IF (SELECT count(*) FROM trust.list_context_messages_api_v1('f0101000-0000-4000-8500-000000000004',NULL,NULL,20))<>1 THEN RAISE EXCEPTION 'C28 authorized history missing'; END IF;
 PERFORM set_config('shifaa.action','getEncounter',true);
 IF clinical.feature_010_get_encounter_notes_projection_v1('f0101000-0000-4000-8800-000000000002') IS NULL
  OR clinical.feature_010_get_encounter_notes_projection_v1('f0101000-0000-4000-8800-000000000002')::text LIKE '%"private"%' THEN RAISE EXCEPTION 'C28 restored patient note privacy failed'; END IF;
 PERFORM set_config('shifaa.action','listContextMessages',true);
 BEGIN PERFORM 1 FROM clinical.appointments; RAISE EXCEPTION 'C28 direct table access granted'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 PERFORM set_config('shifaa.person_id','f0101000-0000-4000-8000-000000000004',true);
END $$;` +
    denied +
    `ROLLBACK; RESET SESSION AUTHORIZATION;` +
    setup +
    `
RESET SESSION AUTHORIZATION;
UPDATE clinical.encounter_participants SET ended_at='2030-04-05T07:59:00Z' WHERE encounter_id='f0101000-0000-4000-8800-000000000002' AND person_id='f0101000-0000-4000-8000-000000000001' AND ended_at IS NULL;
SELECT set_config('shifaa.person_id','f0101000-0000-4000-8000-000000000001',true),set_config('shifaa.actor_role','CLN',true);
SET SESSION AUTHORIZATION shifaa_api;
` +
    denied +
    `ROLLBACK; RESET SESSION AUTHORIZATION;` +
    setup +
    `
RESET SESSION AUTHORIZATION;
SELECT set_config('shifaa.c28_version',(SELECT version::text FROM clinical.encounters WHERE id='f0101000-0000-4000-8800-000000000002'),true),
 set_config('shifaa.person_id','f0101000-0000-4000-8000-000000000001',true),set_config('shifaa.actor_role','CLN',true),set_config('shifaa.action','completeEncounter',true),
 set_config('shifaa.idempotency_key','c28-restored-completion',true),set_config('shifaa.request_hash',repeat('d',64),true);
SET SESSION AUTHORIZATION shifaa_api;
DO $$ BEGIN PERFORM clinical.complete_encounter_api_v1('f0101000-0000-4000-8800-000000000002',current_setting('shifaa.c28_version')::integer,jsonb_build_object('summary','Synthetic C28 completion','structuralConfirmation',true));
 PERFORM set_config('shifaa.person_id','f0101000-0000-4000-8000-000000000002',true); PERFORM set_config('shifaa.actor_role','PAT',true); PERFORM set_config('shifaa.action','listContextMessages',true); END $$;
` +
    denied +
    `ROLLBACK; RESET SESSION AUTHORIZATION;`
  );
}

function c26AuthorizationOrderingSql() {
  return `BEGIN;
SELECT set_config('shifaa.environment','local',true),set_config('shifaa.test_now','2030-04-05T08:00:00Z',true),
 set_config('shifaa.person_id','f0101000-0000-4000-8000-000000000003',true),set_config('shifaa.actor_role','CLN',true),
 set_config('shifaa.aal','2',true),set_config('shifaa.purposes','appointment.scheduling',true);
SET SESSION AUTHORIZATION shifaa_api;
DO $$
DECLARE
 operation record;
 candidate record;
 observed_state text;
 observed_message text;
 absent_message text;
 request_id text;
BEGIN
 FOR operation IN
  SELECT * FROM (VALUES
   ('update','updateEncounter','SELECT clinical.update_encounter_api_v1($1,1,$2)',
    'f0101000-0000-4000-8800-000000000099'::uuid,'f0101000-0000-4000-8800-000000000002'::uuid,NULL::uuid,
    jsonb_build_object('conditionIds','[]'::jsonb)),
   ('note','signEncounterNote','SELECT clinical.sign_encounter_note_api_v1($1,$2)',
    'f0101000-0000-4000-8800-000000000099'::uuid,'f0101000-0000-4000-8800-000000000002'::uuid,NULL::uuid,
    jsonb_build_object('noteType','c28-ordering-probe','visibility','private',
      'bodyCiphertext',encode(decode('01'||repeat('a1',12)||repeat('b2',16)||repeat('c3',24),'hex'),'base64'))),
   ('complete','completeEncounter','SELECT clinical.complete_encounter_api_v1($1,1,$2)',
    'f0101000-0000-4000-8800-000000000099'::uuid,'f0101000-0000-4000-8800-000000000002'::uuid,NULL::uuid,
    jsonb_build_object('summary','Synthetic C28 authorization-ordering probe','structuralConfirmation',true)),
   ('referral-create','createReferral','SELECT clinical.create_referral_api_v1($1,$2)',
    'f0101000-0000-4000-8800-000000000099'::uuid,'f0101000-0000-4000-8800-000000000002'::uuid,NULL::uuid,
    jsonb_build_object('targetSpecialty','cardiology','reasonSummary','Synthetic C28 authorization-ordering probe')),
   ('referral-accept','acceptReferral','SELECT clinical.accept_referral_api_v1($1,1,$2)',
    'f0101000-0000-4000-8a00-000000000099'::uuid,'f0101000-0000-4000-8a00-000000000002'::uuid,
    'f0101000-0000-4000-8a00-000000000001'::uuid,'{}'::jsonb)
  ) AS cases(kind,action_code,statement,absent_id,foreign_id,stale_id,request_body)
 LOOP
  absent_message:=NULL;
  FOR candidate IN
   SELECT * FROM (VALUES ('absent',operation.absent_id),('foreign',operation.foreign_id),('stale',operation.stale_id)) AS probes(label,resource_id)
   WHERE resource_id IS NOT NULL
  LOOP
   request_id:=pg_catalog.gen_random_uuid()::text;
   PERFORM set_config('shifaa.action',operation.action_code,true);
   PERFORM set_config('shifaa.request_id',request_id,true);
   PERFORM set_config('shifaa.trace_id',request_id,true);
   PERFORM set_config('shifaa.idempotency_key',request_id,true);
   PERFORM set_config('shifaa.request_hash',repeat('e',64),true);
   observed_state:='00000';
   observed_message:='operation unexpectedly succeeded';
   BEGIN
    EXECUTE operation.statement USING candidate.resource_id,operation.request_body;
   EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS observed_state=RETURNED_SQLSTATE,observed_message=MESSAGE_TEXT;
   END;
   IF observed_state<>'P0002' THEN
    RAISE EXCEPTION 'C28 C26 authorization ordering failed for %/%',operation.kind,candidate.label;
   END IF;
   IF candidate.label='absent' THEN
    absent_message:=observed_message;
   ELSIF observed_message IS DISTINCT FROM absent_message THEN
    RAISE EXCEPTION 'C28 C26 hidden resource response differs for %/%',operation.kind,candidate.label;
   END IF;
  END LOOP;
 END LOOP;
END $$;
RESET SESSION AUTHORIZATION;
ROLLBACK;`;
}

export async function runRestore() {
  const selected = process.env['SHIFAA_TEST_POSTGRES_RUNTIME'];
  assert.ok(!selected || runtimes.some((r) => r.name === selected), 'unknown C28 runtime');
  assert.ok(
    !process.argv.includes('--require-both-runtimes') || !selected,
    'C28 restore verification requires both named runtimes',
  );
  const paths = [
    ...JSON.parse(readFileSync('package.json', 'utf8')).scripts['db:migrate'].matchAll(
      /-f \/workspace\/(\S+\.sql)/g,
    ),
  ].map((match) => match[1]);
  assert.equal(paths.at(-1)?.split('/').at(-1), migrationHead);
  const c26Index = paths.findIndex((path) => path.endsWith(`/${c26Head}`));
  assert.equal(paths[c26Index - 1]?.split('/').at(-1), checkpointHead);
  assert.equal(c26Index, paths.length - 2, 'only the bounded F04 step may follow C26');
  const manifest = paths.map((path) => ({
    path,
    digest: createHash('sha256').update(readFileSync(path)).digest('hex'),
  }));
  const reports = [];
  for (const runtime of runtimes.filter((r) => !selected || r.name === selected)) {
    const prefix = `f010_c28_restore_${randomBytes(8).toString('hex')}`;
    const source = `${prefix}_src`,
      target = `${prefix}_dst`;
    const created = new Set();
    const create = (database) => {
      sql(runtime, runtime.admin, `CREATE DATABASE "${database}" TEMPLATE template0;`);
      created.add(database);
    };
    let stage = 'fresh-migrations';
    try {
      create(source);
      sql(
        runtime,
        source,
        'CREATE SCHEMA f010_c28_harness; CREATE TABLE f010_c28_harness.receipts (path text PRIMARY KEY, digest text NOT NULL);',
      );
      const readReceipts = () => {
        const receipts = JSON.parse(
          sql(
            runtime,
            source,
            "SELECT coalesce(json_agg(r ORDER BY path),'[]'::json) FROM f010_c28_harness.receipts r;",
          ),
        );
        // The canonical chain is not lexically ordered (infra precedes supabase).
        receipts.sort((a, b) => paths.indexOf(a.path) - paths.indexOf(b.path));
        return receipts;
      };
      const applyForward = (through = manifest.length) => {
        const receipts = readReceipts();
        const pending = pendingForwardMigrations(manifest, receipts, through);
        for (const entry of pending) {
          migration(runtime, source, entry.path);
          sql(
            runtime,
            source,
            `INSERT INTO f010_c28_harness.receipts VALUES ('${entry.path}','${entry.digest}');`,
          );
          if (entry.path.endsWith('20260924000100_f009_patient_queue_delay_projection.sql')) {
            sql(
              runtime,
              source,
              readFileSync('infra/db/fixtures/clinic-scheduling-restore.sql', 'utf8'),
            );
          }
        }
        return pending;
      };
      stage = 'pre-C26-forward-migrations';
      applyForward(c26Index);
      const checkpointReceipts = readReceipts();
      assert.deepEqual(
        checkpointReceipts,
        manifest.slice(0, c26Index),
        'C28 source did not stop at the C23 receipt checkpoint',
      );
      assert.deepEqual(
        pendingForwardMigrations(manifest, checkpointReceipts, c26Index + 1),
        [manifest[c26Index]],
        'C26 must be the sole pending forward migration',
      );
      stage = 'synthetic-state';
      sql(runtime, source, fixture());
      databaseRoleClock(runtime, source);
      const apiFixtureIds = restoreApiFixture(runtime, source, 'seed');
      const beforeUpgrade = JSON.parse(sql(runtime, source, snapshotSql));
      stage = 'populated-C23-to-C26-upgrade';
      assert.deepEqual(
        applyForward(c26Index + 1),
        [manifest[c26Index]],
        'populated C28 source did not apply only pending C26',
      );
      assert.deepEqual(
        readReceipts(),
        manifest.slice(0, c26Index + 1),
        'C26 forward receipt was not recorded',
      );
      const afterUpgrade = JSON.parse(sql(runtime, source, snapshotSql));
      const changedC26Functions = verifyForwardUpgrade(beforeUpgrade, afterUpgrade);
      sql(runtime, source, securitySql);
      sql(runtime, source, c26AuthorizationOrderingSql());
      assert.deepEqual(
        JSON.parse(sql(runtime, source, snapshotSql)),
        afterUpgrade,
        'C26 authorization-ordering checks changed durable source state',
      );
      stage = 'populated-C26-to-F04-upgrade';
      assert.deepEqual(applyForward(), [manifest.at(-1)]);
      assert.deepEqual(readReceipts(), manifest, 'F04 forward receipt was not recorded');
      const before = JSON.parse(sql(runtime, source, snapshotSql));
      const changedF04Functions = verifyF04ForwardUpgrade(afterUpgrade, before);
      stage = 'backup';
      const backup = docker(
        runtime,
        ['pg_dump', '-Fc', '-U', runtime.user, '-d', source],
        undefined,
        true,
      );
      const started = performance.now();
      stage = 'restore';
      create(target);
      docker(
        runtime,
        ['pg_restore', '--exit-on-error', '--no-owner', '-U', runtime.user, '-d', target],
        backup,
        true,
      );
      databaseRoleClock(runtime, target);
      const restoredReceipts = JSON.parse(
        sql(runtime, target, 'SELECT json_agg(r ORDER BY path) FROM f010_c28_harness.receipts r;'),
      );
      restoredReceipts.sort((a, b) => paths.indexOf(a.path) - paths.indexOf(b.path));
      assert.deepEqual(
        pendingForwardMigrations(manifest, restoredReceipts),
        [],
        'restored migration expectations incompatible',
      );
      stage = 'integrity';
      const restored = JSON.parse(sql(runtime, target, snapshotSql));
      if (before.securityDigest !== restored.securityDigest) {
        for (const part of [
          'functionDigests',
          'tableDigests',
          'constraintDigests',
          'triggerDigests',
          'policyDigests',
        ]) {
          console.log(
            JSON.stringify({
              part,
              changed: Object.keys(before[part]).filter(
                (key) => before[part][key] !== restored[part][key],
              ),
            }),
          );
        }
      }
      sql(runtime, target, securitySql);
      stage = 'restored-api-compatibility';
      const apiCompatibilityChecks = restoreApiFixture(runtime, target, 'verify', apiFixtureIds);
      assert.deepEqual(
        JSON.parse(sql(runtime, target, snapshotSql)),
        restored,
        'read-only restored API compatibility checks changed durable data',
      );
      stage = 'live-authorization';
      sql(runtime, target, authorizationSql());
      sql(runtime, target, c26AuthorizationOrderingSql());
      assert.deepEqual(
        JSON.parse(sql(runtime, target, snapshotSql)),
        restored,
        'rolled-back authorization checks changed durable state',
      );
      stage = 'C26-restored-replay';
      migration(runtime, target, paths[c26Index]);
      assert.deepEqual(JSON.parse(sql(runtime, target, snapshotSql)), restored);
      stage = 'F04-restored-replay';
      migration(runtime, target, paths.at(-1));
      assert.deepEqual(JSON.parse(sql(runtime, target, snapshotSql)), restored);
      const report = verifyRestoreProof({
        runtime: runtime.name,
        sourceDatabase: source,
        restoreTarget: target,
        backupForm:
          'pg_dump custom (-Fc), pg_restore --exit-on-error --no-owner; same cluster isolated databases',
        backupBytes: backup.length,
        restoreMs: performance.now() - started,
        source: before,
        restored,
        authorizationChecks: checks,
        migrationHead,
        forwardMigrations: paths.length,
        forwardUpgrade: 'C23-to-C26-populated-data-preserved',
        changedC26Functions,
        apiCompatibility: 'PASS',
        apiCompatibilityChecks,
        c26RestoredReplay: 'PASS',
        changedF04Functions,
        f04ForwardUpgrade: 'C26-to-F04-populated-data-preserved',
        f04RestoredReplay: 'PASS',
      });
      reports.push(report);
      console.log(
        JSON.stringify({
          runtime: report.runtime,
          backupBytes: report.backupBytes,
          restoreMs: report.restoreMs,
          counts: report.restored.counts,
          dataDigest: report.restored.dataDigest,
          securityDigest: report.restored.securityDigest,
          authorizationChecks: report.authorizationChecks,
          productionRpoRto: report.productionRpoRto,
        }),
      );
    } catch (error) {
      throw new Error(`C28 restore failed at ${stage} (${runtime.name})`, { cause: error });
    } finally {
      for (const database of created) {
        assert.ok(database === source || database === target);
        assert.match(database, /^f010_c28_restore_[a-f0-9]{16}_(src|dst)$/);
        sql(runtime, runtime.admin, `DROP DATABASE "${database}";`);
      }
    }
  }
  if (process.env['SHIFAA_F010_RESTORE_REPORT'])
    writeFileSync(process.env['SHIFAA_F010_RESTORE_REPORT'], JSON.stringify(reports, null, 2));
  return reports;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href)
  await runRestore();
