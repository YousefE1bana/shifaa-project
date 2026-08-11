import { Type, type Static } from '@sinclair/typebox';

export const FACILITY_FEATURE_ID = '003-facility-onboarding-rbac' as const;
export const facilityOperationIds = [
  'createProfessionalLicense',
  'createProfessionalLicenseUpload',
  'getProfessionalLicense',
  'listProfessionalLicenseCases',
  'reviewProfessionalLicense',
  'createFacility',
  'getFacility',
  'updateFacility',
  'submitFacility',
  'createFacilityLicenseUpload',
  'listFacilityApprovalCases',
  'reviewFacility',
  'listFacilityMemberships',
  'inviteFacilityMember',
  'acceptFacilityMembership',
  'updateFacilityMembership',
  'endFacilityMembership',
  'listAdminRoleGrants',
  'proposeAdminRoleGrant',
  'decideAdminRoleGrant',
  'proposeAdminRoleRevocation',
  'decideAdminRoleRevocation',
] as const;
export type FacilityOperationId = (typeof facilityOperationIds)[number];
export const FacilityTypeSchema = Type.Union([
  Type.Literal('clinic'),
  Type.Literal('pharmacy'),
  Type.Literal('hospital'),
  Type.Literal('laboratory'),
]);
export const AdminRoleSchema = Type.Union([
  Type.Literal('super_admin'),
  Type.Literal('support_admin'),
  Type.Literal('medical_reviewer'),
  Type.Literal('facility_approver'),
  Type.Literal('finance_reviewer'),
]);
export const UploadMetadataSchema = Type.Object(
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
export const FacilityCreateSchema = Type.Object(
  {
    facility_type: FacilityTypeSchema,
    name_ar: Type.String({ minLength: 2, maxLength: 160 }),
    name_en: Type.String({ minLength: 2, maxLength: 160 }),
    governorate_code: Type.String({ minLength: 2, maxLength: 16 }),
    city: Type.String({ minLength: 2, maxLength: 120 }),
    district: Type.String({ minLength: 2, maxLength: 120 }),
    address_line: Type.String({ minLength: 4, maxLength: 300 }),
  },
  { additionalProperties: false },
);
export const FacilityPatchSchema = Type.Partial(
  Type.Omit(FacilityCreateSchema, ['facility_type']),
  { additionalProperties: false, minProperties: 1 },
);
export const FacilityLicenseUploadSchema = Type.Object(
  {
    mime_type: Type.Union([
      Type.Literal('image/jpeg'),
      Type.Literal('image/png'),
      Type.Literal('application/pdf'),
    ]),
    size_bytes: Type.Integer({ minimum: 1, maximum: 10_485_760 }),
    sha256: Type.String({ pattern: '^[0-9a-f]{64}$' }),
    license_type: Type.String({ minLength: 2, maxLength: 80 }),
    license_number: Type.String({ minLength: 4, maxLength: 80 }),
    issuer: Type.String({ minLength: 2, maxLength: 160 }),
    expires_on: Type.String({ format: 'date' }),
    licensed_activities: Type.Array(Type.String({ maxLength: 80 }), {
      minItems: 1,
      maxItems: 30,
      uniqueItems: true,
    }),
  },
  { additionalProperties: false },
);
export const ProfessionalLicenseCreateSchema = Type.Object(
  {
    profession: Type.Union([
      Type.Literal('doctor'),
      Type.Literal('pharmacist'),
      Type.Literal('nurse'),
      Type.Literal('lab_professional'),
    ]),
    specialty_code: Type.Optional(Type.Union([Type.String({ maxLength: 80 }), Type.Null()])),
    license_number: Type.String({ minLength: 4, maxLength: 80 }),
    issuer: Type.String({ minLength: 2, maxLength: 160 }),
    expires_on: Type.String({ format: 'date' }),
  },
  { additionalProperties: false },
);
export const FacilityReviewSchema = Type.Object(
  {
    decision: Type.Union([
      Type.Literal('approve'),
      Type.Literal('reject'),
      Type.Literal('suspend'),
    ]),
    reason: Type.String({ minLength: 3, maxLength: 500 }),
    evidence_object_id: Type.Optional(Type.String({ format: 'uuid' })),
  },
  { additionalProperties: false },
);
export const ProfessionalReviewSchema = Type.Object(
  {
    decision: Type.Union([Type.Literal('verify'), Type.Literal('reject'), Type.Literal('suspend')]),
    reason: Type.String({ minLength: 3, maxLength: 500 }),
    evidence_object_id: Type.Optional(Type.String({ format: 'uuid' })),
  },
  { additionalProperties: false },
);
export const MembershipInviteSchema = Type.Object(
  {
    person_id: Type.String({ format: 'uuid' }),
    role_code: Type.Union([
      Type.Literal('doctor'),
      Type.Literal('pharmacist'),
      Type.Literal('nurse'),
      Type.Literal('lab_professional'),
    ]),
    employment_license_id: Type.String({ format: 'uuid' }),
    valid_from: Type.String({ format: 'date-time' }),
    valid_until: Type.Optional(Type.Union([Type.String({ format: 'date-time' }), Type.Null()])),
  },
  { additionalProperties: false },
);
export const MembershipPatchSchema = Type.Partial(
  Type.Object({
    role_code: Type.Union([
      Type.Literal('doctor'),
      Type.Literal('pharmacist'),
      Type.Literal('nurse'),
      Type.Literal('lab_professional'),
    ]),
    employment_license_id: Type.String({ format: 'uuid' }),
    valid_from: Type.String({ format: 'date-time' }),
    valid_until: Type.Union([Type.String({ format: 'date-time' }), Type.Null()]),
    status: Type.Union([Type.Literal('active'), Type.Literal('suspended')]),
  }),
  { additionalProperties: false, minProperties: 1 },
);
export const AdminGrantProposalSchema = Type.Object(
  {
    person_id: Type.String({ format: 'uuid' }),
    role_code: AdminRoleSchema,
    valid_from: Type.String({ format: 'date-time' }),
    valid_until: Type.Optional(Type.Union([Type.String({ format: 'date-time' }), Type.Null()])),
    reason: Type.String({ minLength: 3, maxLength: 500 }),
  },
  { additionalProperties: false },
);
export const DecisionSchema = Type.Object(
  {
    decision: Type.Union([Type.Literal('approve'), Type.Literal('reject')]),
    reason: Type.String({ minLength: 3, maxLength: 500 }),
  },
  { additionalProperties: false },
);
export const ReasonSchema = Type.Object(
  {
    reason: Type.String({ minLength: 3, maxLength: 500 }),
    effective_at: Type.Optional(Type.String({ format: 'date-time' })),
  },
  { additionalProperties: false },
);

export type FacilityCreateInput = Static<typeof FacilityCreateSchema>;
export type FacilityPatchInput = Static<typeof FacilityPatchSchema>;
export type FacilityLicenseUploadInput = Static<typeof FacilityLicenseUploadSchema>;
export type ProfessionalLicenseCreateInput = Static<typeof ProfessionalLicenseCreateSchema>;
export type FacilityReviewInput = Static<typeof FacilityReviewSchema>;
export type ProfessionalReviewInput = Static<typeof ProfessionalReviewSchema>;
export type MembershipInviteInput = Static<typeof MembershipInviteSchema>;
export type MembershipPatchInput = Static<typeof MembershipPatchSchema>;
export type AdminGrantProposalInput = Static<typeof AdminGrantProposalSchema>;
export type DecisionInput = Static<typeof DecisionSchema>;
export type ReasonInput = Static<typeof ReasonSchema>;
export type FacilityUploadMetadata = Static<typeof UploadMetadataSchema>;

export const facilityRequestSchemas = {
  createProfessionalLicense: ProfessionalLicenseCreateSchema,
  createProfessionalLicenseUpload: UploadMetadataSchema,
  createFacility: FacilityCreateSchema,
  updateFacility: FacilityPatchSchema,
  createFacilityLicenseUpload: FacilityLicenseUploadSchema,
  reviewFacility: FacilityReviewSchema,
  reviewProfessionalLicense: ProfessionalReviewSchema,
  inviteFacilityMember: MembershipInviteSchema,
  updateFacilityMembership: MembershipPatchSchema,
  endFacilityMembership: ReasonSchema,
  proposeAdminRoleGrant: AdminGrantProposalSchema,
  decideAdminRoleGrant: DecisionSchema,
  proposeAdminRoleRevocation: ReasonSchema,
  decideAdminRoleRevocation: DecisionSchema,
} as const;
