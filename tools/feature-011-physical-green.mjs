import assert from 'node:assert/strict';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import {
  root,
  runtimes,
  withDatabase,
  prepare,
  smoke,
  sql,
  digest,
  readMigration,
  harnessInputs,
  runtimeManifest,
} from './run-feature-011-postgres-test.mjs';
import {
  checkpointMigrations,
  storageSlugs,
  consumerSlugs,
  baselineRows,
  seedAdminHistory,
  storageCatalogProof,
} from './run-feature-011-storage-test.mjs';
import {
  catalogProof,
  directRoleProof,
  canonicalProof,
  auditGuardProof,
} from './run-feature-011-consumer-test.mjs';
import { consumerComponents } from './feature-011-consumer-fixtures.mjs';
import { readDocumentationSuccessor } from './feature-011-documentation-successor.mjs';
import {
  currentEvidenceRoot,
  currentPhysicalSourceDigests,
  verifyFeature011Contracts,
} from './verify-feature-011-contracts.mjs';

export const evidenceRoot = currentEvidenceRoot(root);
const feature = 'specs/011-allergies-clinical-content-governance';
const quote = (v) => `'${String(v).replaceAll("'", "''")}'`;
const read = (p) => readFileSync(resolve(root, p), 'utf8');
export function artifact(name, value) {
  const path = `${evidenceRoot}/${name}`;
  mkdirSync(resolve(root, evidenceRoot), { recursive: true });
  writeFileSync(
    resolve(root, path),
    typeof value === 'string' ? value : JSON.stringify(value, null, 2) + '\n',
  );
  return { path, sha256: digest(path) };
}
export function acceptedChain() {
  const accepted = JSON.parse(
    read(`${feature}/evidence/fresh-implementation/K06/sql-allergy.json`),
  );
  assert.equal(digest(accepted.proof.path), accepted.proof.sha256, 'Accepted K06 proof drift');
  const acceptedSql = JSON.parse(read(accepted.proof.path)).sourceDigests;
  const migrations = [
    ...checkpointMigrations(storageSlugs),
    ...checkpointMigrations(consumerSlugs),
  ];
  assert.equal(migrations.length, 10);
  const documentation = readDocumentationSuccessor(root);
  const docRenewal =
    documentation &&
    (evidenceRoot.endsWith('/documentation-renewal') ||
      evidenceRoot.includes('/K24/prerequisite-remediation'));
  const docAuthorization = docRenewal
    ? JSON.parse(read(`${evidenceRoot}/authorization.json`))
    : null;
  for (const [path, sha] of Object.entries(accepted.normativeInputDigests))
    assert.equal(digest(path), documentation?.inputDigests[path] ?? sha, `Normative drift ${path}`);
  for (const [path, sha] of Object.entries(accepted.generatedDigests ?? {}))
    if (docRenewal) {
      assert.equal(docAuthorization.generatedChanges[path].before, sha);
      assert.equal(
        digest(path),
        docAuthorization.generatedChanges[path].after,
        `Generated drift ${path}`,
      );
    } else assert.equal(digest(path), sha, `Generated drift ${path}`);
  const renewed = evidenceRoot.endsWith('/prerequisite-remediation') || docRenewal;
  const authorization = renewed ? JSON.parse(read(`${evidenceRoot}/authorization.json`)) : null;
  for (const path of migrations) {
    if (renewed && authorization.sqlChanges[path]) {
      assert.equal(
        authorization.sqlChanges[path].before,
        acceptedSql[path],
        `Prior SQL binding ${path}`,
      );
      assert.equal(
        digest(path),
        authorization.sqlChanges[path].after,
        `Authorized SQL repair drift ${path}`,
      );
    } else assert.equal(digest(path), acceptedSql[path], `Accepted SQL drift ${path}`);
  }
  if (renewed) {
    const componentRoot = docRenewal
      ? docAuthorization.componentRoot
      : authorization.authorization === 'F011_K12_BASELINE_RECONCILIATION_APPROVED'
        ? `${feature}/evidence/fresh-implementation/K08/prerequisite-remediation`
        : evidenceRoot;
    const components = JSON.parse(read(`${componentRoot}/k06/consumer-proof.json`));
    assert.equal(components.result, 'PASS_COMPONENT_VERIFICATION');
    assert.equal(components.results.length, 2);
    for (const path of migrations) assert.equal(digest(path), components.sourceDigests[path]);
  }
  const map = JSON.parse(read(`${feature}/contracts/task-map.json`));
  assert.equal(map.tasks.length, 92);
  const handoff = authorization?.authorization === 'F011_K12_BASELINE_RECONCILIATION_APPROVED';
  const boundary = docRenewal
    ? docAuthorization.completionBoundary
    : authorization?.authorization === 'K15_ACCEPTED_K16_ACCEPTED_PAIRED_K17_K18_APPROVED'
      ? 62
      : handoff
        ? 47
        : renewed
          ? 29
          : 26;
  for (let i = 0; i < 92; i++)
    assert.equal(
      map.tasks[i].status,
      i < boundary ? 'CHECKED' : 'UNCHECKED',
      `Completion boundary ${map.tasks[i].id}`,
    );
  for (const k of ['k05', 'k06'])
    assert.match(read(`${feature}/decisions/${k}-accepted-2026-10-07.md`), /ACCEPTED/);
  return migrations;
}
export function physicalCatalog(runtime, database) {
  const model = read(`${feature}/data-model.md`);
  const tables = [
    ...new Set([
      ...[...model.matchAll(/\| (clinical\.[a-z_]+)\s+\|/g)].map((m) => m[1]),
      ...[...model.matchAll(/^### (clinical\.[a-z_]+)$/gm)].map((m) => m[1]),
      'clinical.mutation_commit_obligations',
      'audit.signature_evidence',
    ]),
  ].sort();
  assert.equal(tables.length, 15);
  const execQuery = (q) => {
    const result = sql(
      runtime,
      database,
      `BEGIN; SET LOCAL ROLE shifaa_f011_executor; ${q} ROLLBACK;`,
    );
    return JSON.parse(result.stdout.trim());
  };
  const observed = tables.map((name) =>
    execQuery(`SELECT json_build_object(
    'name',${quote(name)},'rlsEnabled',c.relrowsecurity,'rlsForced',c.relforcerowsecurity,
    'columns',(SELECT json_agg(json_build_object('name',a.attname,'type',CASE format_type(a.atttypid,a.atttypmod) WHEN 'timestamp with time zone' THEN 'timestamptz' ELSE format_type(a.atttypid,a.atttypmod) END,'nullable',NOT a.attnotnull) ORDER BY a.attnum) FROM pg_attribute a WHERE a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped),
    'constraints',coalesce((SELECT json_agg(json_build_object('name',conname,'definition',pg_get_constraintdef(oid)) ORDER BY conname) FROM pg_constraint WHERE conrelid=c.oid),'[]'::json),
    'indexes',(SELECT json_agg(pg_get_indexdef(indexrelid) ORDER BY pg_get_indexdef(indexrelid)) FROM pg_index WHERE indrelid=c.oid),
    'triggers',coalesce((SELECT json_agg(pg_get_triggerdef(oid) ORDER BY tgname) FROM pg_trigger WHERE tgrelid=c.oid AND NOT tgisinternal),'[]'::json),
    'policies',coalesce((SELECT json_agg(json_build_object('name',polname,'command',polcmd,'roles',ARRAY(SELECT CASE WHEN x=0 THEN 'PUBLIC' ELSE pg_get_userbyid(x) END FROM unnest(polroles) x ORDER BY x),'using',pg_get_expr(polqual,polrelid),'withCheck',pg_get_expr(polwithcheck,polrelid)) ORDER BY polname) FROM pg_policy WHERE polrelid=c.oid),'[]'::json),
    'grants',coalesce((SELECT json_agg(json_build_object('grantee',CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END,'privilege',a.privilege_type) ORDER BY pg_get_userbyid(a.grantee),a.privilege_type) FROM aclexplode(coalesce(c.relacl,acldefault('r',c.relowner))) a WHERE a.grantee<>c.relowner),'[]'::json)
    ) FROM pg_class c WHERE c.oid=${quote(name)}::regclass;`),
  );
  const bindings = JSON.parse(read(`${feature}/contracts/scope-manifest.json`)).operations;
  const signatures = [
    'list_allergies_api_v1(uuid,jsonb)',
    'create_allergy_api_v1(uuid,jsonb)',
    'verify_allergy_api_v1(uuid,integer,jsonb)',
    'list_clinical_content_api_v1(text,jsonb)',
    'create_clinical_content_release_api_v1(text,jsonb)',
    'sign_clinical_content_release_api_v1(uuid,integer,jsonb)',
    'publish_clinical_content_release_api_v1(uuid,integer,jsonb)',
  ];
  const functions = signatures.map((identity, i) => ({
    ...execQuery(
      `SELECT json_build_object('identity',p.oid::regprocedure::text,'arguments',pg_get_function_arguments(p.oid),'result',pg_get_function_result(p.oid),'definitionSha256',encode(pg_catalog.sha256(convert_to(pg_get_functiondef(p.oid),'UTF8')),'hex'),'owner',pg_get_userbyid(p.proowner),'securityDefiner',p.prosecdef,'searchPath',substring(p.proconfig[1] from 13),'grants',(SELECT json_agg(json_build_object('grantee',CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END,'privilege',a.privilege_type) ORDER BY pg_get_userbyid(a.grantee)) FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a)) FROM pg_proc p WHERE p.oid=${quote(`clinical.${identity}`)}::regprocedure;`,
    ),
    operationId: bindings[i].id,
    method: bindings[i].method,
    path: bindings[i].path,
  }));
  const roles = execQuery(
    `SELECT json_agg(json_build_object('name',rolname,'login',rolcanlogin,'superuser',rolsuper,'bypassRls',rolbypassrls,'ownsDomainTables',EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='clinical' AND c.relowner=r.oid)) ORDER BY rolname) FROM pg_roles r WHERE rolname IN ('shifaa_api','shifaa_f011_executor');`,
  );
  for (const fn of functions) {
    assert.equal(fn.searchPath, '""', `${fn.identity} must configure the empty search_path`);
    fn.configuredSearchPath = fn.searchPath;
    fn.searchPath = '';
  }
  assert.ok(roles.every((r) => !r.superuser && !r.bypassRls && !r.ownsDomainTables));
  assert.ok(observed.every((t) => t.rlsEnabled && t.rlsForced));
  const profile = JSON.parse(read(`${feature}/contracts/verified-evidence-binding-v1.json`));
  for (const [table, columns] of Object.entries(profile.physical))
    for (const c of columns)
      assert.deepEqual(
        observed.find((t) => t.name === `clinical.${table}`).columns.find((a) => a.name === c.name),
        c,
      );
  assert.equal(
    observed.find((t) => t.name === 'clinical.content_signature_bindings').columns.length,
    50,
  );
  return {
    signatureSidecar: 'clinical.content_signature_bindings',
    tables: observed,
    functions,
    roles,
  };
}
export async function runPhysicalGreen() {
  const migrations = acceptedChain();
  const contracts = await verifyFeature011Contracts({ contractsOnly: true });
  assert.equal(contracts.result, 'PASS', contracts.failures.join('\n'));
  const inputs = harnessInputs();
  const sourceDigests = currentPhysicalSourceDigests(root, { includeRaces: false });
  const exposure = spawnSync(
    'pnpm.cmd',
    ['--filter', '@shifaa/api', 'exec', 'vitest', 'run', 'src/feature-011-exposure.test.ts'],
    { cwd: root, encoding: 'utf8', windowsHide: true, shell: true },
  );
  assert.equal(exposure.status, 0, exposure.stdout + exposure.stderr);
  const routes = artifact('routes-absent.log', exposure.stdout + exposure.stderr);
  const results = [];
  try {
    for (const runtime of runtimes) {
      console.log(`K07 physical GREEN setup: ${runtime.name}`);
      const result = await withDatabase(
        runtime,
        async (database) => {
          const baseline = prepare(runtime, database),
            health = smoke(runtime, database);
          assert.equal(
            health.manifest.serverVersion.split(' ')[0],
            runtime.name === 'shifaa-local-postgres' ? '17.11' : '17.6',
          );
          seedAdminHistory(runtime, database);
          const before = baselineRows(runtime, database);
          const applied = migrations.map((path) => ({
            path,
            sha256: digest(path),
            ...sql(runtime, database, readMigration(path)),
          }));
          const after = baselineRows(runtime, database);
          for (const [table, facts] of Object.entries(before))
            assert.equal(after[table], facts, `Populated predecessor drift ${table}`);
          const invariants = storageCatalogProof(runtime, database);
          const security = catalogProof(runtime, database),
            directRoles = directRoleProof(runtime, database);
          const catalog = physicalCatalog(runtime, database),
            canonical = canonicalProof(runtime, database, true);
          const executorIdentity = sql(
            runtime,
            database,
            "BEGIN; SET LOCAL ROLE shifaa_f011_executor; SELECT json_build_object('currentUser',current_user,'superuser',rolsuper,'bypassRls',rolbypassrls) FROM pg_roles WHERE rolname=current_user; ROLLBACK;",
          );
          const identity = JSON.parse(executorIdentity.stdout.trim());
          assert.deepEqual(identity, {
            currentUser: 'shifaa_f011_executor',
            superuser: false,
            bypassRls: false,
          });
          sql(runtime, database, read('infra/db/fixtures/feature-011-k06.sql'));
          const behavior = consumerComponents(runtime, database),
            auditGuards = auditGuardProof(runtime, database);
          assert.equal(behavior.results.length, 45);
          const details = {
            runtime: runtimeManifest(runtime),
            database,
            baseline,
            health,
            applied,
            invariants,
            security,
            directRoles,
            catalog,
            canonical,
            executorIdentity,
            auditGuards,
            behavior,
            populatedPredecessor: { tables: Object.keys(before).length, before, after },
            routes,
            syntheticOnly: true,
            realAesKmsAccepted: false,
            realEvidenceSourceAccepted: false,
            fullRaceProofExecuted: false,
          };
          artifact(`${runtime.name}-physical-details.json`, details);
          return details;
        },
        'K07',
      );
      results.push(result);
      assert.deepEqual(
        currentPhysicalSourceDigests(root, { includeRaces: false }),
        sourceDigests,
        'Proof-source drift during T027',
      );
      console.log(`${runtime.name}: physical GREEN PASS`);
    }
    assert.deepEqual(
      results[0].catalog,
      results[1].catalog,
      'Both runtime full physical catalogs must be identical',
    );
    const expectedCatalog = artifact('expected-catalog.json', results[0].catalog);
    const proof = {
      formatVersion: 1,
      checkpoint: 'K07',
      task: 'T027',
      stage: 'P4',
      result: 'PASS',
      ledgerId: 'SHIFAA-F011-FRESH-TASKS@1.0.0',
      head: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(),
      planManifestSha256: '79b1eafe6dea7ab2a26edd805e2c83baf2d0f0d12b9b6c44d11164caa8ab4548',
      sourceDigests,
      inputs,
      expectedCatalog,
      results,
      routes,
      syntheticOnly: true,
      completedAt: new Date().toISOString(),
      t028Executed: false,
      t029Asserted: false,
    };
    artifact('physical-green.json', proof);
    return proof;
  } catch (error) {
    artifact('physical-green-attempt.json', {
      task: 'T027',
      result: 'FAIL',
      error: error.stack,
      sourceDigests,
      results,
      syntheticOnly: true,
      capturedAt: new Date().toISOString(),
      t028Unlocked: false,
      t029Asserted: false,
    });
    throw error;
  }
}
