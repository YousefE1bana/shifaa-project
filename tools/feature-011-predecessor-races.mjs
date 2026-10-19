import { testRuntime } from './verification-database.mjs';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  root,
  sql,
  prepare,
  withDatabase,
  digest,
  runtimes,
} from './run-feature-011-postgres-test.mjs';
import { session, marker } from './run-feature-011-concurrency-test.mjs';

const id = (suffix) => `f0101000-0000-4000-${suffix}`;
const q = (value) => `'${String(value).replaceAll("'", "''")}'`;
const delay = () => new Promise((done) => setTimeout(done, 25));
function baselineFixture(runtime, database, writer) {
  if (writer === 'facility')
    return { fixture: 'K03 freshly revalidated neutral predecessor fixture' };
  const path = 'infra/db/tests/feature-010-api.sql';
  let prefix = readFileSync(resolve(root, path), 'utf8').split(
    '-- Place the expected red check after all synthetic fixture SQL has parsed and',
  )[0];
  assert.ok(prefix.startsWith('-- Feature 010 C10'));
  // The historical intentionally corrupted unrelated queue row is not a healthy race fixture.
  const corrupted =
    /ALTER TABLE clinical\.queue_entries DISABLE TRIGGER USER;\r?\nUPDATE clinical\.queue_entries SET queue_scope_id=[\s\S]*?ALTER TABLE clinical\.queue_entries ENABLE TRIGGER USER;/;
  assert.ok(corrupted.test(prefix));
  prefix = prefix.replace(corrupted, '');
  sql(runtime, database, prefix + '\nCOMMIT;');
  if (writer === 'continuity')
    sql(
      runtime,
      database,
      `BEGIN;
    SELECT set_config('shifaa.environment','ci',true),set_config('shifaa.test_now','2030-04-05T08:00:00Z',true),set_config('shifaa.person_id','f0110000-0000-4000-8000-000000000004',true);
    INSERT INTO identity.admin_role_grants(id,person_id,role_code,status,valid_from,valid_until,proposed_by)
    VALUES('f0114000-0000-4000-8000-000000000001','f0110000-0000-4000-8000-000000000008','support_admin','pending','2020-01-01','2035-01-01','f0110000-0000-4000-8000-000000000004');
    SELECT set_config('shifaa.person_id','f0110000-0000-4000-8000-000000000005',true);
    UPDATE identity.admin_role_grants SET status='active',decided_by='f0110000-0000-4000-8000-000000000005',decision_reason='synthetic.k04.assignment' WHERE id='f0114000-0000-4000-8000-000000000001';
    INSERT INTO identity.continuity_cases(id,case_type,subject_person_id,subject_patient_id,relationship_id,status,assigned_reviewer_person_id,created_at)
    VALUES('f0114000-0000-4000-8000-000000000002','dependent_transition',${q(id('8000-000000000002'))},${q(id('8100-000000000001'))},${q(id('8d00-000000000001'))},'review_required','f0110000-0000-4000-8000-000000000008','2030-04-05T08:00:00Z');
    COMMIT;`,
    );
  return {
    fixture: path,
    sha256: digest(path),
    reuse:
      'Only the current prerequisite prefix, excluding its deliberately corrupted queue vector; full setup and actual writer freshly executed',
    feature011HistoricalCompletionReused: false,
  };
}
async function identity(connection) {
  connection.send(
    `SET statement_timeout='15s'; SET idle_in_transaction_session_timeout='30s'; SELECT json_build_object('pid',pg_backend_pid(),'user',current_user); SELECT 'IDENTITY';`,
  );
  await marker(connection, 'IDENTITY');
  return JSON.parse(connection.output.split(/\r?\n/).find((line) => line.startsWith('{')));
}
async function rowWait(runtime, database, holderPid, contenderPid) {
  const deadline = Date.now() + 10000;
  while (Date.now() < deadline) {
    const result = sql(
      runtime,
      database,
      `SELECT json_build_object('holderPid',${holderPid},'contenderPid',${contenderPid},'blockingPids',pg_blocking_pids(${contenderPid}),'waitEvent',(SELECT wait_event_type FROM pg_stat_activity WHERE pid=${contenderPid}),'locks',(SELECT json_agg(json_build_object('pid',pid,'type',locktype,'mode',mode,'granted',granted,'relation',relation::regclass::text)) FROM pg_locks WHERE pid IN (${holderPid},${contenderPid})));`,
    );
    const facts = JSON.parse(result.stdout.trim());
    if (
      facts.blockingPids.includes(holderPid) &&
      facts.waitEvent === 'Lock' &&
      facts.locks.some(
        (lock) =>
          lock.pid === contenderPid &&
          !lock.granted &&
          ['transactionid', 'tuple'].includes(lock.type),
      )
    )
      return { ...facts, observerCommand: result.command };
    await delay();
  }
  throw new Error('Actual predecessor row-lock blocking was not observed; never RED.');
}
function writerSql(writer) {
  const context = `SELECT set_config('shifaa.environment','ci',true),set_config('shifaa.test_now','2030-04-05T08:00:00Z',true),set_config('shifaa.aal','2',true);`;
  if (writer === 'continuity')
    return `${context}
    SELECT set_config('shifaa.person_id','f0110000-0000-4000-8000-000000000008',true),set_config('shifaa.actor_role','ADM-SUPPORT',true),set_config('shifaa.action','transitionDependent',true),set_config('shifaa.purposes','guardianship_review',true),set_config('shifaa.factor_amr_at','2030-04-05T07:59:00Z',true);
    SELECT platform.decide_dependent_transition(${q(id('8d00-000000000001'))},1,'approve','synthetic.k04.transition',NULL);`;
  return `${context}
    SELECT set_config('shifaa.person_id',${q(id('8000-000000000001'))},true),set_config('shifaa.actor_role','CLN',true),set_config('shifaa.action','completeEncounter',true),set_config('shifaa.purposes','appointment.scheduling',true),set_config('shifaa.request_id','f0114000-0000-4000-9000-000000000001',true),set_config('shifaa.trace_id','f011-k04-predecessor',true),set_config('shifaa.idempotency_key','f011-k04-baseline-completion',true),set_config('shifaa.request_hash',repeat('a',64),true);
    SELECT clinical.complete_encounter_api_v1(${q(id('8800-000000000002'))},1,'{"summary":"Synthetic K04 predecessor health","structuralConfirmation":true}'::jsonb);`;
}
async function pair(runtime, database, writer, schedule) {
  const targets = {
    facility: { table: 'identity.facilities', id: 'f0110000-0000-4000-8200-000000000001' },
    continuity: { table: 'identity.care_relationships', id: id('8d00-000000000001') },
    f010: { table: 'clinical.encounters', id: id('8800-000000000002') },
  };
  const target = targets[writer];
  const probe = session(runtime, database, `${database}_holder`, runtime.user);
  let writerConnection,
    repository,
    writerPromise,
    writerError,
    releaseWriter,
    held = false,
    writerIdentity;
  const release = new Promise((done) => (releaseWriter = done));
  let locks;
  try {
    const probeIdentity = await identity(probe);
    const holdProbe = async () => {
      probe.send(
        `BEGIN; SELECT id FROM ${target.table} WHERE id=${q(target.id)} FOR SHARE; SELECT 'PROBE_HELD';`,
      );
      await marker(probe, 'PROBE_HELD');
    };
    if (schedule === 'action-first') await holdProbe();
    if (writer === 'facility') {
      const { tsImport } = await import(
        pathToFileURL(resolve(root, 'services/api/node_modules/tsx/dist/esm/api/index.mjs')).href
      );
      const { PostgresIdentityRepository } = await tsImport(
        pathToFileURL(resolve(root, 'services/api/src/adapters/postgres/identity-repository.ts'))
          .href,
        import.meta.url,
      );
      const { PostgresFacilityOnboardingService } = await tsImport(
        pathToFileURL(resolve(root, 'services/api/src/adapters/postgres/facility-service.ts')).href,
        import.meta.url,
      );
      repository = new PostgresIdentityRepository(
        `postgres://shifaa_api:synthetic_api_only@127.0.0.1:${testRuntime(runtime === runtimes[0] ? 'postgres' : 'supabase').port}/${database}`,
      );
      const membership = JSON.parse(
        sql(
          runtime,
          database,
          "SELECT json_build_object('id',id,'version',version) FROM identity.facility_memberships WHERE facility_id='f0110000-0000-4000-8200-000000000001';",
        ).stdout.trim(),
      );
      const service = new PostgresFacilityOnboardingService(
        repository,
        new Uint8Array(32).fill(17),
        new Uint8Array(32).fill(23),
      );
      writerPromise = repository.withRawTransaction(async (tx) => {
        await tx`SET statement_timeout='15s'`;
        [writerIdentity] = await tx`SELECT pg_backend_pid() AS pid,current_user AS "user"`;
        await service.endMembership(
          {
            personId: 'f0110000-0000-4000-8000-000000000002',
            principal: 'synthetic-k04',
            adminRole: 'facility_approver',
            aal: 2,
            purpose: 'professional_license_review',
            requestId: 'f0114000-0000-4000-9000-000000000001',
          },
          target.id,
          membership.id,
          { reason: 'synthetic.k04.revoke' },
          membership.version,
        );
        held = true;
        await release;
      });
      writerPromise.catch((error) => {
        writerError = error;
      });
      const deadline = Date.now() + 10000;
      while (!writerIdentity && !writerError && Date.now() < deadline) await delay();
      if (writerError) throw writerError;
      assert.ok(writerIdentity, 'Actual repository connection did not start.');
    } else {
      writerConnection = session(runtime, database, `${database}_contender`);
      writerIdentity = await identity(writerConnection);
      writerConnection.send(`BEGIN; ${writerSql(writer)} SELECT 'WRITER_HELD';`);
    }
    assert.equal(writerIdentity.user, 'shifaa_api');
    assert.notEqual(probeIdentity.pid, writerIdentity.pid);
    const awaitHeld = async () => {
      if (writerConnection) return marker(writerConnection, 'WRITER_HELD');
      const deadline = Date.now() + 10000;
      while (!held && !writerError && Date.now() < deadline) await delay();
      if (writerError) throw writerError;
      assert.ok(held, 'Actual facility writer did not reach its barrier.');
    };
    if (schedule === 'writer-first') {
      await awaitHeld();
      probe.send(
        `BEGIN; SELECT id FROM ${target.table} WHERE id=${q(target.id)} FOR SHARE; SELECT 'PROBE_HELD';`,
      );
      locks = await rowWait(runtime, database, writerIdentity.pid, probeIdentity.pid);
      releaseWriter();
      if (writerConnection) {
        writerConnection.send("COMMIT; SELECT 'WRITER_COMMITTED';");
        await marker(writerConnection, 'WRITER_COMMITTED');
      } else await writerPromise;
      await marker(probe, 'PROBE_HELD');
      probe.send("ROLLBACK; SELECT 'PROBE_RELEASED';");
      await marker(probe, 'PROBE_RELEASED');
    } else {
      locks = await rowWait(runtime, database, probeIdentity.pid, writerIdentity.pid);
      probe.send("ROLLBACK; SELECT 'PROBE_RELEASED';");
      await marker(probe, 'PROBE_RELEASED');
      await awaitHeld();
      releaseWriter();
      if (writerConnection) {
        writerConnection.send("COMMIT; SELECT 'WRITER_COMMITTED';");
        await marker(writerConnection, 'WRITER_COMMITTED');
      } else await writerPromise;
    }
    const stateQuery =
      writer === 'facility'
        ? "SELECT membership_status FROM identity.facility_memberships WHERE facility_id='f0110000-0000-4000-8200-000000000001'"
        : `SELECT status FROM ${target.table} WHERE id=${q(target.id)}`;
    const state = sql(runtime, database, stateQuery).stdout.trim();
    assert.equal(state, { facility: 'ended', continuity: 'revoked', f010: 'completed' }[writer]);
    return {
      writer,
      schedule,
      result: 'PASS_ACTUAL_PREDECESSOR_WRITER_AND_ROW_BARRIER_HEALTH',
      probeIdentity,
      writerIdentity,
      target,
      locks,
      durableState: state,
      writerCommitted: true,
      feature011RaceBehaviorProven: false,
      probe:
        'Neutral owner SHARE probe; Feature 011 action is absent and is tested separately as missing-physical RED',
      source:
        writer === 'facility'
          ? 'PostgresFacilityOnboardingService.endMembership'
          : writer === 'continuity'
            ? 'platform.decide_dependent_transition(uuid,integer,text,text,text)'
            : 'clinical.complete_encounter_api_v1(uuid,integer,jsonb)',
      sourceSha256:
        writer === 'facility'
          ? digest('services/api/src/adapters/postgres/facility-service.ts')
          : undefined,
    };
  } finally {
    releaseWriter();
    for (const connection of [probe, writerConnection].filter(Boolean))
      if (!connection.ended && !connection.child.stdin.writableEnded) {
        connection.send('ROLLBACK;');
        connection.child.stdin.end();
      }
    await Promise.allSettled([probe.closed, writerConnection?.closed, writerPromise]);
    if (repository) await repository.close();
  }
}
export async function provePredecessorRaces(runtime) {
  const results = [];
  for (const writer of ['facility', 'continuity', 'f010'])
    for (const schedule of ['writer-first', 'action-first']) {
      const result = await withDatabase(
        runtime,
        async (database) => {
          prepare(runtime, database);
          const fixture = baselineFixture(runtime, database, writer);
          return { ...(await pair(runtime, database, writer, schedule)), fixture, database };
        },
        'K04',
      );
      results.push(result);
      console.log(
        `${runtime.name}: actual ${writer} ${schedule} committed, row-lock/barrier and exact cleanup PASS`,
      );
    }
  return {
    result: 'PASS_PREDECESSOR_HEALTH',
    results,
    lockOrderAuthority: 'data-model.md section 11',
    feature011RaceAcceptance: false,
  };
}
