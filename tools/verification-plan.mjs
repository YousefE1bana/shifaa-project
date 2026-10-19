import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';

export const planPath = 'docs/governance/safe-verification-v1/plan.json';
export function verificationPlan(root) {
  const plan = JSON.parse(fs.readFileSync(path.join(root, planPath), 'utf8'));
  const originalPackage = execFileSync(
    'git',
    ['cat-file', 'blob', 'f205a80ae41b5507afaa1a7868fbbc8e84deb217'],
    { cwd: root, maxBuffer: 128 * 1024, stdio: ['ignore', 'pipe', 'pipe'] },
  );
  assert.equal(
    createHash('sha256').update(originalPackage).digest('hex'),
    '2b15d2515d1fed80b6ea30ed8a19a7aa51d488571fc7a64675cd04812ffe2200',
  );
  assert.equal(
    plan.originalVerify,
    JSON.parse(originalPackage).scripts.verify,
    'Legacy coverage differs from the immutable approved baseline',
  );
  const original = plan.originalVerify.split(' && ');
  assert.equal(original.length, 42, 'Legacy coverage must be explicitly reviewed');
  assert.deepEqual(
    plan.requiredSteps,
    original.map((command, i) => ({ id: `legacy-${String(i + 1).padStart(2, '0')}`, command })),
  );
  assert.deepEqual(plan.additionalRequiredSuites, ['family', 'privacy']);
  const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  assert.equal(pkg.scripts.verify, 'node tools/verify.mjs');
  // No arbitrary shell commands are accepted from a run configuration.
  for (const { command } of plan.requiredSteps)
    assert.match(
      command,
      /^(pnpm [a-z][a-z0-9:-]*(?: --quiet)?|docker compose config --quiet|node tools\/verify-feature-008-evidence\.mjs --all)$/,
    );
  return structuredClone(plan);
}
export const requiredIds = (plan) => [
  ...plan.requiredSteps.map((s) => s.id),
  ...plan.additionalRequiredSuites.map((s) => `guarded-${s}`),
];
export function publicResults(plan, results) {
  assert.ok(Array.isArray(results) && results.length === requiredIds(plan).length);
  const ids = new Set(requiredIds(plan));
  return results.map((r) => {
    assert.ok(ids.has(r.id) && ['PASS', 'FAIL', 'BLOCKED'].includes(r.status));
    assert.ok(
      r.exitCode === null || (Number.isInteger(r.exitCode) && r.exitCode >= 0 && r.exitCode <= 255),
    );
    return { id: r.id, status: r.status, exitCode: r.exitCode };
  });
}
export function assertComplete(plan, results) {
  assert.deepEqual(
    results.map((s) => s.id).sort(),
    requiredIds(plan).sort(),
    'Missing, duplicated or unexpected required checks',
  );
  assert.ok(
    results.every((s) => s.status === 'PASS' && s.exitCode === 0),
    'Required checks did not all pass',
  );
}
