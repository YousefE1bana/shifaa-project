// @generated from specs/010-encounters-referrals-contextual-chat/contracts/openapi.yaml — DO NOT EDIT.

import { FormatRegistry, Type, type Static } from '@sinclair/typebox';

if (!FormatRegistry.Has('uuid')) {
  FormatRegistry.Set('uuid', (formatValue) =>
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(formatValue),
  );
}
if (!FormatRegistry.Has('date-time')) {
  FormatRegistry.Set('date-time', (formatValue) => Number.isFinite(Date.parse(formatValue)));
}
if (!FormatRegistry.Has('date')) {
  FormatRegistry.Set('date', (formatValue) => /^\d{4}-\d{2}-\d{2}$/.test(formatValue));
}
if (!FormatRegistry.Has('uri-reference')) {
  FormatRegistry.Set('uri-reference', (formatValue) => !/\s/.test(formatValue));
}

export const feature010Operations = [
  {
    operationId: 'createEncounter',
    method: 'POST',
    path: '/encounters',
    requestSchema: 'CreateEncounterRequest',
    responseSchema: 'EncounterStartResult',
    pathParameters: [],
    queryParameters: [],
    headerParameters: [
      {
        name: 'Accept-Language',
        required: false,
        schema: {
          type: 'string',
          enum: ['ar-EG', 'en-EG'],
          default: 'ar-EG',
        },
      },
      {
        name: 'X-Request-Id',
        required: false,
        schema: {
          $ref: '#/components/schemas/Uuid',
        },
      },
      {
        name: 'Idempotency-Key',
        required: true,
        schema: {
          type: 'string',
          minLength: 16,
          maxLength: 128,
        },
      },
    ],
  },
  {
    operationId: 'getEncounter',
    method: 'GET',
    path: '/encounters/{encounterId}',
    responseSchema: 'EncounterProjection',
    pathParameters: [
      {
        name: 'encounterId',
        required: true,
        schema: {
          $ref: '#/components/schemas/Uuid',
        },
      },
    ],
    queryParameters: [
      {
        name: 'fields',
        required: false,
        schema: {
          type: 'array',
          uniqueItems: true,
          items: {
            type: 'string',
            enum: ['notes', 'conditions', 'observations', 'orders', 'participants'],
          },
        },
      },
    ],
    headerParameters: [
      {
        name: 'Accept-Language',
        required: false,
        schema: {
          type: 'string',
          enum: ['ar-EG', 'en-EG'],
          default: 'ar-EG',
        },
      },
      {
        name: 'X-Request-Id',
        required: false,
        schema: {
          $ref: '#/components/schemas/Uuid',
        },
      },
    ],
  },
  {
    operationId: 'updateEncounter',
    method: 'PATCH',
    path: '/encounters/{encounterId}',
    requestSchema: 'UpdateEncounterRequest',
    responseSchema: 'EncounterProjection',
    pathParameters: [
      {
        name: 'encounterId',
        required: true,
        schema: {
          $ref: '#/components/schemas/Uuid',
        },
      },
    ],
    queryParameters: [],
    headerParameters: [
      {
        name: 'Accept-Language',
        required: false,
        schema: {
          type: 'string',
          enum: ['ar-EG', 'en-EG'],
          default: 'ar-EG',
        },
      },
      {
        name: 'X-Request-Id',
        required: false,
        schema: {
          $ref: '#/components/schemas/Uuid',
        },
      },
      {
        name: 'Idempotency-Key',
        required: true,
        schema: {
          type: 'string',
          minLength: 16,
          maxLength: 128,
        },
      },
      {
        name: 'If-Match',
        required: true,
        schema: {
          type: 'string',
          pattern: '^"[1-9][0-9]*"$',
        },
      },
    ],
  },
  {
    operationId: 'signEncounterNote',
    method: 'POST',
    path: '/encounters/{encounterId}/notes',
    requestSchema: 'SignEncounterNoteRequest',
    responseSchema: 'CareTeamNoteProjection',
    pathParameters: [
      {
        name: 'encounterId',
        required: true,
        schema: {
          $ref: '#/components/schemas/Uuid',
        },
      },
    ],
    queryParameters: [],
    headerParameters: [
      {
        name: 'Accept-Language',
        required: false,
        schema: {
          type: 'string',
          enum: ['ar-EG', 'en-EG'],
          default: 'ar-EG',
        },
      },
      {
        name: 'X-Request-Id',
        required: false,
        schema: {
          $ref: '#/components/schemas/Uuid',
        },
      },
      {
        name: 'Idempotency-Key',
        required: true,
        schema: {
          type: 'string',
          minLength: 16,
          maxLength: 128,
        },
      },
    ],
  },
  {
    operationId: 'completeEncounter',
    method: 'POST',
    path: '/encounters/{encounterId}/complete',
    requestSchema: 'CompleteEncounterRequest',
    responseSchema: 'EncounterCompleteResult',
    pathParameters: [
      {
        name: 'encounterId',
        required: true,
        schema: {
          $ref: '#/components/schemas/Uuid',
        },
      },
    ],
    queryParameters: [],
    headerParameters: [
      {
        name: 'Accept-Language',
        required: false,
        schema: {
          type: 'string',
          enum: ['ar-EG', 'en-EG'],
          default: 'ar-EG',
        },
      },
      {
        name: 'X-Request-Id',
        required: false,
        schema: {
          $ref: '#/components/schemas/Uuid',
        },
      },
      {
        name: 'Idempotency-Key',
        required: true,
        schema: {
          type: 'string',
          minLength: 16,
          maxLength: 128,
        },
      },
      {
        name: 'If-Match',
        required: true,
        schema: {
          type: 'string',
          pattern: '^"[1-9][0-9]*"$',
        },
      },
    ],
  },
  {
    operationId: 'createReferral',
    method: 'POST',
    path: '/encounters/{encounterId}/referrals',
    requestSchema: 'CreateReferralRequest',
    responseSchema: 'PendingSourceReferralProjection',
    pathParameters: [
      {
        name: 'encounterId',
        required: true,
        schema: {
          $ref: '#/components/schemas/Uuid',
        },
      },
    ],
    queryParameters: [],
    headerParameters: [
      {
        name: 'Accept-Language',
        required: false,
        schema: {
          type: 'string',
          enum: ['ar-EG', 'en-EG'],
          default: 'ar-EG',
        },
      },
      {
        name: 'X-Request-Id',
        required: false,
        schema: {
          $ref: '#/components/schemas/Uuid',
        },
      },
      {
        name: 'Idempotency-Key',
        required: true,
        schema: {
          type: 'string',
          minLength: 16,
          maxLength: 128,
        },
      },
    ],
  },
  {
    operationId: 'listReferrals',
    method: 'GET',
    path: '/referrals',
    responseSchema: 'ReferralPage',
    pathParameters: [],
    queryParameters: [
      {
        name: 'cursor',
        required: false,
        schema: {
          type: 'string',
          maxLength: 512,
        },
      },
      {
        name: 'limit',
        required: false,
        schema: {
          type: 'integer',
          minimum: 1,
          maximum: 100,
          default: 25,
        },
      },
      {
        name: 'patientId',
        required: false,
        schema: {
          $ref: '#/components/schemas/Uuid',
        },
      },
      {
        name: 'facilityId',
        required: false,
        schema: {
          $ref: '#/components/schemas/Uuid',
        },
      },
      {
        name: 'specialty',
        required: false,
        schema: {
          type: 'string',
          minLength: 1,
          maxLength: 120,
        },
      },
      {
        name: 'status',
        required: false,
        schema: {
          $ref: '#/components/schemas/ReferralStatus',
        },
      },
      {
        name: 'date',
        required: false,
        schema: {
          type: 'string',
          format: 'date',
        },
      },
    ],
    headerParameters: [
      {
        name: 'Accept-Language',
        required: false,
        schema: {
          type: 'string',
          enum: ['ar-EG', 'en-EG'],
          default: 'ar-EG',
        },
      },
      {
        name: 'X-Request-Id',
        required: false,
        schema: {
          $ref: '#/components/schemas/Uuid',
        },
      },
    ],
  },
  {
    operationId: 'acceptReferral',
    method: 'POST',
    path: '/referrals/{referralId}/accept',
    requestSchema: 'AcceptReferralRequest',
    responseSchema: 'ReferralAcceptanceResult',
    pathParameters: [
      {
        name: 'referralId',
        required: true,
        schema: {
          $ref: '#/components/schemas/Uuid',
        },
      },
    ],
    queryParameters: [],
    headerParameters: [
      {
        name: 'Accept-Language',
        required: false,
        schema: {
          type: 'string',
          enum: ['ar-EG', 'en-EG'],
          default: 'ar-EG',
        },
      },
      {
        name: 'X-Request-Id',
        required: false,
        schema: {
          $ref: '#/components/schemas/Uuid',
        },
      },
      {
        name: 'Idempotency-Key',
        required: true,
        schema: {
          type: 'string',
          minLength: 16,
          maxLength: 128,
        },
      },
      {
        name: 'If-Match',
        required: true,
        schema: {
          type: 'string',
          pattern: '^"[1-9][0-9]*"$',
        },
      },
    ],
  },
  {
    operationId: 'listContextMessages',
    method: 'GET',
    path: '/contexts/{contextType}/{contextId}/messages',
    responseSchema: 'MessagePage',
    pathParameters: [
      {
        name: 'contextType',
        required: true,
        schema: {
          type: 'string',
          const: 'appointment',
        },
      },
      {
        name: 'contextId',
        required: true,
        schema: {
          $ref: '#/components/schemas/Uuid',
        },
      },
    ],
    queryParameters: [
      {
        name: 'cursor',
        required: false,
        schema: {
          type: 'string',
          maxLength: 512,
        },
      },
      {
        name: 'limit',
        required: false,
        schema: {
          type: 'integer',
          minimum: 1,
          maximum: 100,
          default: 25,
        },
      },
    ],
    headerParameters: [
      {
        name: 'Accept-Language',
        required: false,
        schema: {
          type: 'string',
          enum: ['ar-EG', 'en-EG'],
          default: 'ar-EG',
        },
      },
      {
        name: 'X-Request-Id',
        required: false,
        schema: {
          $ref: '#/components/schemas/Uuid',
        },
      },
    ],
  },
  {
    operationId: 'sendContextMessage',
    method: 'POST',
    path: '/contexts/{contextType}/{contextId}/messages',
    requestSchema: 'SendContextMessageRequest',
    responseSchema: 'MessageProjection',
    pathParameters: [
      {
        name: 'contextType',
        required: true,
        schema: {
          type: 'string',
          const: 'appointment',
        },
      },
      {
        name: 'contextId',
        required: true,
        schema: {
          $ref: '#/components/schemas/Uuid',
        },
      },
    ],
    queryParameters: [],
    headerParameters: [
      {
        name: 'Accept-Language',
        required: false,
        schema: {
          type: 'string',
          enum: ['ar-EG', 'en-EG'],
          default: 'ar-EG',
        },
      },
      {
        name: 'X-Request-Id',
        required: false,
        schema: {
          $ref: '#/components/schemas/Uuid',
        },
      },
      {
        name: 'Idempotency-Key',
        required: true,
        schema: {
          type: 'string',
          minLength: 16,
          maxLength: 128,
        },
      },
    ],
  },
] as const;
export type Feature010OperationId = (typeof feature010Operations)[number]['operationId'];

export const Feature010UuidSchema = Type.String({ format: 'uuid' });
export const Feature010VersionSchema = Type.Integer({ minimum: 1 });
export const EncounterStatusSchema = Type.Union([Type.Literal('open'), Type.Literal('completed')]);
export const ReferralStatusSchema = Type.Union([Type.Literal('pending'), Type.Literal('accepted')]);
export const NoteVisibilitySchema = Type.Union([
  Type.Literal('private'),
  Type.Literal('patient_visible'),
]);
export const AcceptedFieldCodesSchema = Type.Union([
  Type.Tuple([Type.Literal('reason_summary')]),
  Type.Tuple([Type.Literal('reason_summary'), Type.Literal('encounter_type')]),
]);
export const ParticipantIntervalEndSchema = Type.Object(
  {
    personId: Feature010UuidSchema,
    roleCode: Type.String({ minLength: 1, maxLength: 80 }),
    startedAt: Type.String({ format: 'date-time' }),
  },
  { additionalProperties: false },
);
export const CreateEncounterRequestSchema = Type.Object(
  {
    appointmentId: Feature010UuidSchema,
    patientId: Feature010UuidSchema,
    encounterType: Type.String({ minLength: 1, maxLength: 120 }),
  },
  { additionalProperties: false },
);
export const UpdateEncounterRequestSchema = Type.Object(
  {
    conditionIds: Type.Optional(Type.Array(Feature010UuidSchema, { uniqueItems: true })),
    observationIds: Type.Optional(Type.Array(Feature010UuidSchema, { uniqueItems: true })),
    orderIds: Type.Optional(Type.Array(Feature010UuidSchema, { uniqueItems: true })),
    participantIntervalsEnd: Type.Optional(
      Type.Array(ParticipantIntervalEndSchema, { minItems: 1, uniqueItems: true }),
    ),
  },
  { additionalProperties: false, minProperties: 1 },
);
export const SignEncounterNoteRequestSchema = Type.Object(
  {
    noteType: Type.String({ minLength: 1, maxLength: 120 }),
    body: Type.String({ minLength: 1 }),
    visibility: NoteVisibilitySchema,
    supersedesId: Type.Optional(Feature010UuidSchema),
  },
  { additionalProperties: false },
);
export const CompleteEncounterRequestSchema = Type.Object(
  { summary: Type.String({ minLength: 1 }), structuralConfirmation: Type.Literal(true) },
  { additionalProperties: false },
);
export const CreateReferralRequestSchema = Type.Object(
  {
    targetSpecialty: Type.String({ minLength: 1, maxLength: 120 }),
    targetFacilityId: Type.Optional(Feature010UuidSchema),
    targetDoctorId: Type.Optional(Feature010UuidSchema),
    reasonSummary: Type.String({ minLength: 1 }),
    encounterType: Type.Optional(Type.String({})),
  },
  { additionalProperties: false },
);
export const TargetSlotSchema = Type.Object(
  {
    facilityId: Feature010UuidSchema,
    doctorId: Feature010UuidSchema,
    startsAt: Type.String({ format: 'date-time' }),
    endsAt: Type.String({ format: 'date-time' }),
    timezone: Type.String({ minLength: 1 }),
    civilDate: Type.String({ format: 'date' }),
    availabilityVersion: Feature010VersionSchema,
  },
  { additionalProperties: false },
);
export const AcceptReferralRequestSchema = Type.Object(
  { authorizedFieldCodes: AcceptedFieldCodesSchema, targetSlot: TargetSlotSchema },
  { additionalProperties: false },
);
export const SendContextMessageRequestSchema = Type.Object(
  { body: Type.String({ minLength: 1 }) },
  { additionalProperties: false },
);
export const CareTeamNoteProjectionSchema = Type.Object(
  {
    id: Feature010UuidSchema,
    encounterId: Feature010UuidSchema,
    authorId: Feature010UuidSchema,
    noteType: Type.String({}),
    visibility: NoteVisibilitySchema,
    signedAt: Type.String({ format: 'date-time' }),
    supersedesId: Type.Optional(Feature010UuidSchema),
    body: Type.String({}),
  },
  { additionalProperties: false },
);
export const SubjectNoteProjectionSchema = Type.Object(
  {
    id: Feature010UuidSchema,
    encounterId: Feature010UuidSchema,
    authorId: Feature010UuidSchema,
    noteType: Type.String({}),
    visibility: Type.Literal('patient_visible'),
    signedAt: Type.String({ format: 'date-time' }),
    supersedesId: Type.Optional(Feature010UuidSchema),
    body: Type.String({}),
  },
  { additionalProperties: false },
);
export const ParticipantProjectionSchema = Type.Object(
  {
    personId: Feature010UuidSchema,
    roleCode: Type.String({}),
    startedAt: Type.String({ format: 'date-time' }),
    endedAt: Type.Optional(Type.String({ format: 'date-time' })),
  },
  { additionalProperties: false },
);
export const CareTeamEncounterProjectionSchema = Type.Object(
  {
    id: Feature010UuidSchema,
    patientId: Feature010UuidSchema,
    facilityId: Feature010UuidSchema,
    appointmentId: Feature010UuidSchema,
    encounterType: Type.String({}),
    responsibleClinicianId: Feature010UuidSchema,
    status: EncounterStatusSchema,
    startedAt: Type.String({ format: 'date-time' }),
    endedAt: Type.Optional(Type.String({ format: 'date-time' })),
    completionSummary: Type.Optional(Type.String({})),
    version: Feature010VersionSchema,
    conditionIds: Type.Optional(Type.Array(Feature010UuidSchema)),
    observationIds: Type.Optional(Type.Array(Feature010UuidSchema)),
    orderIds: Type.Optional(Type.Array(Feature010UuidSchema)),
    notes: Type.Optional(Type.Array(CareTeamNoteProjectionSchema)),
    participants: Type.Optional(Type.Array(ParticipantProjectionSchema)),
  },
  { additionalProperties: false },
);
export const SubjectEncounterProjectionSchema = Type.Object(
  {
    id: Feature010UuidSchema,
    patientId: Feature010UuidSchema,
    facilityId: Feature010UuidSchema,
    appointmentId: Feature010UuidSchema,
    encounterType: Type.String({}),
    responsibleClinicianId: Feature010UuidSchema,
    status: EncounterStatusSchema,
    startedAt: Type.String({ format: 'date-time' }),
    endedAt: Type.Optional(Type.String({ format: 'date-time' })),
    completionSummary: Type.Optional(Type.String({})),
    version: Feature010VersionSchema,
    conditionIds: Type.Optional(Type.Array(Feature010UuidSchema)),
    observationIds: Type.Optional(Type.Array(Feature010UuidSchema)),
    orderIds: Type.Optional(Type.Array(Feature010UuidSchema)),
    notes: Type.Optional(Type.Array(SubjectNoteProjectionSchema)),
    participants: Type.Optional(Type.Array(ParticipantProjectionSchema)),
  },
  { additionalProperties: false },
);
export const EncounterProjectionSchema = Type.Union([
  CareTeamEncounterProjectionSchema,
  SubjectEncounterProjectionSchema,
]);
export const EncounterStartResultSchema = Type.Object(
  {
    encounter: CareTeamEncounterProjectionSchema,
    appointmentStatus: Type.Literal('in_consultation'),
    queueStatus: Type.Literal('in_service'),
    queueEntryId: Feature010UuidSchema,
  },
  { additionalProperties: false },
);
export const EncounterCompleteResultSchema = Type.Object(
  {
    encounter: CareTeamEncounterProjectionSchema,
    appointmentId: Feature010UuidSchema,
    appointmentVersion: Feature010VersionSchema,
    appointmentStatus: Type.Literal('completed'),
    queueStatus: Type.Literal('completed'),
    queueEntryId: Feature010UuidSchema,
    queueVersion: Feature010VersionSchema,
    completedAt: Type.String({ format: 'date-time' }),
  },
  { additionalProperties: false },
);
export const PendingSourceReferralProjectionSchema = Type.Object(
  {
    id: Feature010UuidSchema,
    sourceEncounterId: Feature010UuidSchema,
    status: Type.Literal('pending'),
    version: Feature010VersionSchema,
    targetSpecialty: Type.String({}),
    targetFacilityId: Type.Optional(Feature010UuidSchema),
    targetDoctorId: Type.Optional(Feature010UuidSchema),
    reasonSummary: Type.String({}),
    encounterType: Type.Optional(Type.String({})),
  },
  { additionalProperties: false },
);
export const PendingSubjectReferralProjectionSchema = Type.Object(
  {
    id: Feature010UuidSchema,
    sourceEncounterId: Feature010UuidSchema,
    status: Type.Literal('pending'),
    version: Feature010VersionSchema,
    targetSpecialty: Type.String({}),
    targetFacilityId: Type.Optional(Feature010UuidSchema),
    targetDoctorId: Type.Optional(Feature010UuidSchema),
    reasonSummary: Type.String({}),
    encounterType: Type.Optional(Type.String({})),
  },
  { additionalProperties: false },
);
export const AcceptedSourceReferralProjectionSchema = Type.Object(
  {
    id: Feature010UuidSchema,
    sourceEncounterId: Feature010UuidSchema,
    status: Type.Literal('accepted'),
    version: Feature010VersionSchema,
    targetSpecialty: Type.String({}),
    targetFacilityId: Type.Optional(Feature010UuidSchema),
    targetDoctorId: Type.Optional(Feature010UuidSchema),
    reasonSummary: Type.String({}),
    encounterType: Type.Optional(Type.String({})),
    acceptedFieldCodes: AcceptedFieldCodesSchema,
    resultingAppointmentId: Feature010UuidSchema,
  },
  { additionalProperties: false },
);
export const AcceptedSubjectReferralProjectionSchema = Type.Object(
  {
    id: Feature010UuidSchema,
    sourceEncounterId: Feature010UuidSchema,
    status: Type.Literal('accepted'),
    version: Feature010VersionSchema,
    targetSpecialty: Type.String({}),
    targetFacilityId: Type.Optional(Feature010UuidSchema),
    targetDoctorId: Type.Optional(Feature010UuidSchema),
    reasonSummary: Type.String({}),
    encounterType: Type.Optional(Type.String({})),
    acceptedFieldCodes: AcceptedFieldCodesSchema,
    resultingAppointmentId: Feature010UuidSchema,
  },
  { additionalProperties: false },
);
export const AcceptedTargetReasonReferralProjectionSchema = Type.Object(
  {
    id: Feature010UuidSchema,
    status: Type.Literal('accepted'),
    version: Feature010VersionSchema,
    acceptedFieldCodes: Type.Tuple([Type.Literal('reason_summary')]),
    resultingAppointmentId: Feature010UuidSchema,
    reasonSummary: Type.String({}),
  },
  { additionalProperties: false },
);
export const AcceptedTargetReasonAndTypeReferralProjectionSchema = Type.Object(
  {
    id: Feature010UuidSchema,
    status: Type.Literal('accepted'),
    version: Feature010VersionSchema,
    acceptedFieldCodes: Type.Tuple([
      Type.Literal('reason_summary'),
      Type.Literal('encounter_type'),
    ]),
    resultingAppointmentId: Feature010UuidSchema,
    reasonSummary: Type.String({}),
    encounterType: Type.String({}),
  },
  { additionalProperties: false },
);
export const ReferralProjectionSchema = Type.Union([
  PendingSourceReferralProjectionSchema,
  PendingSubjectReferralProjectionSchema,
  AcceptedSourceReferralProjectionSchema,
  AcceptedSubjectReferralProjectionSchema,
  AcceptedTargetReasonReferralProjectionSchema,
  AcceptedTargetReasonAndTypeReferralProjectionSchema,
]);
export const Feature010PageMetaSchema = Type.Object(
  {
    nextCursor: Type.Union([Type.String({}), Type.Null()]),
    lastUpdatedAt: Type.String({ format: 'date-time' }),
    stale: Type.Boolean(),
  },
  { additionalProperties: false },
);
export const ReferralPageSchema = Type.Object(
  { data: Type.Array(ReferralProjectionSchema), meta: Feature010PageMetaSchema },
  { additionalProperties: false },
);
export const BookedAppointmentSchema = Type.Object(
  {
    id: Feature010UuidSchema,
    sourceReferralId: Feature010UuidSchema,
    status: Type.Literal('confirmed'),
    facilityId: Feature010UuidSchema,
    doctorId: Feature010UuidSchema,
    startsAt: Type.String({ format: 'date-time' }),
    endsAt: Type.String({ format: 'date-time' }),
    feeMinorUnits: Type.Integer({ minimum: 0 }),
    currency: Type.Literal('EGP'),
    paymentMethod: Type.Literal('cash_on_arrival'),
    version: Feature010VersionSchema,
  },
  { additionalProperties: false },
);
export const ReferralAcceptanceResultSchema = Type.Object(
  { referral: AcceptedSubjectReferralProjectionSchema, appointment: BookedAppointmentSchema },
  { additionalProperties: false },
);
export const MessageProjectionSchema = Type.Object(
  {
    id: Feature010UuidSchema,
    contextType: Type.Literal('appointment'),
    contextId: Feature010UuidSchema,
    senderId: Feature010UuidSchema,
    body: Type.String({}),
    sentAt: Type.String({ format: 'date-time' }),
  },
  { additionalProperties: false },
);
export const MessagePageSchema = Type.Object(
  { data: Type.Array(MessageProjectionSchema), meta: Feature010PageMetaSchema },
  { additionalProperties: false },
);
export const Feature010ProblemSchema = Type.Object(
  {
    type: Type.String({ format: 'uri-reference' }),
    title: Type.String({}),
    status: Type.Integer({ minimum: 400, maximum: 599 }),
    detail: Type.String({}),
    instance: Type.String({ format: 'uri-reference' }),
    code: Type.String({}),
    request_id: Feature010UuidSchema,
    errors: Type.Optional(
      Type.Array(
        Type.Object(
          { pointer: Type.String({}), code: Type.String({}) },
          { additionalProperties: false },
        ),
      ),
    ),
    retry_after_seconds: Type.Optional(Type.Integer({ minimum: 0 })),
  },
  { additionalProperties: false },
);

export const GetEncounterQuerySchema = Type.Object(
  {
    fields: Type.Optional(
      Type.Array(
        Type.Union([
          Type.Literal('notes'),
          Type.Literal('conditions'),
          Type.Literal('observations'),
          Type.Literal('orders'),
          Type.Literal('participants'),
        ]),
        { uniqueItems: true },
      ),
    ),
  },
  { additionalProperties: false },
);
export const ListReferralsQuerySchema = Type.Object(
  {
    cursor: Type.Optional(Type.String({ maxLength: 512 })),
    limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 100, default: 25 })),
    patientId: Type.Optional(Feature010UuidSchema),
    facilityId: Type.Optional(Feature010UuidSchema),
    specialty: Type.Optional(Type.String({ minLength: 1, maxLength: 120 })),
    status: Type.Optional(ReferralStatusSchema),
    date: Type.Optional(Type.String({ format: 'date' })),
  },
  { additionalProperties: false },
);
export const ListContextMessagesQuerySchema = Type.Object(
  {
    cursor: Type.Optional(Type.String({ maxLength: 512 })),
    limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 100, default: 25 })),
  },
  { additionalProperties: false },
);

export const feature010Schemas = {
  Uuid: Feature010UuidSchema,
  Version: Feature010VersionSchema,
  EncounterStatus: EncounterStatusSchema,
  ReferralStatus: ReferralStatusSchema,
  NoteVisibility: NoteVisibilitySchema,
  AcceptedFieldCodes: AcceptedFieldCodesSchema,
  ParticipantIntervalEnd: ParticipantIntervalEndSchema,
  CreateEncounterRequest: CreateEncounterRequestSchema,
  UpdateEncounterRequest: UpdateEncounterRequestSchema,
  SignEncounterNoteRequest: SignEncounterNoteRequestSchema,
  CompleteEncounterRequest: CompleteEncounterRequestSchema,
  CreateReferralRequest: CreateReferralRequestSchema,
  TargetSlot: TargetSlotSchema,
  AcceptReferralRequest: AcceptReferralRequestSchema,
  SendContextMessageRequest: SendContextMessageRequestSchema,
  CareTeamNoteProjection: CareTeamNoteProjectionSchema,
  SubjectNoteProjection: SubjectNoteProjectionSchema,
  ParticipantProjection: ParticipantProjectionSchema,
  CareTeamEncounterProjection: CareTeamEncounterProjectionSchema,
  SubjectEncounterProjection: SubjectEncounterProjectionSchema,
  EncounterProjection: EncounterProjectionSchema,
  EncounterStartResult: EncounterStartResultSchema,
  EncounterCompleteResult: EncounterCompleteResultSchema,
  PendingSourceReferralProjection: PendingSourceReferralProjectionSchema,
  PendingSubjectReferralProjection: PendingSubjectReferralProjectionSchema,
  AcceptedSourceReferralProjection: AcceptedSourceReferralProjectionSchema,
  AcceptedSubjectReferralProjection: AcceptedSubjectReferralProjectionSchema,
  AcceptedTargetReasonReferralProjection: AcceptedTargetReasonReferralProjectionSchema,
  AcceptedTargetReasonAndTypeReferralProjection:
    AcceptedTargetReasonAndTypeReferralProjectionSchema,
  ReferralProjection: ReferralProjectionSchema,
  PageMeta: Feature010PageMetaSchema,
  ReferralPage: ReferralPageSchema,
  BookedAppointment: BookedAppointmentSchema,
  ReferralAcceptanceResult: ReferralAcceptanceResultSchema,
  MessageProjection: MessageProjectionSchema,
  MessagePage: MessagePageSchema,
  Problem: Feature010ProblemSchema,
  getEncounterQuery: GetEncounterQuerySchema,
  listReferralsQuery: ListReferralsQuerySchema,
  listContextMessagesQuery: ListContextMessagesQuerySchema,
} as const;

export const feature010QuerySchemas = {
  getEncounter: GetEncounterQuerySchema,
  listReferrals: ListReferralsQuerySchema,
  listContextMessages: ListContextMessagesQuerySchema,
} as const;

export const feature010RequestSchemas = {
  createEncounter: CreateEncounterRequestSchema,
  updateEncounter: UpdateEncounterRequestSchema,
  signEncounterNote: SignEncounterNoteRequestSchema,
  completeEncounter: CompleteEncounterRequestSchema,
  createReferral: CreateReferralRequestSchema,
  acceptReferral: AcceptReferralRequestSchema,
  sendContextMessage: SendContextMessageRequestSchema,
} as const;

export const feature010ResponseSchemas = {
  createEncounter: EncounterStartResultSchema,
  getEncounter: EncounterProjectionSchema,
  updateEncounter: EncounterProjectionSchema,
  signEncounterNote: CareTeamNoteProjectionSchema,
  completeEncounter: EncounterCompleteResultSchema,
  createReferral: PendingSourceReferralProjectionSchema,
  listReferrals: ReferralPageSchema,
  acceptReferral: ReferralAcceptanceResultSchema,
  listContextMessages: MessagePageSchema,
  sendContextMessage: MessageProjectionSchema,
} as const;

export type Feature010Uuid = Static<typeof Feature010UuidSchema>;
export type Feature010Version = Static<typeof Feature010VersionSchema>;
export type EncounterStatus = Static<typeof EncounterStatusSchema>;
export type ReferralStatus = Static<typeof ReferralStatusSchema>;
export type NoteVisibility = Static<typeof NoteVisibilitySchema>;
export type AcceptedFieldCodes = Static<typeof AcceptedFieldCodesSchema>;
export type ParticipantIntervalEnd = Static<typeof ParticipantIntervalEndSchema>;
export type CreateEncounterRequest = Static<typeof CreateEncounterRequestSchema>;
export type UpdateEncounterRequest = Static<typeof UpdateEncounterRequestSchema>;
export type SignEncounterNoteRequest = Static<typeof SignEncounterNoteRequestSchema>;
export type CompleteEncounterRequest = Static<typeof CompleteEncounterRequestSchema>;
export type CreateReferralRequest = Static<typeof CreateReferralRequestSchema>;
export type TargetSlot = Static<typeof TargetSlotSchema>;
export type AcceptReferralRequest = Static<typeof AcceptReferralRequestSchema>;
export type SendContextMessageRequest = Static<typeof SendContextMessageRequestSchema>;
export type CareTeamNoteProjection = Static<typeof CareTeamNoteProjectionSchema>;
export type SubjectNoteProjection = Static<typeof SubjectNoteProjectionSchema>;
export type ParticipantProjection = Static<typeof ParticipantProjectionSchema>;
export type CareTeamEncounterProjection = Static<typeof CareTeamEncounterProjectionSchema>;
export type SubjectEncounterProjection = Static<typeof SubjectEncounterProjectionSchema>;
export type EncounterProjection = Static<typeof EncounterProjectionSchema>;
export type EncounterStartResult = Static<typeof EncounterStartResultSchema>;
export type EncounterCompleteResult = Static<typeof EncounterCompleteResultSchema>;
export type PendingSourceReferralProjection = Static<typeof PendingSourceReferralProjectionSchema>;
export type PendingSubjectReferralProjection = Static<
  typeof PendingSubjectReferralProjectionSchema
>;
export type AcceptedSourceReferralProjection = Static<
  typeof AcceptedSourceReferralProjectionSchema
>;
export type AcceptedSubjectReferralProjection = Static<
  typeof AcceptedSubjectReferralProjectionSchema
>;
export type AcceptedTargetReasonReferralProjection = Static<
  typeof AcceptedTargetReasonReferralProjectionSchema
>;
export type AcceptedTargetReasonAndTypeReferralProjection = Static<
  typeof AcceptedTargetReasonAndTypeReferralProjectionSchema
>;
export type ReferralProjection = Static<typeof ReferralProjectionSchema>;
export type Feature010PageMeta = Static<typeof Feature010PageMetaSchema>;
export type ReferralPage = Static<typeof ReferralPageSchema>;
export type BookedAppointment = Static<typeof BookedAppointmentSchema>;
export type ReferralAcceptanceResult = Static<typeof ReferralAcceptanceResultSchema>;
export type MessageProjection = Static<typeof MessageProjectionSchema>;
export type MessagePage = Static<typeof MessagePageSchema>;
export type Feature010Problem = Static<typeof Feature010ProblemSchema>;
export type GetEncounterQuery = Static<typeof GetEncounterQuerySchema>;
export type ListReferralsQuery = Static<typeof ListReferralsQuerySchema>;
export type ListContextMessagesQuery = Static<typeof ListContextMessagesQuerySchema>;
