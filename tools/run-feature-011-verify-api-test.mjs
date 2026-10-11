// K13 synthetic clinical fixtures, real native Auth/AES/SQL and independent sessions.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { withAllergyApi, patient, report } from './run-feature-011-allergy-api-test.mjs';
import { runtimes, sql, digest, root } from './run-feature-011-postgres-test.mjs';
import { session, marker } from './run-feature-011-concurrency-test.mjs';
import { PostgresIdentityRepository } from '../services/api/src/adapters/postgres/identity-repository.ts';
import { PostgresFacilityOnboardingService } from '../services/api/src/adapters/postgres/facility-service.ts';
import {
  verifyFeature011Contracts,
  currentPhysicalSourceDigests,
} from './verify-feature-011-contracts.mjs';
const e = 'specs/011-allergies-clinical-content-governance/evidence/fresh-implementation/K13';
const q = (v) => `'${String(v).replaceAll("'", "''")}'`;
const person = 'f0110000-0000-4000-8000-000000000002',
  facility = 'f0110000-0000-4000-8200-000000000001',
  encounter = 'f0110000-0000-4000-8400-000000000001';
const reason = 'K13 neutral synthetic verification reason — سبب تجريبي';
const pause = () => new Promise((done) => setTimeout(done, 25));
function dependencies({ runtime, database }) {
  return {
    evidence: {
      mode: 'isolated-synthetic',
      sourceIdentity: 'synthetic.internal_clinician_provenance',
      now: () => new Date().toISOString().replace(/\.(\d{3})Z$/, '.$1000Z'),
    },
    support: {
      async lookup(ref) {
        const row = JSON.parse(
          sql(
            runtime,
            database,
            `SELECT row_to_json(s) FROM clinical.allergy_verification_support s WHERE id=${q(ref)}::uuid;`,
          ).stdout.trim() || 'null',
        );
        if (!row) throw Error('Unavailable synthetic governed support');
        const used =
          sql(
            runtime,
            database,
            `SELECT EXISTS(SELECT 1 FROM clinical.allergy_verification_bindings WHERE evidence_ref=${q(ref)}::uuid);`,
          ).stdout.trim() === 't';
        return {
          contractId: 'SHIFAA-F011-VERIFIED-EVIDENCE-BINDING/1',
          profile: 'allergy_verification',
          bindingId: randomUUID(),
          producerId: row.producer_id,
          verifiedAt: new Date(row.recorded_at).toISOString().replace(/\.(\d{3})Z$/, '.$1000Z'),
          evidenceRef: row.id,
          patientId: row.patient_id,
          allergyId: row.allergy_id,
          previousRevisionId: row.previous_revision_id,
          previousVersion: row.previous_version,
          revisionId: randomUUID(),
          revisionVersion: row.previous_version + 1,
          targetStatus: row.target_status,
          attestorPersonId: row.attestor_person_id,
          sourceIdentity: row.source_identity,
          sourceEvidenceIdentity: row.source_evidence_identity,
          synthetic: row.synthetic,
          consumed: used,
        };
      },
    },
  };
}
function provision(h, row, targetStatus, overrides = {}) {
  const id = randomUUID(),
    r = {
      patientId: patient,
      allergyId: row.allergyId,
      previousRevisionId: row.revisionId,
      previousVersion: row.version,
      targetStatus,
      attestor: person,
      ...overrides,
    };
  sql(
    h.runtime,
    h.database,
    `INSERT INTO clinical.allergy_verification_support(id,patient_id,allergy_id,previous_revision_id,previous_version,target_status,attestor_person_id,source_identity,source_evidence_identity,producer_id,recorded_at,synthetic) VALUES(${q(id)}::uuid,${q(r.patientId)}::uuid,${q(r.allergyId)}::uuid,${q(r.previousRevisionId)}::uuid,${r.previousVersion},${q(r.targetStatus)},${q(r.attestor)}::uuid,'synthetic.internal_clinician_provenance',${q(id)}::uuid,'f011.allergy_evidence_boundary',clock_timestamp(),true);`,
  );
  return id;
}
function verify(h, row, targetStatus, ref, options = {}) {
  return h.request(
    'POST',
    { targetStatus, reason, verificationEvidenceRef: ref, encounterId: encounter, ...options.body },
    {
      actor: 'clinician',
      url: `/v1/allergies/${row.allergyId}/verification`,
      ...options,
      headers: { 'if-match': `"${row.version}"`, ...options.headers },
    },
  );
}
async function create(h, extra = {}) {
  const r = await h.request('POST', { ...report, ...extra });
  assert.equal(r.statusCode, 201, r.body);
  return r.json();
}
async function waitLocks(h, condition) {
  const deadline = Date.now() + 20000;
  while (Date.now() < deadline) {
    const rows = h.owner(
      `SELECT coalesce(json_agg(json_build_object('pid',a.pid,'user',a.usename,'blocking',pg_blocking_pids(a.pid),'wait',a.wait_event_type,'ungranted',(SELECT count(*) FROM pg_locks l WHERE l.pid=a.pid AND NOT l.granted))), '[]'::json) FROM pg_stat_activity a WHERE a.datname=${q(h.database)} AND a.wait_event_type='Lock';`,
    );
    if (condition(rows)) return rows;
    await pause();
  }
  throw Error('K13 required pg_locks barrier missing; never success');
}
async function holdHead(h, id) {
  const c = session(
    h.runtime,
    h.database,
    h.database.replace('k08', 'k07') + '_holder',
    h.runtime.user,
  );
  c.send(
    `BEGIN; SET LOCAL idle_in_transaction_session_timeout='60s'; SELECT pg_backend_pid(); SELECT id FROM clinical.allergy_heads WHERE id=${q(id)}::uuid FOR UPDATE; SELECT 'HELD';`,
  );
  await marker(c, 'HELD');
  return c;
}
async function release(c) {
  c.send("COMMIT; SELECT 'COMMITTED';");
  await marker(c, 'COMMITTED');
  c.send('\q');
}
async function mainProof(h, control) {
  const tests = [],
    races = [],
    check = (id, value) => {
      assert.ok(value, id);
      tests.push({ id, result: 'PASS' });
    };
  const expect = async (id, status, work, noEffect = true) => {
    const before = h.snapshot(),
      r = await work();
    assert.equal(r.statusCode, status, `${id}: ${r.body}`);
    if (noEffect) assert.deepEqual(h.snapshot(), before);
    tests.push({ id, result: 'PASS', status });
    return r;
  };
  let row = await create(h);
  const initial = row,
    old = h.owner(
      `SELECT row_to_json(a) FROM clinical.allergies a WHERE id=${q(row.revisionId)}::uuid;`,
    );
  let firstReplay;
  for (const target of [
    'clinician_confirmed',
    'refuted',
    'clinician_confirmed',
    'entered_in_error',
  ]) {
    const ref = provision(h, row, target),
      key = randomUUID(),
      before = h.snapshot();
    const response = await expect(
      'APPEND_' + target,
      200,
      () => verify(h, row, target, ref, { key }),
      false,
    );
    firstReplay ??= { row, ref, key, response, target };
    const next = response.json();
    check(
      'EXACT_REVISION_' + next.version,
      next.version === row.version + 1 &&
        next.previousRevisionId === row.revisionId &&
        next.recorderPersonId === initial.recorderPersonId &&
        next.recordedAt === initial.recordedAt &&
        JSON.stringify(next.source) === JSON.stringify(initial.source),
    );
    check(
      'EXPLICIT_UNKNOWN_' + next.version,
      ['coding', 'reaction', 'severity', 'onset'].every(
        (k) => JSON.stringify(next[k]) === '{"knowledge":"unknown"}',
      ),
    );
    const delta = h.snapshot();
    check(
      'ALL_FIVE_APPEND_' + next.version,
      ['revisions', 'audit', 'outbox', 'receipts', 'obligations', 'idempotency'].every(
        (k) => delta[k] === before[k] + 1,
      ),
    );
    const counter = h.counters();
    const replay = await expect('ORIGINAL_REPLAY_' + next.version, 200, () =>
      verify(h, row, target, ref, { key }),
    );
    check(
      'ORIGINAL_BYTES_' + next.version,
      replay.body === response.body &&
        replay.headers.etag === response.headers.etag &&
        replay.headers['x-request-id'] === response.headers['x-request-id'],
    );
    check(
      'NO_NEW_ENCRYPTION_REPLAY_' + next.version,
      h.counters().keyPreparations === counter.keyPreparations + 1,
    );
    await expect('CHANGED_KEY_BINDING_' + next.version, 409, () =>
      verify(h, row, target, ref, { key, body: { reason: reason + ' changed' } }),
    );
    row = next;
  }
  check(
    'PREVIOUS_ENVELOPE_RECORDER_SOURCE_IMMUTABLE',
    JSON.stringify(
      h.owner(
        `SELECT row_to_json(a) FROM clinical.allergies a WHERE id=${q(initial.revisionId)}::uuid;`,
      ),
    ) === JSON.stringify(old),
  );
  const settled = await expect('ORIGINAL_REPLAY_AFTER_TERMINAL_ADVANCEMENT', 200, () =>
    verify(h, firstReplay.row, firstReplay.target, firstReplay.ref, { key: firstReplay.key }),
  );
  check('ORIGINAL_ADVANCED_BYTES', settled.body === firstReplay.response.body);
  const terminalRef = provision(h, row, 'refuted');
  await expect('ENTERED_ERROR_TERMINAL', 409, () => verify(h, row, 'refuted', terminalRef));
  const corrected = await create(h, { correctsAllergyId: row.allergyId });
  check(
    'CORRECTION_NEW_LINKED_SELF_REPORTED',
    corrected.allergyId !== row.allergyId &&
      corrected.correctsAllergyId === row.allergyId &&
      corrected.status === 'self_reported' &&
      corrected.version === 1 &&
      corrected.verification === null,
  );
  const history = await expect('FULL_HISTORY', 200, () =>
    h.request('GET', null, {
      url: `/v1/patients/${patient}/allergies?view=history&allergyId=${initial.allergyId}`,
    }),
  );
  check(
    'FOUR_STATE_HISTORY',
    history.json().data.length === 5 &&
      new Set(history.json().data.map((r) => r.status)).size === 4,
  );
  for (const actor of ['patient', 'delegate', 'outsider']) {
    const ref = provision(h, corrected, 'clinician_confirmed');
    await expect('CLINICIAN_ONLY_' + actor, 403, () =>
      verify(h, corrected, 'clinician_confirmed', ref, { actor }),
    );
  }
  const other = await create(h),
    ref = provision(h, other, 'clinician_confirmed');
  await expect('CROSS_ASSERTION_SUPPORT', 403, () =>
    verify(h, corrected, 'clinician_confirmed', ref),
  );
  await expect('WRONG_TARGET_SUPPORT', 422, () => verify(h, other, 'refuted', ref));
  await expect('NO_NEW_KNOWN_CODING', 422, () =>
    verify(h, other, 'clinician_confirmed', ref, {
      body: {
        corrections: { coding: { knowledge: 'known', value: { system: 'neutral', code: 'X' } } },
      },
    }),
  );
  await expect('STALE_VERSION', 409, () =>
    verify(h, other, 'clinician_confirmed', ref, { headers: { 'if-match': '"2"' } }),
  );
  await expect('MISSING_VERSION', 422, () =>
    verify(h, other, 'clinician_confirmed', ref, { headers: { 'if-match': '' } }),
  );
  await expect('MISSING_REASON', 422, () =>
    verify(h, other, 'clinician_confirmed', ref, { body: { reason: '' } }),
  );
  await expect('NO_VERIFIED_TO_SELF', 422, () => verify(h, other, 'self_reported', ref));
  await expect('MISSING_SUPPORT', 403, () => verify(h, other, 'clinician_confirmed', randomUUID()));
  for (const fault of ['before', 'after', 'unknown']) {
    const a = await create(h),
      support = provision(h, a, 'clinician_confirmed'),
      key = randomUUID(),
      before = h.snapshot();
    h.setFault(fault);
    await expect(
      'FAULT_' + fault,
      500,
      () => verify(h, a, 'clinician_confirmed', support, { key }),
      fault === 'before',
    );
    h.setFault(undefined);
    const done = await expect(
      'SETTLEMENT_' + fault,
      200,
      () => verify(h, a, 'clinician_confirmed', support, { key }),
      false,
    );
    check(
      'FAULT_ONE_DURABLE_' + fault,
      h.snapshot().revisions === before.revisions + 1 && done.json().version === 2,
    );
  }
  for (const category of ['same-head', 'same-support', 'same-key']) {
    const a = await create(h),
      s1 = provision(h, a, 'clinician_confirmed'),
      s2 = category === 'same-head' ? provision(h, a, 'refuted') : s1,
      key = randomUUID();
    let arrived = 0,
      unblock;
    const gate = new Promise((d) => (unblock = d));
    control.before = async () => {
      arrived++;
      await gate;
    };
    const holder = await holdHead(h, a.allergyId),
      before = h.snapshot();
    let pending = [];
    try {
      pending = [
        verify(h, a, 'clinician_confirmed', s1, { key }),
        verify(h, a, category === 'same-head' ? 'refuted' : 'clinician_confirmed', s2, {
          key: category === 'same-key' ? key : randomUUID(),
        }),
      ];
      const deadline = Date.now() + 20000;
      while (arrived < 2 && Date.now() < deadline) await pause();
      assert.equal(arrived, 2, 'Both independently prepared candidates reached the barrier');
      unblock();
      const locks = await waitLocks(
        h,
        (rs) => rs.filter((r) => r.user === 'shifaa_api' && r.ungranted > 0).length >= 2,
      );
      await release(holder);
      const outcomes = await Promise.all(pending);
      const statuses = outcomes.map((r) => r.statusCode).sort();
      assert.deepEqual(
        statuses,
        category === 'same-key' ? [200, 200] : [200, 409],
        outcomes.map((r) => r.body).join('\n'),
      );
      if (category === 'same-key') assert.equal(outcomes[0].body, outcomes[1].body);
      const after = h.snapshot();
      assert.equal(after.revisions - before.revisions, 1);
      assert.equal(after.audit - before.audit, 1);
      assert.equal(after.outbox - before.outbox, 1);
      assert.equal(after.receipts - before.receipts, 1);
      const bindings = h.owner(
        `SELECT json_build_object('count',count(*),'refs',count(DISTINCT evidence_ref)) FROM clinical.allergy_verification_bindings WHERE revision_id IN(SELECT id FROM clinical.allergies WHERE allergy_id=${q(a.allergyId)}::uuid);`,
      );
      assert.deepEqual(bindings, { count: 1, refs: 1 });
      races.push({
        category,
        result: 'PASS',
        statuses,
        locks,
        delta: Object.fromEntries(Object.keys(after).map((k) => [k, after[k] - before[k]])),
      });
    } finally {
      control.before = undefined;
      unblock();
      if (!holder.ended) holder.send('ROLLBACK;\q');
      await Promise.allSettled(pending);
    }
  }
  check('ZERO_EXTERNAL_KEY_WORK_UNDER_OWN_LOCKS', h.counters().externalUnderLocks === 0);
  const final = h.snapshot();
  check(
    'ALL_FIVE_FINAL',
    final.receipts === final.audit &&
      final.receipts === final.outbox &&
      final.receipts === final.obligations &&
      final.receipts === final.idempotency,
  );
  return {
    runtime: h.runtime.name,
    health: h.health,
    result: 'PASS',
    tests,
    count: tests.length,
    races,
    durable: final,
    counters: h.counters(),
    predecessorPreserved: true,
  };
}
async function writer(h) {
  const membership = h.owner(
    `SELECT json_build_object('id',id,'version',version) FROM identity.facility_memberships WHERE person_id=${q(person)}::uuid AND facility_id=${q(facility)}::uuid AND membership_status='active';`,
  );
  const repo = new PostgresIdentityRepository(
    `postgres://shifaa_api:synthetic_api_only@127.0.0.1:${h.runtime === runtimes[0] ? 5432 : 54322}/${h.database}`,
  );
  const service = new PostgresFacilityOnboardingService(
    repo,
    new Uint8Array(32).fill(17),
    new Uint8Array(32).fill(23),
  );
  let release,
    held = false,
    error,
    identity;
  const gate = new Promise((d) => (release = d));
  const promise = repo.withRawTransaction(async (tx) => {
    [identity] = await tx`SELECT pg_backend_pid() AS pid`;
    await service.endMembership(
      {
        personId: person,
        principal: 'synthetic-k13',
        adminRole: 'facility_approver',
        aal: 2,
        purpose: 'professional_license_review',
        requestId: randomUUID(),
      },
      facility,
      membership.id,
      { reason: 'synthetic.k13.revoke' },
      membership.version,
    );
    held = true;
    await gate;
  });
  promise.catch((e) => (error = e));
  return {
    membership,
    get identity() {
      return identity;
    },
    get held() {
      return held;
    },
    get error() {
      return error;
    },
    commit: async () => {
      release();
      await promise;
    },
    close: async () => {
      release();
      await Promise.allSettled([promise, repo.close()]);
    },
  };
}
async function authorityProof(h, control, schedule) {
  const a = await create(h),
    ref = provision(h, a, 'clinician_confirmed'),
    before = h.snapshot();
  let action,
    write,
    releaseAction,
    ready = false;
  try {
    if (schedule === 'action-first') {
      const gate = new Promise((d) => (releaseAction = d));
      control.after = async () => {
        ready = true;
        await gate;
      };
      action = verify(h, a, 'clinician_confirmed', ref);
      const until = Date.now() + 20000;
      while (!ready && Date.now() < until) await pause();
      assert(ready);
      write = await writer(h);
      const locks = await waitLocks(
        h,
        (rs) => !!write.identity && rs.some((r) => r.pid === write.identity.pid && r.ungranted > 0),
      );
      releaseAction();
      const result = await action;
      assert.equal(result.statusCode, 200, result.body);
      while (!write.held && !write.error) await pause();
      if (write.error) throw write.error;
      await write.commit();
      return {
        schedule,
        result: 'PASS',
        status: 200,
        locks,
        writer: 'PostgresFacilityOnboardingService.endMembership',
        delta: h.snapshot().revisions - before.revisions,
      };
    }
    write = await writer(h);
    while (!write.held && !write.error) await pause();
    if (write.error) throw write.error;
    action = verify(h, a, 'clinician_confirmed', ref);
    const locks = await waitLocks(h, (rs) =>
      rs.some(
        (r) =>
          r.user === 'shifaa_api' &&
          r.pid !== write.identity.pid &&
          r.blocking.includes(write.identity.pid),
      ),
    );
    await write.commit();
    const result = await action;
    assert.equal(result.statusCode, 403, result.body);
    assert.equal(h.snapshot().revisions, before.revisions);
    return {
      schedule,
      result: 'PASS',
      status: 403,
      locks,
      writer: 'PostgresFacilityOnboardingService.endMembership',
      delta: 0,
    };
  } finally {
    control.after = undefined;
    releaseAction?.();
    await write?.close();
    if (action) await Promise.allSettled([action]);
  }
}
export async function runK13() {
  const parity = await verifyFeature011Contracts({ root });
  assert.equal(parity.result, 'PASS', JSON.stringify(parity.failures));
  const paths = [
    'services/api/src/modules/feature-011/verify-allergy.ts',
    'services/api/src/modules/feature-011/verify-allergy.test.ts',
    'services/api/src/modules/feature-011/allergies.ts',
    'services/api/src/routes/feature-011-allergies.ts',
    'tools/run-feature-011-verify-api-test.mjs',
    'tools/run-feature-011-allergy-api-test.mjs',
  ];
  const inputs = Object.fromEntries(paths.map((p) => [p, digest(p)])),
    physical = currentPhysicalSourceDigests(root);
  const results = [];
  for (const runtime of runtimes) {
    console.log(runtime.name + ': K13 clean native verification/history/race proof');
    const control = {};
    const options = {
      dependencies,
      beforeMutation: async () => control.before?.(),
      afterFinalization: async () => control.after?.(),
      forbiddenValues: [reason],
    };
    const result = await withAllergyApi(runtime, (h) => mainProof(h, control), options);
    result.authority = [];
    for (const schedule of ['revoke-first', 'action-first'])
      result.authority.push(
        await withAllergyApi(runtime, (h) => authorityProof(h, control, schedule), options),
      );
    assert.equal(result.authority.find((r) => r.schedule === 'action-first').delta, 1);
    results.push(result);
  }
  for (const [p, sha] of Object.entries(inputs)) assert.equal(digest(p), sha);
  assert.deepEqual(currentPhysicalSourceDigests(root), physical);
  const proof = {
    checkpoint: 'K13',
    tasks: ['T052', 'T053'],
    result: 'PASS',
    capturedAt: new Date().toISOString(),
    inputs,
    physicalSourceDigests: physical,
    runtimes: results,
    syntheticEngineeringOnly: true,
    productionKms: false,
    clinicalApproval: false,
    acceptance: 'PENDING_PRODUCT_OWNER',
    retainedGates: 'UNCHANGED_OPEN',
  };
  mkdirSync(e, { recursive: true });
  for (const name of ['verify-api.json', 'verify-api-proof.json'])
    writeFileSync(`${e}/${name}`, JSON.stringify(proof, null, 2) + '\n');
  console.log(
    JSON.stringify({
      result: 'PASS',
      runtimes: results.map((r) => ({
        runtime: r.runtime,
        count: r.count,
        races: r.races.length,
        authority: r.authority.length,
      })),
    }),
  );
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href)
  await runK13();
