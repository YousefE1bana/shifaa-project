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

export interface PreparedLogout {
  result: LogoutResult;
  audit: ContinuityAuditInput;
}

export interface ContinuityRepository {
  isNativeSessionCurrent(sessionId: string, subjectId: string): Promise<boolean>;
  restrictionForSession(sessionId: string, subjectId: string): Promise<ContinuityRestriction>;
  appendAudit(input: ContinuityAuditInput): Promise<void>;
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
