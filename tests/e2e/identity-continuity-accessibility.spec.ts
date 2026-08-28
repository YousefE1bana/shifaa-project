import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const root = path.resolve(process.cwd());
const evidenceDirectory = path.join(
  root,
  'specs/007-identity-continuity-sessions-mfa-recovery/evidence/live',
);
const liveQa = fs.readFileSync(
  path.join(root, 'specs/007-identity-continuity-sessions-mfa-recovery/evidence/live-qa.md'),
  'utf8',
);

const expectedScreenshots = [
  ['mfa-ar-360x800.png', 360],
  ['mfa-en-360x800.png', 360],
  ['recovery-ar-360x800.png', 360],
  ['recovery-en-360x800.png', 360],
  ['relationships-ar-412x915.png', 412],
  ['relationships-en-412x915.png', 412],
  ['relationships-ar-768x1024.png', 768],
  ['relationships-en-768x1024.png', 768],
  ['admin-step-up-ar-1440x900.png', 1440],
  ['admin-step-up-en-1440x900.png', 1440],
  ['mfa-en-forced-colors-reduced-motion-360x800.png', 360],
] as const;

function readSource(relativePath: string): string {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

test('live QA evidence contains inspected bilingual files at contracted widths', () => {
  for (const [fileName, expectedWidth] of expectedScreenshots) {
    const image = fs.readFileSync(path.join(evidenceDirectory, fileName));
    assert.equal(image.subarray(1, 4).toString('ascii'), 'PNG');
    assert.equal(image.readUInt32BE(16), expectedWidth);
    assert.match(liveQa, new RegExp(fileName.replaceAll('.', '\\.')));
  }
  assert.match(liveQa, /200%/);
  assert.match(liveQa, /400%/);
  assert.match(liveQa, /forced-colors: active/);
  assert.match(liveQa, /prefers-reduced-motion: reduce/);
  assert.match(liveQa, /no audible NVDA or TalkBack session is claimed/i);
});

test('all security surfaces consume the shared status primitive', () => {
  for (const file of [
    'apps/patient/app/mfa.tsx',
    'apps/patient/app/recovery.tsx',
    'apps/patient/app/relationships.tsx',
    'packages/design-system/src/security/PrivilegedStepUp.tsx',
  ]) {
    assert.match(readSource(file), /SecurityStatusBanner/);
  }
  const primitive = readSource('packages/design-system/src/security/SecurityExperience.tsx');
  assert.match(primitive, /accessibilityLiveRegion/);
  assert.match(primitive, /tabIndex=\{-1\}/);
  assert.match(primitive, /minimumTargetSize/);
  assert.match(primitive, /FocusVisiblePressable/);
  assert.match(primitive, /\\u2066/);
  assert.match(primitive, /\\u2069/);
  assert.doesNotMatch(primitive, /duration|animation/i);
});

test('security mutations reconcile current session and authority without an offline queue', () => {
  const reconciliation = readSource(
    'packages/design-system/src/security/SecurityReconciliation.ts',
  );
  assert.match(reconciliation, /sessionCurrent/);
  assert.match(reconciliation, /authorityCurrent/);
  assert.match(reconciliation, /reconciliationRequired/);
  assert.doesNotMatch(reconciliation, /queue|AsyncStorage|localStorage/);

  for (const file of [
    'apps/patient/app/mfa.tsx',
    'apps/patient/app/recovery.tsx',
    'apps/patient/app/relationships.tsx',
    'apps/admin/src/app/relationships/GuardianshipWorkspace.tsx',
  ]) {
    assert.doesNotMatch(readSource(file), /mutationQueue|offlineQueue|enqueue/i);
  }
});
