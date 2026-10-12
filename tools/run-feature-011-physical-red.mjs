import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  root,
  runtimes,
  sql,
  withDatabase,
  prepare,
  smoke,
  harnessInputs,
  runtimeManifest,
  digest,
} from './run-feature-011-postgres-test.mjs';

export const suiteFiles = [
  'allergy-create-read',
  'allergy-verification',
  'content-draft',
  'signatures',
  'publication',
  'receipts',
  'schema',
  'rls',
  'content-projections',
  'concurrency',
].map((name) => `infra/db/tests/feature-011-${name}.sql`);
const commonPath = 'infra/db/fixtures/feature-011-k04.sql';
const output = resolve(root, 'artifacts/feature-011/k04');
const quote = (value) => `'${String(value).replaceAll("'", "''")}'`;
export function parseCases(source, file) {
  const chunks = source.split(/^-- F011_CASE /m).slice(1);
  assert.ok(chunks.length, `No cases: ${file}`);
  return chunks.map((chunk) => {
    const newline = chunk.indexOf('\n');
    const metadata = JSON.parse(chunk.slice(0, newline));
    assert.match(metadata.id, /^[A-Za-z0-9_-]+$/);
    assert.ok(['T012', 'T013', 'T014', 'T015'].includes(metadata.task));
    assert.ok(['table', 'function', 'role'].includes(metadata.missing.kind));
    assert.match(
      metadata.missing.name,
      /^(clinical\.[a-z_][a-z_0-9]*(?:\([a-z,]+\))?|shifaa_f011_executor)$/,
    );
    assert.ok(['owner', 'shifaa_api'].includes(metadata.user));
    assert.equal(typeof metadata.commit, 'boolean');
    const statement = chunk.slice(newline + 1).trim();
    assert.ok(statement.includes("SELECT 'K04_CASE_COMPILED';"));
    assert.ok(statement.endsWith('SELECT pg_temp.f011_case();'));
    assert.ok(
      !/materialBytesHex|raw_content|raw_code|raw_test_vectors/.test(
        statement.replace(/ARRAY\[[^\]]*\]/g, ''),
      ),
      'Raw evidence must not enter SQL.',
    );
    return { ...metadata, file, statement };
  });
}
export function assertPhysicalRed(result, item, absent) {
  assert.equal(absent, true, 'Expected physical primitive is not absent.');
  const message = `F011_K04_MISSING:${item.id}:${item.missing.kind}:${item.missing.name}`;
  assert.equal(result.exitCode, 3, 'Only an intentional PostgreSQL assertion failure is RED.');
  assert.ok(
    result.stdout.split(/\r?\n/).includes('K04_CASE_COMPILED'),
    'Case body did not compile.',
  );
  const errors = result.stderr.split(/\r?\n/).filter((line) => /ERROR:/.test(line));
  assert.equal(errors.length, 1, 'Unexpected extra SQL errors.');
  assert.ok(errors[0].endsWith(`P0001: ${message}`), `Unexpected RED: ${result.output}`);
  assert.ok(
    !/syntax error|permission denied|does not exist|connection.*failed/i.test(result.stderr),
  );
  return {
    result: 'VALID_MISSING_PHYSICAL_RED',
    sqlstate: 'P0001',
    reason: message,
    behaviorExecution: 'BLOCKED_BY_ABSENT_PHYSICAL_PRIMITIVE',
    deferredCommitBehaviorProven: false,
  };
}
function absence(runtime, database, item) {
  const primitive = { table: 'to_regclass', function: 'to_regprocedure', role: 'to_regrole' }[
    item.missing.kind
  ];
  return (
    sql(
      runtime,
      database,
      `SELECT ${primitive}(${quote(item.missing.name)}) IS NULL;`,
    ).stdout.trim() === 't'
  );
}
function execute(runtime, database, item) {
  const absent = absence(runtime, database, item);
  const common = readFileSync(resolve(root, commonPath), 'utf8');
  const result = sql(
    runtime,
    database,
    `BEGIN; SET LOCAL check_function_bodies=on; SET LOCAL shifaa.k04_case=${quote(item.id)};\n${common}\n${item.statement}\n${item.commit ? 'COMMIT;' : 'ROLLBACK;'}`,
    { allowFailure: true, user: item.user === 'owner' ? runtime.user : item.user },
  );
  return {
    id: item.id,
    task: item.task,
    file: item.file,
    purpose: item.purpose,
    missing: item.missing,
    role: item.user === 'owner' ? runtime.user : item.user,
    commitFaultFixture: item.commit,
    ...assertPhysicalRed(result, item, absent),
    command: result.command,
    exitCode: result.exitCode,
    stdout: result.stdout,
    stderr: result.stderr,
  };
}
function frozenHealth(runtime, database) {
  const file =
    'specs/011-allergies-clinical-content-governance/contracts/artifact-canonicalization-v1-vectors.json';
  const vectors = JSON.parse(readFileSync(resolve(root, file), 'utf8')).positive;
  const results = vectors.map((vector) => {
    assert.equal(Buffer.from(vector.canonicalUtf8, 'utf8').toString('hex'), vector.canonicalHex);
    const result = sql(
      runtime,
      database,
      `SELECT json_build_object('id',${quote(vector.id)},'hex',encode(convert_to(${quote(vector.canonicalUtf8)},'UTF8'),'hex'),'sha256',encode(audit.sha256_v1(decode(${quote(vector.canonicalHex)},'hex')),'hex'));`,
    );
    const facts = JSON.parse(result.stdout.trim());
    assert.equal(facts.hex, vector.canonicalHex);
    assert.equal(facts.sha256, vector.sha256);
    return { ...facts, result: 'PASS_LITERAL_FIXTURE_HEALTH' };
  });
  assert.deepEqual(
    results.map((v) => v.id),
    ['V01', 'V02', 'V03', 'V04', 'V05', 'V06', 'V07'],
  );
  return { vectorFile: file, sha256: digest(file), results, encoderAcceptance: false };
}
function receiptPrerequisiteHealth(runtime, database) {
  const source = readFileSync(resolve(root, commonPath), 'utf8');
  const body = source
    .split('CREATE FUNCTION pg_temp.f011_receipt_fault(operation text, fault text)')[1]
    .split('  -- The existing event type')[0];
  const declaration = body.slice(body.indexOf('DECLARE'), body.indexOf('BEGIN'));
  const statements = body
    .slice(body.indexOf('BEGIN') + 5)
    .replace(/^  PERFORM pg_temp\.f011_require_table\([^\n]+\);\r?\n/gm, '');
  for (const fault of ['none', 'wrong-audit', 'wrong-outbox'])
    sql(
      runtime,
      database,
      `BEGIN; SET LOCAL shifaa.k04_case='BASELINE-${fault}'; ${source}
    DO $baseline$ DECLARE operation text:='createAllergy'; fault text:=${quote(fault)};
    ${declaration.replace(/^DECLARE\s*/, '')}
    BEGIN ${statements}
      IF NOT EXISTS(SELECT 1 FROM platform.idempotency_records WHERE id=idem)
        OR NOT EXISTS(SELECT 1 FROM audit.events WHERE id=audit_row.event_id AND occurred_at=audit_row.event_occurred_at)
        OR NOT EXISTS(SELECT 1 FROM platform.outbox_events WHERE id=outbox) THEN RAISE EXCEPTION 'Baseline receipt fixture setup failed'; END IF;
    END $baseline$; ROLLBACK;`,
    );
  return {
    result: 'PASS_BASELINE_RECEIPT_PREREQUISITES',
    faults: ['none', 'wrong-audit', 'wrong-outbox'],
    source: commonPath,
    sourceSha256: digest(commonPath),
    rollback: true,
    feature011CommitGuardExecuted: false,
  };
}
export async function runPhysicalRed(kind) {
  assert.ok(['sql', 'concurrency'].includes(kind));
  mkdirSync(output, { recursive: true });
  const all = suiteFiles.flatMap((file) =>
    parseCases(readFileSync(resolve(root, file), 'utf8'), file),
  );
  assert.equal(new Set(all.map((item) => item.id)).size, all.length);
  const selected = all.filter(
    (item) => item.file.endsWith('-concurrency.sql') === (kind === 'concurrency'),
  );
  const manifestPath =
    'specs/011-allergies-clinical-content-governance/decisions/recovered-plan-approval-manifest-v1.json';
  const manifest = JSON.parse(readFileSync(resolve(root, manifestPath), 'utf8'));
  const normative = [
    ...manifest.normativeApprovalInputs.baselineAuthority,
    ...manifest.normativeApprovalInputs.featurePlanFamily,
  ];
  assert.equal(normative.length, 42);
  for (const input of normative)
    assert.equal(digest(input.path), input.sha256, `Normative drift: ${input.path}`);
  const inputPaths = [
    commonPath,
    ...suiteFiles,
    'tools/run-feature-011-physical-red.mjs',
    manifestPath,
    ...normative.map((input) => input.path),
    'packages/contracts/src/feature-011.ts',
    'packages/api-client/src/feature-011.ts',
  ];
  if (existsSync(resolve(root, 'tools/feature-011-predecessor-races.mjs')))
    inputPaths.push('tools/feature-011-predecessor-races.mjs');
  const inputs = {
    ...harnessInputs(),
    sourceDigests: Object.fromEntries(inputPaths.map((path) => [path, digest(path)])),
  };
  const results = [];
  for (const runtime of runtimes) {
    const identity = runtimeManifest(runtime);
    const result = await withDatabase(
      runtime,
      async (database) => {
        const setup = prepare(runtime, database),
          health = smoke(runtime, database);
        const version = sql(runtime, database, 'SHOW server_version;').stdout.trim();
        assert.ok(
          version.startsWith(runtime === runtimes[0] ? '17.11' : '17.6'),
          `Wrong runtime ${version}`,
        );
        for (const user of [runtime.user, 'shifaa_api'])
          sql(
            runtime,
            database,
            `BEGIN; ${readFileSync(resolve(root, commonPath), 'utf8')} SELECT pg_temp.f011_check(true,'common fixture health'); ROLLBACK;`,
            { user },
          );
        const vectors = frozenHealth(runtime, database);
        const receiptPrerequisites = receiptPrerequisiteHealth(runtime, database);
        let predecessorProof;
        if (kind === 'concurrency') {
          const { provePredecessorRaces } = await import('./feature-011-predecessor-races.mjs');
          predecessorProof = await provePredecessorRaces(runtime, database);
        }
        const cases = selected.map((item) => execute(runtime, database, item));
        return {
          runtime: identity,
          database,
          version,
          setup,
          health,
          commonFixtureCompilation: 'PASS_OWNER_AND_ACTUAL_API',
          vectors,
          receiptPrerequisites,
          predecessorProof,
          cases,
        };
      },
      'K04',
    );
    results.push(result);
    console.log(
      `${runtime.name} ${kind}: ${selected.length} valid missing-physical RED; setup, fixture compilation, frozen bytes/digests and exact cleanup PASS`,
    );
  }
  for (const [path, hash] of Object.entries(inputs.sourceDigests))
    assert.equal(digest(path), hash, `Source changed during RED capture: ${path}`);
  const report = {
    checkpoint: 'K04',
    kind,
    result: 'PASS_VALID_MISSING_PHYSICAL_RED',
    inputs,
    results,
    caseCountPerRuntime: selected.length,
    feature011DDLExecuted: false,
    fullFeatureBehaviorAcceptance: false,
    realAESKMSAcceptance: false,
    realEvidenceSourceAcceptance: false,
    clinicalApproval: false,
    productionReadiness: false,
  };
  writeFileSync(resolve(output, `${kind}-red-run.json`), JSON.stringify(report, null, 2) + '\n');
}
