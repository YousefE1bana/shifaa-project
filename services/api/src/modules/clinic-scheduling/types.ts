import type {
  AbsenceInput,
  Appointment,
  AppointmentListQuery,
  AppointmentPage,
  AvailabilityPage,
  AvailabilityQuery,
  CheckInResult,
  CreateAppointmentRequest,
  CreateScheduleExceptionRequest,
  CreateScheduleRequest,
  DelayInput,
  DoctorSearchPage,
  DoctorSearchQuery,
  Queue,
  QueueEntry,
  QueuePosition,
  QueueQuery,
  ReasonRequest,
  RescheduleRequest,
  Schedule,
  ScheduleException,
  UpdateScheduleRequest,
  DelayResult,
  AbsenceResult,
} from '@shifaa/contracts';

/** Runtime-authenticated identity. Role, facility, purpose, and relationships are resolved server-side. */
export interface ClinicSchedulingActor {
  readonly personId: string;
  readonly principal: string;
  readonly requestId: string;
  readonly traceId: string;
  readonly aal: 1 | 2;
  readonly locale: 'ar-EG' | 'en-EG';
}
/** Public discovery reads may run without an authenticated actor. */
export type ClinicSchedulingPublicActor = ClinicSchedulingActor | null;

/** HTTP metadata only; it carries no client-authored authorization facts. */
export interface ClinicSchedulingRequestContext {
  readonly actor: ClinicSchedulingActor;
  readonly idempotencyKey?: string;
  readonly requestHash?: string;
}
export type ClinicSchedulingMutationContext = ClinicSchedulingRequestContext;

/** Facility is supplied as a route target and checked against the authoritative schedule row. */
export type CreateScheduleCommand = CreateScheduleRequest;
export type UpdateScheduleCommand = UpdateScheduleRequest;
export type CreateScheduleExceptionCommand = CreateScheduleExceptionRequest;

/** Facility and payment method are caller-supplied contract fields that are verified against server facts. */
export type CreateAppointmentCommand = CreateAppointmentRequest;
export type CancelAppointmentCommand = ReasonRequest;
export type RescheduleCommand = RescheduleRequest;
export type DelayCommand = DelayInput;
export type AbsenceCommand = AbsenceInput;

/** Mutation repositories return the exact response DTO for each approved operation. */
export type ClinicSchedulingMutationReference =
  | Schedule
  | ScheduleException
  | Appointment
  | CheckInResult
  | QueueEntry
  | Queue
  | DelayResult;
export type ClinicSchedulingAbsenceReference = AbsenceResult;
export interface BoundedReadPageInput {
  readonly cursor?: string;
  readonly limit: number;
}
export interface BoundedReadPage<T> {
  readonly items: readonly T[];
  readonly nextCursor: string | null;
  /** Read freshness is authoritative metadata, never inferred as confirmed data. */
  readonly freshness?: ClinicSchedulingReadFreshness;
}

export type ClinicSchedulingReadFreshness = 'fresh' | 'stale' | 'unknown';

/**
 * Private, minimum-projection cache seam for safe read degradation.
 * Implementations must scope keys to the authenticated actor and must not
 * persist mutation payloads, reasons, or unrestricted clinical data.
 */
export interface ClinicSchedulingCachePort {
  get<T>(key: string): Promise<
    | Readonly<{
        value: T;
        freshness?: ClinicSchedulingReadFreshness;
      }>
    | undefined
  >;
  set<T>(
    key: string,
    value: T,
    options: Readonly<{ ttlMs: number; private: boolean }>,
  ): Promise<void>;
}

/** Fixed, minimum-disclosure projections returned by database functions. */
export type SubjectAppointmentProjection = Readonly<
  Pick<Appointment, 'id' | 'startsAt' | 'endsAt' | 'status' | 'version'>
>;
export type SubjectQueueProjection = Readonly<
  Pick<
    QueuePosition,
    | 'appointmentId'
    | 'queueNumber'
    | 'position'
    | 'state'
    | 'estimatedServiceAt'
    | 'delayMinutes'
    | 'queueVersion'
    | 'updatedAt'
    | 'stale'
  >
>;
export type AvailabilityRow = Readonly<
  Pick<
    NonNullable<AvailabilityPage['items']>[number],
    'facilityId' | 'doctorId' | 'startsAt' | 'endsAt' | 'timezone' | 'civilDate'
  > &
    Partial<Pick<NonNullable<AvailabilityPage['items']>[number], 'delayMinutes'>> & {
      localStart: string;
    }
>;
export type ScheduleAvailabilityRow = Omit<AvailabilityRow, 'facilityId' | 'doctorId'>;
/** Availability read metadata is carried by the fixed DB projection, never inferred by HTTP. */
export type AvailabilityReadPage = BoundedReadPage<AvailabilityRow> &
  Pick<AvailabilityPage, 'feeMinorUnits' | 'currency' | 'paymentMethod' | 'version'> &
  Partial<Pick<AvailabilityPage, 'generatedAt'>>;
export type DoctorSearchRow = Readonly<DoctorSearchPage['items'][number]>;
export type AppointmentListRow = Readonly<
  Pick<
    Appointment,
    'id' | 'patientId' | 'facilityId' | 'doctorId' | 'startsAt' | 'endsAt' | 'status' | 'version'
  >
>;
export type QueueRow = Readonly<
  Pick<Queue, 'facilityId' | 'doctorId' | 'civilDate' | 'version' | 'entries'> &
    Partial<Pick<Queue, 'delayMinutes'>>
>;

/** Query DTOs are filters only; they never establish scope or authority. */
export type DoctorSearchFilter = DoctorSearchQuery;
export type AvailabilityFilter = AvailabilityQuery;
export type AppointmentFilter = AppointmentListQuery;
export type QueueFilter = QueueQuery;

/** Service-facing read seams for T037; only approved fixed projections belong in the repository. */
export interface ClinicSchedulingReadPort {
  searchDoctors(
    actor: ClinicSchedulingPublicActor,
    filter: DoctorSearchFilter,
    page: BoundedReadPageInput,
  ): Promise<BoundedReadPage<DoctorSearchRow>>;
  listAvailabilityPage(
    actor: ClinicSchedulingPublicActor,
    facilityId: string,
    doctorId: string,
    filter: Pick<AvailabilityFilter, 'fromDate' | 'toDate'>,
    page: BoundedReadPageInput,
  ): Promise<AvailabilityReadPage>;
  getAppointment(
    actor: ClinicSchedulingActor,
    appointmentId: string,
  ): Promise<SubjectAppointmentProjection | null>;
  listAppointments(
    actor: ClinicSchedulingActor,
    filter: AppointmentFilter,
    page: BoundedReadPageInput,
  ): Promise<BoundedReadPage<AppointmentListRow>>;
  getQueue(
    actor: ClinicSchedulingActor,
    filter: Pick<QueueFilter, 'doctorId' | 'date'> & { readonly facilityId: string },
    page: BoundedReadPageInput,
  ): Promise<BoundedReadPage<QueueRow>>;
  getMyQueuePosition(
    actor: ClinicSchedulingActor,
    appointmentId: string,
  ): Promise<SubjectQueueProjection | null>;
}

export type ClinicSchedulingAction =
  | 'appointment.discovery'
  | 'appointment.scheduling'
  | 'schedule.manage'
  | 'appointment.manage'
  | 'queue.manage'
  | 'delay.manage'
  | 'absence.manage';

export interface RequestedScope {
  readonly facilityId?: string;
  readonly doctorId?: string;
  readonly civilDate?: string;
  readonly scheduleId?: string;
  readonly appointmentId?: string;
  readonly queueEntryId?: string;
  readonly patientId?: string;
}

/** Authoritative facts returned by an authorization adapter, never accepted from a caller. */
export interface CurrentClinicAuthorization {
  readonly action: ClinicSchedulingAction;
  readonly facilityId: string;
  readonly doctorId?: string;
  readonly patientId?: string;
  readonly facilityVerified: true;
  readonly doctorLicenseVerified: true;
  readonly relationship: 'self' | 'guardian' | 'delegate' | 'clinic_member' | 'owner';
}

export interface ClinicSchedulingAuthorizationPort {
  authorize(
    actor: ClinicSchedulingActor,
    action: ClinicSchedulingAction,
    target: RequestedScope,
  ): Promise<CurrentClinicAuthorization>;
}

export interface ClinicSchedulingClockPort {
  now(): Date;
}

export type ClinicSchedulingFunctionName =
  | 'create_schedule_v1'
  | 'update_schedule_v1'
  | 'create_schedule_exception_v1'
  | 'create_appointment_v1'
  | 'reschedule_appointment_v1'
  | 'cancel_appointment_v1'
  | 'check_in_appointment_v1'
  | 'call_queue_entry_v1'
  | 'complete_queue_entry_v1'
  | 'reorder_queue_entry_v1'
  | 'send_doctor_delay_v1'
  | 'declare_doctor_absence_v1';

/** A single approved SECURITY DEFINER function owns domain/effect atomicity. */
export interface ClinicSchedulingTransactionPort {
  readonly atomicMutationBoundary: 'approved_database_function';
}

export interface ClinicSchedulingIdempotencyPort {
  execute<T>(input: {
    readonly actor: ClinicSchedulingActor;
    readonly operation: string;
    readonly key: string;
    readonly body: unknown;
    readonly work: () => Promise<T>;
  }): Promise<T>;
}

export interface ClinicSchedulingAuditPort {
  append(input: {
    readonly actor: ClinicSchedulingActor;
    readonly action: string;
    readonly resourceType: string;
    readonly resourceId: string;
    readonly resourceVersion: number;
    readonly facilityId?: string;
    readonly patientId?: string;
  }): Promise<void>;
}

export interface ClinicSchedulingOutboxPort {
  append(input: {
    readonly aggregateType: string;
    readonly aggregateId: string;
    readonly aggregateVersion: number;
    readonly eventType:
      | 'clinical.schedule.changed.v1'
      | 'clinical.appointment.changed.v1'
      | 'clinical.queue.changed.v1'
      | 'clinical.doctor_delay.declared.v1'
      | 'clinical.doctor_absence.declared.v1';
  }): Promise<void>;
}

export interface ClinicSchedulingFeatureFlagPort {
  enabled(code: 'clinic_scheduling.server' | 'clinic_scheduling.mutations'): Promise<boolean>;
}

export interface ClinicSchedulingProjectionPort {
  /** All projection reads below are fixed-shape, server-scoped database reads. */
  listAvailability(
    actor: ClinicSchedulingActor,
    scheduleId: string,
    civilDate: string,
  ): Promise<readonly ScheduleAvailabilityRow[]>;
  readMyAppointment(
    actor: ClinicSchedulingActor,
    appointmentId: string,
  ): Promise<SubjectAppointmentProjection | null>;
  readMyQueuePosition(
    actor: ClinicSchedulingActor,
    appointmentId: string,
  ): Promise<SubjectQueueProjection | null>;
}

export interface ClinicSchedulingRepository extends ClinicSchedulingProjectionPort {
  createSchedule(
    request: ClinicSchedulingMutationContext,
    facilityId: string,
    input: CreateScheduleCommand,
  ): Promise<Schedule>;
  updateSchedule(
    request: ClinicSchedulingMutationContext,
    scheduleId: string,
    expectedVersion: number,
    input: UpdateScheduleCommand,
  ): Promise<Schedule>;
  createScheduleException(
    request: ClinicSchedulingMutationContext,
    scheduleId: string,
    expectedVersion: number,
    input: CreateScheduleExceptionCommand,
  ): Promise<ScheduleException>;
  createAppointment(
    request: ClinicSchedulingMutationContext,
    facilityId: string,
    input: CreateAppointmentCommand,
  ): Promise<Appointment>;
  cancelAppointment(
    request: ClinicSchedulingMutationContext,
    appointmentId: string,
    expectedVersion: number,
    input: CancelAppointmentCommand,
  ): Promise<Appointment>;
  rescheduleAppointment(
    request: ClinicSchedulingMutationContext,
    appointmentId: string,
    expectedVersion: number,
    input: RescheduleCommand,
  ): Promise<Appointment>;
  checkInAppointment(
    request: ClinicSchedulingMutationContext,
    appointmentId: string,
    expectedVersion: number,
  ): Promise<CheckInResult>;
  callQueueEntry(
    request: ClinicSchedulingMutationContext,
    queueEntryId: string,
    expectedVersion: number,
  ): Promise<QueueEntry>;
  reorderQueueEntry(
    request: ClinicSchedulingMutationContext,
    queueEntryId: string,
    expectedVersion: number,
    expectedQueueVersion: number,
    targetPosition: number,
    reason: string,
  ): Promise<Queue>;
  completeQueueEntry(
    request: ClinicSchedulingMutationContext,
    queueEntryId: string,
    expectedVersion: number,
  ): Promise<QueueEntry>;
  sendDoctorDelay(
    request: ClinicSchedulingMutationContext,
    facilityId: string,
    doctorId: string,
    input: DelayCommand,
  ): Promise<DelayResult>;
  declareDoctorAbsence(
    request: ClinicSchedulingMutationContext,
    facilityId: string,
    doctorId: string,
    input: AbsenceCommand,
  ): Promise<ClinicSchedulingAbsenceReference>;
}

/** T036 intentionally narrows this to the implemented fixed-function repository. */
export type ClinicSchedulingServicePort = ClinicSchedulingRepository;
