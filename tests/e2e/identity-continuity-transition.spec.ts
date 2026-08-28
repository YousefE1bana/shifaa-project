import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

import { identityContinuityLegalVectors } from '@shifaa/test-kit/identity-continuity';
import { identityContinuityOperationIds } from '@shifaa/contracts/identity-continuity';

const root = new URL('../../', import.meta.url);
const corePolicy = fs.readFileSync(
  new URL('packages/core/src/identity-continuity/identity-continuity.test.ts', root),
  'utf8',
);
const realApi = fs.readFileSync(
  new URL('services/api/test/identity-continuity-transition.integration.test.ts', root),
  'utf8',
);
const forcedRls = fs.readFileSync(
  new URL('infra/db/tests/identity-continuity-rls.sql', root),
  'utf8',
);
const adminUi = fs.readFileSync(
  new URL('apps/admin/src/app/relationships/GuardianshipWorkspace.tsx', root),
  'utf8',
);
const patientUi = fs.readFileSync(new URL('apps/patient/app/relationships.tsx', root), 'utf8');
const reconciliation = fs.readFileSync(
  new URL(
    'specs/007-identity-continuity-sessions-mfa-recovery/evidence/t035-read-contract-reconciliation.md',
    root,
  ),
  'utf8',
);

const expectedVectors = [
  ['TV-FAM-CAPACITY-TRANSITION-001', 'no_effect', corePolicy],
  ['TV-FAM-CAPACITY-TRANSITION-002', 'deny', corePolicy],
  ['TV-FAM-CAPACITY-TRANSITION-003', 'verification_only', corePolicy],
  ['TV-FAM-CAPACITY-TRANSITION-004', 'no_effect', corePolicy],
  ['TV-FAM-CAPACITY-TRANSITION-005', 'deny', corePolicy],
  ['TV-FAM-CAPACITY-TRANSITION-006', 'review_required', realApi],
  ['TV-FAM-CAPACITY-TRANSITION-007', 'human_review', corePolicy],
  ['TV-FAM-CAPACITY-TRANSITION-008', 'human_review', corePolicy],
  ['TV-FAM-CAPACITY-TRANSITION-009', 'human_review', realApi],
  ['TV-FAM-CAPACITY-TRANSITION-010', 'approve_same_record', realApi],
  ['TV-FAM-CAPACITY-TRANSITION-011', 'former_authority_denied', forcedRls],
  ['TV-FAM-CAPACITY-TRANSITION-012', 'deny', forcedRls],
  ['TV-FAM-CAPACITY-TRANSITION-013', 'separate_grant_scoped', forcedRls],
  ['TV-FAM-CAPACITY-TRANSITION-014', 'one_winner', realApi],
  ['TV-FAM-CAPACITY-TRANSITION-015', 'stored_replay', realApi],
  ['TV-FAM-CAPACITY-TRANSITION-016', 'changed_replay_denied', realApi],
  ['TV-FAM-CAPACITY-TRANSITION-017', 'authorization_denied', realApi],
  ['TV-FAM-CAPACITY-TRANSITION-018', 'forced_rls_denied', forcedRls],
  ['TV-FAM-CAPACITY-TRANSITION-019', 'atomic', realApi],
  ['TV-FAM-CAPACITY-TRANSITION-020', 'provenance_preserved', reconciliation],
] as const;

test('consolidated checkpoint accounts for all 20 frozen legal vectors', () => {
  assert.equal(identityContinuityLegalVectors.length, 20);
  assert.deepEqual(
    identityContinuityLegalVectors.map(({ id, expected }) => [id, expected]),
    expectedVectors.map(([id, expected]) => [id, expected]),
  );
  for (const [id, , evidence] of expectedVectors)
    assert.ok(evidence.length > 100, `${id} evidence missing`);
});

test('transition reconciliation adds no operation, role, relationship type, or direct UI database path', () => {
  assert.equal(identityContinuityOperationIds.length, 8);
  assert.equal(identityContinuityOperationIds.at(-1), 'transitionDependent');
  assert.match(reconciliation, /listGuardianshipCases/);
  assert.match(reconciliation, /listRelationships/);
  assert.doesNotMatch(`${adminUi}\n${patientUi}`, /service_role|supabase\.from|continuity_cases/i);
  assert.doesNotMatch(reconciliation, /new role|new relationship type/i);
});

test('bilingual relationship surfaces state human review and same-record consequences without inference', () => {
  assert.match(adminUi, /Human review required/);
  assert.match(adminUi, /مراجعة بشرية مطلوبة/);
  assert.match(patientUi, /same_patient_record_preserved/);
  assert.match(patientUi, /ended_after_approval/);
  assert.match(patientUi, /directionFor\(locale\)/);
  assert.doesNotMatch(`${adminUi}\n${patientUi}`, /legally capable|فاقد الأهلية|استعاد الأهلية/i);
});
