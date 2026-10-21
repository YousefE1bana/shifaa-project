import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parse, stringify } from 'yaml';
import {
  readDocumentationSuccessor,
  documentationSuccessorInputPaths,
  readHistoricalVerificationInputs,
} from './feature-011-documentation-successor.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const feature = 'specs/011-allergies-clinical-content-governance';
const manifestPath = `${feature}/decisions/recovered-plan-approval-manifest-v1.json`;
const approvedTasksHash = 'e7a8eac9f0fed21f16b1f632edb4efe5fad3beccae6b637bff957235f9573165';
const approvedMapHash = '5a6037838bc644a5dbb61c17a5504a662822f8d5ee0925379b823737f17b738d';
const approvedPlanManifestHash = '79b1eafe6dea7ab2a26edd805e2c83baf2d0f0d12b9b6c44d11164caa8ab4548';
const fixtureParent = path.join(root, 'artifacts/feature-011/k01-fixtures');
const tooling = { node: 'v24.22.1', pnpm: '11.13.0', supabase: '2.113.0' };

async function withFixture(mutator, observedTooling = tooling) {
  fs.mkdirSync(fixtureParent, { recursive: true });
  const fixtureRoot = fs.mkdtempSync(path.join(fixtureParent, 'scope-'));
  assert.ok(path.resolve(fixtureRoot).startsWith(`${path.resolve(fixtureParent)}${path.sep}`));
  try {
    const manifest = JSON.parse(fs.readFileSync(path.join(root, manifestPath), 'utf8'));
    const readHistorical = readHistoricalVerificationInputs(root);
    const files = new Set([
      ...Object.values(manifest.normativeApprovalInputs).flatMap((entries) =>
        Array.isArray(entries) ? entries.map(({ path: file }) => file) : [],
      ),
      manifestPath,
      ...(readDocumentationSuccessor(root) ? documentationSuccessorInputPaths : []),
      `${feature}/decisions/recovered-plan-approved-2026-10-06.md`,
      `${feature}/decisions/fresh-tasks-approved-2026-10-06.md`,
      `${feature}/decisions/feature-011-ux-plan-gate-2026-10-06.md`,
      `${feature}/decisions/product-owner-approvals-2026-10-02.md`,
      `${feature}/evidence/recovered-plan-approval-validation-2026-10-06.json`,
      `${feature}/evidence/fresh-tasks-inputs-v1.json`,
      `${feature}/contracts/task-map.json`,
      `${feature}/tasks.md`,
      `${feature}/visual-baselines/baseline-inventory.json`,
      `${feature}/contracts/scope-manifest.json`,
      `${feature}/contracts/openapi.yaml`,
      `${feature}/contracts/trusted-release-handoff-v1.json`,
      `${feature}/contracts/artifact-canonicalization-v1.json`,
      `${feature}/contracts/artifact-canonicalization-v1-vectors.json`,
      `${feature}/contracts/artifact-canonicalization-parity-v1.json`,
      'packages/api-client/src/feature-011.ts',
      'packages/contracts/src/feature-011.ts',
      'package.json',
      'pnpm-lock.yaml',
      '.specify/feature.json',
      '.node-version',
      '.nvmrc',
      'shifaa-prd.md',
      'SHIFAA-Implementation-Plan-MASTER.md',
      'docs/architecture/SHIFAA-API-Catalog.md',
      'docs/governance/SHIFAA-Feature-011-Reconciliation-2026-10-01.md',
    ]);
    for (const file of files) {
      const target = path.join(fixtureRoot, file);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      // Preserve the immutable approval baseline through the already verified
      // successor boundary; mutations below still exercise the original negatives.
      fs.writeFileSync(
        target,
        file === 'package.json' ? fs.readFileSync(path.join(root, file)) : readHistorical(file),
      );
    }
    // The disposable K01 fixture owns its pointer; leave the repository's active context intact.
    writeJson(fixtureRoot, '.specify/feature.json', { feature_directory: feature });
    // Exercise the immutable K01 approval baseline, not later accepted completion.
    // Exact approved hashes below reject any change beyond completion bookkeeping.
    const tasksFile = path.join(fixtureRoot, `${feature}/tasks.md`);
    fs.writeFileSync(
      tasksFile,
      fs.readFileSync(tasksFile, 'utf8').replace(/^- \[x\] (T\d{3}\b)/gm, '- [ ] $1'),
    );
    const initialMap = readJson(fixtureRoot, `${feature}/contracts/task-map.json`);
    for (const task of initialMap.tasks) task.status = 'UNCHECKED';
    writeJson(fixtureRoot, `${feature}/contracts/task-map.json`, initialMap);
    assertHealthyFixture(fixtureRoot);
    mutator?.(fixtureRoot);
    const verifierPath = path.join(root, 'tools/verify-feature-011-scope.mjs');
    assert.ok(fs.existsSync(verifierPath), 'scope verifier is not implemented');
    const { verifyFeature011Scope } = await import(pathToFileURL(verifierPath));
    return await verifyFeature011Scope({ root: fixtureRoot, tooling: observedTooling });
  } finally {
    const resolvedRoot = path.resolve(fixtureRoot);
    assert.ok(resolvedRoot.startsWith(`${path.resolve(fixtureParent)}${path.sep}`));
    fs.rmSync(resolvedRoot, { recursive: true, force: true });
  }
}

function assertHealthyFixture(fixtureRoot) {
  const map = readJson(fixtureRoot, `${feature}/contracts/task-map.json`);
  const scope = readJson(fixtureRoot, `${feature}/contracts/scope-manifest.json`);
  const freshApproval = fs.readFileSync(
    path.join(fixtureRoot, `${feature}/decisions/fresh-tasks-approved-2026-10-06.md`),
    'utf8',
  );
  assert.equal(map.tasks.length, 92);
  assert.equal(map.checkpoints.length, 24);
  assert.equal(map.requirements.length, 23);
  assert.equal(map.operations.length, 7);
  assert.equal(map.acceptanceCoverage.length, 16);
  assert.ok(map.tasks.every(({ status }) => status === 'UNCHECKED'));
  assert.deepEqual(
    scope.operations.map(({ id }) => id),
    map.operations.map(({ id }) => id),
  );
  assert.ok(freshApproval.includes(approvedTasksHash));
  assert.ok(freshApproval.includes(approvedMapHash));
  assert.ok(freshApproval.includes(approvedPlanManifestHash));
  const mapHash = createHash('sha256')
    .update(fs.readFileSync(path.join(fixtureRoot, `${feature}/contracts/task-map.json`)))
    .digest('hex');
  const tasksHash = createHash('sha256')
    .update(fs.readFileSync(path.join(fixtureRoot, `${feature}/tasks.md`)))
    .digest('hex');
  assert.equal(mapHash, approvedMapHash);
  assert.equal(tasksHash, approvedTasksHash);
}

function readJson(fixtureRoot, relativePath) {
  return JSON.parse(fs.readFileSync(path.join(fixtureRoot, relativePath), 'utf8'));
}

function writeJson(fixtureRoot, relativePath, document) {
  fs.writeFileSync(path.join(fixtureRoot, relativePath), JSON.stringify(document, null, 2) + '\n');
}

function mutateOpenapi(fixtureRoot, mutate) {
  const file = path.join(fixtureRoot, `${feature}/contracts/openapi.yaml`);
  const document = parse(fs.readFileSync(file, 'utf8'));
  mutate(document);
  fs.writeFileSync(file, stringify(document));
}

function expectFailure(report, diagnostic) {
  assert.ok(
    report.failures.some((failure) => diagnostic.test(failure)),
    `Expected ${diagnostic}; received: ${report.failures.join('; ')}`,
  );
}

test('approved recovered inputs and fresh ledger produce a pending, fail-closed scope result', async () => {
  const report = await withFixture();
  assert.deepEqual(
    report.failures,
    [],
    `valid current fixture rejected: ${report.failures.join('; ')}`,
  );
  assert.equal(report.parity.status, 'PENDING');
  assert.equal(report.parity.affectedConsumersAllowed, false);
  assert.equal(report.parity.assertionTask, 'T029');
  assert.equal(report.parity.checkpoint, 'K07');
  assert.deepEqual(report.parity.runtimes, ['shifaa-local-postgres', 'shifaa-local-supabase']);
});

for (const [label, mutate] of [
  [
    'added public operation',
    (root) =>
      mutateOpenapi(root, (api) => {
        api.paths['/safety'] = { post: { operationId: 'evaluateSafety', responses: {} } };
      }),
  ],
  [
    'removed public operation',
    (root) =>
      mutateOpenapi(root, (api) => {
        delete api.paths['/patients/{managedPatientId}/allergies'].get;
      }),
  ],
  [
    'substituted public operation',
    (root) =>
      mutateOpenapi(root, (api) => {
        api.paths['/patients/{managedPatientId}/allergies'].get.operationId = 'listPrescriptions';
      }),
  ],
  [
    'changed method or path binding',
    (root) =>
      mutateOpenapi(root, (api) => {
        api.paths['/allergies/{allergyId}/verification'].put =
          api.paths['/allergies/{allergyId}/verification'].post;
        delete api.paths['/allergies/{allergyId}/verification'].post;
      }),
  ],
  [
    'added a public request header',
    (root) =>
      mutateOpenapi(root, (api) => {
        api.paths['/patients/{managedPatientId}/allergies'].get.parameters.push({
          in: 'header',
          name: 'x-clinical-mode',
          required: true,
          schema: { type: 'string' },
        });
      }),
  ],
  [
    'removed a required mutation header',
    (root) =>
      mutateOpenapi(root, (api) => {
        const operation = api.paths['/patients/{managedPatientId}/allergies'].post;
        operation.parameters = operation.parameters.filter(
          ({ $ref }) => !$ref.endsWith('/IdempotencyKey'),
        );
      }),
  ],
  [
    'opened a closed request DTO',
    (root) =>
      mutateOpenapi(root, (api) => {
        api.components.schemas.CreateAllergyRequest.additionalProperties = true;
      }),
  ],
  [
    'changed an existing required DTO field',
    (root) =>
      mutateOpenapi(root, (api) => {
        delete api.components.schemas.CreateAllergyRequest.properties.substance;
      }),
  ],
]) {
  test(`rejects ${label}`, async () => {
    const report = await withFixture(mutate);
    expectFailure(report, /operation|wire|openapi\.yaml/i);
  });
}

for (const [label, relativePath, mutate] of [
  [
    'added NFR',
    `${feature}/contracts/scope-manifest.json`,
    (scope) => scope.nfr.push('NFR-SEC-003'),
  ],
  [
    'substituted NFR',
    `${feature}/contracts/task-map.json`,
    (map) => {
      map.requirements[4] = 'NFR-SEC-003';
    },
  ],
  [
    'expanded FR-ADMIN-004 beyond publication',
    `${feature}/contracts/scope-manifest.json`,
    (scope) => {
      scope.frSlices['FR-ADMIN-004'] = 'all administration';
    },
  ],
  ['added Feature 012 prescription behavior', `${feature}/contracts/openapi.yaml`, null],
]) {
  test(`rejects ${label}`, async () => {
    const report = await withFixture((fixtureRoot) => {
      if (relativePath.endsWith('.yaml')) {
        mutateOpenapi(fixtureRoot, (api) => {
          api.paths['/prescriptions'] = {
            post: { operationId: 'createPrescription', responses: {} },
          };
        });
        return;
      }
      const document = readJson(fixtureRoot, relativePath);
      mutate(document);
      writeJson(fixtureRoot, relativePath, document);
    });
    expectFailure(
      report,
      /NFR|FR-ADMIN-004|scope-manifest|Feature 012|operation|approved input hash mismatch:.*contracts\/openapi\.yaml/i,
    );
    assert.equal(report.parity.affectedConsumersAllowed, false);
  });
}

test('verifyAllergy entered-in-error reconciliation remains asserted', async () => {
  const report = await withFixture((fixtureRoot) => {
    const catalog = path.join(fixtureRoot, 'docs/architecture/SHIFAA-API-Catalog.md');
    const contents = fs.readFileSync(catalog, 'utf8');
    const row = contents.split('\n').find((line) => line.startsWith('| `verifyAllergy`'));
    assert.ok(row?.includes('terminal entered_in_error'));
    fs.writeFileSync(
      catalog,
      contents.replace(row, row.replace('terminal entered_in_error', 'terminal')),
    );
  });
  expectFailure(report, /verifyAllergy|entered_in_error|reconciliation/i);
  expectFailure(report, /Unreadable or malformed baseline\/tooling/);
});

test('listClinicalContent metadata-only reconciliation remains asserted', async () => {
  const report = await withFixture((fixtureRoot) => {
    const catalog = path.join(fixtureRoot, 'docs/architecture/SHIFAA-API-Catalog.md');
    const contents = fs.readFileSync(catalog, 'utf8');
    const row = contents.split('\n').find((line) => line.startsWith('| `listClinicalContent`'));
    assert.ok(
      row?.includes('no drafts/unsigned details/bodies/derived mutation or admin authority'),
    );
    fs.writeFileSync(
      catalog,
      contents.replace(
        row,
        row.replace(
          'no drafts/unsigned details/bodies/derived mutation or admin authority',
          'all content',
        ),
      ),
    );
  });
  expectFailure(report, /listClinicalContent|metadata|reconciliation/i);
});

test('every frozen operation remains bound to its API Catalog method and path', async () => {
  const report = await withFixture((fixtureRoot) => {
    const catalog = path.join(fixtureRoot, 'docs/architecture/SHIFAA-API-Catalog.md');
    const contents = fs.readFileSync(catalog, 'utf8');
    const row = contents.split('\n').find((line) => line.startsWith('| `listAllergies`'));
    assert.ok(row?.includes('GET /patients/{managedPatientId}/allergies'));
    fs.writeFileSync(
      catalog,
      contents.replace(
        row,
        row.replace('GET /patients/{managedPatientId}/allergies', 'POST /wrong'),
      ),
    );
  });
  expectFailure(report, /API Catalog|listAllergies|operation method.path/i);
});

test('API Catalog request header flags remain frozen for each operation', async () => {
  const report = await withFixture((fixtureRoot) => {
    const catalog = path.join(fixtureRoot, 'docs/architecture/SHIFAA-API-Catalog.md');
    const contents = fs.readFileSync(catalog, 'utf8');
    const row = contents.split('\n').find((line) => line.startsWith('| `createAllergy`'));
    assert.ok(row?.includes('| I     |'), 'idempotency flag mutation marker exists');
    fs.writeFileSync(catalog, contents.replace(row, row.replace('| I     |', '| —     |')));
  });
  expectFailure(report, /API Catalog request header flags mismatch: createAllergy/i);
});

for (const [label, file] of [
  ['fresh Tasks approval record', `${feature}/decisions/fresh-tasks-approved-2026-10-06.md`],
  ['recovered Plan approval record', `${feature}/decisions/recovered-plan-approved-2026-10-06.md`],
  ['Feature 011 UX decision', `${feature}/decisions/feature-011-ux-plan-gate-2026-10-06.md`],
]) {
  test(`rejects rewritten ${label}`, async () => {
    const report = await withFixture((fixtureRoot) => {
      const filePath = path.join(fixtureRoot, file);
      fs.appendFileSync(filePath, '\nUnreviewed approval edit.\n');
    });
    expectFailure(
      report,
      /approval.*hash|decision.*hash|approved Plan disposition hash|approved input hash mismatch:.*feature-011-ux-plan-gate/i,
    );
  });
}

test('changed existing generated client bytes are rejected without rewriting generated outputs', async () => {
  const report = await withFixture((fixtureRoot) => {
    const clientPath = path.join(fixtureRoot, 'packages/api-client/src/feature-011.ts');
    const source = fs.readFileSync(clientPath, 'utf8');
    const wire = '`/allergies/${encodeURIComponent(allergyId)}/verification`';
    assert.ok(source.includes(wire), 'generated client mutation marker exists');
    fs.writeFileSync(clientPath, source.replace(wire, '`/safety`'));
  });
  expectFailure(report, /client|wire|generated|parity/i);
});

test('Feature 012 remains an explicit exclusion even when counts remain unchanged', async () => {
  const report = await withFixture((fixtureRoot) => {
    const scopePath = path.join(fixtureRoot, `${feature}/contracts/scope-manifest.json`);
    const scope = JSON.parse(fs.readFileSync(scopePath, 'utf8'));
    scope.exclusions = scope.exclusions.filter((entry) => entry !== 'Feature 012');
    writeJson(fixtureRoot, `${feature}/contracts/scope-manifest.json`, scope);
  });
  expectFailure(report, /exclusion|scope-manifest|Feature 012/i);
});

test('toolchain checks use pinned Node, pnpm, and local Supabase CLI without Docker startup', async () => {
  const report = await withFixture(undefined, { ...tooling, pnpm: '11.0.0' });
  expectFailure(report, /pnpm/i);
});

test('toolchain rejects the previous Node runtime and a mismatched engine declaration', async () => {
  expectFailure(await withFixture(undefined, { ...tooling, node: 'v24.18.0' }), /Node|node/i);
  const report = await withFixture((fixtureRoot) => {
    const manifest = readJson(fixtureRoot, 'package.json');
    manifest.engines.node = '24.18.0';
    writeJson(fixtureRoot, 'package.json', manifest);
  });
  expectFailure(report, /Node.*pin inconsistency/i);
});

test('unreadable current scope input fails closed with its path', async () => {
  const report = await withFixture((fixtureRoot) => {
    fs.unlinkSync(path.join(fixtureRoot, `${feature}/contracts/scope-manifest.json`));
  });
  expectFailure(report, /scope-manifest|Unreadable/i);
  assert.equal(report.parity.affectedConsumersAllowed, false);
});
