import { Type, type Static } from '@sinclair/typebox';

export const FAMILY_CARE_FEATURE_ID = '004-family-care-relationships' as const;
export const familyCareRequirementIds = [
  'FR-FAM-001',
  'FR-FAM-002',
  'FR-FAM-004',
  'FR-FAM-005',
  'FR-FAM-006',
  'FR-FAM-007',
  'FR-FAM-008',
] as const;
export const familyCareOperationIds = [
  'listRelationships',
  'createGuardianship',
  'listGuardianshipCases',
  'reviewGuardianship',
  'createDelegation',
  'acceptDelegation',
  'updateDelegation',
  'revokeRelationship',
  'createEmergencyContact',
  'listEmergencyContacts',
  'respondEmergencyContact',
  'revokeEmergencyContact',
] as const;
export type FamilyCareOperationId = (typeof familyCareOperationIds)[number];

export const RelationshipTypeSchema = Type.Union([
  Type.Literal('self'),
  Type.Literal('guardianship'),
  Type.Literal('delegation'),
]);
export const RelationshipStatusSchema = Type.Union([
  Type.Literal('pending'),
  Type.Literal('active'),
  Type.Literal('suspended'),
  Type.Literal('rejected'),
  Type.Literal('revoked'),
  Type.Literal('expired'),
]);
export const PermissionCodeSchema = Type.Union([
  Type.Literal('profile.view'),
  Type.Literal('appointment.manage'),
  Type.Literal('record.view'),
  Type.Literal('medication.manage'),
  Type.Literal('sos.activate'),
  Type.Literal('sos.share'),
  Type.Literal('complaint.create'),
  Type.Literal('symptom_routing.use'),
  Type.Literal('consent.manage'),
]);
export const DelegablePermissionCodeSchema = Type.Exclude(
  PermissionCodeSchema,
  Type.Literal('consent.manage'),
);
export const EmergencyContactStatusSchema = Type.Union([
  Type.Literal('pending'),
  Type.Literal('confirmed'),
  Type.Literal('declined'),
  Type.Literal('revoked'),
  Type.Literal('expired'),
]);
export const LocationPrecisionSchema = Type.Union([
  Type.Literal('none'),
  Type.Literal('coarse'),
  Type.Literal('exact'),
]);

export const FamilyPageQuerySchema = Type.Object(
  {
    cursor: Type.Optional(Type.String({ minLength: 1 })),
    limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 100 })),
    status: Type.Optional(Type.String({ minLength: 1 })),
    mode: Type.Optional(
      Type.Union([Type.Literal('guardianship_review'), Type.Literal('dependent_transition')]),
    ),
    includeDependentTransition: Type.Optional(Type.Boolean()),
  },
  { additionalProperties: false },
);

const TransitionWorkflowStatusSchema = Type.Union([
  Type.Literal('proof_required'),
  Type.Literal('review_required'),
  Type.Literal('human_review_required'),
  Type.Literal('approved'),
  Type.Literal('rejected'),
]);
const TransitionBlockerStateSchema = Type.Union([
  Type.Literal('none'),
  Type.Literal('interdiction'),
  Type.Literal('court_order'),
  Type.Literal('dispute'),
]);
const NullableDateTime = Type.Union([Type.String({ format: 'date-time' }), Type.Null()]);

export const DependentTransitionWorklistItemSchema = Type.Object(
  {
    relationshipId: Type.String({ format: 'uuid' }),
    transitionCaseId: Type.String({ format: 'uuid' }),
    caseType: Type.Literal('dependent_transition'),
    status: TransitionWorkflowStatusSchema,
    continuityCaseVersion: Type.Integer({ minimum: 1 }),
    proofState: Type.Union([Type.Literal('required'), Type.Literal('verified')]),
    reviewState: TransitionWorkflowStatusSchema,
    blockerState: TransitionBlockerStateSchema,
    createdAt: Type.String({ format: 'date-time' }),
    updatedAt: Type.String({ format: 'date-time' }),
    decidedAt: NullableDateTime,
  },
  { additionalProperties: false },
);

export const PatientDependentTransitionSummarySchema = Type.Object(
  {
    relationshipId: Type.Union([Type.String({ format: 'uuid' }), Type.Null()]),
    transitionCaseId: Type.Union([Type.String({ format: 'uuid' }), Type.Null()]),
    status: Type.Union([
      Type.Literal('not_eligible'),
      Type.Literal('verification_required'),
      Type.Literal('review_required'),
      Type.Literal('human_review_required'),
      Type.Literal('approved'),
      Type.Literal('rejected'),
    ]),
    continuityCaseVersion: Type.Union([Type.Integer({ minimum: 1 }), Type.Null()]),
    updatedAt: NullableDateTime,
    recordConsequence: Type.Union([
      Type.Literal('unchanged_before_decision'),
      Type.Literal('same_patient_record_preserved'),
      Type.Literal('unchanged_after_rejection'),
    ]),
    priorAuthorityConsequence: Type.Union([
      Type.Literal('current_until_decision'),
      Type.Literal('ended_after_approval'),
      Type.Literal('evaluated_independently_after_rejection'),
    ]),
  },
  { additionalProperties: false },
);

export const CreateGuardianshipSchema = Type.Object(
  {
    evidence_object_id: Type.String({ format: 'uuid' }),
    purpose_code: Type.String({ minLength: 3, maxLength: 128 }),
    requested_permissions: Type.Array(PermissionCodeSchema, {
      minItems: 1,
      maxItems: 9,
      uniqueItems: true,
    }),
  },
  { additionalProperties: false },
);
export const GuardianshipDecisionSchema = Type.Object(
  {
    decision: Type.Union([Type.Literal('approved'), Type.Literal('rejected')]),
    reason_code: Type.String({ pattern: '^[a-z][a-z0-9_.-]{2,63}$' }),
    valid_until: Type.Optional(Type.Union([Type.String({ format: 'date-time' }), Type.Null()])),
    approved_permissions: Type.Optional(
      Type.Array(PermissionCodeSchema, { minItems: 1, maxItems: 9, uniqueItems: true }),
    ),
  },
  { additionalProperties: false },
);
export const CreateDelegationSchema = Type.Object(
  {
    delegate_person_id: Type.String({ format: 'uuid' }),
    purpose_code: Type.String({ minLength: 3, maxLength: 128 }),
    permissions: Type.Array(DelegablePermissionCodeSchema, {
      minItems: 1,
      maxItems: 8,
      uniqueItems: true,
    }),
    valid_until: Type.String({ format: 'date-time' }),
  },
  { additionalProperties: false },
);
export const AcceptDelegationSchema = Type.Object(
  {
    token: Type.String({ minLength: 32, maxLength: 512 }),
    confirmed: Type.Literal(true),
  },
  { additionalProperties: false },
);
export const UpdateDelegationSchema = Type.Partial(
  Type.Object({
    permissions: Type.Array(DelegablePermissionCodeSchema, {
      minItems: 1,
      maxItems: 8,
      uniqueItems: true,
    }),
    valid_until: Type.String({ format: 'date-time' }),
  }),
  { additionalProperties: false, minProperties: 1 },
);
export const RevokeRelationshipSchema = Type.Object(
  { reason_code: Type.String({ pattern: '^[a-z][a-z0-9_.-]{2,63}$' }) },
  { additionalProperties: false },
);
export const CreateEmergencyContactSchema = Type.Object(
  {
    display_name: Type.String({ minLength: 2, maxLength: 120 }),
    phone_e164: Type.String({ pattern: '^\\+[1-9][0-9]{7,14}$' }),
    preferred_locale: Type.Union([Type.Literal('ar-EG'), Type.Literal('en-EG')]),
    location_precision: LocationPrecisionSchema,
  },
  { additionalProperties: false },
);
export const RespondEmergencyContactSchema = Type.Object(
  {
    token: Type.String({ minLength: 32, maxLength: 512 }),
    decision: Type.Union([Type.Literal('confirmed'), Type.Literal('declined')]),
  },
  { additionalProperties: false },
);

export type PermissionCode = Static<typeof PermissionCodeSchema>;
export type DelegablePermissionCode = Static<typeof DelegablePermissionCodeSchema>;
export type CreateGuardianshipInput = Static<typeof CreateGuardianshipSchema>;
export type GuardianshipDecisionInput = Static<typeof GuardianshipDecisionSchema>;
export type CreateDelegationInput = Static<typeof CreateDelegationSchema>;
export type AcceptDelegationInput = Static<typeof AcceptDelegationSchema>;
export type UpdateDelegationInput = Static<typeof UpdateDelegationSchema>;
export type RevokeRelationshipInput = Static<typeof RevokeRelationshipSchema>;
export type CreateEmergencyContactInput = Static<typeof CreateEmergencyContactSchema>;
export type RespondEmergencyContactInput = Static<typeof RespondEmergencyContactSchema>;
export type FamilyPageQuery = Static<typeof FamilyPageQuerySchema>;
export type DependentTransitionWorklistItem = Static<typeof DependentTransitionWorklistItemSchema>;
export type PatientDependentTransitionSummary = Static<
  typeof PatientDependentTransitionSummarySchema
>;
export interface DependentTransitionWorklistPage {
  items: DependentTransitionWorklistItem[];
  next_cursor: string | null;
}
export interface RelationshipsPageWithTransition {
  items: Readonly<Record<string, unknown>>[];
  next_cursor: string | null;
  dependentTransition: PatientDependentTransitionSummary;
}

export const familyCareRequestSchemas = {
  createGuardianship: CreateGuardianshipSchema,
  reviewGuardianship: GuardianshipDecisionSchema,
  createDelegation: CreateDelegationSchema,
  acceptDelegation: AcceptDelegationSchema,
  updateDelegation: UpdateDelegationSchema,
  revokeRelationship: RevokeRelationshipSchema,
  createEmergencyContact: CreateEmergencyContactSchema,
  respondEmergencyContact: RespondEmergencyContactSchema,
  revokeEmergencyContact: RevokeRelationshipSchema,
} as const;
