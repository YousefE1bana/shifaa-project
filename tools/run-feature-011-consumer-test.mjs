import assert from 'node:assert/strict';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
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
import {
  checkpointMigrations,
  storageSlugs,
  consumerSlugs,
  baselineRows,
} from './run-feature-011-storage-test.mjs';
import { consumerComponents } from './feature-011-consumer-fixtures.mjs';
import { preflightConsumers } from './feature-011-k08-preflight.mjs';
import { currentEvidenceRoot } from './verify-feature-011-contracts.mjs';

const feature = 'specs/011-allergies-clinical-content-governance';
const local = currentEvidenceRoot(root).endsWith('/prerequisite-remediation')
  ? `${currentEvidenceRoot(root)}/k06`
  : 'artifacts/feature-011/k05-k06/remediation';
const renewed = currentEvidenceRoot(root).endsWith('/prerequisite-remediation');
const k05UnlockPath = renewed
  ? `${currentEvidenceRoot(root)}/k05/k05-before-k06.json`
  : 'artifacts/feature-011/k05-k06/support-remediation/k05-before-k06.json';
const quote = (value) => `'${String(value).replaceAll("'", "''")}'`;
function outboxEventValues(runtime, database) {
  const definition = sql(
    runtime,
    database,
    "SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conrelid='platform.outbox_events'::regclass AND conname='outbox_events_event_type_check';",
  ).stdout.trim();
  assert.ok(definition, 'The predecessor outbox event constraint must exist');
  return [...definition.matchAll(/'([^']+)'/g)].map((match) => match[1]).sort();
}
const entrypoints = [
  'clinical.list_allergies_api_v1(uuid,jsonb)',
  'clinical.create_allergy_api_v1(uuid,jsonb)',
  'clinical.verify_allergy_api_v1(uuid,integer,jsonb)',
  'clinical.list_clinical_content_api_v1(text,jsonb)',
  'clinical.create_clinical_content_release_api_v1(text,jsonb)',
  'clinical.sign_clinical_content_release_api_v1(uuid,integer,jsonb)',
  'clinical.publish_clinical_content_release_api_v1(uuid,integer,jsonb)',
];
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

export function catalogProof(runtime, database) {
  const guardNames = [
    ...new Set(
      checkpointMigrations(storageSlugs).flatMap((path) =>
        [...readMigration(path).matchAll(/CREATE (?:OR REPLACE )?FUNCTION clinical\.(\w+)/g)].map(
          (match) => match[1],
        ),
      ),
    ),
  ];
  const sourceNames = [
    ...new Set(
      checkpointMigrations(consumerSlugs).flatMap((path) =>
        [...readMigration(path).matchAll(/CREATE (?:OR REPLACE )?FUNCTION clinical\.(\w+)/g)].map(
          (match) => match[1],
        ),
      ),
    ),
  ];
  const query = `SELECT json_build_object(
    'executor',(SELECT json_build_object('login',rolcanlogin,'superuser',rolsuper,'bypassRls',rolbypassrls) FROM pg_roles WHERE rolname='shifaa_f011_executor'),
    'apiCanAssumeExecutor',pg_has_role('shifaa_api','shifaa_f011_executor','MEMBER'),
    'executorSchemaCreate',(SELECT count(*) FROM pg_namespace n WHERE n.nspname IN ('clinical','identity','audit','platform','consent') AND has_schema_privilege('shifaa_f011_executor',n.oid,'CREATE')),
    'tables',(SELECT json_agg(json_build_object('name',c.relname,'owner',pg_get_userbyid(c.relowner),'rls',c.relrowsecurity,'force',c.relforcerowsecurity)) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='clinical' AND c.relname IN (${relations.map(quote).join(',')})),
    'functions',(SELECT json_agg(json_build_object('signature',p.oid::regprocedure::text,'owner',pg_get_userbyid(p.proowner),'definer',p.prosecdef,'config',p.proconfig,'apiExecute',has_function_privilege('shifaa_api',p.oid,'EXECUTE'),'workerExecute',has_function_privilege('shifaa_worker',p.oid,'EXECUTE'))) FROM pg_proc p WHERE p.oid=ANY(ARRAY[${entrypoints.map((p) => `${quote(p)}::regprocedure`).join(',')}]::oid[])),
    'allConsumerFunctions',(SELECT json_agg(json_build_object('name',p.proname,'owner',pg_get_userbyid(p.proowner),'definer',p.prosecdef,'config',p.proconfig,'apiExecute',has_function_privilege('shifaa_api',p.oid,'EXECUTE'))) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='clinical' AND p.proname IN (${sourceNames.map(quote).join(',')})),
    'allGuardFunctions',(SELECT json_agg(json_build_object('name',p.proname,'owner',pg_get_userbyid(p.proowner),'definer',p.prosecdef,'config',p.proconfig,'onlineExecute',(SELECT count(*) FROM pg_roles r WHERE r.rolname IN ('shifaa_api','shifaa_worker','anon','authenticated','service_role') AND has_function_privilege(r.oid,p.oid,'EXECUTE')))) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='clinical' AND p.proname IN (${guardNames.map(quote).join(',')})),
    'auditReadColumns',(SELECT json_agg(a.attname ORDER BY a.attname) FROM pg_attribute a WHERE a.attrelid='audit.events'::regclass AND a.attnum>0 AND NOT a.attisdropped AND has_column_privilege('shifaa_f011_executor',a.attrelid,a.attnum,'SELECT')),
    'publicExecute',(SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace CROSS JOIN LATERAL aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a WHERE n.nspname='clinical' AND (p.proname LIKE 'f011_%' OR p.oid=ANY(ARRAY[${entrypoints.map((p) => `${quote(p)}::regprocedure`).join(',')}]::oid[])) AND a.grantee=0 AND a.privilege_type='EXECUTE'),
    'directGrants',(SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace CROSS JOIN pg_roles r WHERE n.nspname='clinical' AND c.relname IN (${relations.map(quote).join(',')}) AND r.rolname IN ('shifaa_api','shifaa_worker','anon','authenticated','service_role') AND (has_table_privilege(r.oid,c.oid,'SELECT') OR has_table_privilege(r.oid,c.oid,'INSERT') OR has_table_privilege(r.oid,c.oid,'UPDATE') OR has_table_privilege(r.oid,c.oid,'DELETE'))));`;
  const result = JSON.parse(sql(runtime, database, query).stdout.trim());
  assert.deepEqual(result.executor, { login: false, superuser: false, bypassRls: false });
  assert.equal(result.apiCanAssumeExecutor, false);
  assert.equal(
    result.executorSchemaCreate,
    0,
    'Temporary function ownership setup must leave no schema CREATE privilege',
  );
  assert.equal(result.tables.length, 14);
  assert.ok(result.tables.every((t) => t.rls && t.force && t.owner !== 'shifaa_f011_executor'));
  assert.equal(result.functions.length, 7);
  assert.ok(
    result.functions.every(
      (f) =>
        f.owner === 'shifaa_f011_executor' &&
        f.definer &&
        f.apiExecute &&
        !f.workerExecute &&
        f.config?.some((c) => /^search_path=(?:"")?$/.test(c)),
    ),
  );
  assert.equal(result.allConsumerFunctions.length, sourceNames.length);
  const apiNames = new Set([
    ...entrypoints.map((signature) => signature.split('.')[1].split('(')[0]),
    'f011_finalize_receipt_v1',
  ]);
  assert.ok(
    result.allConsumerFunctions.every(
      (fn) =>
        fn.owner === 'shifaa_f011_executor' &&
        fn.definer &&
        fn.config?.some((value) => /^search_path=(?:"")?$/.test(value)) &&
        fn.apiExecute === apiNames.has(fn.name),
    ),
    'Every consumer/helper must have non-owner fixed-path execution and the exact API allowlist',
  );
  assert.equal(result.publicExecute, 0);
  assert.equal(result.directGrants, 0);
  assert.equal(guardNames.length, 12);
  assert.equal(result.allGuardFunctions.length, guardNames.length);
  assert.ok(
    result.allGuardFunctions.every(
      (fn) =>
        fn.owner === 'shifaa_f011_executor' &&
        fn.definer &&
        fn.onlineExecute === 0 &&
        fn.config?.some((value) => /^search_path=(?:"")?$/.test(value)),
    ),
    'All physical guards must use the non-owner executor, empty search_path and no online EXECUTE',
  );
  assert.deepEqual(
    result.auditReadColumns,
    [
      'occurred_at',
      'id',
      'actor_person_id',
      'request_id',
      'resource_type',
      'resource_id',
      'resource_version',
      'outcome',
    ].sort(),
    'Commit guards receive only the eight needed audit columns',
  );
  return result;
}

export function auditGuardProof(runtime, database) {
  const actor = 'f0110000-0000-4000-8000-000000000001';
  const expected = Number(
    sql(
      runtime,
      database,
      `SELECT count(*) FROM audit.events WHERE actor_person_id=${quote(actor)}::uuid AND resource_type IN ('clinical.allergy_revision','clinical.content_release');`,
    ).stdout.trim(),
  );
  const other = Number(
    sql(
      runtime,
      database,
      `SELECT count(*) FROM audit.events WHERE actor_person_id<>${quote(actor)}::uuid;`,
    ).stdout.trim(),
  );
  assert.ok(
    expected > 0 && other > 0,
    'Audit isolation needs real committed events for distinct synthetic actors',
  );
  const query = (person) =>
    sql(
      runtime,
      database,
      `BEGIN; SELECT set_config('shifaa.person_id',${quote(person)},true); SET LOCAL ROLE shifaa_f011_executor; SELECT json_build_object('visible',count(*)) FROM audit.events; ROLLBACK;`,
    ).stdout;
  const count = (output) =>
    JSON.parse(output.split(/\r?\n/).find((line) => line.startsWith('{'))).visible;
  assert.equal(
    count(query(actor)),
    expected,
    'Executor audit RLS reveals only the current actor clinical events',
  );
  assert.equal(count(query('')), 0, 'No actor grants no audit visibility');
  const denied = sql(
    runtime,
    database,
    'BEGIN; SET LOCAL ROLE shifaa_f011_executor; SELECT * FROM audit.events; ROLLBACK;',
    { allowFailure: true },
  );
  assert.equal(denied.exitCode, 3);
  assert.match(denied.stderr, /42501: permission denied/);
  return {
    result: 'PASS',
    actorClinicalEvents: expected,
    otherActorEventsHidden: other,
    noActorVisible: 0,
    allAuditColumnsDenied: '42501',
    transport: 'owner-session SET LOCAL ROLE',
    gucIsAuthentication: false,
  };
}

export function directRoleProof(runtime, database) {
  const result = [];
  for (const role of ['shifaa_api', 'shifaa_worker'])
    for (const relation of relations) {
      const denied = sql(runtime, database, `SELECT * FROM clinical.${relation};`, {
        user: role,
        allowFailure: true,
      });
      assert.equal(denied.exitCode, 3);
      assert.match(denied.stderr, /42501: permission denied/);
      result.push({ role, relation, sqlstate: '42501' });
    }
  // Exercise privileges through real roles; WHERE false avoids accidental data
  // changes even if a grant regresses. service_role uses SET ROLE in an owner
  // transport session and is reported separately from API login sessions.
  for (const role of ['shifaa_api', 'shifaa_worker', 'service_role']) {
    for (const relation of relations) {
      for (const statement of [
        `INSERT INTO clinical.${relation} DEFAULT VALUES;`,
        `UPDATE clinical.${relation} SET ${relation === 'allergies' ? 'id' : relation === 'content_material_bindings' || relation === 'content_artifact_admissibility_bindings' ? 'binding_id' : relation === 'content_signature_bindings' ? 'signature_evidence_id' : relation === 'allergy_verification_bindings' ? 'revision_id' : relation === 'mutation_commit_obligations' ? 'idempotency_record_id' : 'id'} = NULL WHERE false;`,
        `DELETE FROM clinical.${relation} WHERE false;`,
      ]) {
        const denied = sql(
          runtime,
          database,
          role === 'service_role'
            ? `BEGIN; SET LOCAL ROLE service_role; ${statement} ROLLBACK;`
            : statement,
          { ...(role === 'service_role' ? {} : { user: role }), allowFailure: true },
        );
        assert.equal(denied.exitCode, 3, `${role} direct DML ${relation}`);
        assert.match(denied.stderr, /42501: permission denied/);
        result.push({
          role,
          relation,
          operation: statement.split(' ')[0],
          sqlstate: '42501',
          transport:
            role === 'service_role' ? 'owner-session SET LOCAL ROLE' : 'independent role login',
        });
      }
    }
  }
  const assume = sql(runtime, database, 'SET ROLE shifaa_f011_executor;', {
    user: 'shifaa_api',
    allowFailure: true,
  });
  assert.equal(assume.exitCode, 3);
  assert.match(assume.stderr, /42501: permission denied/);
  result.push({ role: 'shifaa_api', assumeExecutor: 'DENIED_42501' });
  const helpers = sql(
    runtime,
    database,
    `SELECT clinical.f011_artifact_canonical_bytes_v1('{}'::jsonb);`,
    { user: 'shifaa_api', allowFailure: true },
  );
  assert.equal(helpers.exitCode, 3);
  assert.match(helpers.stderr, /42501: permission denied/);
  result.push({ role: 'shifaa_api', privateCanonicalHelper: 'DENIED_42501' });
  const worker = sql(
    runtime,
    database,
    `SELECT clinical.list_clinical_content_api_v1('synthetic','{}'::jsonb);`,
    { user: 'shifaa_worker', allowFailure: true },
  );
  assert.equal(worker.exitCode, 3);
  assert.match(worker.stderr, /42501: permission denied/);
  result.push({ role: 'shifaa_worker', entrypoint: 'DENIED_42501' });
  return result;
}

export function canonicalProof(runtime, database, executor = false) {
  const path = `${feature}/contracts/artifact-canonicalization-v1-vectors.json`;
  const vectors = JSON.parse(readFileSync(resolve(root, path), 'utf8'));
  assert.equal(vectors.positive.length, 7);
  const results = vectors.positive.map((v) => {
    const facts = quote(JSON.stringify(v.facts));
    const output = JSON.parse(
      sql(
        runtime,
        database,
        `${executor ? 'BEGIN; SET LOCAL ROLE shifaa_f011_executor;' : ''} SELECT json_build_object('hex',encode(b,'hex'),'sha256',encode(pg_catalog.sha256(b),'hex'),'octets',octet_length(b)) FROM (SELECT clinical.f011_artifact_canonical_bytes_v1(${facts}::jsonb) AS b) value; ${executor ? 'ROLLBACK;' : ''}`,
      ).stdout.trim(),
    );
    assert.equal(output.hex, v.canonicalHex, `${v.id} frozen bytes`);
    assert.equal(output.sha256, v.sha256, `${v.id} frozen digest`);
    assert.equal(output.octets, v.octetLength);
    return { id: v.id, result: 'PASS_FROZEN_SQL_BYTES_AND_DIGEST', ...output };
  });
  const negatives = vectors.negative
    .filter((v) => v.facts && !['N13', 'N14'].includes(v.id))
    .map((v) => {
      const denied = sql(
        runtime,
        database,
        `${executor ? 'BEGIN; SET LOCAL ROLE shifaa_f011_executor;' : ''} SELECT clinical.f011_artifact_canonical_bytes_v1(${quote(JSON.stringify(v.facts))}::jsonb); ${executor ? 'ROLLBACK;' : ''}`,
        { allowFailure: true },
      );
      assert.equal(denied.exitCode, 3, `${v.id} must reject invalid canonical facts`);
      assert.match(
        denied.stderr,
        /22023:|22007:|22008:/,
        `${v.id} must fail fact validation, never setup or SQL syntax`,
      );
      return {
        id: v.id,
        result: 'DENIED_INVALID_CANONICAL_FACTS',
        sqlstate: denied.stderr.match(/ERROR:\s+([A-Z0-9]{5}):/)?.[1],
      };
    });
  assert.equal(negatives.length, 16);
  return {
    path,
    sha256: digest(path),
    results,
    negatives,
    materialBytesPassedIntoSql: false,
    upstreamOnly: [
      'N13 NUL and N14 surrogate are rejected before PostgreSQL representation; protocol tests cover that boundary',
      'N19-N23 decoder vectors: SQL encodes typed facts rather than consuming externally supplied canonical bytes',
      'N24 declaredDigest equality is checked by the release-consumer component fixture',
      'N25 wire timestamp normalization is upstream of canonical SQL facts',
    ],
  };
}

export async function main() {
  assert.equal(
    process.argv[2],
    'k06',
    'Component runner permits K06 only; full K07 proof is separately authorized.',
  );
  const unlock = JSON.parse(readFileSync(resolve(root, k05UnlockPath), 'utf8'));
  assert.equal(unlock.result, 'K05_PASS_BEFORE_K06');
  const k05 = JSON.parse(
    readFileSync(
      resolve(
        root,
        renewed
          ? `${currentEvidenceRoot(root)}/k05/storage-proof.json`
          : 'artifacts/feature-011/k05-k06/storage-proof.json',
      ),
      'utf8',
    ),
  );
  assert.equal(k05.result, 'PASS');
  assert.equal(k05.results.length, 2);
  assert.equal(digest(unlock.storageProof.path), unlock.storageProof.sha256);
  assert.equal(digest(unlock.k05Proof.path), unlock.k05Proof.sha256);
  for (const [path, sha] of Object.entries(unlock.tests))
    assert.equal(digest(path), sha, 'K05 support lifecycle verification source drift');
  assert.ok(k05.results.every((r) => r.supportLifecycle?.provisioningCommittedSeparately));
  for (const [path, sha] of Object.entries(unlock.migrations))
    assert.equal(digest(path), sha, 'K05 verified source drift');
  const inputs = harnessInputs(),
    migrations = [...checkpointMigrations(storageSlugs), ...checkpointMigrations(consumerSlugs)];
  const sourceDigests = Object.fromEntries(migrations.map((p) => [p, digest(p)]));
  const results = [];
  for (const runtime of runtimes) {
    console.log(`K06 component setup: ${runtime.name}`);
    const result = await withDatabase(
      runtime,
      async (database) => {
        const baseline = prepare(runtime, database),
          health = smoke(runtime, database),
          before = baselineRows(runtime, database),
          predecessorOutboxEvents = outboxEventValues(runtime, database);
        assert.ok(
          health.manifest.serverVersion.startsWith(
            runtime.name === 'shifaa-local-postgres' ? '17.11' : '17.6',
          ),
        );
        const applied = migrations.map((path) => ({
          path,
          sha256: digest(path),
          exitCode: sql(runtime, database, readMigration(path)).exitCode,
        }));
        const currentOutboxEvents = outboxEventValues(runtime, database);
        assert.deepEqual(
          currentOutboxEvents,
          [
            ...predecessorOutboxEvents,
            'clinical.allergy.changed.v1',
            'clinical.content_release.changed.v1',
          ].sort(),
          'K06 must preserve every predecessor outbox value and add exactly the two contracted events',
        );
        for (const [table, expected] of Object.entries(before))
          assert.equal(
            sql(
              runtime,
              database,
              `SELECT json_build_object('count',count(*),'digest',md5(coalesce(string_agg(to_jsonb(t)::text,E'\\n' ORDER BY to_jsonb(t)::text),''))) FROM ${table} t;`,
            ).stdout.trim(),
            expected,
            `Predecessor row drift ${table}`,
          );
        const catalog = catalogProof(runtime, database),
          directRoles = directRoleProof(runtime, database),
          canonical = canonicalProof(runtime, database);
        const authorityFixture = 'infra/db/fixtures/feature-011-k06.sql';
        sql(runtime, database, readFileSync(resolve(root, authorityFixture), 'utf8'));
        const fixture = 'tools/feature-011-consumer-fixtures.mjs';
        const sweep = preflightConsumers(runtime, database);
        const behavior = sweep.components;
        const auditGuards = auditGuardProof(runtime, database);
        return {
          runtime: runtimeManifest(runtime),
          baseline,
          health,
          applied,
          populatedPredecessorTablesPreserved: Object.keys(before).length,
          outboxEvents: {
            predecessor: predecessorOutboxEvents,
            current: currentOutboxEvents,
            predecessorValuesPreserved: true,
            exactlyTwoFeature011EventsAdded: true,
          },
          catalog,
          directRoles,
          auditGuards,
          prerequisiteSweep: sweep,
          canonical,
          behavior: {
            authorityFixture,
            authorityFixtureSha256: digest(authorityFixture),
            fixture,
            sha256: digest(fixture),
            ...behavior,
          },
          fullRaceProofExecuted: false,
        };
      },
      'K06',
    );
    results.push(result);
    console.log(`${runtime.name}: K06 component PASS`);
  }
  for (const [path, sha] of Object.entries(sourceDigests))
    assert.equal(digest(path), sha, 'Migration changed during verification');
  mkdirSync(resolve(root, local), { recursive: true });
  writeFileSync(
    resolve(root, `${local}/consumer-proof.json`),
    JSON.stringify(
      {
        checkpoint: 'K06',
        result: 'PASS_COMPONENT_VERIFICATION',
        completedAt: new Date().toISOString(),
        k05Unlock: {
          path: k05UnlockPath,
          sha256: digest(k05UnlockPath),
        },
        inputs,
        sourceDigests,
        results,
        syntheticOnly: true,
        k07Started: false,
        k07Accepted: false,
      },
      null,
      2,
    ) + '\n',
  );
}
if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url)
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
