export const continuityOperationIds = [
  'refreshSession',
  'logout',
  'beginMfaEnrollment',
  'verifyMfaEnrollment',
  'removeMfaFactor',
  'startRecovery',
  'completeRecovery',
  'transitionDependent',
] as const;

export type ContinuityOperationId = (typeof continuityOperationIds)[number];
export type AssuranceLevel = 'aal1' | 'aal2';
export type SupportedFactorType = 'totp';
export type AccountClass = 'patient_optional_mfa' | 'workforce_mandatory_mfa';
export type TransitionBlocker = 'interdiction' | 'court_order' | 'dispute';
export type TransitionStatus =
  | 'proof_required'
  | 'review_required'
  | 'human_review_required'
  | 'approved'
  | 'rejected';

export type PolicyResult<T> = { allowed: true; value: T } | { allowed: false; reason: string };

export interface SessionFreshnessInput {
  nowMs: number;
  tokenExpiresAtMs: number;
  sessionStartedAtMs: number;
  lastActivityAtMs: number;
  foregroundEngaged: boolean;
  configuredAbsoluteMs?: number;
  configuredIdleMs?: number;
}

export interface FactorRemovalInput {
  accountClass: AccountClass;
  verifiedFactorCount: number;
  freshMfa: boolean;
  optionalLastFactorConfirmed: boolean;
  completedReproof: boolean;
  recoveryRestricted: boolean;
}

export interface RecoveryProofInput {
  method: 'bound_factor_independent_method' | 'repeated_identity_proof' | string;
  hasBoundFactor: boolean;
  hasIndependentMethod: boolean;
  repeatedIdentityProofApproved: boolean;
}

export interface TransitionSubmissionInput {
  birthDate: string;
  cairoDate: string;
  identityVerified: boolean;
  relationshipType: string;
  relationshipActive: boolean;
  subjectMatchesPatient: boolean;
  blocker?: TransitionBlocker | string | null;
}

export interface TransitionDecisionInput {
  currentStatus: TransitionStatus | string;
  decision: 'approve' | 'reject' | 'defer' | string;
  reviewerAssigned: boolean;
  reviewerSeparated: boolean;
  aal: AssuranceLevel | string;
  purpose: string;
  factorAgeSeconds: number;
  reasonCode: string;
  blocker?: TransitionBlocker | string | null;
  samePersonId: boolean;
  samePatientId: boolean;
  sameClinicalRecord: boolean;
}
