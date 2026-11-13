import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

// Defense in depth for accidental direct invocation. These environment checks
// are not a sandbox against an operator deliberately forging runner identity.
// The real isolation boundary is the workflow's fixed GitHub-hosted fresh VM,
// no secrets/environments, read-only token, and no retained-resource mounts.
assert.equal(process.env.GITHUB_ACTIONS, 'true');
assert.equal(process.env.RUNNER_ENVIRONMENT, 'github-hosted');
assert.equal(process.env.RUNNER_OS, 'Linux');
assert.equal(process.env.GITHUB_SHA, process.env.EXPECTED_SHA);
const plan = JSON.parse(readFileSync('docs/testing/verification-v1/legacy-obligations.json'));
assert.equal(plan.steps.length, 42);
assert.equal(plan.steps.map((step) => step.command).join(' && '), plan.original);
const results = [];
for (const step of plan.steps) {
  console.log(`::group::${step.id} ${step.command}`);
  const result = spawnSync('bash', ['-o', 'pipefail', '-c', step.command], {
    env: process.env,
    stdio: 'inherit',
    timeout: 30 * 60 * 1000,
  });
  console.log('::endgroup::');
  results.push({
    ...step,
    status: result.status === 0 ? 'PASS' : 'FAIL',
    exitCode: result.status,
    timedOut: result.error?.code === 'ETIMEDOUT',
  });
  // Retain completed evidence after each step; continue independent obligations
  // after failure, never turn a partial run into comprehensive PASS.
  writeFileSync(
    'verification-comprehensive-results.json',
    JSON.stringify(
      {
        commit: process.env.GITHUB_SHA,
        comprehensive: true,
        status:
          results.length === 42 && results.every((r) => r.status === 'PASS')
            ? 'PASS'
            : 'INCOMPLETE_OR_FAIL',
        results,
        notExecuted: plan.steps.slice(results.length).map((step) => step.id),
      },
      null,
      2,
    ) + '\n',
  );
}
process.exitCode = results.every((result) => result.status === 'PASS') ? 0 : 1;
