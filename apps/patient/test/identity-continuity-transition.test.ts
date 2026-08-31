import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const screen = fs.readFileSync(new URL('../app/relationships.tsx', import.meta.url), 'utf8');
const api = fs.readFileSync(new URL('../src/identity-continuity-api.ts', import.meta.url), 'utf8');
const shared = fs.readFileSync(
  new URL('../../../packages/design-system/src/security/SecurityExperience.tsx', import.meta.url),
  'utf8',
);

test('patient relationships opts into the existing transition summary and generated mutation', () => {
  for (const token of [
    'includeDependentTransition: true',
    'transitionDependent',
    'verificationCaseId',
    'continuityCaseVersion',
    'assertIdentityContinuityOnline',
    'same_patient_record_preserved',
    'ended_after_approval',
  ]) {
    assert.match(`${screen}\n${api}`, new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
  assert.doesNotMatch(
    `${screen}\n${api}`,
    /service_role|supabase\.from|queueMutation|backgroundSync/,
  );
  assert.match(screen, /transition\.continuityCaseVersion \?\? 1/);
  assert.doesNotMatch(screen, /!transition\.continuityCaseVersion/);
});

test('patient transition renders every frozen bilingual UI state without age countdown inference', () => {
  for (const token of [
    'not_eligible',
    'verification_required',
    'review_required',
    'human_review_required',
    'approved',
    'rejected',
    'conflict',
    'directionFor(locale)',
    'accessibilityLiveRegion',
    'minimumTargetSize',
    'patientPrimaryTargetSize',
  ]) {
    assert.match(`${screen}\n${shared}`, new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
  assert.match(screen, /SecurityStatusBanner/);
  assert.doesNotMatch(screen, /countdown|automatic transfer|legal capacity|الأهلية القانونية/i);
});
