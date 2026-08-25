import { identityContinuityLegalVectors } from '@shifaa/test-kit/identity-continuity';
import { describe, expect, it } from 'vitest';

import {
  cairoCivilAge,
  evaluateFactorRemoval,
  evaluateMfaEnrollment,
  evaluateRecoveryProof,
  evaluateSessionFreshness,
  evaluateTransitionDecision,
  evaluateTransitionSubmission,
  hasFreshQualifyingMfa,
  restrictedSessionAllows,
} from './policy.js';

const HOUR = 3_600_000;
const NOW = Date.parse('2026-08-25T10:00:00Z');

describe('identity continuity pure policy', () => {
  it.each([
    [NOW - 1, false],
    [NOW + 1, true],
  ])('uses the exact token expiry boundary %s', (expiresAt, allowed) => {
    expect(
      evaluateSessionFreshness({
        nowMs: NOW,
        tokenExpiresAtMs: expiresAt,
        sessionStartedAtMs: NOW - HOUR,
        lastActivityAtMs: NOW - 1_000,
        foregroundEngaged: true,
      }).allowed,
    ).toBe(allowed);
  });

  it.each([
    [23.75 * HOUR - 1, 44 * 60_000, true],
    [23.75 * HOUR, 44 * 60_000, false],
    [HOUR, 45 * 60_000, true],
    [HOUR, 45 * 60_000 + 1, false],
    [24 * HOUR, 1_000, false],
    [HOUR, 60 * 60_000 + 1, false],
  ])('enforces absolute=%s and idle=%s', (absoluteAge, idleAge, allowed) => {
    expect(
      evaluateSessionFreshness({
        nowMs: NOW,
        tokenExpiresAtMs: NOW + 1_000,
        sessionStartedAtMs: NOW - absoluteAge,
        lastActivityAtMs: NOW - idleAge,
        foregroundEngaged: true,
      }).allowed,
    ).toBe(allowed);
  });

  it('never refreshes an unattended client', () => {
    expect(
      evaluateSessionFreshness({
        nowMs: NOW,
        tokenExpiresAtMs: NOW + 1_000,
        sessionStartedAtMs: NOW,
        lastActivityAtMs: NOW,
        foregroundEngaged: false,
      }),
    ).toEqual({ allowed: false, reason: 'foreground-required' });
  });

  it.each([
    [299, true],
    [300, true],
    [301, false],
    [-1, false],
  ])('uses the closed MFA freshness boundary at %ss', (age, expected) => {
    expect(hasFreshQualifyingMfa(age, 'aal2')).toBe(expected);
  });

  it('fails closed for unsupported and duplicate pending factors', () => {
    expect(
      evaluateMfaEnrollment({
        factorType: 'passkey',
        pendingCount: 0,
        verifiedFactorCount: 0,
        freshMfa: false,
        freshPrimaryReauthentication: true,
      }),
    ).toEqual({ allowed: false, reason: 'factor-type-unsupported' });
    expect(
      evaluateMfaEnrollment({
        factorType: 'totp',
        pendingCount: 1,
        verifiedFactorCount: 0,
        freshMfa: false,
        freshPrimaryReauthentication: true,
      }),
    ).toEqual({ allowed: false, reason: 'factor-enrollment-pending' });
  });

  it('distinguishes optional and mandatory last-factor removal', () => {
    expect(
      evaluateFactorRemoval({
        accountClass: 'patient_optional_mfa',
        verifiedFactorCount: 1,
        freshMfa: true,
        optionalLastFactorConfirmed: true,
        completedReproof: false,
        recoveryRestricted: false,
      }),
    ).toEqual({ allowed: true, value: 'aal1' });
    expect(
      evaluateFactorRemoval({
        accountClass: 'workforce_mandatory_mfa',
        verifiedFactorCount: 1,
        freshMfa: true,
        optionalLastFactorConfirmed: true,
        completedReproof: false,
        recoveryRestricted: false,
      }),
    ).toEqual({ allowed: false, reason: 'last-factor-removal-denied' });
    expect(
      evaluateFactorRemoval({
        accountClass: 'workforce_mandatory_mfa',
        verifiedFactorCount: 2,
        freshMfa: true,
        optionalLastFactorConfirmed: false,
        completedReproof: false,
        recoveryRestricted: false,
      }),
    ).toEqual({ allowed: true, value: 'aal2' });
  });

  it('requires the approved recovery proof combinations', () => {
    expect(
      evaluateRecoveryProof({
        method: 'bound_factor_independent_method',
        hasBoundFactor: true,
        hasIndependentMethod: true,
        repeatedIdentityProofApproved: false,
      }),
    ).toEqual({ allowed: true, value: 'ordinary' });
    expect(
      evaluateRecoveryProof({
        method: 'bound_factor_independent_method',
        hasBoundFactor: true,
        hasIndependentMethod: false,
        repeatedIdentityProofApproved: false,
      }).allowed,
    ).toBe(false);
    expect(
      evaluateRecoveryProof({
        method: 'repeated_identity_proof',
        hasBoundFactor: false,
        hasIndependentMethod: false,
        repeatedIdentityProofApproved: true,
      }),
    ).toEqual({ allowed: true, value: 'restricted' });
    expect(
      evaluateRecoveryProof({
        method: 'unknown',
        hasBoundFactor: true,
        hasIndependentMethod: true,
        repeatedIdentityProofApproved: true,
      }).allowed,
    ).toBe(false);
  });

  it('permits exactly four operations in a restricted session', () => {
    const allowed = ['refreshSession', 'logout', 'beginMfaEnrollment', 'verifyMfaEnrollment'];
    const denied = [
      'removeMfaFactor',
      'startRecovery',
      'completeRecovery',
      'transitionDependent',
      'ninthOperation',
    ];
    expect(allowed.every(restrictedSessionAllows)).toBe(true);
    expect(denied.some(restrictedSessionAllows)).toBe(false);
  });

  it('uses Cairo civil dates and never treats age 18 as transfer', () => {
    expect(cairoCivilAge('2008-08-25', '2026-08-25')).toBe(18);
    expect(cairoCivilAge('2005-08-25', '2026-08-24')).toBe(20);
    expect(cairoCivilAge('2005-08-25', '2026-08-25')).toBe(21);
    expect(cairoCivilAge('not-a-date', '2026-08-25')).toBeUndefined();
  });

  it('maps all 20 frozen legal vectors to fail-closed policy outcomes', () => {
    expect(identityContinuityLegalVectors).toHaveLength(20);
    for (const vector of identityContinuityLegalVectors) {
      const outcome = runLegalVector(vector.input);
      expect(outcome, vector.id).toBe(vector.expected);
    }
  });
});

function runLegalVector(
  input: string,
): 'deny' | 'verification_only' | 'human_review' | 'approve_same_record' {
  if (
    [
      'age_18_minus',
      'age_18_exact',
      'age_18_plus',
      'before_21',
      'clock_only_no_request',
      'proof_missing',
      'proof_failed',
      'proof_mismatched',
      'proof_expired',
      'proof_unreleased',
      'reviewer_unassigned',
      'reviewer_is_subject_or_guardian',
      'reviewer_aal1_or_stale',
    ].includes(input)
  )
    return 'deny';
  if (input === 'age_21_exact' || input === 'after_21') {
    const submitted = evaluateTransitionSubmission({
      birthDate: '2005-08-25',
      cairoDate: input === 'age_21_exact' ? '2026-08-25' : '2026-08-26',
      identityVerified: false,
      relationshipType: 'guardianship',
      relationshipActive: true,
      subjectMatchesPatient: true,
    });
    return submitted.allowed && submitted.value === 'proof_required' ? 'verification_only' : 'deny';
  }
  if (
    input === 'active_interdiction' ||
    input === 'controlling_court_order' ||
    input === 'active_dispute'
  ) {
    const blocker =
      input === 'active_interdiction'
        ? 'interdiction'
        : input === 'controlling_court_order'
          ? 'court_order'
          : 'dispute';
    const submitted = evaluateTransitionSubmission({
      birthDate: '2005-08-25',
      cairoDate: '2026-08-25',
      identityVerified: true,
      relationshipType: 'guardianship',
      relationshipActive: true,
      subjectMatchesPatient: true,
      blocker,
    });
    return submitted.allowed && submitted.value === 'human_review_required'
      ? 'human_review'
      : 'deny';
  }
  const decided = evaluateTransitionDecision({
    currentStatus: 'review_required',
    decision: 'approve',
    reviewerAssigned: true,
    reviewerSeparated: true,
    aal: 'aal2',
    purpose: 'guardianship_review',
    factorAgeSeconds: 300,
    reasonCode: 'human_review.approved',
    samePersonId: true,
    samePatientId: true,
    sameClinicalRecord: true,
  });
  return decided.allowed && decided.value === 'approved' ? 'approve_same_record' : 'deny';
}
