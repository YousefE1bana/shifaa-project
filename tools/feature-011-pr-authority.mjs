// PR-490 current-authority regressions. The root agent runs this serially on
// both isolated PostgreSQL runtimes; this file never connects to a database
// unless explicitly invoked.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { hashRequest, idempotencyScopeHash } from '../services/api/src/platform/idempotency.ts';
import { withAllergyApi, patient, report } from './run-feature-011-allergy-api-test.mjs';
import { request as contentRequest, withContent } from './run-feature-011-content-api-test.mjs';
import { withOperationalContent } from './feature-011-ops-fixtures.mjs';
import { root, runtimes, sql } from './run-feature-011-postgres-test.mjs';

const baselineRef = 'bea8fad786b387fe39b7a9aabd2e60dd2df7cc53';
const baseline = process.argv.includes('--review-baseline');
const quote = (value) => `'${String(value).replaceAll("'", "''")}'`;
const person = (n) => `f0110000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const facility = 'f0110000-0000-4000-8200-000000000001';
const expectedLabel = baseline ? 'BASELINE_REPRODUCED' : 'CURRENT_FIXED';
const results = [];

function baselineFunction(path, name) {
  const source = execFileSync('git', ['show', `${baselineRef}:${path}`], {
    cwd: root,
    encoding: 'utf8',
    windowsHide: true,
  });
  const start = source.indexOf(`CREATE FUNCTION clinical.${name}(`);
  if (start < 0) throw new Error(`baseline function missing: ${name}`);
  const delimiter = '$function$;';
  const end = source.indexOf(delimiter, start);
  if (end < 0) throw new Error(`baseline function body incomplete: ${name}`);
  return source
    .slice(start, end + delimiter.length)
    .replace('CREATE FUNCTION', 'CREATE OR REPLACE FUNCTION');
}

function restoreBaseline(runtime, database, functions) {
  if (!baseline) return;
  for (const [path, name] of functions) sql(runtime, database, baselineFunction(path, name));
}

function expectSql(runtime, database, query, shouldDeny, scenario) {
  const result = sql(runtime, database, query, { user: 'shifaa_api', allowFailure: true });
  if (shouldDeny) {
    if (result.exitCode !== 0 && /\b42501\b/.test(result.output)) return;
    if (result.exitCode !== 0) throw new Error(`${scenario}: SQL setup/runtime failure`);
    assert.fail(`${scenario}: expected SQLSTATE 42501`);
  }
  if (result.exitCode !== 0) {
    if (/\b42501\b/.test(result.output)) assert.fail(`${scenario}: baseline unexpectedly denied`);
    throw new Error(`${scenario}: SQL setup/runtime failure`);
  }
}

function contextSql(values, call) {
  const settings = Object.entries(values)
    .map(([name, value]) => `SELECT set_config(${quote(`shifaa.${name}`)},${quote(value)},true);`)
    .join('\n');
  return `BEGIN;\nDO $check$ BEGIN IF session_user<>'shifaa_api' OR current_user<>'shifaa_api' THEN RAISE EXCEPTION 'actual non-owner API role required'; END IF; END $check$;\n${settings}\n${call}\nROLLBACK;`;
}

function outcome(scenario, fn) {
  return fn().then(
    () => results.push({ scenario, result: 'PASS', mode: expectedLabel }),
    (error) =>
      results.push({
        scenario,
        result: 'FAIL',
        kind: error instanceof assert.AssertionError ? 'assertion' : 'setup_or_runtime',
        reason: String(error?.message ?? error).split('\n', 1)[0],
      }),
  );
}

async function patReplay(runtime) {
  const migration = 'supabase/migrations/20261006185236_f011_allergy_functions.sql';
  await withAllergyApi(runtime, async (h) => {
    restoreBaseline(runtime, h.database, [[migration, 'f011_allergy_current_authority_v1']]);
    const key = `f011-pat-${randomUUID()}`;
    const created = await h.request('POST', report, { actor: 'patient', key });
    assert.equal(created.statusCode, 201, 'active patient setup must create its replay receipt');
    const requestId = randomUUID();
    const requestHash = hashRequest({
      patientId: patient,
      request: report,
      locale: 'en-EG',
      purposes: ['synthetic.feature011'],
      facilityId: null,
      encounterId: null,
    });
    sql(
      runtime,
      h.database,
      `UPDATE identity.people SET profile_status='suspended' WHERE id=${quote(person(1))}::uuid;`,
    );
    const context = {
      environment: 'local',
      person_id: person(1),
      actor_role: 'PAT',
      aal: '2',
      purposes: 'synthetic.feature011',
      facility_id: '',
      encounter_id: '',
      request_id: requestId,
      idempotency_key: key,
      request_hash: requestHash,
      action: 'createAllergy',
      principal_hash: idempotencyScopeHash('principal', person(1)),
    };
    const input = { responseLanguage: 'en-EG', responseRequestId: requestId, preparation: null };
    const query = contextSql(
      context,
      `SELECT clinical.create_allergy_api_v1(${quote(patient)}::uuid,${quote(JSON.stringify(input))}::jsonb);`,
    );
    expectSql(runtime, h.database, query, !baseline, 'PAT_SUSPENDED_RECEIPT_REPLAY');
  });
}

async function reviewerReplay(runtime) {
  const releaseMigration = 'supabase/migrations/20261006185237_f011_release_functions.sql';
  await withContent(runtime, async (h) => {
    restoreBaseline(runtime, h.database, [[releaseMigration, 'f011_lock_medical_reviewer_v1']]);
    const key = `f011-reviewer-${randomUUID()}`;
    const created = await h.content(contentRequest, { key });
    assert.equal(
      created.statusCode,
      201,
      'active medical reviewer setup must create its replay receipt',
    );
    const requestId = h.control.prepared.at(-1)?.responseRequestId;
    assert.equal(typeof requestId, 'string', 'prepared request context is available');
    const requestHash = hashRequest({
      contentType: 'synthetic',
      request: contentRequest,
      locale: 'en-EG',
      purposes: ['synthetic.feature011'],
    });
    sql(
      runtime,
      h.database,
      `UPDATE identity.people SET profile_status='suspended' WHERE id=${quote(person(5))}::uuid;`,
    );
    const context = {
      environment: 'local',
      person_id: person(5),
      actor_role: 'ADM-MEDICAL',
      aal: '2',
      purposes: 'synthetic.feature011',
      facility_id: '',
      encounter_id: '',
      request_id: requestId,
      idempotency_key: key,
      request_hash: requestHash,
      action: 'createClinicalContentRelease',
      principal_hash: idempotencyScopeHash('principal', person(5)),
    };
    const input = {
      responseLanguage: 'en-EG',
      responseRequestId: requestId,
      handoff: null,
      materialBindings: null,
    };
    const query = contextSql(
      context,
      `SELECT clinical.create_clinical_content_release_api_v1('synthetic',${quote(JSON.stringify(input))}::jsonb);`,
    );
    expectSql(runtime, h.database, query, !baseline, 'MEDICAL_REVIEWER_SUSPENDED_RECEIPT_REPLAY');
  });
}

async function facilityEligibility(runtime) {
  const path = 'supabase/migrations/20261006185240_f011_publication_functions.sql';
  await withOperationalContent(runtime, async (h) => {
    restoreBaseline(runtime, h.database, [[path, 'f011_release_current_eligibility_v1']]);
    sql(
      runtime,
      h.database,
      readFileSync(resolve(root, 'infra/db/tests/feature-011-pr-authority.sql'), 'utf8'),
    );
    const { id } = await h.ready();
    const published = await h.publish(id);
    assert.equal(published.statusCode, 200, published.body);
    const readEligibility = async () => {
      const response = await h.request('GET', undefined, {
        actor: 'medical',
        url: `/v1/admin/clinical-content/synthetic?projection=governance&releaseId=${id}`,
      });
      assert.equal(response.statusCode, 200, response.body);
      const row = response.json().data.find((candidate) => candidate.releaseId === id);
      assert.ok(row, 'published release is in the native reviewer governance projection');
      return row.eligibility;
    };
    assert.equal(await readEligibility(), 'effective', 'facility-scoped current authority setup');
    const scenarios = [
      [
        'FACILITY_MEMBERSHIP_LOST',
        `UPDATE identity.facility_memberships SET membership_status='ended' WHERE facility_id='f0110000-0000-4000-8200-000000000001' AND person_id='f0110000-0000-4000-8000-000000000002';`,
        `UPDATE identity.facility_memberships SET membership_status='active' WHERE facility_id='f0110000-0000-4000-8200-000000000001' AND person_id='f0110000-0000-4000-8000-000000000002';`,
      ],
      [
        'FACILITY_LICENSE_EXPIRED',
        `UPDATE identity.facility_licenses SET status='expired',expires_on=current_date-1 WHERE id='f011c000-0000-4000-8000-000000000002';`,
        `UPDATE identity.facility_licenses SET status='verified',expires_on='2099-12-31' WHERE id='f011c000-0000-4000-8000-000000000002';`,
      ],
      [
        'FACILITY_SUSPENDED',
        `UPDATE identity.facilities SET facility_status='suspended' WHERE id=${quote(facility)}::uuid;`,
        `UPDATE identity.facilities SET facility_status='pending_review' WHERE id=${quote(facility)}::uuid; UPDATE identity.facilities SET facility_status='active' WHERE id=${quote(facility)}::uuid;`,
      ],
      [
        'SIGNER_IDENTITY_SUSPENDED',
        `UPDATE identity.people SET profile_status='suspended' WHERE id=${quote(person(2))}::uuid;`,
        `UPDATE identity.people SET profile_status='active' WHERE id=${quote(person(2))}::uuid;`,
      ],
    ];
    for (const [name, lose, restore] of scenarios) {
      sql(runtime, h.database, lose);
      try {
        assert.equal(await readEligibility(), baseline ? 'effective' : 'unavailable', name);
      } finally {
        sql(runtime, h.database, restore);
      }
    }
  });
}

for (const runtime of runtimes) {
  await outcome(`${runtime.name}:PAT_SUSPENDED_RECEIPT_REPLAY`, () => patReplay(runtime));
  await outcome(`${runtime.name}:MEDICAL_REVIEWER_SUSPENDED_RECEIPT_REPLAY`, () =>
    reviewerReplay(runtime),
  );
  await outcome(`${runtime.name}:FACILITY_SCOPED_CURRENT_ELIGIBILITY`, () =>
    facilityEligibility(runtime),
  );
}

const failed = results.filter((item) => item.result !== 'PASS');
console.log(JSON.stringify({ mode: expectedLabel, results, failed: failed.length }, null, 2));
if (failed.length) process.exitCode = 1;
