import { FormatRegistry, Type, type Static, type TSchema } from '@sinclair/typebox';
import { Value } from '@sinclair/typebox/value';

if (!FormatRegistry.Has('uuid')) {
  FormatRegistry.Set('uuid', (value) =>
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value),
  );
}
if (!FormatRegistry.Has('date-time')) {
  FormatRegistry.Set('date-time', (value) => Number.isFinite(Date.parse(value)));
}

export const IDENTITY_CONTINUITY_FEATURE_ID =
  '007-identity-continuity-sessions-mfa-recovery' as const;

export const identityContinuityOperationIds = [
  'refreshSession',
  'logout',
  'beginMfaEnrollment',
  'verifyMfaEnrollment',
  'removeMfaFactor',
  'startRecovery',
  'completeRecovery',
  'transitionDependent',
] as const;
export type IdentityContinuityOperationId = (typeof identityContinuityOperationIds)[number];

export const identityContinuityOperations = {
  refreshSession: ['POST', '/auth/session/refresh', ['FR-AUTH-005']],
  logout: ['POST', '/auth/logout', ['FR-AUTH-005']],
  beginMfaEnrollment: ['POST', '/auth/mfa/enroll', ['FR-AUTH-002', 'FR-ADMIN-002']],
  verifyMfaEnrollment: ['POST', '/auth/mfa/enroll/verify', ['FR-AUTH-002', 'FR-ADMIN-002']],
  removeMfaFactor: [
    'DELETE',
    '/auth/mfa/factors/{factorId}',
    ['FR-AUTH-002', 'FR-AUTH-005', 'FR-ADMIN-002'],
  ],
  startRecovery: ['POST', '/auth/recovery', ['FR-AUTH-005']],
  completeRecovery: ['POST', '/auth/recovery/{caseId}/complete', ['FR-AUTH-005', 'FR-ADMIN-002']],
  transitionDependent: [
    'POST',
    '/guardianships/{relationshipId}/transition',
    ['FR-FAM-003', 'FR-ADMIN-002'],
  ],
} as const satisfies Record<
  IdentityContinuityOperationId,
  readonly ['POST' | 'DELETE', string, readonly string[]]
>;

const closedObject = <T extends Record<string, TSchema>>(properties: T) =>
  Type.Object(properties, { additionalProperties: false });
const Uuid = Type.String({ format: 'uuid' });
const DateTime = Type.String({ format: 'date-time' });
const NullableUuid = Type.Union([Uuid, Type.Null()]);
const Assurance = Type.Union([Type.Literal('aal1'), Type.Literal('aal2')]);

export const WebRefreshRequestSchema = closedObject({
  client: Type.Literal('web'),
  foregroundEngaged: Type.Literal(true),
});
export const NativeRefreshRequestSchema = closedObject({
  client: Type.Literal('native'),
  foregroundEngaged: Type.Literal(true),
  refreshToken: Type.String({ minLength: 1, maxLength: 4096, writeOnly: true }),
});
export const RefreshRequestSchema = Type.Union([
  WebRefreshRequestSchema,
  NativeRefreshRequestSchema,
]);
export const SessionResultSchema = closedObject({
  accessToken: Type.String({ minLength: 32 }),
  refreshToken: Type.Optional(Type.String({ minLength: 1, maxLength: 4096, writeOnly: true })),
  sessionId: Uuid,
  assurance: Assurance,
  expiresAt: DateTime,
  restriction: Type.Union([Type.Literal('mfa_enrollment_only'), Type.Null()]),
});
export const LogoutRequestSchema = closedObject({ allSessions: Type.Boolean() });
export const LogoutResultSchema = closedObject({
  scope: Type.Union([Type.Literal('current'), Type.Literal('all')]),
  revokedAt: DateTime,
});
export const BeginEnrollmentRequestSchema = closedObject({
  factorType: Type.Union([Type.Literal('totp'), Type.Literal('passkey')]),
  friendlyName: Type.Optional(Type.String({ minLength: 1, maxLength: 64 })),
});
export const EnrollmentSecretResultSchema = closedObject({
  enrollmentId: Uuid,
  factorType: Type.Literal('totp'),
  secret: Type.String({ minLength: 16, maxLength: 256 }),
  qrUri: Type.String({ minLength: 16, maxLength: 2048 }),
  expiresAt: DateTime,
});
export const VerifyEnrollmentRequestSchema = closedObject({
  enrollmentId: Uuid,
  code: Type.String({ pattern: '^[0-9]{6}$' }),
});
export const FactorSummarySchema = closedObject({
  id: Uuid,
  type: Type.Literal('totp'),
  status: Type.Literal('verified'),
  friendlyName: Type.Union([Type.String({ maxLength: 64 }), Type.Null()]),
  createdAt: DateTime,
});
export const FactorResultSchema = closedObject({
  factor: FactorSummarySchema,
  assurance: Type.Literal('aal2'),
  session: SessionResultSchema,
});
export const RemoveFactorRequestSchema = closedObject({
  proofCaseId: Type.Optional(NullableUuid),
  confirmOptionalLastFactor: Type.Boolean(),
});
export const FactorRemovalResultSchema = closedObject({
  removedFactorId: Uuid,
  assurance: Assurance,
  removedAt: DateTime,
});
export const StartRecoveryRequestSchema = closedObject({
  handle: Type.String({ minLength: 3, maxLength: 320 }),
  locale: Type.Union([Type.Literal('ar-EG'), Type.Literal('en-EG')]),
});
export const RecoveryAcceptedSchema = closedObject({
  caseId: Uuid,
  caseToken: Type.String({ minLength: 32, maxLength: 512 }),
  status: Type.Literal('accepted'),
  messageCode: Type.Literal('recovery.accepted'),
});
export const CompleteRecoveryRequestSchema = closedObject({
  caseToken: Type.String({ minLength: 32, maxLength: 512, writeOnly: true }),
  handle: Type.String({ minLength: 3, maxLength: 320, writeOnly: true }),
  recoveryOtp: Type.String({ minLength: 6, maxLength: 12, writeOnly: true }),
  proofMethod: Type.Union([
    Type.Literal('bound_factor_independent_method'),
    Type.Literal('repeated_identity_proof'),
  ]),
  factorEvidence: Type.Optional(Type.Union([Type.String({ maxLength: 512 }), Type.Null()])),
  verificationCaseId: Type.Optional(NullableUuid),
  newCredential: Type.String({ minLength: 12, maxLength: 256, writeOnly: true }),
});
export const RecoveryResultSchema = closedObject({
  caseId: Uuid,
  status: Type.Union([Type.Literal('completed'), Type.Literal('restricted_enrollment')]),
  session: SessionResultSchema,
});
export const TransitionSubmitRequestSchema = closedObject({
  action: Type.Literal('submit_proof'),
  verificationCaseId: Uuid,
});
export const TransitionDecisionRequestSchema = closedObject({
  action: Type.Literal('decide'),
  decision: Type.Union([Type.Literal('approve'), Type.Literal('reject'), Type.Literal('defer')]),
  reasonCode: Type.String({ pattern: '^[a-z][a-z0-9_.-]{2,63}$' }),
  reviewRequiredReason: Type.Optional(
    Type.Union([
      Type.Literal('interdiction'),
      Type.Literal('court_order'),
      Type.Literal('dispute'),
      Type.Null(),
    ]),
  ),
});
export const TransitionRequestSchema = Type.Union([
  TransitionSubmitRequestSchema,
  TransitionDecisionRequestSchema,
]);
export const TransitionResultSchema = closedObject({
  caseId: Uuid,
  relationshipId: Uuid,
  patientId: Uuid,
  personId: Uuid,
  status: Type.Union([
    Type.Literal('proof_required'),
    Type.Literal('review_required'),
    Type.Literal('human_review_required'),
    Type.Literal('approved'),
    Type.Literal('rejected'),
  ]),
  version: Type.Integer({ minimum: 1 }),
  updatedAt: DateTime,
});

export const identityContinuityRequestSchemas = {
  refreshSession: RefreshRequestSchema,
  logout: LogoutRequestSchema,
  beginMfaEnrollment: BeginEnrollmentRequestSchema,
  verifyMfaEnrollment: VerifyEnrollmentRequestSchema,
  removeMfaFactor: RemoveFactorRequestSchema,
  startRecovery: StartRecoveryRequestSchema,
  completeRecovery: CompleteRecoveryRequestSchema,
  transitionDependent: TransitionRequestSchema,
} as const satisfies Record<IdentityContinuityOperationId, TSchema>;

export const identityContinuityResponseSchemas = {
  refreshSession: SessionResultSchema,
  logout: LogoutResultSchema,
  beginMfaEnrollment: EnrollmentSecretResultSchema,
  verifyMfaEnrollment: FactorResultSchema,
  removeMfaFactor: FactorRemovalResultSchema,
  startRecovery: RecoveryAcceptedSchema,
  completeRecovery: RecoveryResultSchema,
  transitionDependent: TransitionResultSchema,
} as const satisfies Record<IdentityContinuityOperationId, TSchema>;

export function validatesIdentityContinuityRequest(
  operationId: IdentityContinuityOperationId,
  value: unknown,
): boolean {
  return Value.Check(identityContinuityRequestSchemas[operationId], value);
}

export const identityContinuitySensitiveFields = [
  'accessToken',
  'refreshToken',
  'secret',
  'qrUri',
  'code',
  'handle',
  'caseToken',
  'recoveryOtp',
  'factorEvidence',
  'newCredential',
] as const;

export type RefreshRequest = Static<typeof RefreshRequestSchema>;
export type SessionResult = Static<typeof SessionResultSchema>;
export type LogoutRequest = Static<typeof LogoutRequestSchema>;
export type LogoutResult = Static<typeof LogoutResultSchema>;
export type BeginEnrollmentRequest = Static<typeof BeginEnrollmentRequestSchema>;
export type EnrollmentSecretResult = Static<typeof EnrollmentSecretResultSchema>;
export type VerifyEnrollmentRequest = Static<typeof VerifyEnrollmentRequestSchema>;
export type FactorSummary = Static<typeof FactorSummarySchema>;
export type FactorResult = Static<typeof FactorResultSchema>;
export type RemoveFactorRequest = Static<typeof RemoveFactorRequestSchema>;
export type FactorRemovalResult = Static<typeof FactorRemovalResultSchema>;
export type StartRecoveryRequest = Static<typeof StartRecoveryRequestSchema>;
export type RecoveryAccepted = Static<typeof RecoveryAcceptedSchema>;
export type CompleteRecoveryRequest = Static<typeof CompleteRecoveryRequestSchema>;
export type RecoveryResult = Static<typeof RecoveryResultSchema>;
export type TransitionRequest = Static<typeof TransitionRequestSchema>;
export type TransitionResult = Static<typeof TransitionResultSchema>;
