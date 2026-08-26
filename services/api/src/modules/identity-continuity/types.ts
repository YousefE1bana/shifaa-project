import type {
  BeginEnrollmentRequest,
  CompleteRecoveryRequest,
  FactorRemovalResult,
  FactorResult,
  LogoutRequest,
  LogoutResult,
  RecoveryAccepted,
  RecoveryResult,
  RefreshRequest,
  RemoveFactorRequest,
  SessionResult,
  StartRecoveryRequest,
  TransitionRequest,
  TransitionResult,
  VerifyEnrollmentRequest,
  EnrollmentSecretResult,
} from '@shifaa/contracts/identity-continuity';

export type ContinuityRestriction = 'mfa_enrollment_only' | null;

export interface ContinuityRequestContext {
  requestId: string;
  idempotencyKey: string;
  accessToken?: string;
  refreshCookie?: string;
  csrfCookie?: string;
  csrfHeader?: string;
  origin?: string;
  fetchSite?: string;
}

export interface ContinuityAuditInput {
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

export interface PreparedLogout {
  result: LogoutResult;
  audit: ContinuityAuditInput;
}

export interface PendingEnrollmentMarker {
  enrollmentId: string;
  expiresAtMs: number;
}

export interface ContinuityRepository {
  isNativeSessionCurrent(sessionId: string, subjectId: string, claimedAal: 1 | 2): Promise<boolean>;
  restrictionForSession(sessionId: string, subjectId: string): Promise<ContinuityRestriction>;
  withSerializedFactorState<T>(subjectId: string, work: () => Promise<T>): Promise<T>;
  appendAudit(input: ContinuityAuditInput): Promise<void>;
  resolveSubjectPerson(subjectId: string): Promise<string | undefined>;
  accountClassForPerson(
    personId: string,
  ): Promise<'patient_optional_mfa' | 'workforce_mandatory_mfa'>;
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
  ): Promise<RecoveryResult>;
  transitionDependent(
    context: ContinuityRequestContext,
    relationshipId: string,
    body: TransitionRequest,
    expectedVersion: number,
  ): Promise<TransitionResult>;
}
