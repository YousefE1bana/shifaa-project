import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { verifyFeature010Scope } from './verify-feature-010-scope.mjs';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const fixtureFiles = [
  'docs/architecture/SHIFAA-API-Catalog.md',
  'docs/governance/SHIFAA-Remaining-Specs-Roadmap.md',
  'package.json',
  'specs/009-clinic-scheduling-appointments-queue/data-model.md',
  'specs/009-clinic-scheduling-appointments-queue/spec.md',
  'specs/010-encounters-referrals-contextual-chat/contracts/openapi.yaml',
  'specs/010-encounters-referrals-contextual-chat/plan.md',
  'specs/010-encounters-referrals-contextual-chat/spec.md',
  'specs/010-encounters-referrals-contextual-chat/tasks.md',
  'specs/010-encounters-referrals-contextual-chat/visual-baselines/reference-manifest.json',
];

function createFixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'shifaa-f010-c01-'));
  for (const relativePath of fixtureFiles) {
    const destination = path.join(root, relativePath);
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.copyFileSync(path.join(repositoryRoot, relativePath), destination);
  }
  return root;
}

function withFixture(mutator) {
  const root = createFixture();
  try {
    if (mutator) mutator(root);
    return verifyFeature010Scope({ root });
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

function edit(root, relativePath, transform) {
  const absolutePath = path.join(root, relativePath);
  const before = fs.readFileSync(absolutePath, 'utf8');
  const after = transform(before);
  assert.notEqual(after, before, `fixture edit changed ${relativePath}`);
  fs.writeFileSync(absolutePath, after);
}

function replaceOnce(text, before, after) {
  assert.ok(text.includes(before), `fixture marker exists: ${before}`);
  return text.replace(before, after);
}

function removeAcceptanceCriterion(text, criterion) {
  const line = new RegExp(`^.*\\*\\*${criterion} —.*(?:\\r?\\n)?$`, 'm');
  assert.match(text, line, `approved spec contains ${criterion}`);
  return text.replace(line, '');
}

function duplicateAcceptanceCriterion(text, criterion) {
  const line = text.match(new RegExp(`^.*\\*\\*${criterion} —.*$`, 'm'))?.[0];
  assert.ok(line, `approved spec contains ${criterion}`);
  return text.replace(line, `${line}\n${line}`);
}

function removeClosureRow(text, criterion) {
  const row = new RegExp('^\\| `' + criterion + '` \\|.*(?:\\r?\\n)?$', 'm');
  assert.match(text, row, `checkpoint closure table contains ${criterion}`);
  return text.replace(row, '');
}

function duplicateClosureRow(text, criterion) {
  const row = text.match(new RegExp('^\\| `' + criterion + '` \\|.*$', 'm'))?.[0];
  assert.ok(row, `checkpoint closure table contains ${criterion}`);
  return text.replace(row, `${row}\n${row}`);
}

test('accepts the frozen Feature 010 inventory, baseline, gates, and F009 producer boundary', () => {
  assert.deepEqual(withFixture(), []);
});

test('rejects missing or duplicate acceptance criteria in the approved spec and closure table', () => {
  const specPath = 'specs/010-encounters-referrals-contextual-chat/spec.md';
  const tasksPath = 'specs/010-encounters-referrals-contextual-chat/tasks.md';
  const drifts = [
    {
      name: 'missing acceptance criterion in spec',
      path: specPath,
      update: (text) => removeAcceptanceCriterion(text, 'AC-01'),
      failure: /spec acceptance criteria must contain exactly AC-01 through AC-14 once/,
    },
    {
      name: 'duplicate acceptance criterion in spec',
      path: specPath,
      update: (text) => duplicateAcceptanceCriterion(text, 'AC-01'),
      failure: /spec acceptance criteria must contain exactly AC-01 through AC-14 once/,
    },
    {
      name: 'missing acceptance criterion in closure table',
      path: tasksPath,
      update: (text) => removeClosureRow(text, 'AC-01'),
      failure: /checkpoint closure table must contain exactly AC-01 through AC-14 once/,
    },
    {
      name: 'duplicate acceptance criterion in closure table',
      path: tasksPath,
      update: (text) => duplicateClosureRow(text, 'AC-01'),
      failure: /checkpoint closure table must contain exactly AC-01 through AC-14 once/,
    },
  ];

  for (const drift of drifts) {
    const failures = withFixture((root) => edit(root, drift.path, drift.update));
    assert.ok(
      failures.some((failure) => drift.failure.test(failure)),
      drift.name,
    );
  }
});

test('rejects drift in the approved FR, NFR, operation, gate, baseline, and F009 inventories', () => {
  const specPath = 'specs/010-encounters-referrals-contextual-chat/spec.md';
  const planPath = 'specs/010-encounters-referrals-contextual-chat/plan.md';
  const manifestPath =
    'specs/010-encounters-referrals-contextual-chat/visual-baselines/reference-manifest.json';
  const predecessorModelPath = 'specs/009-clinic-scheduling-appointments-queue/data-model.md';
  const drifts = [
    {
      name: 'functional requirement inventory',
      path: specPath,
      update: (text) => replaceOnce(text, 'FR-FAC-006', 'FR-FAC-099'),
      failure: /target FR metadata must contain exactly the three approved requirements/,
    },
    {
      name: 'non-functional requirement inventory',
      path: specPath,
      update: (text) => replaceOnce(text, 'NFR-PORT-001', 'NFR-PORT-099'),
      failure: /target NFR metadata must contain exactly the 23 approved requirements/,
    },
    {
      name: 'operation inventory',
      path: specPath,
      update: (text) =>
        replaceOnce(
          text,
          '| `sendContextMessage` | `POST /contexts/{contextType}/{contextId}/messages`',
          '| `sendExtraMessage` | `POST /contexts/{contextType}/{contextId}/messages`',
        ),
      failure:
        /Unapproved Feature 010 operation in Feature 010 specification operations: sendExtraMessage/,
    },
    {
      name: 'gate inventory',
      path: specPath,
      update: (text) => text.replaceAll('OPEN-TECH-003', ''),
      failure: /Feature 010 spec gate inventory must contain exactly the eight approved gate IDs/,
    },
    {
      name: 'unexpected gate in plan',
      path: planPath,
      update: (text) => replaceOnce(text, 'OPEN-TECH-003', 'OPEN-TECH-003 and OPEN-TECH-999'),
      failure: /Feature 010 plan gate inventory must contain exactly the eight approved gate IDs/,
    },
    {
      name: 'approved baseline manifest digest',
      path: manifestPath,
      update: (text) => `${text}\n`,
      failure: /approved Feature 010 baseline manifest SHA-256 mismatch/,
    },
    {
      name: 'F009 producer boundary',
      path: predecessorModelPath,
      update: (text) =>
        replaceOnce(
          text,
          'with no Feature 010 validation, route, or producer',
          'with a Feature 010 producer',
        ),
      failure: /F009 producer boundary marker is missing/,
    },
  ];

  for (const drift of drifts) {
    const failures = withFixture((root) => edit(root, drift.path, drift.update));
    assert.ok(
      failures.some((failure) => drift.failure.test(failure)),
      drift.name,
    );
  }
});
