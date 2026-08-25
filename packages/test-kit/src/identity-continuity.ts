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
  expected: 'deny' | 'verification_only' | 'human_review' | 'approve_same_record';
};

export const identityContinuityLegalVectors: readonly LegalTransitionVector[] = [
  ['age_18_minus', 'deny'],
  ['age_18_exact', 'deny'],
  ['age_18_plus', 'deny'],
  ['before_21', 'deny'],
  ['age_21_exact', 'verification_only'],
  ['after_21', 'verification_only'],
  ['clock_only_no_request', 'deny'],
  ['proof_missing', 'deny'],
  ['proof_failed', 'deny'],
  ['proof_mismatched', 'deny'],
  ['proof_expired', 'deny'],
  ['proof_unreleased', 'deny'],
  ['active_interdiction', 'human_review'],
  ['controlling_court_order', 'human_review'],
  ['active_dispute', 'human_review'],
  ['reviewer_unassigned', 'deny'],
  ['reviewer_is_subject_or_guardian', 'deny'],
  ['reviewer_aal1_or_stale', 'deny'],
  ['approved_preserves_record', 'approve_same_record'],
  ['later_access_requires_separate_grant', 'approve_same_record'],
].map((entry, index) => ({
  id: `TV-FAM-CAPACITY-TRANSITION-${String(index + 1).padStart(3, '0')}`,
  input: entry[0],
  expected: entry[1],
})) as readonly LegalTransitionVector[];

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
