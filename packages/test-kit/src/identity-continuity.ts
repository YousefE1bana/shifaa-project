export const identityContinuitySyntheticClock = new Date('2026-08-25T10:00:00.000Z');

export const identityContinuitySyntheticActors = {
  patient: '70000000-0000-4000-8000-000000000001',
  dependent: '70000000-0000-4000-8000-000000000002',
  guardian: '70000000-0000-4000-8000-000000000003',
  delegate: '70000000-0000-4000-8000-000000000004',
  reviewer: '70000000-0000-4000-8000-000000000005',
  unrelated: '70000000-0000-4000-8000-000000000006',
} as const;

export const identityContinuitySyntheticPatients = {
  dependent: '71000000-0000-4000-8000-000000000001',
  unrelated: '71000000-0000-4000-8000-000000000002',
} as const;

export const identityContinuitySyntheticRelationships = {
  guardianship: '72000000-0000-4000-8000-000000000001',
  delegation: '72000000-0000-4000-8000-000000000002',
} as const;

export const identityContinuitySyntheticSessions = {
  current: '73000000-0000-4000-8000-000000000001',
  otherDevice: '73000000-0000-4000-8000-000000000002',
  restricted: '73000000-0000-4000-8000-000000000003',
} as const;

export const identityContinuityBoundaries = {
  jwtSeconds: 900,
  configuredAbsoluteMs: (23 * 60 + 45) * 60_000,
  effectiveAbsoluteMs: 24 * 60 * 60_000,
  configuredIdleMs: 45 * 60_000,
  effectiveIdleMs: 60 * 60_000,
  refreshReuseSeconds: [10, 10.001] as const,
  factorAmrSeconds: [299, 300, 301] as const,
  enrollmentExpiryMs: 10 * 60_000,
  recoveryExpiryMs: 15 * 60_000,
  decoyPurgeAfterExpiryMs: 24 * 60 * 60_000,
} as const;

export const identityContinuityAcceptanceCriteria = Array.from(
  { length: 32 },
  (_, index) => `AC-${String(index + 1).padStart(2, '0')}`,
);

export type LegalTransitionVector = {
  id: `TV-FAM-CAPACITY-TRANSITION-${string}`;
  input: string;
  expected:
    | 'no_effect'
    | 'deny'
    | 'verification_only'
    | 'review_required'
    | 'human_review'
    | 'approve_same_record'
    | 'former_authority_denied'
    | 'separate_grant_scoped'
    | 'one_winner'
    | 'stored_replay'
    | 'changed_replay_denied'
    | 'authorization_denied'
    | 'forced_rls_denied'
    | 'atomic'
    | 'provenance_preserved';
};

export const identityContinuityLegalVectors: readonly LegalTransitionVector[] = [
  { id: 'TV-FAM-CAPACITY-TRANSITION-001', input: 'age_18_minus_exact_plus', expected: 'no_effect' },
  { id: 'TV-FAM-CAPACITY-TRANSITION-002', input: 'before_21_request', expected: 'deny' },
  {
    id: 'TV-FAM-CAPACITY-TRANSITION-003',
    input: 'at_or_after_21_request',
    expected: 'verification_only',
  },
  { id: 'TV-FAM-CAPACITY-TRANSITION-004', input: 'clock_only_at_21', expected: 'no_effect' },
  {
    id: 'TV-FAM-CAPACITY-TRANSITION-005',
    input: 'proof_missing_failed_mismatched_expired_unreleased',
    expected: 'deny',
  },
  {
    id: 'TV-FAM-CAPACITY-TRANSITION-006',
    input: 'proof_without_reviewed_confirmation',
    expected: 'review_required',
  },
  { id: 'TV-FAM-CAPACITY-TRANSITION-007', input: 'active_interdiction', expected: 'human_review' },
  {
    id: 'TV-FAM-CAPACITY-TRANSITION-008',
    input: 'controlling_court_order',
    expected: 'human_review',
  },
  { id: 'TV-FAM-CAPACITY-TRANSITION-009', input: 'active_dispute', expected: 'human_review' },
  {
    id: 'TV-FAM-CAPACITY-TRANSITION-010',
    input: 'approved_preserves_record',
    expected: 'approve_same_record',
  },
  {
    id: 'TV-FAM-CAPACITY-TRANSITION-011',
    input: 'former_guardian_permissions',
    expected: 'former_authority_denied',
  },
  { id: 'TV-FAM-CAPACITY-TRANSITION-012', input: 'later_access_without_grant', expected: 'deny' },
  {
    id: 'TV-FAM-CAPACITY-TRANSITION-013',
    input: 'later_access_with_separate_grant',
    expected: 'separate_grant_scoped',
  },
  {
    id: 'TV-FAM-CAPACITY-TRANSITION-014',
    input: 'conflicting_concurrent_decisions',
    expected: 'one_winner',
  },
  {
    id: 'TV-FAM-CAPACITY-TRANSITION-015',
    input: 'identical_idempotent_replay',
    expected: 'stored_replay',
  },
  {
    id: 'TV-FAM-CAPACITY-TRANSITION-016',
    input: 'changed_body_same_key',
    expected: 'changed_replay_denied',
  },
  {
    id: 'TV-FAM-CAPACITY-TRANSITION-017',
    input: 'actor_assignment_aal_purpose_negatives',
    expected: 'authorization_denied',
  },
  {
    id: 'TV-FAM-CAPACITY-TRANSITION-018',
    input: 'direct_sql_and_privileged_bypass',
    expected: 'forced_rls_denied',
  },
  { id: 'TV-FAM-CAPACITY-TRANSITION-019', input: 'atomic_commit_or_rollback', expected: 'atomic' },
  {
    id: 'TV-FAM-CAPACITY-TRANSITION-020',
    input: 'governance_provenance',
    expected: 'provenance_preserved',
  },
];

export const identityContinuityRestrictedOperations = [
  'refreshSession',
  'logout',
  'beginMfaEnrollment',
  'verifyMfaEnrollment',
] as const;

export const identityContinuitySyntheticSentinels = {
  refreshToken: 'SYNTHETIC-REFRESH-TOKEN-MUST-NOT-PERSIST',
  totpSecret: 'SYNTHETIC-TOTP-SECRET-MUST-NOT-PERSIST',
  recoveryHandle: 'SYNTHETIC-RECOVERY-HANDLE-MUST-NOT-PERSIST',
  rawProof: 'SYNTHETIC-RAW-PROOF-MUST-NOT-PERSIST',
  clinicalPayload: 'SYNTHETIC-CLINICAL-PAYLOAD-MUST-NOT-PERSIST',
} as const;

export function identityContinuityIdempotencyKey(label: string): string {
  return `synthetic-007-${label
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '-')
    .padEnd(20, '0')}`;
}
