import { Type, type Static, type TSchema } from '@sinclair/typebox';

export const FEATURE_ID = '001-identity-onboarding' as const;

export const targetRequirementIds = [
  'FR-AUTH-001',
  'FR-AUTH-002',
  'FR-AUTH-003',
  'FR-AUTH-004',
  'FR-AUTH-006',
  'FR-AUTH-007',
  'FR-AUTH-008',
  'FR-ADMIN-002',
  'NFR-API-001',
  'NFR-API-002',
] as const;

export const operationIds = [
  'registerPerson',
  'login',
  'verifyOtp',
  'getMyProfile',
  'updateMyProfile',
  'createIdentityProof',
  'listMyIdentities',
  'createIdentityUpload',
  'getVerificationCase',
  'listIdentityVerificationCases',
  'reviewVerificationCase',
  'getPrivacyNotice',
  'listMyConsents',
  'recordConsent',
  'withdrawConsent',
  'identityProviderCallback',
] as const;

export type OperationId = (typeof operationIds)[number];

const NullableString = Type.Union([Type.String(), Type.Null()]);
const Uuid = Type.String({ format: 'uuid' });

export const RegisterPersonBody = Type.Object(
  {
    locale: Type.Union([Type.Literal('ar-EG'), Type.Literal('en-EG')]),
    handle: Type.String({ minLength: 5, maxLength: 254 }),
    password: Type.String({ minLength: 12, maxLength: 128 }),
  },
  { additionalProperties: false },
);

export const LoginBody = Type.Object(
  { handle: Type.String(), password: Type.String() },
  { additionalProperties: false },
);

export const OtpVerificationBody = Type.Object(
  { challenge_id: Uuid, code: Type.String({ pattern: '^[0-9]{6}$' }) },
  { additionalProperties: false },
);

export const AuthResult = Type.Object({
  kind: Type.Union([Type.Literal('challenge'), Type.Literal('session')]),
  challenge_id: Type.Optional(Type.Union([Uuid, Type.Null()])),
  access_token: Type.Optional(NullableString),
  refresh_token: Type.Optional(NullableString),
  aal: Type.Optional(Type.Union([Type.Literal(1), Type.Literal(2), Type.Null()])),
});

export const Profile = Type.Object({
  id: Uuid,
  display_name: Type.String(),
  birth_date: Type.Union([Type.String({ format: 'date' }), Type.Null()]),
  nationality_code: Type.String({ pattern: '^[A-Z]{2}$' }),
  preferred_locale: Type.Union([Type.Literal('ar-EG'), Type.Literal('en-EG')]),
  verification_status: Type.String(),
  version: Type.Integer({ minimum: 1 }),
});

export const ProfilePatchBody = Type.Partial(
  Type.Object(
    {
      display_name: Type.String({ minLength: 2, maxLength: 120 }),
      birth_date: Type.Union([Type.String({ format: 'date' }), Type.Null()]),
      nationality_code: Type.String({ pattern: '^[A-Z]{2}$' }),
      preferred_locale: Type.Union([Type.Literal('ar-EG'), Type.Literal('en-EG')]),
    },
    { additionalProperties: false },
  ),
);

export const IdentityInputBody = Type.Object(
  {
    identity_type: Type.Union([
      Type.Literal('egyptian_national_id'),
      Type.Literal('passport'),
      Type.Literal('unhcr_card'),
    ]),
    value: Type.String({ minLength: 6, maxLength: 32 }),
    issuing_country: Type.String({ pattern: '^[A-Z]{2}$' }),
    expires_on: Type.Optional(Type.Union([Type.String({ format: 'date' }), Type.Null()])),
  },
  { additionalProperties: false },
);

export const VerificationCase = Type.Object({
  id: Uuid,
  identity_type: Type.Optional(Type.String()),
  masked_value: Type.Optional(Type.String()),
  status: Type.Union([
    Type.Literal('pending'),
    Type.Literal('manual_review'),
    Type.Literal('verified'),
    Type.Literal('rejected'),
    Type.Literal('failed'),
    Type.Literal('expired'),
  ]),
  reason_code: Type.Optional(NullableString),
  next_action: Type.Optional(NullableString),
  version: Type.Integer({ minimum: 1 }),
});

export const IdentitySummary = Type.Object({
  id: Uuid,
  identity_type: Type.String(),
  masked_value: Type.String(),
  verification_case: VerificationCase,
});

export const UploadMetadataBody = Type.Object(
  {
    mime_type: Type.Union([
      Type.Literal('image/jpeg'),
      Type.Literal('image/png'),
      Type.Literal('application/pdf'),
    ]),
    size_bytes: Type.Integer({ minimum: 1, maximum: 10_485_760 }),
    sha256: Type.String({ pattern: '^[0-9a-f]{64}$' }),
  },
  { additionalProperties: false },
);

export const ReviewDecisionBody = Type.Object(
  {
    decision: Type.Union([Type.Literal('approve'), Type.Literal('reject')]),
    reason: Type.String({ minLength: 3, maxLength: 500 }),
    evidence_object_id: Type.Optional(Type.Union([Uuid, Type.Null()])),
  },
  { additionalProperties: false },
);

export const ConsentInputBody = Type.Object(
  {
    purpose_code: Type.String(),
    purpose_version: Type.String(),
    decision: Type.Union([Type.Literal('granted'), Type.Literal('refused')]),
    notice_version: Type.String(),
  },
  { additionalProperties: false },
);

export const ProviderCallbackBody = Type.Object({
  event_id: Type.String(),
  case_id: Uuid,
  outcome: Type.Union([
    Type.Literal('verified'),
    Type.Literal('failed'),
    Type.Literal('manual_review'),
  ]),
});

export const ProblemDetails = Type.Object({
  type: Type.String(),
  title: Type.String(),
  status: Type.Integer(),
  detail: Type.String(),
  code: Type.String(),
  request_id: Uuid,
  retry_after_seconds: Type.Optional(Type.Integer()),
});

export const requestSchemas = {
  registerPerson: RegisterPersonBody,
  login: LoginBody,
  verifyOtp: OtpVerificationBody,
  updateMyProfile: ProfilePatchBody,
  createIdentityProof: IdentityInputBody,
  createIdentityUpload: UploadMetadataBody,
  reviewVerificationCase: ReviewDecisionBody,
  recordConsent: ConsentInputBody,
  identityProviderCallback: ProviderCallbackBody,
} satisfies Partial<Record<OperationId, TSchema>>;

export type RegisterPersonInput = Static<typeof RegisterPersonBody>;
export type LoginInput = Static<typeof LoginBody>;
export type OtpVerificationInput = Static<typeof OtpVerificationBody>;
export type ProfileDto = Static<typeof Profile>;
export type ProfilePatchInput = Static<typeof ProfilePatchBody>;
export type IdentityInput = Static<typeof IdentityInputBody>;
export type IdentitySummaryDto = Static<typeof IdentitySummary>;
export type VerificationCaseDto = Static<typeof VerificationCase>;
export type UploadMetadata = Static<typeof UploadMetadataBody>;
export type ReviewDecisionInput = Static<typeof ReviewDecisionBody>;
export type ConsentInput = Static<typeof ConsentInputBody>;
export type ProviderCallbackInput = Static<typeof ProviderCallbackBody>;

export const routeCatalog: ReadonlyArray<{
  operationId: OperationId;
  method: 'GET' | 'POST' | 'PATCH';
  path: string;
  requirements: readonly string[];
}> = [
  {
    operationId: 'registerPerson',
    method: 'POST',
    path: '/auth/register',
    requirements: ['FR-AUTH-001', 'FR-AUTH-002'],
  },
  { operationId: 'login', method: 'POST', path: '/auth/login', requirements: ['FR-AUTH-002'] },
  {
    operationId: 'verifyOtp',
    method: 'POST',
    path: '/auth/otp/verify',
    requirements: ['FR-AUTH-002'],
  },
  { operationId: 'getMyProfile', method: 'GET', path: '/people/me', requirements: ['FR-AUTH-001'] },
  {
    operationId: 'updateMyProfile',
    method: 'PATCH',
    path: '/people/me',
    requirements: ['FR-AUTH-001'],
  },
  {
    operationId: 'createIdentityProof',
    method: 'POST',
    path: '/people/me/identities',
    requirements: ['FR-AUTH-003', 'FR-AUTH-004', 'FR-AUTH-006', 'FR-AUTH-008'],
  },
  {
    operationId: 'listMyIdentities',
    method: 'GET',
    path: '/people/me/identities',
    requirements: ['FR-AUTH-003', 'FR-AUTH-004'],
  },
  {
    operationId: 'createIdentityUpload',
    method: 'POST',
    path: '/identity-verifications/:caseId/upload-intent',
    requirements: ['FR-AUTH-004'],
  },
  {
    operationId: 'getVerificationCase',
    method: 'GET',
    path: '/identity-verifications/:caseId',
    requirements: ['FR-AUTH-003', 'FR-AUTH-004'],
  },
  {
    operationId: 'listIdentityVerificationCases',
    method: 'GET',
    path: '/admin/identity-verifications',
    requirements: ['FR-AUTH-003', 'FR-AUTH-004', 'FR-ADMIN-002'],
  },
  {
    operationId: 'reviewVerificationCase',
    method: 'POST',
    path: '/admin/identity-verifications/:caseId/decision',
    requirements: ['FR-AUTH-003', 'FR-AUTH-004', 'FR-ADMIN-002'],
  },
  {
    operationId: 'getPrivacyNotice',
    method: 'GET',
    path: '/privacy/notices/current',
    requirements: ['FR-AUTH-007', 'FR-AUTH-008'],
  },
  {
    operationId: 'listMyConsents',
    method: 'GET',
    path: '/privacy/consents',
    requirements: ['FR-AUTH-007'],
  },
  {
    operationId: 'recordConsent',
    method: 'POST',
    path: '/privacy/consents',
    requirements: ['FR-AUTH-007', 'FR-AUTH-008'],
  },
  {
    operationId: 'withdrawConsent',
    method: 'POST',
    path: '/privacy/consents/:consentId/withdraw',
    requirements: ['FR-AUTH-007'],
  },
  {
    operationId: 'identityProviderCallback',
    method: 'POST',
    path: '/internal/callbacks/identity/:provider',
    requirements: ['FR-AUTH-003'],
  },
];
