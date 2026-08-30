import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const workspace = fs.readFileSync(
  new URL('../src/app/relationships/GuardianshipWorkspace.tsx', import.meta.url),
  'utf8',
);
const api = fs.readFileSync(new URL('../src/identity-continuity-api.ts', import.meta.url), 'utf8');

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
