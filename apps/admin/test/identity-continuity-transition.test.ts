import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const workspace = fs.readFileSync(
  new URL('../src/app/relationships/GuardianshipWorkspace.tsx', import.meta.url),
  'utf8',
);
const api = fs.readFileSync(new URL('../src/identity-continuity-api.ts', import.meta.url), 'utf8');
const page = fs.readFileSync(new URL('../src/app/relationships/page.tsx', import.meta.url), 'utf8');

test('the executable admin route installs a real OTP-authenticated staff JWT', () => {
  assert.match(page, /IdentityOnboardingClient/);
  assert.match(page, /client\.login/);
  assert.match(page, /client\.verifyOtp/);
  assert.match(page, /result\.access_token/);
  assert.match(page, /<GuardianshipWorkspace accessToken=\{provideAccessToken\}/);
  assert.doesNotMatch(page, /synthetic-admin|synthetic-reviewer|localStorage|sessionStorage/);
});

test('admin relationships uses the assigned transition read mode and continuity version', () => {
  for (const token of [
    "mode: 'dependent_transition'",
    'continuityCaseVersion',
    'transitionCaseId',
    'blockerState',
    'IdentityContinuityClient',
    'transitionDependent',
    "'X-Purpose': 'guardianship_review'",
    'privilegedAccessState',
    'amrAgeSeconds',
    'version-conflict',
    'reviewRequiredReason',
    'transitionBlockerReason',
  ]) {
    assert.match(`${workspace}\n${api}`, new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
  assert.doesNotMatch(
    `${workspace}\n${api}`,
    /service_role|supabase\.from|continuity_cases|new role/i,
  );
  assert.match(workspace, /reasonCode: 'human_review\.guardianship_transition'/);
  assert.doesNotMatch(workspace, /reasonCode: reason\.trim\(\)/);
  assert.match(workspace, /accessToken\?: \(\) => string \| undefined/);
  assert.doesNotMatch(workspace, /synthetic-admin:support_admin:/);
});

test('admin transition states remain bilingual, assigned-only, and non-inferential', () => {
  for (const token of [
    'review_required',
    'human_review_required',
    'approved',
    'rejected',
    "locale === 'ar-EG'",
    "'rtl' : 'ltr'",
    'aria-live="polite"',
    'human review',
    'مراجعة بشرية',
  ]) {
    assert.match(workspace, new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
  assert.doesNotMatch(workspace, /legally capable|فاقد الأهلية|استعاد الأهلية/i);
});
