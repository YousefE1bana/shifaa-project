import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { testRuntime } from './verification-database.mjs';
import { sourceFingerprint } from './test-resource-context.mjs';
import { runDisposableTestSuite } from './trusted-disposable-test-launcher.mjs';

const root = path.resolve(import.meta.dirname, '..');
const target = testRuntime('postgres');
const result = await runDisposableTestSuite({
  execute: 'CREATE_NEW_DISPOSABLE_RESOURCES',
  approval: 'Current pnpm verify invocation: exact newly created resources only',
  scope: process.argv[2],
  worktree: root,
  revision: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(),
  sourceDigest: sourceFingerprint(root),
  outputParent: path.dirname(process.env.SHIFAA_VERIFY_CONTEXT),
  imageReference: target.image,
  docker: {
    context: target.context,
    engine: target.engine,
    endpoint: target.endpoint,
    image: target.image,
  },
  resourceBudget: 'SEQUENTIAL_2CPU_1GIB',
  cleanup: 'REMOVE_RELEASED_RUNS_BEFORE_NEXT_LEASE',
  bootstrap: 'aggregate-baseline',
  maxRuns: 32,
});
console.log(
  JSON.stringify({
    scope: process.argv[2],
    passedTests: result.passedTests,
    failedTests: result.failedTests,
    passed: result.passed,
    realIntegrationAccepted: false,
  }),
);
process.exitCode = result.passed ? 0 : 1;
