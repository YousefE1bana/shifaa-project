import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const feature = 'specs/011-allergies-clinical-content-governance';
const mapPath = `${feature}/contracts/task-map.json`;
const tasksPath = `${feature}/tasks.md`;
const manifestPath = `${feature}/decisions/recovered-plan-approval-manifest-v1.json`;
const manifestHash = '79b1eafe6dea7ab2a26edd805e2c83baf2d0f0d12b9b6c44d11164caa8ab4548';
const tasksHash = 'e7a8eac9f0fed21f16b1f632edb4efe5fad3beccae6b637bff957235f9573165';
const mapHash = '5a6037838bc644a5dbb61c17a5504a662822f8d5ee0925379b823737f17b738d';
const operations = [
  ['listAllergies', 'get', '/patients/{managedPatientId}/allergies'],
  ['createAllergy', 'post', '/patients/{managedPatientId}/allergies'],
  ['verifyAllergy', 'post', '/allergies/{allergyId}/verification'],
  ['listClinicalContent', 'get', '/admin/clinical-content/{contentType}'],
  ['createClinicalContentRelease', 'post', '/admin/clinical-content/{contentType}/releases'],
  ['signClinicalContentRelease', 'post', '/admin/clinical-content/releases/{releaseId}/signatures'],
  ['publishClinicalContentRelease', 'post', '/admin/clinical-content/releases/{releaseId}/publish'],
];
const nfrs = [
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

const readText = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const readJson = (file) => JSON.parse(readText(file));
const sha256 = (file) =>
  createHash('sha256')
    .update(fs.readFileSync(path.join(root, file)))
    .digest('hex');
const digestText = (text) => createHash('sha256').update(text).digest('hex');
function initialLedger() {
  const map = readJson(mapPath);
  const tasks = readText(tasksPath);
  for (const task of map.tasks) {
    assert.ok(['CHECKED', 'UNCHECKED'].includes(task.status));
    assert.ok(
      tasks.includes(`- [${task.status === 'CHECKED' ? 'x' : ' '}] ${task.id} `),
      `${task.id} completion differs`,
    );
    task.status = 'UNCHECKED';
  }
  return {
    tasks: tasks.replace(/^- \[x\] (T\d{3}\b)/gm, '- [ ] $1'),
    map: JSON.stringify(map, null, 2) + '\n',
  };
}

test('fresh approval binds exact 92-task ledger and recovered 42-input Plan family', () => {
  const manifest = readJson(manifestPath);
  const approval = readText(`${feature}/decisions/fresh-tasks-approved-2026-10-06.md`);
  const recoveredApproval = readText(`${feature}/decisions/recovered-plan-approved-2026-10-06.md`);
  assert.equal(sha256(manifestPath), manifestHash);
  const initial = initialLedger();
  assert.equal(digestText(initial.tasks), tasksHash);
  assert.equal(digestText(initial.map), mapHash);
  assert.equal(manifest.normativeApprovalInputs.baselineAuthority.length, 6);
  assert.equal(manifest.normativeApprovalInputs.featurePlanFamily.length, 36);
  assert.ok(approval.includes(manifestHash));
  assert.ok(approval.includes(tasksHash));
  assert.ok(approval.includes(mapHash));
  assert.ok(recoveredApproval.includes('PLAN_APPROVED'));
  assert.ok(recoveredApproval.includes(manifestHash));
});

test('current map has the fresh schema, exact Feature 011 scope, and no historical scope/acceptance fields', () => {
  const map = readJson(mapPath);
  const scope = readJson(`${feature}/contracts/scope-manifest.json`);
  assert.equal(map.ledgerId, 'SHIFAA-F011-FRESH-TASKS@1.0.0');
  assert.equal(map.tasks.length, 92);
  assert.equal(map.checkpoints.length, 24);
  assert.equal(map.acceptanceCoverage.length, 16);
  assert.equal(map.operations.length, 7);
  assert.deepEqual(
    map.requirements.filter((id) => id.startsWith('NFR-')),
    nfrs,
  );
  assert.deepEqual(map.operations, scope.operations);
  assert.deepEqual(
    map.operations.map(({ id, method, path }) => [id, method, path]),
    operations,
  );
  assert.ok(!Object.hasOwn(map, 'scope'));
  assert.ok(!Object.hasOwn(map, 'acceptance'));
});

test('K01 and pending parity assertion resolve only to fresh tasks and K07 T029', () => {
  const map = readJson(mapPath);
  const k01 = map.checkpoints.find(({ id }) => id === 'K01');
  const k07 = map.checkpoints.find(({ id }) => id === 'K07');
  const assertion = map.tasks.find(({ id }) => id === 'T029');
  const parity = map.gates['OPEN-TECH-002'];
  assert.deepEqual(k01.tasks, ['T001', 'T002', 'T003']);
  assert.ok(
    map.tasks
      .filter(({ checkpoint }) => checkpoint === 'K01')
      .every(({ id }) => ['T001', 'T002', 'T003'].includes(id)),
  );
  assert.equal(assertion.checkpoint, 'K07');
  assert.ok(k07.tasks.includes('T029'));
  assert.deepEqual(parity.assertion, ['T029']);
  assert.equal(parity.status, 'OPEN');
  initialLedger();
});

test('generation-time labels and immutable candidate provenance remain separate from current formal approvals', () => {
  const map = readJson(mapPath);
  const uxGate = readText(`${feature}/decisions/feature-011-ux-plan-gate-2026-10-06.md`);
  const recoveredApproval = readText(`${feature}/decisions/recovered-plan-approved-2026-10-06.md`);
  assert.equal(map.executionAuthorized, false);
  assert.equal(map.analyzeAuthorized, false);
  assert.ok(
    readText(`${feature}/decisions/fresh-tasks-approved-2026-10-06.md`).includes('TASKS_APPROVED'),
  );
  assert.ok(uxGate.includes('APPROVED'));
  assert.ok(recoveredApproval.includes('0.1.1-test-only'));
  assert.ok(
    recoveredApproval.includes('59ea1788edbae023533a9e08da97bc3884e0e098ec6e80721272822b6439c432'),
  );
  assert.ok(recoveredApproval.includes('compatibility to this recovered Plan family'));
});

test('current approved parity permits bounded consumers while retaining the global open gate', async () => {
  const verifierPath = path.join(root, 'tools/verify-feature-011-contracts.mjs');
  const { verifyFeature011Contracts } = await import(pathToFileURL(verifierPath));
  const report = await verifyFeature011Contracts({ root });
  assert.deepEqual(report.failures, [], report.failures.join('\n'));
  assert.equal(report.result, 'PASS');
  assert.equal(report.retainedGate, 'OPEN-TECH-002');
  assert.equal(report.affectedConsumersAllowed, true);
  assert.deepEqual(report.requiredStages, ['P1', 'P2', 'P3', 'P4', 'P5']);
});
