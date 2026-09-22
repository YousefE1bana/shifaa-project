// @generated from specs/009-clinic-scheduling-appointments-queue/contracts/openapi.yaml — DO NOT EDIT.

import { FormatRegistry, Type, type Static } from '@sinclair/typebox';

if (!FormatRegistry.Has('uuid')) {
  FormatRegistry.Set('uuid', (value) =>
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value),
  );
}
if (!FormatRegistry.Has('date-time')) {
  FormatRegistry.Set('date-time', (value) => Number.isFinite(Date.parse(value)));
}
if (!FormatRegistry.Has('date')) {
  FormatRegistry.Set('date', (value) => /^\d{4}-\d{2}-\d{2}$/.test(value));
}
if (!FormatRegistry.Has('time')) {
  FormatRegistry.Set('time', (value) =>
    /^\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:\d{2})?$/.test(value),
  );
}
if (!FormatRegistry.Has('uri-reference')) {
  FormatRegistry.Set('uri-reference', (value) => !/\s/.test(value));
}

export const clinicSchedulingOperations = [
  {
    operationId: 'searchDoctors',
    method: 'GET',
    path: '/discovery/doctors',
  },
  {
    operationId: 'listDoctorAvailability',
    method: 'GET',
    path: '/clinics/{facilityId}/doctors/{doctorId}/availability',
  },
  {
    operationId: 'createSchedule',
    method: 'POST',
    path: '/clinics/{facilityId}/schedules',
  },
  {
    operationId: 'updateSchedule',
    method: 'PATCH',
    path: '/clinics/{facilityId}/schedules/{scheduleId}',
  },
  {
    operationId: 'createScheduleException',
    method: 'POST',
    path: '/clinics/{facilityId}/schedules/{scheduleId}/exceptions',
  },
  {
    operationId: 'listAppointments',
    method: 'GET',
    path: '/appointments',
  },
  {
    operationId: 'createAppointment',
    method: 'POST',
    path: '/appointments',
  },
  {
    operationId: 'getAppointment',
    method: 'GET',
    path: '/appointments/{appointmentId}',
  },
  {
    operationId: 'cancelAppointment',
    method: 'POST',
    path: '/appointments/{appointmentId}/cancel',
  },
  {
    operationId: 'rescheduleAppointment',
    method: 'POST',
    path: '/appointments/{appointmentId}/reschedule',
  },
  {
    operationId: 'checkInAppointment',
    method: 'POST',
    path: '/appointments/{appointmentId}/check-in',
  },
  {
    operationId: 'getQueue',
    method: 'GET',
    path: '/clinics/{facilityId}/queues',
  },
  {
    operationId: 'getMyQueuePosition',
    method: 'GET',
    path: '/appointments/{appointmentId}/queue-position',
  },
  {
    operationId: 'callQueueEntry',
    method: 'POST',
    path: '/queue-entries/{queueEntryId}/call',
  },
  {
    operationId: 'reorderQueueEntry',
    method: 'POST',
    path: '/queue-entries/{queueEntryId}/reorder',
  },
  {
    operationId: 'completeQueueEntry',
    method: 'POST',
    path: '/queue-entries/{queueEntryId}/complete',
  },
  {
    operationId: 'sendDoctorDelay',
    method: 'POST',
    path: '/clinics/{facilityId}/doctors/{doctorId}/delay',
  },
  {
    operationId: 'declareDoctorAbsence',
    method: 'POST',
    path: '/clinics/{facilityId}/doctors/{doctorId}/absence',
  },
] as const;
export type ClinicSchedulingOperationId =
  (typeof clinicSchedulingOperations)[number]['operationId'];

export const UuidSchema = Type.String({ format: 'uuid' });
export const VersionSchema = Type.Integer({ minimum: 1 });
export const ReadFreshnessSchema = Type.Union([
  Type.Literal('fresh'),
  Type.Literal('stale'),
  Type.Literal('unknown'),
]);
export const CurrencyCodeSchema = Type.Literal('EGP');
export const AppointmentStatusSchema = Type.Union([
  Type.Literal('requested'),
  Type.Literal('confirmed'),
  Type.Literal('checked_in'),
  Type.Literal('in_queue'),
  Type.Literal('in_consultation'),
  Type.Literal('completed'),
  Type.Literal('cancelled'),
  Type.Literal('no_show'),
  Type.Literal('reschedule_required'),
]);
export const QueueStatusSchema = Type.Union([
  Type.Literal('waiting'),
  Type.Literal('called'),
  Type.Literal('in_service'),
  Type.Literal('completed'),
  Type.Literal('removed'),
]);
export const ScheduleStatusSchema = Type.Union([
  Type.Literal('active'),
  Type.Literal('paused'),
  Type.Literal('retired'),
]);
export const ExceptionTypeSchema = Type.Union([
  Type.Literal('blocked'),
  Type.Literal('added'),
  Type.Literal('delay'),
  Type.Literal('absence'),
]);
export const OrdinaryExceptionTypeSchema = Type.Union([
  Type.Literal('blocked'),
  Type.Literal('added'),
]);
export const LocalWindowSchema = Type.Object(
  {
    isoWeekday: Type.Integer({ minimum: 1, maximum: 7 }),
    localStart: Type.String({ format: 'time' }),
    localEnd: Type.String({ format: 'time' }),
  },
  { additionalProperties: false },
);
export const SlotSchema = Type.Object({
  facilityId: UuidSchema,
  doctorId: UuidSchema,
  startsAt: Type.String({ format: 'date-time' }),
  endsAt: Type.String({ format: 'date-time' }),
  timezone: Type.String({}),
  civilDate: Type.String({ format: 'date' }),
  delayMinutes: Type.Optional(Type.Integer({ minimum: 0 })),
});
export const CreateScheduleRequestSchema = Type.Object(
  {
    doctorId: UuidSchema,
    timezone: Type.String({ minLength: 1, maxLength: 100 }),
    validFrom: Type.String({ format: 'date' }),
    validTo: Type.String({ format: 'date' }),
    slotDurationMinutes: Type.Integer({ minimum: 1, maximum: 1440 }),
    feeMinorUnits: Type.Integer({ minimum: 0 }),
    status: ScheduleStatusSchema,
    windows: Type.Array(LocalWindowSchema, { minItems: 1, maxItems: 70 }),
  },
  { additionalProperties: false },
);
export const UpdateScheduleRequestSchema = Type.Object(
  {
    timezone: Type.Optional(Type.String({ minLength: 1, maxLength: 100 })),
    validFrom: Type.Optional(Type.String({ format: 'date' })),
    validTo: Type.Optional(Type.String({ format: 'date' })),
    slotDurationMinutes: Type.Optional(Type.Integer({ minimum: 1, maximum: 1440 })),
    feeMinorUnits: Type.Optional(Type.Integer({ minimum: 0 })),
    status: Type.Optional(ScheduleStatusSchema),
    windows: Type.Optional(Type.Array(LocalWindowSchema, { minItems: 1, maxItems: 70 })),
  },
  { additionalProperties: false, minProperties: 1 },
);
export const ScheduleSchema = Type.Object(
  {
    doctorId: UuidSchema,
    timezone: Type.String({ minLength: 1, maxLength: 100 }),
    validFrom: Type.String({ format: 'date' }),
    validTo: Type.String({ format: 'date' }),
    slotDurationMinutes: Type.Integer({ minimum: 1, maximum: 1440 }),
    feeMinorUnits: Type.Integer({ minimum: 0 }),
    status: ScheduleStatusSchema,
    windows: Type.Array(LocalWindowSchema, { minItems: 1, maxItems: 70 }),
    id: UuidSchema,
    facilityId: UuidSchema,
    currency: CurrencyCodeSchema,
    version: VersionSchema,
  },
  { additionalProperties: false },
);
export const CreateScheduleExceptionRequestSchema = Type.Object(
  {
    type: OrdinaryExceptionTypeSchema,
    startsAt: Type.String({ format: 'date-time' }),
    endsAt: Type.String({ format: 'date-time' }),
    civilDate: Type.String({ format: 'date' }),
    reason: Type.String({ minLength: 1, maxLength: 500 }),
  },
  { additionalProperties: false },
);
export const ScheduleExceptionSchema = Type.Object(
  {
    id: UuidSchema,
    scheduleId: UuidSchema,
    facilityId: UuidSchema,
    doctorId: UuidSchema,
    type: OrdinaryExceptionTypeSchema,
    startsAt: Type.String({ format: 'date-time' }),
    endsAt: Type.String({ format: 'date-time' }),
    civilDate: Type.String({ format: 'date' }),
    reason: Type.String({ minLength: 1, maxLength: 500 }),
    version: VersionSchema,
    affectedAppointmentCount: Type.Optional(Type.Integer({ minimum: 0 })),
  },
  { additionalProperties: false },
);
export const CreateAppointmentRequestSchema = Type.Object(
  {
    patientId: UuidSchema,
    facilityId: UuidSchema,
    doctorId: UuidSchema,
    startsAt: Type.String({ format: 'date-time' }),
    endsAt: Type.String({ format: 'date-time' }),
    timezone: Type.String({}),
    civilDate: Type.String({ format: 'date' }),
    paymentMethod: Type.Literal('cash_on_arrival'),
    sourceReferralId: Type.Optional(Type.Union([UuidSchema, Type.Null()])),
  },
  { additionalProperties: false },
);
export const AppointmentSchema = Type.Object(
  {
    id: UuidSchema,
    patientId: UuidSchema,
    facilityId: UuidSchema,
    doctorId: UuidSchema,
    startsAt: Type.String({ format: 'date-time' }),
    endsAt: Type.String({ format: 'date-time' }),
    timezone: Type.String({}),
    civilDate: Type.String({ format: 'date' }),
    status: AppointmentStatusSchema,
    feeMinorUnits: Type.Integer({ minimum: 0 }),
    currency: CurrencyCodeSchema,
    paymentMethod: Type.Literal('cash_on_arrival'),
    version: VersionSchema,
  },
  { additionalProperties: false },
);
export const RescheduleRequestSchema = Type.Object(
  {
    startsAt: Type.String({ format: 'date-time' }),
    endsAt: Type.String({ format: 'date-time' }),
    timezone: Type.String({}),
    civilDate: Type.String({ format: 'date' }),
    reason: Type.String({ pattern: '^(?!.*[\\r\\n\\t]).+$', minLength: 1, maxLength: 500 }),
  },
  { additionalProperties: false },
);
export const QueueEntrySchema = Type.Object({
  id: UuidSchema,
  appointmentId: UuidSchema,
  facilityId: UuidSchema,
  doctorId: UuidSchema,
  civilDate: Type.String({ format: 'date' }),
  queueNumber: Type.Integer({ minimum: 1 }),
  position: Type.Optional(Type.Integer({ minimum: 1 })),
  estimatedServiceAt: Type.Optional(
    Type.Union([Type.String({ format: 'date-time' }), Type.Null()]),
  ),
  state: QueueStatusSchema,
  version: VersionSchema,
});
export const ReorderRequestSchema = Type.Object(
  {
    targetPosition: Type.Integer({ minimum: 1 }),
    queueVersion: VersionSchema,
    reason: Type.String({ minLength: 1, maxLength: 500 }),
  },
  { additionalProperties: false },
);
export const DelayRequestSchema = Type.Object(
  {
    civilDate: Type.String({ format: 'date' }),
    delayMinutes: Type.Integer({ minimum: 1, maximum: 1440 }),
    templateCode: Type.String({ minLength: 1, maxLength: 120 }),
    reason: Type.String({ minLength: 1, maxLength: 500 }),
  },
  { additionalProperties: false },
);
export const DelayResultSchema = Type.Object({
  delayId: UuidSchema,
  facilityId: UuidSchema,
  doctorId: UuidSchema,
  civilDate: Type.String({ format: 'date' }),
  delayMinutes: Type.Integer({ minimum: 1 }),
  version: VersionSchema,
  affectedAppointmentIds: Type.Optional(Type.Array(UuidSchema)),
  outboxEventIds: Type.Optional(Type.Array(UuidSchema)),
});
export const AbsenceRequestSchema = Type.Object(
  {
    startsAt: Type.String({ format: 'date-time' }),
    endsAt: Type.String({ format: 'date-time' }),
    civilDate: Type.String({ format: 'date' }),
    reason: Type.String({ minLength: 1, maxLength: 500 }),
  },
  { additionalProperties: false },
);
export const ReplacementSuggestionSchema = Type.Object({
  appointmentId: UuidSchema,
  slots: Type.Array(SlotSchema),
  held: Type.Optional(Type.Literal(false)),
});
export const AbsenceResultSchema = Type.Object({
  absenceId: UuidSchema,
  affectedAppointmentIds: Type.Array(UuidSchema),
  removedQueueEntryIds: Type.Array(UuidSchema),
  replacementSuggestions: Type.Array(ReplacementSuggestionSchema),
});
export const CheckInResultSchema = Type.Object({
  appointment: AppointmentSchema,
  queueEntry: QueueEntrySchema,
});
export const QueuePositionSchema = Type.Object({
  appointmentId: UuidSchema,
  state: QueueStatusSchema,
  queueNumber: Type.Integer({ minimum: 1 }),
  position: Type.Optional(Type.Union([Type.Integer({ minimum: 1 }), Type.Null()])),
  estimatedServiceAt: Type.Optional(
    Type.Union([Type.String({ format: 'date-time' }), Type.Null()]),
  ),
  queueVersion: VersionSchema,
  updatedAt: Type.String({ format: 'date-time' }),
  stale: Type.Boolean(),
});
export const QueueSchema = Type.Object({
  facilityId: UuidSchema,
  doctorId: UuidSchema,
  civilDate: Type.String({ format: 'date' }),
  version: VersionSchema,
  delayMinutes: Type.Optional(Type.Integer({ minimum: 0 })),
  entries: Type.Array(QueueEntrySchema),
  nextCursor: Type.Union([Type.String({}), Type.Null()]),
  freshness: Type.Optional(ReadFreshnessSchema),
});
export const PublicDoctorProjectionSchema = Type.Object(
  {
    doctorId: UuidSchema,
    doctorDisplayName: Type.String({ minLength: 1, maxLength: 160 }),
    specialty: Type.String({ minLength: 1, maxLength: 120 }),
    professionalLicenseVerified: Type.Literal(true),
    facilityId: UuidSchema,
    facilityDisplayName: Type.String({ minLength: 1, maxLength: 160 }),
    facilityVerified: Type.Literal(true),
    feeMinorUnits: Type.Integer({ minimum: 0 }),
    currency: CurrencyCodeSchema,
    paymentMethod: Type.Literal('cash_on_arrival'),
    nextAvailableSlot: Type.Union([SlotSchema, Type.Null()]),
    distanceMeters: Type.Union([Type.Number({ minimum: 0 }), Type.Null()]),
    availabilityVersion: VersionSchema,
    updatedAt: Type.String({ format: 'date-time' }),
    stale: Type.Boolean(),
  },
  { additionalProperties: false },
);
export const DoctorSearchPageSchema = Type.Object(
  {
    items: Type.Array(PublicDoctorProjectionSchema),
    nextCursor: Type.Union([Type.String({}), Type.Null()]),
    freshness: ReadFreshnessSchema,
  },
  { additionalProperties: false },
);
export const AvailabilityPageSchema = Type.Object({
  items: Type.Array(SlotSchema),
  feeMinorUnits: Type.Integer({ minimum: 0 }),
  currency: CurrencyCodeSchema,
  paymentMethod: Type.Literal('cash_on_arrival'),
  nextCursor: Type.Optional(Type.Union([Type.String({}), Type.Null()])),
  generatedAt: Type.Optional(Type.String({ format: 'date-time' })),
  version: VersionSchema,
  freshness: ReadFreshnessSchema,
});
export const AppointmentPageSchema = Type.Object({
  items: Type.Array(AppointmentSchema),
  nextCursor: Type.Optional(Type.Union([Type.String({}), Type.Null()])),
  freshness: ReadFreshnessSchema,
});
export const ProblemSchema = Type.Object({
  type: Type.String({ format: 'uri-reference' }),
  title: Type.String({}),
  status: Type.Integer({ minimum: 400, maximum: 599 }),
  detail: Type.Optional(Type.String({})),
  instance: Type.Optional(Type.String({ format: 'uri-reference' })),
  code: Type.Optional(Type.String({})),
  requestId: Type.Optional(Type.String({})),
});
export const ReasonRequestSchema = Type.Object(
  { reason: Type.String({ minLength: 1, maxLength: 500 }) },
  { additionalProperties: false },
);

export const SearchDoctorsQuerySchema = Type.Object(
  {
    specialty: Type.Optional(Type.String({ maxLength: 120 })),
    facilityId: Type.Optional(UuidSchema),
    near: Type.Optional(
      Type.String({
        pattern:
          '^-?(?:[0-8]?[0-9](?:\\.[0-9]{1,6})?|90(?:\\.0{1,6})?),-?(?:1[0-7][0-9](?:\\.[0-9]{1,6})?|[0-9]?[0-9](?:\\.[0-9]{1,6})?|180(?:\\.0{1,6})?)$',
      }),
    ),
    radius: Type.Optional(Type.Integer({ minimum: 100, maximum: 100000 })),
    date: Type.Optional(Type.String({ format: 'date' })),
    cursor: Type.Optional(Type.String({ maxLength: 512 })),
  },
  { additionalProperties: false },
);
export const AvailabilityQuerySchema = Type.Object(
  {
    fromDate: Type.String({ format: 'date' }),
    toDate: Type.String({ format: 'date' }),
    cursor: Type.Optional(Type.String({ maxLength: 512 })),
  },
  { additionalProperties: false },
);
export const AppointmentListQuerySchema = Type.Object(
  {
    patientId: Type.Optional(UuidSchema),
    facilityId: Type.Optional(UuidSchema),
    doctorId: Type.Optional(UuidSchema),
    status: Type.Optional(AppointmentStatusSchema),
    date: Type.Optional(Type.String({ format: 'date' })),
    cursor: Type.Optional(Type.String({ maxLength: 512 })),
  },
  { additionalProperties: false },
);
export const QueueQuerySchema = Type.Object(
  {
    doctorId: UuidSchema,
    date: Type.String({ format: 'date' }),
    cursor: Type.Optional(Type.String({ maxLength: 512 })),
  },
  { additionalProperties: false },
);

export const clinicSchedulingSchemas = {
  Uuid: UuidSchema,
  Version: VersionSchema,
  ReadFreshness: ReadFreshnessSchema,
  CurrencyCode: CurrencyCodeSchema,
  AppointmentStatus: AppointmentStatusSchema,
  QueueStatus: QueueStatusSchema,
  ScheduleStatus: ScheduleStatusSchema,
  ExceptionType: ExceptionTypeSchema,
  OrdinaryExceptionType: OrdinaryExceptionTypeSchema,
  LocalWindow: LocalWindowSchema,
  Slot: SlotSchema,
  CreateScheduleRequest: CreateScheduleRequestSchema,
  UpdateScheduleRequest: UpdateScheduleRequestSchema,
  Schedule: ScheduleSchema,
  CreateScheduleExceptionRequest: CreateScheduleExceptionRequestSchema,
  ScheduleException: ScheduleExceptionSchema,
  CreateAppointmentRequest: CreateAppointmentRequestSchema,
  Appointment: AppointmentSchema,
  RescheduleRequest: RescheduleRequestSchema,
  QueueEntry: QueueEntrySchema,
  ReorderRequest: ReorderRequestSchema,
  DelayRequest: DelayRequestSchema,
  DelayResult: DelayResultSchema,
  AbsenceRequest: AbsenceRequestSchema,
  ReplacementSuggestion: ReplacementSuggestionSchema,
  AbsenceResult: AbsenceResultSchema,
  CheckInResult: CheckInResultSchema,
  QueuePosition: QueuePositionSchema,
  Queue: QueueSchema,
  PublicDoctorProjection: PublicDoctorProjectionSchema,
  DoctorSearchPage: DoctorSearchPageSchema,
  AvailabilityPage: AvailabilityPageSchema,
  AppointmentPage: AppointmentPageSchema,
  Problem: ProblemSchema,
  ReasonRequest: ReasonRequestSchema,
  SearchDoctorsQuery: SearchDoctorsQuerySchema,
  AvailabilityQuery: AvailabilityQuerySchema,
  AppointmentListQuery: AppointmentListQuerySchema,
  QueueQuery: QueueQuerySchema,
} as const;

export type CreateScheduleInput = Static<typeof CreateScheduleRequestSchema>;
export type UpdateScheduleInput = Static<typeof UpdateScheduleRequestSchema>;
export type CreateScheduleExceptionInput = Static<typeof CreateScheduleExceptionRequestSchema>;
export type CreateAppointmentInput = Static<typeof CreateAppointmentRequestSchema>;
export type CancelAppointmentInput = Static<typeof ReasonRequestSchema>;
export type RescheduleInput = Static<typeof RescheduleRequestSchema>;
export type ReorderInput = Static<typeof ReorderRequestSchema>;
export type DelayInput = Static<typeof DelayRequestSchema>;
export type AbsenceInput = Static<typeof AbsenceRequestSchema>;
export type Uuid = Static<typeof UuidSchema>;
export type Version = Static<typeof VersionSchema>;
export type ReadFreshness = Static<typeof ReadFreshnessSchema>;
export type CurrencyCode = Static<typeof CurrencyCodeSchema>;
export type AppointmentStatus = Static<typeof AppointmentStatusSchema>;
export type QueueStatus = Static<typeof QueueStatusSchema>;
export type ScheduleStatus = Static<typeof ScheduleStatusSchema>;
export type ExceptionType = Static<typeof ExceptionTypeSchema>;
export type OrdinaryExceptionType = Static<typeof OrdinaryExceptionTypeSchema>;
export type LocalWindow = Static<typeof LocalWindowSchema>;
export type Slot = Static<typeof SlotSchema>;
export type CreateScheduleRequest = Static<typeof CreateScheduleRequestSchema>;
export type UpdateScheduleRequest = Static<typeof UpdateScheduleRequestSchema>;
export type Schedule = Static<typeof ScheduleSchema>;
export type CreateScheduleExceptionRequest = Static<typeof CreateScheduleExceptionRequestSchema>;
export type ScheduleException = Static<typeof ScheduleExceptionSchema>;
export type CreateAppointmentRequest = Static<typeof CreateAppointmentRequestSchema>;
export type Appointment = Static<typeof AppointmentSchema>;
export type RescheduleRequest = Static<typeof RescheduleRequestSchema>;
export type QueueEntry = Static<typeof QueueEntrySchema>;
export type ReorderRequest = Static<typeof ReorderRequestSchema>;
export type DelayRequest = Static<typeof DelayRequestSchema>;
export type DelayResult = Static<typeof DelayResultSchema>;
export type AbsenceRequest = Static<typeof AbsenceRequestSchema>;
export type ReplacementSuggestion = Static<typeof ReplacementSuggestionSchema>;
export type AbsenceResult = Static<typeof AbsenceResultSchema>;
export type CheckInResult = Static<typeof CheckInResultSchema>;
export type QueuePosition = Static<typeof QueuePositionSchema>;
export type Queue = Static<typeof QueueSchema>;
export type PublicDoctorProjection = Static<typeof PublicDoctorProjectionSchema>;
export type DoctorSearchPage = Static<typeof DoctorSearchPageSchema>;
export type AvailabilityPage = Static<typeof AvailabilityPageSchema>;
export type AppointmentPage = Static<typeof AppointmentPageSchema>;
export type Problem = Static<typeof ProblemSchema>;
export type ReasonRequest = Static<typeof ReasonRequestSchema>;
export type SearchDoctorsQuery = Static<typeof SearchDoctorsQuerySchema>;
export type DoctorSearchQuery = SearchDoctorsQuery;
export type AppointmentListQuery = Static<typeof AppointmentListQuerySchema>;
export type QueueQuery = Static<typeof QueueQuerySchema>;
export type AvailabilityQuery = Static<typeof AvailabilityQuerySchema>;

export const clinicSchedulingRequestSchemas = {
  createSchedule: CreateScheduleRequestSchema,
  updateSchedule: UpdateScheduleRequestSchema,
  createScheduleException: CreateScheduleExceptionRequestSchema,
  createAppointment: CreateAppointmentRequestSchema,
  cancelAppointment: ReasonRequestSchema,
  rescheduleAppointment: RescheduleRequestSchema,
  reorderQueueEntry: ReorderRequestSchema,
  sendDoctorDelay: DelayRequestSchema,
  declareDoctorAbsence: AbsenceRequestSchema,
} as const;
export const clinicSchedulingResponseSchemas = {
  searchDoctors: DoctorSearchPageSchema,
  listDoctorAvailability: AvailabilityPageSchema,
  createSchedule: ScheduleSchema,
  updateSchedule: ScheduleSchema,
  createScheduleException: ScheduleExceptionSchema,
  listAppointments: AppointmentPageSchema,
  createAppointment: AppointmentSchema,
  getAppointment: AppointmentSchema,
  cancelAppointment: AppointmentSchema,
  rescheduleAppointment: AppointmentSchema,
  checkInAppointment: CheckInResultSchema,
  getQueue: QueueSchema,
  getMyQueuePosition: QueuePositionSchema,
  callQueueEntry: QueueEntrySchema,
  reorderQueueEntry: QueueSchema,
  completeQueueEntry: QueueEntrySchema,
  sendDoctorDelay: DelayResultSchema,
  declareDoctorAbsence: AbsenceResultSchema,
} as const;
