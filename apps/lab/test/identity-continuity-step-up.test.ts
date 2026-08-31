import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

import { privilegedAccessState } from '@shifaa/design-system/security/privileged-access-policy';

const shell = fs.readFileSync(
  new URL('../src/app/SecurityStepUpShell.tsx', import.meta.url),
  'utf8',
);
const layout = fs.readFileSync(new URL('../src/app/layout.tsx', import.meta.url), 'utf8');

test('laboratory shell denies AAL1 and stale or incomplete privileged context', () => {
  const base = {
    authAvailable: true,
    aal: 'aal2' as const,
    amrAgeSeconds: 300,
    purpose: 'care',
    reason: 'synthetic-reason',
  };
  assert.equal(privilegedAccessState({ ...base, aal: 'aal1' }), 'aal2-required');
  assert.equal(privilegedAccessState({ ...base, amrAgeSeconds: 301 }), 'amr-stale');
  assert.equal(privilegedAccessState({ ...base, purpose: null }), 'purpose-required');
  assert.equal(privilegedAccessState({ ...base, reason: null }), 'reason-required');
  assert.match(shell, /onLoginOrVerifyOtp/);
  assert.match(shell, /onResumeIntendedAction/);
  assert.match(layout, /SecurityStepUpShell/);
});
