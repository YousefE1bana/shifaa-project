// PR-490 round 2: actual non-owner disclosure and affected-assertion guard proof.
// Synthetic owner setup is confined to harness-owned temporary databases.
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { withContent, request } from './run-feature-011-content-api-test.mjs';
import { report as allergyReport } from './run-feature-011-allergy-api-test.mjs';
import { root, runtimes, sql } from './run-feature-011-postgres-test.mjs';
import { session, marker } from './run-feature-011-concurrency-test.mjs';
import { currentPhysicalSourceDigests } from './verify-feature-011-contracts.mjs';

const q = (v) => "'" + String(v).replaceAll("'", "''") + "'";
const person = 'f0110000-0000-4000-8000-000000000002';
const facility = 'f0110000-0000-4000-8200-000000000001';
const results = [];
const sourceDigests = currentPhysicalSourceDigests(root);
async function rowLockWait(runtime, database, holderPid, contenderPid) {
  assert.ok(
    Number.isInteger(holderPid) && Number.isInteger(contenderPid) && holderPid !== contenderPid,
  );
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    const r = sql(
      runtime,
      database,
      `SELECT json_build_object('holderPid',${holderPid},'contenderPid',${contenderPid},
      'blockingPids',pg_blocking_pids(${contenderPid}),'locks',(SELECT coalesce(json_agg(json_build_object(
        'locktype',locktype,'mode',mode,'granted',granted)),'[]'::json) FROM pg_locks WHERE pid=${contenderPid}),
      'waitEvent',(SELECT wait_event_type FROM pg_stat_activity WHERE pid=${contenderPid}));`,
    );
    const facts = JSON.parse(r.stdout.trim());
    if (
      facts.blockingPids.includes(holderPid) &&
      facts.waitEvent === 'Lock' &&
      facts.locks.some((l) => !l.granted)
    )
      return facts;
    await new Promise((done) => setTimeout(done, 25));
  }
  throw Error('No actual row-lock barrier observed; setup failure, not a race result');
}
for (const runtime of runtimes) {
  await withContent(runtime, async (h) => {
    assert.ok(
      h.health.manifest.serverVersion.startsWith(
        runtime.name === 'shifaa-local-postgres' ? '17.11' : '17.6',
      ),
      'pinned PostgreSQL runtime',
    );
    const created = await h.content(request);
    assert.equal(created.statusCode, 201, 'valid draft setup');
    const release = created.json().releaseId;
    const read = () =>
      sql(
        runtime,
        h.database,
        `BEGIN;
      SELECT set_config('shifaa.person_id',${q(person)},true);
      SELECT set_config('shifaa.actor_role','CLN',true);
      SELECT set_config('shifaa.aal','2',true);
      SELECT set_config('shifaa.action','listClinicalContent',true);
      SELECT set_config('shifaa.purposes','synthetic.feature011',true);
      SELECT set_config('shifaa.facility_id',${q(facility)},true);
      SELECT clinical.list_clinical_content_api_v1('synthetic',
        ${q(JSON.stringify({ projection: 'assigned_review', releaseId: release }))}::jsonb);
      ROLLBACK;`,
        { user: 'shifaa_api', allowFailure: true },
      );
    const expectAllowed = (name) => {
      const r = read();
      assert.equal(r.exitCode, 0, name + ': healthy authorized read');
      assert.ok(r.stdout.includes(release), name + ': exact release');
      results.push({ runtime: runtime.name, scenario: name, result: 'PASS' });
    };
    const cases = [
      [
        'FACILITY_SUSPENDED',
        `UPDATE identity.facilities SET facility_status='suspended' WHERE id=${q(facility)};`,
        `UPDATE identity.facilities SET facility_status='pending_review' WHERE id=${q(facility)}; UPDATE identity.facilities SET facility_status='active' WHERE id=${q(facility)};`,
      ],
      [
        'FACILITY_LICENSE_EXPIRED',
        `UPDATE identity.facility_licenses SET status='expired',expires_on=current_date-1 WHERE facility_id=${q(facility)};`,
        `UPDATE identity.facility_licenses SET status='verified',expires_on='2099-12-31' WHERE facility_id=${q(facility)};`,
      ],
      [
        'MEMBERSHIP_ENDED',
        `UPDATE identity.facility_memberships SET membership_status='ended' WHERE facility_id=${q(facility)} AND person_id=${q(person)};`,
        `UPDATE identity.facility_memberships SET membership_status='active' WHERE facility_id=${q(facility)} AND person_id=${q(person)};`,
      ],
      [
        'MEMBERSHIP_EXPIRED',
        `UPDATE identity.facility_memberships SET valid_until=clock_timestamp()-interval '1 second' WHERE facility_id=${q(facility)} AND person_id=${q(person)};`,
        `UPDATE identity.facility_memberships SET valid_until=NULL WHERE facility_id=${q(facility)} AND person_id=${q(person)};`,
      ],
    ];
    expectAllowed('ACTIVE_FACILITY_REVIEW');
    for (const [name, lose, restore] of cases) {
      sql(runtime, h.database, lose);
      try {
        const r = read();
        if (r.exitCode !== 0 && !/\b42501\b/.test(r.output))
          throw Error(name + ': setup/runtime error');
        results.push({
          runtime: runtime.name,
          scenario: name,
          result: r.exitCode !== 0 ? 'PASS' : 'FAIL',
          reason:
            r.exitCode === 0 ? 'stale facility authority disclosed exact draft' : 'SQLSTATE 42501',
        });
      } finally {
        sql(runtime, h.database, restore);
      }
    }
    const statement = `SELECT clinical.list_clinical_content_api_v1('synthetic',
      ${q(JSON.stringify({ projection: 'assigned_review', releaseId: release }))}::jsonb);`;
    const context = `SELECT set_config('shifaa.person_id',${q(person)},true),
      set_config('shifaa.actor_role','CLN',true),set_config('shifaa.aal','2',true),
      set_config('shifaa.action','listClinicalContent',true),
      set_config('shifaa.purposes','synthetic.feature011',true),
      set_config('shifaa.facility_id',${q(facility)},true);`;
    // The harness session-label grammar is K07; these connections still target
    // this process's explicitly owned K08 temporary composition database.
    for (const ordering of ['REVOKE_FIRST', 'ACTION_FIRST']) {
      const label = h.database.replace('_k08_', '_k07_');
      const owner = session(runtime, h.database, label + '_holder', runtime.user);
      const api = session(runtime, h.database, label + '_contender');
      try {
        for (const connection of [owner, api]) {
          connection.send("SET statement_timeout='20s'; SELECT pg_backend_pid(); SELECT 'READY';");
          await marker(connection, 'READY');
        }
        const pid = (c) => Number(c.output.trim().split(/\r?\n/)[0]);
        let locks;
        if (ordering === 'REVOKE_FIRST') {
          owner.send('BEGIN; ' + cases[0][1] + " SELECT 'HELD';");
          await marker(owner, 'HELD');
          api.send('BEGIN; ' + context + statement);
          locks = await rowLockWait(runtime, h.database, pid(owner), pid(api));
          owner.send('COMMIT;');
          api.child.stdin.end();
          const result = await api.closed;
          assert.notEqual(result.code, 0, 'revoke-first cannot disclose');
          assert.match(result.output, /\b42501\b/, 'setup failures are not denial proof');
        } else {
          api.send('BEGIN; ' + context + statement + " SELECT 'ALLOWED';");
          await marker(api, 'ALLOWED');
          assert.ok(api.output.includes(release), 'action-first exact authorized draft');
          owner.send('BEGIN; ' + cases[0][1] + " COMMIT; SELECT 'REVOKED';");
          locks = await rowLockWait(runtime, h.database, pid(api), pid(owner));
          api.send('COMMIT;');
          await marker(owner, 'REVOKED');
        }
        results.push({
          runtime: runtime.name,
          scenario: ordering + '_ASSIGNED_REVIEW',
          result: 'PASS',
          independentPids: [pid(owner), pid(api)],
          locks,
        });
      } finally {
        for (const connection of [owner, api]) {
          if (!connection.ended && !connection.child.stdin.writableEnded) {
            connection.send('ROLLBACK;');
            connection.child.stdin.end();
          }
          await connection.closed;
        }
        const status = sql(
          runtime,
          h.database,
          `SELECT facility_status FROM identity.facilities WHERE id=${q(facility)};`,
        ).stdout.trim();
        if (status === 'suspended') sql(runtime, h.database, cases[0][2]);
      }
    }
    // A legitimately global grant does not infer a facility dependency.
    sql(
      runtime,
      h.database,
      `UPDATE clinical.content_governance_authorities SET facility_id=NULL,version=version+1 WHERE person_id=${q(person)} AND action='listClinicalContent';`,
    );
    sql(runtime, h.database, cases[0][1]);
    try {
      expectAllowed('GLOBAL_REVIEW_WITHOUT_FACILITY_AUTHORITY');
    } finally {
      sql(runtime, h.database, cases[0][2]);
    }

    const ids = [];
    for (let n = 0; n < 120; n++) {
      const r = await h.request('POST', allergyReport, { actor: 'patient' });
      assert.equal(r.statusCode, 201, 'corpus seed retains protected all-five mutation');
      ids.push([r.json().allergyId, r.json().revisionId]);
    }
    sql(runtime, h.database, 'ANALYZE clinical.allergies; ANALYZE clinical.allergy_heads;');
    const def = JSON.parse(
      sql(
        runtime,
        h.database,
        "SELECT to_json(pg_get_functiondef('clinical.f011_guard_allergy_verification_binding_v1()'::regprocedure));",
      ).stdout.trim(),
    );
    const query = def
      .slice(def.indexOf('  SELECT EXISTS ('), def.indexOf(' INTO bad;'))
      .replaceAll('affected_allergy_id', q(ids[0][0]) + '::uuid');
    assert.ok(query.startsWith('  SELECT EXISTS ('), 'actual guard query extracted');
    const explain = JSON.parse(
      sql(runtime, h.database, 'EXPLAIN (ANALYZE,BUFFERS,FORMAT JSON) ' + query).stdout.trim(),
    );
    const scoped =
      (def.match(/a\.allergy_id = affected_allergy_id/g) || []).length === 2 &&
      (def.match(/h\.id = affected_allergy_id/g) || []).length === 2;
    const assertionScans = [];
    function collect(plan) {
      if (/^(a|h)(_[0-9]+)?$/.test(plan.Alias ?? ''))
        assertionScans.push({
          alias: plan.Alias,
          rows: plan['Actual Rows'],
          loops: plan['Actual Loops'],
        });
      for (const child of plan.Plans || []) collect(child);
    }
    collect(explain[0].Plan);
    const bounded = assertionScans.every((p) => p.rows <= 1 && p.loops <= 1);
    results.push({
      runtime: runtime.name,
      scenario: 'AFFECTED_ASSERTION_GUARD',
      result: scoped && bounded ? 'PASS' : 'FAIL',
      corpusAssertions: 120,
      assertionScans,
      reason:
        scoped && bounded
          ? 'each invariant branch evaluates only the triggering assertion; related correction joins retained'
          : 'invariant branches evaluate unrelated assertions',
      explain,
    });
  });
}
const report = {
  capturedAt: new Date().toISOString(),
  result: results.every((r) => r.result === 'PASS') ? 'PASS' : 'FAIL',
  results,
  syntheticEngineeringOnly: true,
  sourceDigests,
};
assert.deepEqual(currentPhysicalSourceDigests(root), sourceDigests, 'inputs changed during proof');
const out =
  process.env.F011_ROUND2_REPORT || 'artifacts/feature-011/pr-remediation-round2/regressions.json';
mkdirSync(out.slice(0, out.lastIndexOf('/')), { recursive: true });
writeFileSync(out, JSON.stringify(report, null, 2) + '\n');
console.log(
  JSON.stringify({ result: report.result, results: results.map(({ explain, locks, ...r }) => r) }),
);
if (report.result !== 'PASS') process.exitCode = 1;
