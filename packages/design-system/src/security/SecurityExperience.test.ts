import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

import { mapSecurityProblem } from './problem-mapping.ts';

const source = fs.readFileSync(new URL('./SecurityExperience.tsx', import.meta.url), 'utf8');

test('security problem mapping normalizes cross-surface degraded states', () => {
  assert.equal(mapSecurityProblem(new Error('offline-no-queue')).state, 'offline');
  assert.equal(
    mapSecurityProblem({ status: 409, problem: { code: 'version-conflict' } }).state,
    'conflict',
  );
  assert.equal(
    mapSecurityProblem({ status: 401, problem: { code: 'session-revoked' } }).state,
    'session-expired',
  );
  assert.equal(
    mapSecurityProblem({ status: 503, problem: { code: 'vendor-unavailable' } }).state,
    'auth-degraded',
  );
});

test('shared security experience has redundant cues, focus restoration, bidi isolation, and safe targets', () => {
  for (const token of [
    'SecurityStatusBanner',
    'SecurityDestructiveConfirmation',
    'BidiSafeText',
    'toneCue',
    'accessibilityLiveRegion',
    'headingRef.current?.focus',
    'tabIndex={-1}',
    'FocusVisiblePressable',
    'minimumTargetSize',
    "'\\u2066'",
    "'\\u2069'",
  ])
    assert.match(source, new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.doesNotMatch(
    source,
    /animation|transition|blur|#[0-9a-f]{3,8}|AsyncStorage|localStorage/i,
  );
});
