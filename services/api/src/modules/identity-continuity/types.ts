import type {
  BeginEnrollmentRequest,
  CompleteRecoveryRequest,
  FactorRemovalResult,
  FactorResult,
  LogoutRequest,
  LogoutResult,
  RecoveryAccepted,
  RecoveryResult,
  CompleteRecoveryResult,
  RecoveryProofRequiredResult,
  RefreshRequest,
  RemoveFactorRequest,
  SessionResult,
  StartRecoveryRequest,
  TransitionRequest,
  TransitionResult,
  VerifyEnrollmentRequest,
  EnrollmentSecretResult,
} from '@shifaa/contracts/identity-continuity';
import type { NativeSessionProjection } from '@shifaa/auth';

export type ContinuityRestriction = 'mfa_enrollment_only' | 'recovery_expired' | null;

export interface ContinuityRequestContext {
  requestId: string;
  idempotencyKey: string;
  accessToken?: string;
  refreshCookie?: string;
  csrfCookie?: string;
  csrfHeader?: string;
  origin?: string;
  fetchSite?: string;
  purpose?: string;
}

export interface TransitionMutationInput {
  relationshipId: string;
  expectedVersion: number;
  actorPersonId: string;
  idempotencyKey: string;
  idempotencyPrincipal: string;
  aal?: 1 | 2;
  purpose?: string;
  factorAmrAt?: string;
  verificationCaseId?: string;
  decision?: 'approve' | 'reject' | 'defer';
  reasonCode?: string;
  reviewRequiredReason?: 'interdiction' | 'court_order' | 'dispute' | null;
  requestId: string;
  occurredAt: string;
}

export interface ContinuityAuditInput {
  actorPersonId: string;
  requestId: string;
  action: string;
  outcome: 'succeeded' | 'denied';
  occurredAt: string;
  metadata?: Readonly<Record<string, string | number | boolean | null>>;
}

export interface ContinuityOutboxInput {
  aggregateId: string;
  aggregateVersion: number;
  eventType:
    | 'identity.factor.changed'
    | 'identity.recovery.completed'
    | 'identity.transition.submitted'
    | 'identity.transition.decided';
  payload: Readonly<Record<string, string>>;
}

export interface FactorChangedEvidence {
  audit: ContinuityAuditInput;
  event: Omit<ContinuityOutboxInput, 'eventType' | 'payload'> & {
    eventType: 'identity.factor.changed';
    payload: {
      recipientPersonId: string;
      support_action: 'verified' | 'removed';
      action_time: string;
    };
  };
}

export interface PreparedLogout {
  result: LogoutResult;
  audit: ContinuityAuditInput;
}

export interface PreparedRecoveryCompletion {
  caseId: string;
  personId: string;
  requestId: string;
  restricted: boolean;
  session: SessionResult;
}
export type PreparedRecoveryOperation = PreparedRecoveryCompletion | RecoveryProofRequiredResult;

export interface RecoveryResumeMarker {
  subjectId: string;
  accessToken: string;
  restricted: boolean | null;
  credentialUpdated: boolean;
  proofGrant?: string;
  proofGrantExpiresAt?: string;
  expiresAt: string;
}

export interface RefreshRotationMarker {
  session: NativeSessionProjection;
  evidenceCommitted: boolean;
  expiresAt: string;
}

export interface FactorRemovalMarker {
  subjectId: string;
  sessionId: string;
  factorId: string;
  personId: string;
  result?: FactorRemovalResult;
  expiresAt: string;
}

export interface PendingEnrollmentMarker {
  enrollmentId: string;
  expiresAtMs: number;
}

export interface ContinuityRepository {
  isNativeSessionCurrent(sessionId: string, subjectId: string, claimedAal: 1 | 2): Promise<boolean>;
  restrictionForSession(sessionId: string, subjectId: string): Promise<ContinuityRestriction>;
  withSerializedFactorState<T>(subjectId: string, work: () => Promise<T>): Promise<T>;
  withDurableSerializedFactorState<T>(subjectId: string, work: () => Promise<T>): Promise<T>;
  appendAudit(input: ContinuityAuditInput): Promise<void>;
  appendFactorChangedEvidence(input: FactorChangedEvidence): Promise<void>;
  findRefreshRotationMarker(markerKey: string): Promise<RefreshRotationMarker | undefined>;
  saveRefreshRotationMarker(markerKey: string, marker: RefreshRotationMarker): Promise<void>;
  commitRefreshRotationEvidence(input: {
    markerKey: string;
    marker: RefreshRotationMarker;
    audit: ContinuityAuditInput;
  }): Promise<void>;
  findFactorRemovalMarker(markerKey: string): Promise<FactorRemovalMarker | undefined>;
  saveFactorRemovalMarker(markerKey: string, marker: FactorRemovalMarker): Promise<void>;
  commitFactorRemoval(input: {
    markerKey: string;
    marker: FactorRemovalMarker & { result: FactorRemovalResult };
    evidence: FactorChangedEvidence;
  }): Promise<void>;
  resolveSubjectPerson(subjectId: string): Promise<string | undefined>;
  accountClassForPerson(
    personId: string,
  ): Promise<'patient_optional_mfa' | 'workforce_mandatory_mfa'>;
  factorRemovalProofIsApproved(input: {
    personId: string;
    verificationCaseId: string;
  }): Promise<boolean>;
  findPendingEnrollmentMarker(input: {
    markerKey: string;
    liveOnly: boolean;
  }): Promise<PendingEnrollmentMarker | undefined>;
  savePendingEnrollmentMarker(input: {
    markerKey: string;
    enrollmentId: string;
    expiresAt: string;
  }): Promise<void>;
  consumePendingEnrollmentMarker(input: { markerKey: string }): Promise<void>;
  completeRestrictedEnrollmentCase(input: {
    sessionId: string;
    subjectId: string;
    requestId: string;
    occurredAt: string;
  }): Promise<void>;
  appendOutboxEvent(input: ContinuityOutboxInput): Promise<void>;
  createRecoveryIntake(input: {
    caseId: string;
    handleDigest: Uint8Array;
    caseTokenDigest: Uint8Array;
    expiresAt: string;
  }): Promise<void>;
  bindRecoveryIntake(input: {
    caseId: string;
    subjectId: string;
    handleDigest: Uint8Array;
    caseTokenDigest: Uint8Array;
  }): Promise<{ personId: string }>;
  findRecoveryResumeMarker(caseId: string): Promise<RecoveryResumeMarker | undefined>;
  saveRecoveryResumeMarker(caseId: string, marker: RecoveryResumeMarker): Promise<void>;
  recoveryProofIsApproved(input: {
    recoveryCaseId: string;
    personId: string;
    verificationCaseId: string;
  }): Promise<boolean>;
  installRecoveryProofGrant(input: {
    recoveryCaseId: string;
    personId: string;
    grantDigest: Uint8Array;
    expiresAt: string;
  }): Promise<void>;
  authorizeRecoveryProofGrant(input: {
    grantDigest: Uint8Array;
  }): Promise<{ recoveryCaseId: string; personId: string; principal: string }>;
  lockRecoveryProofGrant(input: {
    grantDigest: Uint8Array;
    recoveryCaseId: string;
    personId: string;
  }): Promise<void>;
  consumeRecoveryProofGrant(input: {
    recoveryCaseId: string;
    personId: string;
    verificationCaseId: string;
  }): Promise<void>;
  stageRecoveryRestriction(input: { caseId: string; personId: string }): Promise<void>;
  finalizeRecovery(input: {
    caseId: string;
    personId: string;
    sessionId: string;
    restricted: boolean;
    requestId: string;
    occurredAt: string;
  }): Promise<void>;
  submitTransitionProof(
    input: TransitionMutationInput & { verificationCaseId: string },
  ): Promise<TransitionResult>;
  decideTransition(
    input: TransitionMutationInput & {
      decision: 'approve' | 'reject' | 'defer';
      reasonCode: string;
    },
  ): Promise<TransitionResult>;
}

export interface IdentityContinuityServicePort {
  refreshSession(context: ContinuityRequestContext, body: RefreshRequest): Promise<SessionResult>;
  prepareLogout(context: ContinuityRequestContext, body: LogoutRequest): Promise<PreparedLogout>;
  commitLogout(prepared: PreparedLogout): Promise<LogoutResult>;
  logout(context: ContinuityRequestContext, body: LogoutRequest): Promise<LogoutResult>;
  beginMfaEnrollment(
    context: ContinuityRequestContext,
    body: BeginEnrollmentRequest,
  ): Promise<EnrollmentSecretResult>;
  verifyMfaEnrollment(
    context: ContinuityRequestContext,
    body: VerifyEnrollmentRequest,
  ): Promise<FactorResult>;
  removeMfaFactor(
    context: ContinuityRequestContext,
    factorId: string,
    body: RemoveFactorRequest,
  ): Promise<FactorRemovalResult>;
  startRecovery(
    context: ContinuityRequestContext,
    body: StartRecoveryRequest,
  ): Promise<RecoveryAccepted>;
  completeRecovery(
    context: ContinuityRequestContext,
    caseId: string,
    body: CompleteRecoveryRequest,
  ): Promise<CompleteRecoveryResult>;
  prepareRecoveryCompletion(
    context: ContinuityRequestContext,
    caseId: string,
    body: CompleteRecoveryRequest,
  ): Promise<PreparedRecoveryOperation>;
  commitRecoveryCompletion(prepared: PreparedRecoveryOperation): Promise<CompleteRecoveryResult>;
  transitionDependent(
    context: ContinuityRequestContext,
    relationshipId: string,
    body: TransitionRequest,
    expectedVersion: number,
  ): Promise<TransitionResult>;
}
