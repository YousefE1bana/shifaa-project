import type {
  FactorRemovalInput,
  PolicyResult,
  RecoveryProofInput,
  SessionFreshnessInput,
  TransitionDecisionInput,
  TransitionStatus,
  TransitionSubmissionInput,
} from './types.js';
import { continuityOperationIds } from './types.js';

const MINUTE = 60_000;
const EFFECTIVE_ABSOLUTE_MS = 24 * 60 * MINUTE;
const EFFECTIVE_IDLE_MS = 60 * MINUTE;
const CONFIGURED_ABSOLUTE_MS = 23 * 60 * MINUTE + 45 * MINUTE;
const CONFIGURED_IDLE_MS = 45 * MINUTE;
const RESTRICTED_OPERATIONS = new Set([
  'refreshSession',
  'logout',
  'beginMfaEnrollment',
  'verifyMfaEnrollment',
]);

export function evaluateSessionFreshness(input: SessionFreshnessInput): PolicyResult<'active'> {
  if (!Number.isFinite(input.nowMs) || !input.foregroundEngaged)
    return { allowed: false, reason: 'foreground-required' };
  if (input.nowMs > input.tokenExpiresAtMs) return { allowed: false, reason: 'token-expired' };
  const absolute = Math.min(
    input.configuredAbsoluteMs ?? CONFIGURED_ABSOLUTE_MS,
    EFFECTIVE_ABSOLUTE_MS,
  );
  const idle = Math.min(input.configuredIdleMs ?? CONFIGURED_IDLE_MS, EFFECTIVE_IDLE_MS);
  if (input.nowMs - input.sessionStartedAtMs >= absolute)
    return { allowed: false, reason: 'absolute-expired' };
  if (input.nowMs - input.lastActivityAtMs > idle)
    return { allowed: false, reason: 'idle-expired' };
  return { allowed: true, value: 'active' };
}

export function hasFreshQualifyingMfa(factorAgeSeconds: number, aal: string): boolean {
  return (
    aal === 'aal2' &&
    Number.isFinite(factorAgeSeconds) &&
    factorAgeSeconds >= 0 &&
    factorAgeSeconds <= 300
  );
}

export function evaluateMfaEnrollment(input: {
  factorType: string;
  pendingCount: number;
  verifiedFactorCount: number;
  freshMfa: boolean;
  freshPrimaryReauthentication: boolean;
}): PolicyResult<'totp'> {
  if (input.factorType !== 'totp') return { allowed: false, reason: 'factor-type-unsupported' };
  if (input.pendingCount !== 0) return { allowed: false, reason: 'factor-enrollment-pending' };
  if (input.verifiedFactorCount > 0 && !input.freshMfa)
    return { allowed: false, reason: 'mfa-step-up-required' };
  if (input.verifiedFactorCount === 0 && !input.freshPrimaryReauthentication)
    return { allowed: false, reason: 'identity-proof-required' };
  return { allowed: true, value: 'totp' };
}

export function evaluateFactorRemoval(
  input: FactorRemovalInput,
): PolicyResult<AssuranceAfterRemoval> {
  if (input.recoveryRestricted) return { allowed: false, reason: 'restricted-operation' };
  if (!input.freshMfa) return { allowed: false, reason: 'mfa-step-up-required' };
  if (input.verifiedFactorCount < 1) return { allowed: false, reason: 'not-found' };
  const removingLast = input.verifiedFactorCount === 1;
  if (input.accountClass === 'workforce_mandatory_mfa' && removingLast && !input.completedReproof)
    return { allowed: false, reason: 'last-factor-removal-denied' };
  if (
    input.accountClass === 'patient_optional_mfa' &&
    removingLast &&
    !input.optionalLastFactorConfirmed
  )
    return { allowed: false, reason: 'last-factor-removal-denied' };
  return { allowed: true, value: removingLast ? 'aal1' : 'aal2' };
}

type AssuranceAfterRemoval = 'aal1' | 'aal2';

export function evaluateRecoveryProof(
  input: RecoveryProofInput,
): PolicyResult<'ordinary' | 'restricted'> {
  if (input.method === 'bound_factor_independent_method') {
    if (!input.hasBoundFactor || !input.hasIndependentMethod)
      return { allowed: false, reason: 'identity-proof-required' };
    return { allowed: true, value: 'ordinary' };
  }
  if (input.method === 'repeated_identity_proof') {
    if (!input.repeatedIdentityProofApproved)
      return { allowed: false, reason: 'identity-proof-required' };
    return { allowed: true, value: 'restricted' };
  }
  return { allowed: false, reason: 'validation-failed' };
}

export function restrictedSessionAllows(operation: string): boolean {
  return (
    continuityOperationIds.includes(operation as (typeof continuityOperationIds)[number]) &&
    RESTRICTED_OPERATIONS.has(operation)
  );
}

export function cairoCivilAge(birthDate: string, cairoDate: string): number | undefined {
  const birth = parseCivilDate(birthDate);
  const current = parseCivilDate(cairoDate);
  if (!birth || !current || compareCivil(current, birth) < 0) return undefined;
  let age = current.year - birth.year;
  if (current.month < birth.month || (current.month === birth.month && current.day < birth.day))
    age -= 1;
  return age;
}

export function evaluateTransitionSubmission(
  input: TransitionSubmissionInput,
): PolicyResult<TransitionStatus> {
  if (input.relationshipType !== 'guardianship')
    return { allowed: false, reason: 'relationship-invalid' };
  if (!input.relationshipActive) return { allowed: false, reason: 'relationship-inactive' };
  if (!input.subjectMatchesPatient) return { allowed: false, reason: 'subject-mismatch' };
  const age = cairoCivilAge(input.birthDate, input.cairoDate);
  if (age === undefined || age < 21) return { allowed: false, reason: 'not-eligible' };
  if (!input.identityVerified) return { allowed: true, value: 'proof_required' };
  if (isBlocker(input.blocker)) return { allowed: true, value: 'human_review_required' };
  if (input.blocker != null) return { allowed: false, reason: 'unknown-blocker' };
  return { allowed: true, value: 'review_required' };
}

export function evaluateTransitionDecision(
  input: TransitionDecisionInput,
): PolicyResult<TransitionStatus> {
  if (!['review_required', 'human_review_required'].includes(input.currentStatus))
    return { allowed: false, reason: 'state-transition-invalid' };
  if (!input.reviewerAssigned) return { allowed: false, reason: 'reviewer-unassigned' };
  if (!input.reviewerSeparated) return { allowed: false, reason: 'separation-required' };
  if (!hasFreshQualifyingMfa(input.factorAgeSeconds, input.aal))
    return { allowed: false, reason: 'mfa-step-up-required' };
  if (input.purpose !== 'guardianship_review')
    return { allowed: false, reason: 'purpose-required' };
  if (!/^human_review\.[a-z0-9_.-]{2,49}$/.test(input.reasonCode))
    return { allowed: false, reason: 'reason-required' };
  if (!input.samePersonId || !input.samePatientId || !input.sameClinicalRecord)
    return { allowed: false, reason: 'record-continuity-violation' };
  if (input.blocker != null && !isBlocker(input.blocker))
    return { allowed: false, reason: 'unknown-blocker' };
  if (isBlocker(input.blocker) && input.currentStatus !== 'human_review_required')
    return { allowed: false, reason: 'human-review-required' };
  if (input.decision === 'approve') return { allowed: true, value: 'approved' };
  if (input.decision === 'reject') return { allowed: true, value: 'rejected' };
  if (input.decision === 'defer') return { allowed: true, value: 'human_review_required' };
  return { allowed: false, reason: 'validation-failed' };
}

function isBlocker(value: unknown): value is 'interdiction' | 'court_order' | 'dispute' {
  return value === 'interdiction' || value === 'court_order' || value === 'dispute';
}

function parseCivilDate(value: string): { year: number; month: number; day: number } | undefined {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return undefined;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const check = new Date(Date.UTC(year, month - 1, day));
  if (
    check.getUTCFullYear() !== year ||
    check.getUTCMonth() !== month - 1 ||
    check.getUTCDate() !== day
  )
    return undefined;
  return { year, month, day };
}

function compareCivil(
  left: { year: number; month: number; day: number },
  right: { year: number; month: number; day: number },
): number {
  return left.year - right.year || left.month - right.month || left.day - right.day;
}
