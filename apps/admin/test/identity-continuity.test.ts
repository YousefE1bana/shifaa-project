import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const relationships = fs.readFileSync(
  new URL('../src/app/relationships/GuardianshipWorkspace.tsx', import.meta.url),
  'utf8',
);
const shell = fs.readFileSync(
  new URL('../src/app/SecurityStepUpShell.tsx', import.meta.url),
  'utf8',
);

test('admin security surfaces require current assigned authority after reconnect', () => {
  assert.match(relationships, /useSecurityConnection/);
  assert.match(relationships, /reconnectVersion/);
  assert.match(relationships, /markReconciled/);
  assert.match(relationships, /securityMutationAllowed/);
  assert.match(relationships, /transitionCaseId === selectedTransition.transitionCaseId/);
  assert.match(shell, /PrivilegedStepUpWebBoundary/);
  assert.match(relationships, /<SecurityStepUpShell/);
  assert.doesNotMatch(`${relationships}\n${shell}`, /queueMutation|backgroundSync|localStorage/);
});
