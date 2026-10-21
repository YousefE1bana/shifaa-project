import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'yaml';
import { readDocumentationSuccessor } from './feature-011-documentation-successor.mjs';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const feature = 'specs/011-allergies-clinical-content-governance';
const approvalManifestPath = `${feature}/decisions/recovered-plan-approval-manifest-v1.json`;
const approvalManifestHash = '79b1eafe6dea7ab2a26edd805e2c83baf2d0f0d12b9b6c44d11164caa8ab4548';
const freshTasksHash = 'e7a8eac9f0fed21f16b1f632edb4efe5fad3beccae6b637bff957235f9573165';
const taskMapHash = '5a6037838bc644a5dbb61c17a5504a662822f8d5ee0925379b823737f17b738d';
const recoveredApprovalHash = '665824ab1180ef0ebb5d864584e4b58921428e0c172d3e97244fd5222bf9948c';
const freshTasksApprovalHash = '1798fcf91ba1a523a8f912884528d1a0b1b3b7cfefb18969d161b56ca7f660a9';
const uxDecisionHash = 'a46d7f12480819c7649998729ba9149499cf66e33dcfcef335151d712710d817';
const uxManifestHash = '59ea1788edbae023533a9e08da97bc3884e0e098ec6e80721272822b6439c432';
const uxCandidate = 'SHIFAA-F011-OPEN-UX-001-CANDIDATE@0.1.1-test-only';
const requirements = [
  'FR-SAFE-002',
  'FR-SAFE-008',
  'FR-SAFE-012',
  'FR-ADMIN-004',
  'NFR-SEC-001',
  'NFR-SEC-002',
  'NFR-SEC-004',
  'NFR-SEC-005',
  'NFR-SEC-006',
  'NFR-SEC-007',
  'NFR-PRIV-002',
  'NFR-PRIV-004',
  'NFR-I18N-001',
  'NFR-A11Y-001',
  'NFR-PERF-002',
  'NFR-DATA-001',
  'NFR-DATA-002',
  'NFR-API-001',
  'NFR-API-002',
  'NFR-OBS-001',
  'NFR-QUALITY-001',
  'NFR-PORT-001',
  'NFR-PRIV-001',
];
const operations = [
  ['listAllergies', 'get', '/patients/{managedPatientId}/allergies'],
  ['createAllergy', 'post', '/patients/{managedPatientId}/allergies'],
  ['verifyAllergy', 'post', '/allergies/{allergyId}/verification'],
  ['listClinicalContent', 'get', '/admin/clinical-content/{contentType}'],
  ['createClinicalContentRelease', 'post', '/admin/clinical-content/{contentType}/releases'],
  ['signClinicalContentRelease', 'post', '/admin/clinical-content/releases/{releaseId}/signatures'],
  ['publishClinicalContentRelease', 'post', '/admin/clinical-content/releases/{releaseId}/publish'],
];
const gates = [
  'OPEN-CLIN-001',
  'OPEN-TECH-002',
  'OPEN-TECH-003',
  'OPEN-UX-001',
  'OPEN-UX-002',
  'OPEN-LEGAL-001',
  'OPEN-LEGAL-002',
  'OPEN-LEGAL-007',
];
const exclusions = [
  'prescriptions',
  'safety evaluation',
  'warnings/contraindications',
  'override/break-glass execution',
  'dispensing',
  'Feature 012',
  'fabricated medical rules/content',
  'production enablement',
];
const uxRoutes = [
  'patient:/records',
  'clinic:/patients/:id/summary',
  'clinic:/clinical-content/status',
  'admin:/clinical-content',
];
const expectedTooling = { node: 'v24.18.0', pnpm: '11.13.0', supabase: '2.113.0' };

function pendingParity() {
  return {
    gate: 'OPEN-TECH-002',
    status: 'PENDING',
    affectedConsumersAllowed: false,
    assertionTask: 'T029',
    checkpoint: 'K07',
    runtimes: ['shifaa-local-postgres', 'shifaa-local-supabase'],
    requiredEvidence: [
      'generated-contract-client',
      'physical-schema-rls-grants-functions',
      'both-runtime-non-owner-races',
      'owner-stage-disposition',
    ],
  };
}

function exactSet(actual, expected) {
  return (
    Array.isArray(actual) &&
    actual.length === expected.length &&
    new Set(actual).size === actual.length &&
    [...actual].sort().join('|') === [...expected].sort().join('|')
  );
}

function digest(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function inputReaders(root) {
  const read = (relativePath) => fs.readFileSync(path.join(root, relativePath));
  const text = (relativePath) => read(relativePath).toString('utf8');
  const json = (relativePath) => JSON.parse(text(relativePath));
  return { read, text, json };
}

function readApprovalInputs(json, text) {
  return {
    approvalManifest: json(approvalManifestPath),
    freshTasksApproval: text(`${feature}/decisions/fresh-tasks-approved-2026-10-06.md`),
    recoveredPlanApproval: text(`${feature}/decisions/recovered-plan-approved-2026-10-06.md`),
    uxApproval: text(`${feature}/decisions/feature-011-ux-plan-gate-2026-10-06.md`),
  };
}

function readFeatureInputs(json, text) {
  return {
    scope: json(`${feature}/contracts/scope-manifest.json`),
    taskMap: json(`${feature}/contracts/task-map.json`),
    tasks: text(`${feature}/tasks.md`),
    spec: text(`${feature}/spec.md`),
    api: parse(text(`${feature}/contracts/openapi.yaml`)),
    reference: json(`${feature}/visual-baselines/reference-manifest.json`),
    inventory: json(`${feature}/visual-baselines/baseline-inventory.json`),
    catalog: text('docs/architecture/SHIFAA-API-Catalog.md'),
    reconciliation: text('docs/governance/SHIFAA-Feature-011-Reconciliation-2026-10-01.md'),
  };
}

function readRepositoryInputs(json, text) {
  return {
    pointer: json('.specify/feature.json'),
    package: json('package.json'),
    lock: parse(text('pnpm-lock.yaml')),
    nodePin: text('.node-version').trim(),
    nvmPin: text('.nvmrc').trim(),
  };
}

function readInputs(root) {
  const readers = inputReaders(root);
  return {
    ...readers,
    ...readApprovalInputs(readers.json, readers.text),
    ...readFeatureInputs(readers.json, readers.text),
    ...readRepositoryInputs(readers.json, readers.text),
  };
}

function recordFailureWhenFalse(condition, description, failures) {
  if (!condition) failures.push(description);
}

function approvalManifestFailures(inputs) {
  const failures = [];
  const { approvalManifest } = inputs;
  recordFailureWhenFalse(
    digest(inputs.read(approvalManifestPath)) === approvalManifestHash,
    'Recovered Plan approval manifest hash mismatch',
    failures,
  );
  recordFailureWhenFalse(
    approvalManifest.normativeApprovalInputs?.baselineAuthority?.length === 6 &&
      approvalManifest.normativeApprovalInputs?.featurePlanFamily?.length === 36,
    'Recovered Plan approval must bind all 42 normative inputs',
    failures,
  );
  return failures;
}

function normativeInputFailures(inputs, root) {
  const failures = [];
  const successor = readDocumentationSuccessor(root);
  const { approvalManifest } = inputs;
  const normativeFiles = [
    ...approvalManifest.normativeApprovalInputs.baselineAuthority,
    ...approvalManifest.normativeApprovalInputs.featurePlanFamily,
  ];
  for (const binding of normativeFiles) {
    const bytes = fs.readFileSync(path.join(root, binding.path));
    if (digest(bytes) !== (successor?.inputDigests[binding.path] ?? binding.sha256))
      failures.push(`Approved normative input hash mismatch: ${binding.path}`);
  }
  return failures;
}

function formalPlanApprovalFailures(inputs) {
  const { approvalManifest, recoveredPlanApproval, freshTasksApproval } = inputs;
  const failures = [];
  recordFailureWhenFalse(
    approvalManifest.authority?.approvalRecord ===
      `${feature}/decisions/recovered-plan-approved-2026-10-06.md` &&
      recoveredPlanApproval.includes('F011_RECOVERED_PLAN_APPROVED') &&
      recoveredPlanApproval.includes(approvalManifestHash),
    'Current recovered Plan formal approval binding missing',
    failures,
  );
  recordFailureWhenFalse(
    freshTasksApproval.includes('F011_FRESH_TASKS_APPROVED') &&
      freshTasksApproval.includes('TASKS_APPROVED') &&
      freshTasksApproval.includes(approvalManifestHash) &&
      freshTasksApproval.includes(freshTasksHash) &&
      freshTasksApproval.includes(taskMapHash),
    'Current fresh Tasks formal approval binding missing',
    failures,
  );
  recordFailureWhenFalse(
    recoveredPlanApproval.includes('Disposition: **PLAN_APPROVED**') &&
      recoveredPlanApproval.includes('PLAN_APPROVED supersedes') &&
      freshTasksApproval.includes('supersedes the historical 95-task / 29-checkpoint ledger'),
    'Current formal lifecycle decisions do not supersede preserved generation-time labels',
    failures,
  );
  for (const [file, expectedHash] of [
    [`${feature}/decisions/recovered-plan-approved-2026-10-06.md`, recoveredApprovalHash],
    [`${feature}/decisions/fresh-tasks-approved-2026-10-06.md`, freshTasksApprovalHash],
  ]) {
    recordFailureWhenFalse(
      digest(inputs.read(file)) === expectedHash,
      `Formal approval decision hash mismatch: ${file}`,
      failures,
    );
  }
  return failures;
}

function freshLedgerApprovalFailures(inputs) {
  const failures = [];
  const taskHash = digest(inputs.read(`${feature}/tasks.md`));
  const mapHash = digest(inputs.read(`${feature}/contracts/task-map.json`));
  recordFailureWhenFalse(
    taskHash === freshTasksHash,
    'Fresh tasks.md approved hash mismatch',
    failures,
  );
  recordFailureWhenFalse(
    mapHash === taskMapHash,
    'Fresh task-map approved hash mismatch',
    failures,
  );
  return failures;
}

function pointerAndSpecFailures(inputs) {
  const failures = [];
  recordFailureWhenFalse(
    inputs.pointer.feature_directory === feature,
    'Active feature pointer mismatch',
    failures,
  );
  recordFailureWhenFalse(
    inputs.spec
      .split('\n')
      .some((line) => line.startsWith('| Status') && line.includes('`SPEC_APPROVED`')),
    'Feature Spec approval missing',
    failures,
  );
  return failures;
}

function uxApprovalFailures(inputs) {
  const { uxApproval, recoveredPlanApproval } = inputs;
  const failures = [];
  recordFailureWhenFalse(
    uxApproval.includes('F011_UX_PLAN_GATE_PASS') &&
      uxApproval.includes('Product Owner | 2026-10-06 | APPROVED') &&
      uxApproval.includes('Feature 011 Design Lead | 2026-10-06 | APPROVED') &&
      uxApproval.includes(uxCandidate) &&
      uxApproval.includes(uxManifestHash) &&
      recoveredPlanApproval.includes('compatibility to this recovered Plan family'),
    'Current Feature 011 UX decision binding missing',
    failures,
  );
  recordFailureWhenFalse(
    digest(inputs.read(`${feature}/decisions/feature-011-ux-plan-gate-2026-10-06.md`)) ===
      uxDecisionHash,
    'Feature 011 UX decision hash mismatch',
    failures,
  );
  return failures;
}

function approvalFailures(inputs, root) {
  return [
    ...approvalManifestFailures(inputs),
    ...normativeInputFailures(inputs, root),
    ...formalPlanApprovalFailures(inputs),
    ...freshLedgerApprovalFailures(inputs),
    ...pointerAndSpecFailures(inputs),
    ...uxApprovalFailures(inputs),
  ];
}

function scopeInventoryFailures(inputs) {
  const failures = [];
  const { scope, taskMap } = inputs;
  const expectedFr = ['FR-SAFE-002', 'FR-SAFE-008', 'FR-SAFE-012', 'FR-ADMIN-004'];
  recordFailureWhenFalse(
    exactSet(scope.fr, expectedFr.slice(0, 3)) &&
      Object.keys(scope.frSlices ?? {}).join('|') === 'FR-ADMIN-004' &&
      scope.frSlices['FR-ADMIN-004'] === 'clinical-content publication only',
    'Feature 011 FR and FR-ADMIN-004 publication slice mismatch',
    failures,
  );
  recordFailureWhenFalse(
    exactSet(
      scope.nfr,
      requirements.filter((id) => id.startsWith('NFR-')),
    ),
    'Scope NFR inventory mismatch',
    failures,
  );
  recordFailureWhenFalse(
    exactSet(taskMap.requirements, requirements),
    'Fresh ledger FR/NFR inventory mismatch',
    failures,
  );
  recordFailureWhenFalse(
    exactSet(scope.retainedGates, gates) &&
      exactSet(scope.exclusions, exclusions) &&
      scope.clinicalFixtures === 'neutral synthetic only; no real clinical approval',
    'Frozen gate, exclusion, or synthetic-clinical boundary mismatch',
    failures,
  );
  return failures;
}

function operationFailures(inputs) {
  const { scope, taskMap, api } = inputs;
  const failures = [];
  const expected = operations.map((operation) => operation.join('|'));
  const scopeOperations = scope.operations?.map(
    ({ id, method, path }) => `${id}|${method}|${path}`,
  );
  const ledgerOperations = taskMap.operations?.map(
    ({ id, method, path }) => `${id}|${method}|${path}`,
  );
  recordFailureWhenFalse(
    exactSet(scopeOperations, expected) && exactSet(ledgerOperations, expected),
    'Exact seven operation inventory, methods, and paths mismatch',
    failures,
  );
  const apiOperations = Object.entries(api.paths ?? {}).flatMap(([apiPath, methods]) =>
    Object.entries(methods)
      .filter(([, operation]) => operation?.operationId)
      .map(([method, operation]) => `${operation.operationId}|${method}|${apiPath}`),
  );
  recordFailureWhenFalse(
    exactSet(apiOperations, expected),
    'OpenAPI operation inventory, methods, and paths mismatch',
    failures,
  );
  return failures;
}

function acceptanceCoverageFailures(inputs) {
  const { taskMap, spec } = inputs;
  const failures = [];
  const acceptanceIds = Array.from(
    { length: 16 },
    (_, index) => `AC-${String(index + 1).padStart(2, '0')}`,
  );
  const specAcceptance = [...spec.matchAll(/^\| (AC-\d{2}) —/gm)].map((match) => match[1]);
  recordFailureWhenFalse(
    exactSet(
      taskMap.acceptanceCoverage?.map(({ id }) => id),
      acceptanceIds,
    ) && exactSet(specAcceptance, acceptanceIds),
    'AC-01–AC-16 acceptance coverage mismatch',
    failures,
  );
  return failures;
}

function freshTaskStateFailures(inputs) {
  const { taskMap, tasks } = inputs;
  const failures = [];
  recordFailureWhenFalse(
    taskMap.tasks?.length === 92 &&
      taskMap.checkpoints?.length === 24 &&
      taskMap.tasks.every(({ status }) => status === 'UNCHECKED') &&
      (tasks.match(/^- \[ \] T\d{3}\b/gm) ?? []).length === 92 &&
      !/^- \[x\] T\d{3}\b/gm.test(tasks),
    'Fresh ledger task/status or checkbox state mismatch',
    failures,
  );
  return failures;
}

function pendingParityFailures(inputs) {
  const { taskMap } = inputs;
  const failures = [];
  const k01 = taskMap.checkpoints.find(({ id }) => id === 'K01');
  const k07 = taskMap.checkpoints.find(({ id }) => id === 'K07');
  const parity = taskMap.gates?.['OPEN-TECH-002'];
  recordFailureWhenFalse(
    exactSet(k01?.tasks, ['T001', 'T002', 'T003']) &&
      taskMap.tasks.filter(({ checkpoint }) => checkpoint === 'K01').length === 3,
    'Authorized K01 task inventory mismatch',
    failures,
  );
  recordFailureWhenFalse(
    exactSet(parity?.assertion, ['T029']) &&
      k07?.tasks.includes('T029') &&
      parity.status === 'OPEN' &&
      parity.stage === 'affected IMPLEMENTING',
    'OPEN-TECH-002 current T029/K07 assertion binding mismatch',
    failures,
  );
  return failures;
}

function inventoryFailures(inputs) {
  return [
    ...scopeInventoryFailures(inputs),
    ...operationFailures(inputs),
    ...acceptanceCoverageFailures(inputs),
    ...freshTaskStateFailures(inputs),
    ...pendingParityFailures(inputs),
  ];
}

function uxFailures(inputs) {
  const { reference, inventory } = inputs;
  const failures = [];
  recordFailureWhenFalse(
    digest(inputs.read(`${feature}/visual-baselines/reference-manifest.json`)) === uxManifestHash &&
      inventory.packageId === uxCandidate &&
      reference.entryCount === 746,
    'Approved TEST-ONLY UX manifest/candidate hash mismatch',
    failures,
  );
  recordFailureWhenFalse(
    exactSet(inventory.locales, ['ar-EG', 'en-EG']) &&
      exactSet(
        inventory.routes?.map(({ app, route }) => `${app}:${route}`),
        uxRoutes,
      ) &&
      inventory.routes.reduce((sum, route) => sum + route.states.length, 0) === 99 &&
      reference.entries.length === 746,
    'Approved bilingual UX route/state/reference inventory mismatch',
    failures,
  );
  for (const binding of reference.authorityArtifacts ?? []) {
    // The original capture records provenance; the current manifest and dated UX decision bind compatibility to the recovered Plan.
    if (binding.artifact === 'plan.md') continue;
    const bytes = inputs.read(`${feature}/${binding.artifact}`);
    if (digest(bytes) !== binding.sha256)
      failures.push(`UX authority artifact hash mismatch: ${binding.artifact}`);
  }
  return failures;
}

function reconciliationFailures(inputs) {
  const catalogRow = (operation) =>
    inputs.catalog.split('\n').find((line) => line.startsWith(`| \`${operation}\``)) ?? '';
  const verifyAllergy = catalogRow('verifyAllergy');
  const listClinicalContent = catalogRow('listClinicalContent');
  const failures = [];
  recordFailureWhenFalse(
    verifyAllergy.includes('terminal entered_in_error') &&
      verifyAllergy.includes('appended version') &&
      verifyAllergy.includes('no verified-to-self_reported reset'),
    'verifyAllergy catalog reconciliation missing',
    failures,
  );
  recordFailureWhenFalse(
    listClinicalContent.includes('metadata and minimum signature-status evidence only') &&
      listClinicalContent.includes(
        'no drafts/unsigned details/bodies/derived mutation or admin authority',
      ) &&
      listClinicalContent.includes('purpose, AAL2'),
    'listClinicalContent clinic metadata-only catalog reconciliation missing',
    failures,
  );
  recordFailureWhenFalse(
    inputs.reconciliation.includes('new linked `self_reported` record') &&
      inputs.reconciliation.includes('same GET serves authority-selected projections'),
    'Correction/projection reconciliation record missing',
    failures,
  );
  return failures;
}

function catalogOperationFailures(inputs) {
  const failures = [];
  for (const [id, method, apiPath] of operations) {
    const rows = inputs.catalog.split('\n').filter((line) => line.startsWith(`| \`${id}\``));
    const expectedBinding = `\`${method.toUpperCase()} ${apiPath}\``;
    const cells = rows[0]?.split('|').map((cell) => cell.trim());
    if (rows.length !== 1 || cells[2] !== expectedBinding)
      failures.push(`API Catalog operation method/path mismatch: ${id}`);
    const expectedFlags =
      method === 'get'
        ? '—'
        : id === 'verifyAllergy' ||
            id === 'signClinicalContentRelease' ||
            id === 'publishClinicalContentRelease'
          ? 'I,V'
          : 'I';
    if (rows.length === 1 && rows[0].split('|').map((cell) => cell.trim())[5] !== expectedFlags)
      failures.push(`API Catalog request header flags mismatch: ${id}`);
  }
  return failures;
}

function toolingFailures(inputs, tooling) {
  const failures = [];
  for (const [name, version] of Object.entries(expectedTooling)) {
    if (tooling[name] !== version)
      failures.push(
        `Tooling ${name}: expected ${version}, observed ${tooling[name] ?? 'unavailable'}`,
      );
  }
  const locked = inputs.lock.importers['.'].devDependencies.supabase;
  if (
    inputs.package.devDependencies.supabase !== expectedTooling.supabase ||
    locked.specifier !== expectedTooling.supabase ||
    locked.version !== expectedTooling.supabase
  )
    failures.push('Supabase CLI declared/locked pin inconsistency');
  if (
    inputs.package.packageManager !== 'pnpm@11.13.0' ||
    inputs.nodePin !== '24.18.0' ||
    inputs.nvmPin !== '24.18.0'
  )
    failures.push('Node/pnpm declared pin inconsistency');
  return failures;
}

async function generatedWireFailures(inputs, root) {
  const failures = [];
  const [{ renderFeature011Client }, { renderFeature011Contract }] = await Promise.all([
    import('./generate-feature-011-client.mjs'),
    import('./generate-feature-011-contract.mjs'),
  ]);
  const generated = [
    ['client', 'packages/api-client/src/feature-011.ts', await renderFeature011Client(root)],
    [
      'contract DTO/schema',
      'packages/contracts/src/feature-011.ts',
      await renderFeature011Contract(root),
    ],
  ];
  for (const [label, file, expected] of generated) {
    if (inputs.text(file) !== expected) failures.push(`Generated ${label} wire drift: ${file}`);
  }
  return failures;
}

export async function verifyFeature011Scope({ root = repositoryRoot, tooling }) {
  const parity = pendingParity();
  const failures = [];
  try {
    const inputs = readInputs(root);
    if (digest(inputs.read(approvalManifestPath)) !== approvalManifestHash)
      return { failures: ['Recovered Plan approval manifest hash mismatch'], parity };
    failures.push(
      ...approvalFailures(inputs, root),
      ...inventoryFailures(inputs),
      ...uxFailures(inputs),
      ...reconciliationFailures(inputs),
      ...catalogOperationFailures(inputs),
      ...toolingFailures(inputs, tooling),
    );
    failures.push(...(await generatedWireFailures(inputs, root)));
    return { failures, parity };
  } catch (error) {
    failures.push(`Unreadable or malformed baseline/tooling: ${error.message}`);
    return { failures, parity };
  }
}

function commandOutput(command, args) {
  try {
    return execFileSync(command, args, {
      cwd: repositoryRoot,
      encoding: 'utf8',
      timeout: 15000,
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trim();
  } catch {
    return '';
  }
}

function localTooling() {
  const packagePath = path.join(repositoryRoot, 'node_modules/supabase/package.json');
  const supabasePackage = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
  const entrypoint = path.join(path.dirname(packagePath), supabasePackage.bin.supabase);
  const pnpm =
    process.platform === 'win32'
      ? commandOutput('pwsh', ['-NoProfile', '-Command', 'corepack pnpm --version'])
      : commandOutput('corepack', ['pnpm', '--version']);
  return {
    node: process.version,
    pnpm,
    supabase: commandOutput(process.execPath, [entrypoint, '--version']),
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  let report;
  try {
    report = await verifyFeature011Scope({ tooling: localTooling() });
  } catch (error) {
    report = { failures: [`Tooling unavailable: ${error.message}`], parity: pendingParity() };
  }
  console.log(JSON.stringify(report, null, 2));
  process.exitCode = report.failures.length ? 1 : 0;
}
