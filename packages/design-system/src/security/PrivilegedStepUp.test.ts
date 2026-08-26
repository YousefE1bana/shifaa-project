import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';

import { privilegedAccessState, type PrivilegedAccessContext } from './privileged-access-policy.ts';

const allowed: PrivilegedAccessContext = {
  authAvailable: true,
  aal: 'aal2',
  amrAgeSeconds: 300,
  purpose: 'assigned_sensitive_review',
  reason: 'synthetic-review-reason',
};

test('privileged gate permits 299 and 300 second AMR but rejects 301 seconds', () => {
  assert.equal(privilegedAccessState({ ...allowed, amrAgeSeconds: 299 }), 'allowed');
  assert.equal(privilegedAccessState(allowed), 'allowed');
  assert.equal(privilegedAccessState({ ...allowed, amrAgeSeconds: 301 }), 'amr-stale');
});

test('privileged gate fails closed for every missing authorization input', () => {
  assert.equal(privilegedAccessState({ ...allowed, authAvailable: false }), 'auth-degraded');
  assert.equal(privilegedAccessState({ ...allowed, aal: 'aal1' }), 'aal2-required');
  assert.equal(privilegedAccessState({ ...allowed, purpose: null }), 'purpose-required');
  assert.equal(privilegedAccessState({ ...allowed, reason: '  ' }), 'reason-required');
  assert.equal(privilegedAccessState({ ...allowed, amrAgeSeconds: null }), 'amr-stale');
});

test('privileged boundary restores focus to a programmatically focusable content target', () => {
  const source = fs.readFileSync(new URL('./PrivilegedStepUp.tsx', import.meta.url), 'utf8');
  assert.match(source, /contentRef\.current\?\.focus/);
  assert.match(source, /tabIndex=\{-1\}/);
  assert.match(source, /onResumeIntendedAction/);
});
