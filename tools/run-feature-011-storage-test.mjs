import assert from 'node:assert/strict';
import { readFileSync, readdirSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  root,
  runtimes,
  withDatabase,
  prepare,
  smoke,
  sql,
  readMigration,
  digest,
  harnessInputs,
  runtimeManifest,
} from './run-feature-011-postgres-test.mjs';
import { suiteFiles, parseCases } from './run-feature-011-physical-red.mjs';
import { supportLifecycleProof } from './feature-011-support-lifecycle.mjs';
import { currentEvidenceRoot } from './verify-feature-011-contracts.mjs';

export const storageSlugs = [
  'f011_allergy_revisions',
  'f011_content_artifacts',
  'f011_governance_evidence',
  'f011_atomic_receipts',
];
export const consumerSlugs = [
  'f011_allergy_functions',
  'f011_release_functions',
  'f011_signing_functions',
  'f011_publication_functions',
  'f011_rls_grants',
  'f011_receipt_functions',
];
export function checkpointMigrations(slugs) {
  return slugs.map((slug) => {
    const matches = readdirSync(resolve(root, 'supabase/migrations')).filter((f) =>
      new RegExp(`^[0-9]{14}_${slug}\\.sql$`).test(f),
    );
    assert.equal(matches.length, 1, `Expected one CLI migration for ${slug}`);
    return `supabase/migrations/${matches[0]}`;
  });
}
const quote = (value) => `'${String(value).replaceAll("'", "''")}'`;
export function baselineRows(runtime, database) {
  const tables = sql(
    runtime,
    database,
    "SELECT json_agg(format('%I.%I',n.nspname,c.relname) ORDER BY n.nspname,c.relname) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE c.relkind IN ('r','p') AND n.nspname IN ('identity','clinical','audit','consent','platform') AND NOT c.relispartition;",
  ).stdout.trim();
  return Object.fromEntries(
    JSON.parse(tables).map((table) => [
      table,
      sql(
        runtime,
        database,
        `SELECT json_build_object('count',count(*),'digest',md5(coalesce(string_agg(to_jsonb(t)::text,E'\\n' ORDER BY to_jsonb(t)::text),''))) FROM ${table} t;`,
      ).stdout.trim(),
    ]),
  );
}
export function seedAdminHistory(runtime, database) {
  sql(
    runtime,
    database,
    `DO $seed$ DECLARE e record; BEGIN
    SELECT * INTO e FROM audit.append_event_v1('f011a000-0000-4000-8000-000000000099','f011a000-0000-4000-8000-000000000099',
    'platform.synthetic.baseline','platform.synthetic','success',NULL,'f0110000-0000-4000-8000-000000000005',2::smallint,NULL,NULL,'synthetic.feature011','f011a000-0000-4000-8000-000000000098',1);
    INSERT INTO audit.signature_evidence(resource_type,resource_id,resource_version,signer_person_id,signer_role,decision,artifact_digest,audit_event_id,audit_event_occurred_at)
    VALUES('platform.synthetic','f011a000-0000-4000-8000-000000000098',1,'f0110000-0000-4000-8000-000000000005','medical_reviewer','approved',decode(repeat('a',64),'hex'),e.event_id,e.event_occurred_at);
  END $seed$;`,
  );
}
export function storageCatalogProof(runtime, database) {
  const cases = suiteFiles
    .flatMap((file) => parseCases(readFileSync(resolve(root, file), 'utf8'), file))
    .filter((c) => c.user === 'owner' && !c.commit && c.missing.kind === 'table');
  const common = readFileSync(resolve(root, 'infra/db/fixtures/feature-011-k04.sql'), 'utf8');
  const results = cases.map((item) => {
    // Accepted K04 typo is not copied into a physical invariant. The authoritative
    // relation is audit.signature_evidence; the original fixture stays untouched.
    const statement = item.statement.replace(
      "'clinical.audit.signature_evidence'",
      "'audit.signature_evidence'",
    );
    const result = sql(
      runtime,
      database,
      `BEGIN; SET LOCAL shifaa.k04_case=${quote(item.id)}; ${common}\n${statement}\nROLLBACK;`,
    );
    return {
      id: item.id,
      source: item.file,
      sourceSha256: digest(item.file),
      result: 'PASS_STORAGE_INVARIANT',
      exitCode: result.exitCode,
      correction:
        item.id === 'SIGN-RECIPROCAL'
          ? 'Use authoritative audit.signature_evidence; accepted fixture bytes preserved'
          : null,
    };
  });
  assert.equal(results.length, 46, 'K05 storage catalog subset must remain exact');
  return results;
}
function defaultDenyProof(runtime, database) {
  const relations = [
    'allergy_heads',
    'allergies',
    'allergy_verification_support',
    'allergy_verification_bindings',
    'content_series',
    'content_releases',
    'content_material_bindings',
    'content_governance_authorities',
    'content_reviewer_designations',
    'content_signature_bindings',
    'content_admissibility_evidence',
    'content_artifact_admissibility_bindings',
    'mutation_receipts',
    'mutation_commit_obligations',
  ];
  const results = [];
  for (const relation of relations)
    for (const role of ['shifaa_api', 'shifaa_worker']) {
      const result = sql(runtime, database, `SELECT * FROM clinical.${relation};`, {
        user: role,
        allowFailure: true,
      });
      assert.equal(result.exitCode, 3, `${role} must not read ${relation} directly`);
      assert.match(result.stderr, /42501: permission denied/);
      const dml = sql(
        runtime,
        database,
        `SELECT has_table_privilege(${quote(role)},'clinical.${relation}','INSERT') OR has_table_privilege(${quote(role)},'clinical.${relation}','UPDATE') OR has_table_privilege(${quote(role)},'clinical.${relation}','DELETE');`,
      ).stdout.trim();
      assert.equal(dml, 'f', `${role} has direct DML privileges`);
      results.push({
        relation: `clinical.${relation}`,
        role,
        directRead: 'DENIED_42501',
        directDmlGrants: false,
      });
    }
  return results;
}
function privateBoundaryProof(runtime, database) {
  const output = sql(
    runtime,
    database,
    `SELECT json_build_object(
    'publicFunctionExecute', (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace,
      LATERAL aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a
      WHERE n.nspname='clinical' AND p.proname LIKE 'f011_%' AND a.grantee=0 AND a.privilege_type='EXECUTE'),
    'onlineTableGrants', (SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
      CROSS JOIN pg_roles r WHERE n.nspname='clinical' AND c.relkind='r'
      AND c.relname IN ('allergy_heads','allergies','allergy_verification_support','allergy_verification_bindings',
      'content_series','content_releases','content_material_bindings','content_governance_authorities',
      'content_reviewer_designations','content_signature_bindings','content_admissibility_evidence',
      'content_artifact_admissibility_bindings','mutation_receipts','mutation_commit_obligations')
      AND r.rolname IN ('shifaa_api','shifaa_worker','anon','authenticated','service_role')
      AND (has_table_privilege(r.oid,c.oid,'SELECT') OR has_table_privilege(r.oid,c.oid,'INSERT')
        OR has_table_privilege(r.oid,c.oid,'UPDATE') OR has_table_privilege(r.oid,c.oid,'DELETE'))));`,
  ).stdout.trim();
  const result = JSON.parse(output);
  assert.equal(result.publicFunctionExecute, 0, 'Private helper PUBLIC EXECUTE must be revoked');
  assert.equal(result.onlineTableGrants, 0, 'Inherited online grants must not expose new tables');
  return result;
}
function storageBehaviorProof(runtime, database) {
  const common = readFileSync(resolve(root, 'infra/db/fixtures/feature-011-k04.sql'), 'utf8');
  const fixture = 'infra/db/tests/feature-011-k05-storage.sql';
  const result = sql(
    runtime,
    database,
    `BEGIN; SET LOCAL shifaa.k04_case='K05-storage'; ${common}\n${readFileSync(resolve(root, fixture), 'utf8')}\nROLLBACK;`,
  );
  assert.ok(result.stdout.includes('K05_COMPONENT_STORAGE_PASS'));
  const partial = sql(
    runtime,
    database,
    `BEGIN; SET LOCAL shifaa.k04_case='K05-partial-domain'; ${common}\nSELECT pg_temp.f011_allergy_path(ARRAY['self_reported']); SELECT 'K05_DOMAIN_EFFECT_READY'; COMMIT;`,
    { allowFailure: true },
  );
  assert.equal(partial.exitCode, 3, 'Domain-only commit must fail');
  assert.ok(
    partial.stdout.includes('K05_DOMAIN_EFFECT_READY'),
    'Failure before domain effect is not a deferred commit proof',
  );
  assert.match(partial.stderr, /(23514|55000|P0001):[^\n]*(obligation|commit|receipt)/i);
  // The accepted K04 neutral fixture is storage-only. Bind its structural
  // receipt to a real synthetic initial revision, without implementing a K06
  // online consumer or claiming a product event/crypto producer.
  const completeCommon = common
    .replace(
      'target uuid:=gen_random_uuid();',
      "target uuid:=pg_temp.f011_allergy_path(ARRAY['self_reported']);",
    )
    .replace(
      "request,clock_timestamp(),'SHIFAA-F011-RECEIPT-PROTECTED/1'",
      "request,(SELECT occurred_at FROM clinical.mutation_commit_obligations WHERE idempotency_record_id=idem),'SHIFAA-F011-RECEIPT-PROTECTED/1'",
    );
  assert.notEqual(completeCommon, common, 'Structural fixture must bind a domain effect');
  const complete = sql(
    runtime,
    database,
    `BEGIN; SET LOCAL shifaa.k04_case='K05-complete'; ${completeCommon}\nSELECT pg_temp.f011_receipt_fault('createAllergy','complete'); SELECT 'K05_ALL_FIVE_READY'; COMMIT; SELECT 'K05_ALL_FIVE_COMMITTED';`,
  );
  assert.ok(complete.stdout.includes('K05_ALL_FIVE_COMMITTED'));
  const deferredFaults = [
    'missing-receipt',
    'incomplete-idempotency',
    'wrong-pointer',
    'wrong-tuple',
    'wrong-audit',
    'wrong-outbox',
  ].map((fault) => {
    const failure = sql(
      runtime,
      database,
      `BEGIN; SET LOCAL shifaa.k04_case=${quote(`K05-${fault}`)}; ${completeCommon}\nSELECT pg_temp.f011_receipt_fault('createAllergy',${quote(fault)}); SELECT 'K05_PARTIAL_ALL_FIVE_READY'; COMMIT;`,
      { allowFailure: true },
    );
    assert.equal(failure.exitCode, 3, `Partial all-five ${fault} must not commit`);
    assert.ok(
      failure.stdout.includes('K05_PARTIAL_ALL_FIVE_READY'),
      'Setup/statement failure is not a deferred commit proof',
    );
    assert.match(failure.stderr, /(23503|23514|55000|P0001):/);
    assert.match(failure.stderr, /obligation|commit|receipt|tuple/i);
    return {
      fault,
      result: 'DENIED_AT_COMMIT',
      sqlstate: failure.stderr.match(/ERROR:\s+([A-Z0-9]{5}):/)?.[1],
      diagnostic: failure.stderr,
    };
  });
  return {
    fixture,
    sha256: digest(fixture),
    competingDrafts: true,
    threeMaterialBindings: true,
    missingMaterialBindingsDeniedAtDeferredCheck: true,
    immutableBodyAndBindings: true,
    contiguousAllergyHistoryAndReciprocalBindings: true,
    immutableAllergyHistory: true,
    terminalAllergyResurrectionDenied: true,
    crossSeriesPredecessorDenied: true,
    secondPublishedRootDenied: true,
    domainOnlyCommitDenied: true,
    partialCommitSqlstate: partial.stderr.match(/ERROR:\s+([A-Z0-9]{5}):/)?.[1],
    partialCommitDiagnostic: partial.stderr,
    completeSyntheticAllFiveCommit: true,
    neutralFixtureIsNotProductEventAcceptance: true,
    testReceiptUsesAuthoritativeObligationTimestamp: true,
    deferredFaults,
    transactionCleanup: 'Rollback / failed COMMIT; no durable test domain effect',
  };
}
async function main() {
  assert.equal(
    process.argv[2],
    'k05',
    'This runner permits K05 storage verification only; K07 is separately authorized.',
  );
  const inputs = harnessInputs(),
    migrations = checkpointMigrations(storageSlugs),
    sourceDigests = Object.fromEntries(migrations.map((p) => [p, digest(p)]));
  const results = [];
  for (const runtime of runtimes) {
    const runtimeIdentity = runtimeManifest(runtime);
    console.log(`K05 storage setup: ${runtime.name}`);
    const result = await withDatabase(
      runtime,
      async (database) => {
        const baseline = prepare(runtime, database),
          health = smoke(runtime, database);
        assert.ok(
          health.manifest.serverVersion.startsWith(
            runtime.name === 'shifaa-local-postgres' ? '17.11' : '17.6',
          ),
        );
        seedAdminHistory(runtime, database);
        const before = baselineRows(runtime, database);
        const applied = migrations.map((path) => ({
          path,
          sha256: digest(path),
          exitCode: sql(runtime, database, readMigration(path)).exitCode,
        }));
        for (const [table, expected] of Object.entries(before)) {
          const observed = sql(
            runtime,
            database,
            `SELECT json_build_object('count',count(*),'digest',md5(coalesce(string_agg(to_jsonb(t)::text,E'\\n' ORDER BY to_jsonb(t)::text),''))) FROM ${table} t;`,
          ).stdout.trim();
          assert.equal(observed, expected, `Populated predecessor changed: ${table}`);
        }
        const catalog = storageCatalogProof(runtime, database);
        const directAccess = defaultDenyProof(runtime, database);
        const privateBoundary = privateBoundaryProof(runtime, database);
        const behavior = storageBehaviorProof(runtime, database);
        const supportLifecycle = supportLifecycleProof(runtime, database);
        const absent = sql(
          runtime,
          database,
          "SELECT to_regprocedure('clinical.create_allergy_api_v1(uuid,jsonb)') IS NULL AND to_regprocedure('clinical.verify_allergy_api_v1(uuid,integer,jsonb)') IS NULL AND to_regprocedure('clinical.create_clinical_content_release_api_v1(text,jsonb)') IS NULL;",
        ).stdout.trim();
        assert.equal(absent, 't', 'K06 must not start before K05 PASS.');
        return {
          runtime: runtimeIdentity,
          baseline,
          health,
          applied,
          populatedPredecessorTablesPreserved: Object.keys(before).length,
          predecessorRowDigests: before,
          catalog,
          directAccess,
          privateBoundary,
          behavior,
          supportLifecycle,
          consumerEntrypointsStillAbsent: true,
        };
      },
      'K05',
    );
    results.push(result);
    console.log(`${runtime.name}: K05 storage PASS (${result.catalog.length} invariants)`);
  }
  for (const [p, sha] of Object.entries(sourceDigests))
    assert.equal(digest(p), sha, 'Storage source changed during verification.');
  const report = {
    checkpoint: 'K05',
    result: 'PASS',
    completedAt: new Date().toISOString(),
    inputs,
    sourceDigests,
    results,
    k06UnlockedByThisVerification: true,
    k07Accepted: false,
    syntheticOnly: true,
  };
  const output =
    process.argv[3] === 'k17-remediation'
      ? `${currentEvidenceRoot(root)}/k05`
      : process.argv[3] === 'k08-remediation'
        ? 'specs/011-allergies-clinical-content-governance/evidence/fresh-implementation/K08/prerequisite-remediation/k05'
        : 'artifacts/feature-011/k05-k06';
  mkdirSync(resolve(root, output), { recursive: true });
  writeFileSync(
    resolve(root, `${output}/storage-proof.json`),
    JSON.stringify(report, null, 2) + '\n',
  );
}
if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url)
  main().catch((e) => {
    console.error(e);
    process.exitCode = 1;
  });
