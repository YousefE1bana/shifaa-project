import { Type, type Static } from '@sinclair/typebox';

export const PRIVACY_DSR_NOTIFICATIONS_FEATURE_ID = '005-privacy-dsr-notifications' as const;
export const privacyDsrNotificationRequirementIds = [
  'FR-AUTH-007',
  'FR-AUTH-008',
  'FR-ADMIN-002',
  'FR-ADMIN-004',
  'FR-NOTIF-001',
  'FR-NOTIF-002',
] as const;
export const privacyDsrNotificationOperationIds = [
  'createDsr',
  'listMyDsrs',
  'getDsr',
  'downloadDsrExport',
  'listAdminDsrs',
  'decideDsr',
  'fulfilDsr',
  'listNotificationTemplates',
  'createNotificationTemplateRelease',
  'publishNotificationTemplateRelease',
  'smsProviderCallback',
  'replayDeadLetter',
] as const;
export type PrivacyDsrNotificationOperationId = (typeof privacyDsrNotificationOperationIds)[number];

export const privacyDsrNotificationOperations = {
  createDsr: ['POST', '/privacy/requests'],
  listMyDsrs: ['GET', '/privacy/requests'],
  getDsr: ['GET', '/privacy/requests/{requestId}'],
  downloadDsrExport: ['POST', '/privacy/requests/{requestId}/download-link'],
  listAdminDsrs: ['GET', '/admin/privacy/requests'],
  decideDsr: ['POST', '/admin/privacy/requests/{requestId}/decision'],
  fulfilDsr: ['POST', '/admin/privacy/requests/{requestId}/fulfilment'],
  listNotificationTemplates: ['GET', '/admin/notification-templates'],
  createNotificationTemplateRelease: [
    'POST',
    '/admin/notification-templates/{templateCode}/releases',
  ],
  publishNotificationTemplateRelease: [
    'POST',
    '/admin/notification-templates/releases/{releaseId}/publish',
  ],
  smsProviderCallback: ['POST', '/internal/callbacks/messages/{provider}'],
  replayDeadLetter: ['POST', '/internal/outbox/dead-letters/{eventId}/replay'],
} as const satisfies Record<PrivacyDsrNotificationOperationId, readonly ['GET' | 'POST', string]>;

export const DsrTypeSchema = Type.Union([
  Type.Literal('access_export'),
  Type.Literal('correction'),
  Type.Literal('restriction'),
  Type.Literal('erasure_pseudonymization'),
]);
export const DsrStatusSchema = Type.Union([
  Type.Literal('submitted'),
  Type.Literal('identity_verification_required'),
  Type.Literal('under_review'),
  Type.Literal('approved'),
  Type.Literal('partially_approved'),
  Type.Literal('refused'),
  Type.Literal('fulfilled'),
  Type.Literal('cancelled'),
]);
export const ReasonCodeSchema = Type.String({ pattern: '^[a-z][a-z0-9_.-]{2,63}$' });
const ClosedCodeArray = (maximum: number) =>
  Type.Array(Type.String({ pattern: '^[a-z][a-z0-9_.-]{1,63}$' }), {
    maxItems: maximum,
    uniqueItems: true,
  });
export const DsrScopeSchema = Type.Object(
  {
    data_category_codes: Type.Array(Type.String({ pattern: '^[a-z][a-z0-9_.-]{1,63}$' }), {
      minItems: 1,
      maxItems: 32,
      uniqueItems: true,
    }),
    record_reference_codes: Type.Optional(
      Type.Array(Type.String({ maxLength: 128 }), { maxItems: 50, uniqueItems: true }),
    ),
    correction_codes: Type.Optional(ClosedCodeArray(20)),
  },
  { additionalProperties: false },
);
export const CreateDsrSchema = Type.Object(
  {
    managed_patient_id: Type.Optional(Type.String({ format: 'uuid' })),
    request_type: DsrTypeSchema,
    scope: DsrScopeSchema,
    contact_preference: Type.Union([Type.Literal('in_app'), Type.Literal('sms')]),
  },
  { additionalProperties: false },
);
export const DownloadDsrExportSchema = Type.Object(
  { capability_token: Type.String({ minLength: 32, maxLength: 512 }) },
  { additionalProperties: false },
);
export const DsrDecisionSchema = Type.Object(
  {
    decision: Type.Union([
      Type.Literal('approve'),
      Type.Literal('partially_approve'),
      Type.Literal('refuse'),
    ]),
    reason_code: ReasonCodeSchema,
    reason_summary: Type.Optional(Type.String({ minLength: 3, maxLength: 500 })),
    included_scope: Type.Optional(Type.Union([DsrScopeSchema, Type.Null()])),
    excluded_scope: Type.Optional(Type.Union([DsrScopeSchema, Type.Null()])),
    evidence_object_id: Type.String({ format: 'uuid' }),
  },
  { additionalProperties: false },
);
export const DsrFulfilmentSchema = Type.Object(
  {
    action_codes: Type.Array(Type.String({ pattern: '^[a-z][a-z0-9_.-]{2,63}$' }), {
      minItems: 1,
      maxItems: 20,
      uniqueItems: true,
    }),
    action_summary: Type.String({ minLength: 3, maxLength: 500 }),
    evidence_object_id: Type.String({ format: 'uuid' }),
    subject_notice_code: Type.String({ pattern: '^[A-Z][A-Z0-9_]{2,63}$' }),
  },
  { additionalProperties: false },
);
export const FieldSchemaSchema = Type.Object(
  {
    type: Type.Literal('object'),
    additionalProperties: Type.Literal(false),
    properties: Type.Record(
      Type.String({ maxLength: 64 }),
      Type.Object({}, { additionalProperties: true }),
      {
        maxProperties: 16,
      },
    ),
    required: Type.Array(Type.String({ maxLength: 64 }), { maxItems: 16, uniqueItems: true }),
  },
  { additionalProperties: false },
);
export const CreateNotificationTemplateReleaseSchema = Type.Object(
  {
    channel: Type.Literal('sms'),
    arabic_body: Type.String({ minLength: 1, maxLength: 500 }),
    english_body: Type.String({ minLength: 1, maxLength: 500 }),
    allowed_recipient_types: Type.Array(Type.Literal('patient'), {
      minItems: 1,
      uniqueItems: true,
    }),
    allowed_field_schema: FieldSchemaSchema,
    content_digest: Type.String({ pattern: '^[a-f0-9]{64}$' }),
  },
  { additionalProperties: false },
);
export const PublishNotificationTemplateReleaseSchema = Type.Object(
  {
    approval_digest: Type.String({ pattern: '^[a-f0-9]{64}$' }),
    effective_at: Type.String({ format: 'date-time' }),
  },
  { additionalProperties: false },
);
export const SmsProviderCallbackSchema = Type.Object(
  {
    event_reference: Type.String({ minLength: 8, maxLength: 128 }),
    receipt_reference: Type.String({ minLength: 8, maxLength: 128 }),
    delivery_status: Type.Union([
      Type.Literal('accepted'),
      Type.Literal('delivered'),
      Type.Literal('failed'),
    ]),
    occurred_at: Type.String({ format: 'date-time' }),
    nonce: Type.String({ minLength: 16, maxLength: 128 }),
  },
  { additionalProperties: false },
);
export const ReplayDeadLetterSchema = Type.Object(
  { reason_code: ReasonCodeSchema },
  { additionalProperties: false },
);

export type DsrType = Static<typeof DsrTypeSchema>;
export type DsrStatus = Static<typeof DsrStatusSchema>;
export type DsrScopeInput = Static<typeof DsrScopeSchema>;
export type CreateDsrInput = Static<typeof CreateDsrSchema>;
export type DownloadDsrExportInput = Static<typeof DownloadDsrExportSchema>;
export type DsrDecisionInput = Static<typeof DsrDecisionSchema>;
export type DsrFulfilmentInput = Static<typeof DsrFulfilmentSchema>;
export type CreateNotificationTemplateReleaseInput = Static<
  typeof CreateNotificationTemplateReleaseSchema
>;
export type PublishNotificationTemplateReleaseInput = Static<
  typeof PublishNotificationTemplateReleaseSchema
>;
export type SmsProviderCallbackInput = Static<typeof SmsProviderCallbackSchema>;
export type ReplayDeadLetterInput = Static<typeof ReplayDeadLetterSchema>;

export const privacyDsrNotificationRequestSchemas = {
  createDsr: CreateDsrSchema,
  downloadDsrExport: DownloadDsrExportSchema,
  decideDsr: DsrDecisionSchema,
  fulfilDsr: DsrFulfilmentSchema,
  createNotificationTemplateRelease: CreateNotificationTemplateReleaseSchema,
  publishNotificationTemplateRelease: PublishNotificationTemplateReleaseSchema,
  smsProviderCallback: SmsProviderCallbackSchema,
  replayDeadLetter: ReplayDeadLetterSchema,
} as const;
