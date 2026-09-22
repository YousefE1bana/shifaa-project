import { createHash } from 'node:crypto';

import type { TransactionSql } from 'postgres';
import type { TSchema } from '@sinclair/typebox';
import { Value } from '@sinclair/typebox/value';
import type {
  AbsenceResult,
  Appointment,
  AppointmentPage,
  CheckInResult,
  DelayResult,
  AvailabilityPage,
  DoctorSearchPage,
  Queue,
  QueueEntry,
  QueuePosition,
  Schedule,
  ScheduleException,
} from '@shifaa/contracts';
import { clinicSchedulingResponseSchemas } from '@shifaa/contracts';

import type {
  ScheduleAvailabilityRow,
  ClinicSchedulingActor,
  ClinicSchedulingMutationContext,
  ClinicSchedulingPublicActor,
  BoundedReadPage,
  BoundedReadPageInput,
  AvailabilityFilter,
  AvailabilityReadPage,
  AppointmentFilter,
  AppointmentListRow,
  DoctorSearchFilter,
  DoctorSearchRow,
  QueueFilter,
  QueueRow,
  ClinicSchedulingRepository,
  ClinicSchedulingTransactionPort,
  CreateAppointmentCommand,
  CreateScheduleCommand,
  CreateScheduleExceptionCommand,
  DelayCommand,
  AbsenceCommand,
  CancelAppointmentCommand,
  RescheduleCommand,
  SubjectAppointmentProjection,
  SubjectQueueProjection,
  UpdateScheduleCommand,
} from '../../modules/clinic-scheduling/index.js';
import type { PostgresIdentityRepository } from './identity-repository.js';

type RawTransactionRepository = Pick<PostgresIdentityRepository, 'withRawTransaction'>;

type ClinicSchedulingMutationResponseByOperation = {
  createSchedule: Schedule;
  updateSchedule: Schedule;
  createScheduleException: ScheduleException;
  createAppointment: Appointment;
  cancelAppointment: Appointment;
  rescheduleAppointment: Appointment;
  checkInAppointment: CheckInResult;
  callQueueEntry: QueueEntry;
  reorderQueueEntry: Queue;
  completeQueueEntry: QueueEntry;
  sendDoctorDelay: DelayResult;
  declareDoctorAbsence: AbsenceResult;
};

/**
 * Parse and validate a database mutation projection before the surrounding
 * transaction is allowed to commit.  A missing, malformed, or unexpected
 * shape is an error rather than a best-effort reference or fabricated DTO.
 */
export function parseClinicSchedulingMutationResponse<
  TOperation extends keyof ClinicSchedulingMutationResponseByOperation,
>(operation: TOperation, raw: unknown): ClinicSchedulingMutationResponseByOperation[TOperation] {
  let value = raw;
  if (typeof value === 'string') {
    try {
      value = JSON.parse(value) as unknown;
    } catch {
      throw new Error(`Clinic scheduling ${operation} returned invalid JSON.`);
    }
  }
  if (!Value.Check(clinicSchedulingResponseSchemas[operation], value)) {
    throw new Error(`Clinic scheduling ${operation} returned an invalid response DTO.`);
  }
  return value as ClinicSchedulingMutationResponseByOperation[TOperation];
}

function parseClinicSchedulingResponse<
  TOperation extends keyof typeof clinicSchedulingResponseSchemas,
>(operation: TOperation, raw: unknown): ReturnType<typeof JSON.parse> {
  let value = raw;
  if (typeof value === 'string') {
    try {
      value = JSON.parse(value) as unknown;
    } catch {
      throw new Error(`Clinic scheduling ${operation} returned invalid JSON.`);
    }
  }
  const schema = clinicSchedulingResponseSchemas[operation] as TSchema;
  if (!Value.Check(schema, value)) {
    throw new Error(`Clinic scheduling ${operation} returned an invalid response DTO.`);
  }
  return value as ReturnType<typeof JSON.parse>;
}

type AvailabilityDbRow = {
  facility_id?: string;
  doctor_id?: string;
  starts_at: Date | string;
  ends_at: Date | string;
  timezone_name: string;
  civil_date: Date | string;
  local_start: string;
  delay_minutes: number | string | null;
  fee_minor_units?: number | string;
  currency_code?: string;
  payment_method?: string;
  schedule_version?: number | string;
};

type DoctorSearchDbRow = {
  doctor_id: string;
  doctor_display_name: string;
  specialty: string;
  professional_license_verified: boolean;
  facility_id: string;
  facility_display_name: string;
  facility_verified: boolean;
  fee_minor_units: number | string;
  currency_code: string;
  payment_method: string;
  next_starts_at: Date | string | null;
  next_ends_at: Date | string | null;
  next_timezone: string | null;
  next_civil_date: Date | string | null;
  next_local_start: string | null;
  distance_m: number | string | null;
  availability_version: number | string;
  updated_at: Date | string;
  stale: boolean;
};

type PricingDbRow = {
  fee_minor_units: number | string;
  currency_code: string;
  payment_method: string;
  schedule_version: number | string;
};

type DoctorSearchCursor = Readonly<{
  version: 1;
  distance: number | null;
  doctorId: string;
  facilityId: string;
  filterBinding: string;
}>;

type QueueCursor = Readonly<{
  version: 1;
  stateRank: number;
  waitingOrder: number | null;
  queueNumber: number;
  entryId: string;
  queueVersion: number;
  filterBinding: string;
}>;

type SubjectAppointmentDbRow = {
  id: string;
  starts_at: Date | string;
  ends_at: Date | string;
  status: SubjectAppointmentProjection['status'];
  version: number | string;
};

type SubjectQueueDbRow = {
  queue_number: number | string;
  waiting_order: number | string | null;
  state: SubjectQueueProjection['state'];
  estimated_service_at: Date | string | null;
  version: number | string;
  updated_at: Date | string;
};

/**
 * Non-owner adapter for the fixed Feature 009 PostgreSQL functions.
 *
 * It never reads or writes clinical tables directly.  Scope, relationship,
 * current licence, role, purpose, fee, and transition authority are resolved
 * by the database functions or supplied by an authoritative server projection.
 */
export class PostgresClinicSchedulingService
  implements ClinicSchedulingRepository, ClinicSchedulingTransactionPort
{
  public constructor(
    private readonly repository: RawTransactionRepository,
    private readonly environment: 'local' | 'ci' | 'production' = 'local',
  ) {}

  public readonly atomicMutationBoundary = 'approved_database_function' as const;

  public createSchedule(
    request: ClinicSchedulingMutationContext,
    facilityId: string,
    input: CreateScheduleCommand,
  ): Promise<Schedule> {
    return this.withRequest(request, 'schedule.manage', ['appointment.scheduling'], async (sql) => {
      const [row] = await sql<{ response: unknown }[]>`
        select clinical.create_schedule_v1(${sql.json({
          facility_id: facilityId,
          doctor_person_id: input.doctorId,
          timezone_name: input.timezone,
          valid_from: input.validFrom,
          valid_to: input.validTo,
          slot_duration_minutes: input.slotDurationMinutes,
          fee_minor_units: input.feeMinorUnits,
          status: input.status,
          windows: input.windows,
        })}::jsonb) as response`;
      return parseClinicSchedulingMutationResponse('createSchedule', row?.response);
    });
  }

  public updateSchedule(
    request: ClinicSchedulingMutationContext,
    scheduleId: string,
    expectedVersion: number,
    input: UpdateScheduleCommand,
  ): Promise<Schedule> {
    return this.withRequest(request, 'schedule.manage', ['appointment.scheduling'], async (sql) => {
      const payload = {
        ...(input['timezone'] === undefined ? {} : { timezone_name: input['timezone'] }),
        ...(input['validFrom'] === undefined ? {} : { valid_from: input['validFrom'] }),
        ...(input['validTo'] === undefined ? {} : { valid_to: input['validTo'] }),
        ...(input['slotDurationMinutes'] === undefined
          ? {}
          : { slot_duration_minutes: input['slotDurationMinutes'] }),
        ...(input['feeMinorUnits'] === undefined
          ? {}
          : { fee_minor_units: input['feeMinorUnits'] }),
        ...(input['status'] === undefined ? {} : { status: input['status'] }),
        ...(input['windows'] === undefined ? {} : { windows: input['windows'] }),
      };
      const [row] = await sql<{ response: unknown }[]>`
        select clinical.update_schedule_v1(${scheduleId}::uuid,${expectedVersion},${sql.json(payload)}::jsonb) as response`;
      return parseClinicSchedulingMutationResponse('updateSchedule', row?.response);
    });
  }

  public createScheduleException(
    request: ClinicSchedulingMutationContext,
    scheduleId: string,
    expectedVersion: number,
    input: CreateScheduleExceptionCommand,
  ): Promise<ScheduleException> {
    return this.withRequest(request, 'schedule.manage', ['appointment.scheduling'], async (sql) => {
      const [row] = await sql<{ response: unknown }[]>`
        select clinical.create_schedule_exception_v1(${sql.json({
          schedule_id: scheduleId,
          expected_version: expectedVersion,
          civil_date: input.civilDate,
          starts_at: input.startsAt,
          ends_at: input.endsAt,
          exception_type: input.type,
          reason: input.reason,
        })}::jsonb) as response`;
      return parseClinicSchedulingMutationResponse('createScheduleException', row?.response);
    });
  }

  public createAppointment(
    request: ClinicSchedulingMutationContext,
    facilityId: string,
    input: CreateAppointmentCommand,
  ): Promise<Appointment> {
    if (input.facilityId !== facilityId) {
      throw new Error('Create appointment facility does not match the route target.');
    }
    if (input.paymentMethod !== 'cash_on_arrival') {
      throw new Error('Only cash on arrival is enabled for Feature 009.');
    }
    return this.withRequest(
      request,
      'appointment.manage',
      ['appointment.scheduling'],
      async (sql) => {
        const [row] = await sql<{ response: unknown }[]>`
        select clinical.create_appointment_v1(${sql.json({
          patient_person_id: input.patientId,
          facility_id: input.facilityId,
          doctor_person_id: input.doctorId,
          starts_at: input.startsAt,
          ends_at: input.endsAt,
          timezone_name: input.timezone,
          civil_date: input.civilDate,
          local_start: this.localStart(input.startsAt, input.timezone),
          payment_method: input.paymentMethod,
          ...(input.sourceReferralId === undefined
            ? {}
            : { source_referral_id: input.sourceReferralId }),
        })}::jsonb) as response`;
        return parseClinicSchedulingMutationResponse('createAppointment', row?.response);
      },
    );
  }

  public cancelAppointment(
    request: ClinicSchedulingMutationContext,
    appointmentId: string,
    expectedVersion: number,
    input: CancelAppointmentCommand,
  ): Promise<Appointment> {
    return this.withRequest(
      request,
      'appointment.manage',
      ['appointment.scheduling'],
      async (sql) => {
        const [row] = await sql<{ response: unknown }[]>`
        select clinical.cancel_appointment_v1(${appointmentId}::uuid,${expectedVersion},${input.reason}) as response`;
        return parseClinicSchedulingMutationResponse('cancelAppointment', row?.response);
      },
    );
  }

  public rescheduleAppointment(
    request: ClinicSchedulingMutationContext,
    appointmentId: string,
    expectedVersion: number,
    input: RescheduleCommand,
  ): Promise<Appointment> {
    return this.withRequest(
      request,
      'appointment.manage',
      ['appointment.scheduling'],
      async (sql) => {
        const [row] = await sql<{ response: unknown }[]>`
        select clinical.reschedule_appointment_v1(
          ${appointmentId}::uuid,${expectedVersion},${input['startsAt']}::timestamptz,
          ${input['endsAt']}::timestamptz,${input['civilDate']}::date,
          ${this.localStart(input['startsAt'], input['timezone'])}::time,${input['reason']}
        ) as response`;
        return parseClinicSchedulingMutationResponse('rescheduleAppointment', row?.response);
      },
    );
  }

  public checkInAppointment(
    request: ClinicSchedulingMutationContext,
    appointmentId: string,
    expectedVersion: number,
  ): Promise<CheckInResult> {
    return this.withRequest(
      request,
      'appointment.manage',
      ['appointment.scheduling'],
      async (sql) => {
        const [row] = await sql<{ response: unknown }[]>`
        select clinical.check_in_appointment_v1(${appointmentId}::uuid,${expectedVersion}) as response`;
        return parseClinicSchedulingMutationResponse('checkInAppointment', row?.response);
      },
    );
  }

  public callQueueEntry(
    request: ClinicSchedulingMutationContext,
    queueEntryId: string,
    expectedVersion: number,
  ): Promise<QueueEntry> {
    return this.withRequest(request, 'queue.manage', ['queue.operation'], async (sql) => {
      const [row] = await sql<{ response: unknown }[]>`
        select clinical.call_queue_entry_v1(${queueEntryId}::uuid,${expectedVersion}) as response`;
      return parseClinicSchedulingMutationResponse('callQueueEntry', row?.response);
    });
  }

  public reorderQueueEntry(
    request: ClinicSchedulingMutationContext,
    queueEntryId: string,
    expectedVersion: number,
    targetPosition: number,
    reason: string,
  ): Promise<Queue> {
    return this.withRequest(request, 'queue.manage', ['queue.operation'], async (sql) => {
      const [row] = await sql<{ response: unknown }[]>`
        select clinical.reorder_queue_entry_v1(${queueEntryId}::uuid,${expectedVersion},${targetPosition},${reason}) as response`;
      return parseClinicSchedulingMutationResponse('reorderQueueEntry', row?.response);
    });
  }

  public completeQueueEntry(
    request: ClinicSchedulingMutationContext,
    queueEntryId: string,
    expectedVersion: number,
  ): Promise<QueueEntry> {
    return this.withRequest(request, 'queue.manage', ['queue.operation'], async (sql) => {
      const [row] = await sql<{ response: unknown }[]>`
        select clinical.complete_queue_entry_v1(${queueEntryId}::uuid,${expectedVersion}) as response`;
      return parseClinicSchedulingMutationResponse('completeQueueEntry', row?.response);
    });
  }

  public sendDoctorDelay(
    request: ClinicSchedulingMutationContext,
    facilityId: string,
    doctorId: string,
    input: DelayCommand,
  ): Promise<DelayResult> {
    return this.withRequest(request, 'delay.manage', ['scoped.notification'], async (sql) => {
      const [row] = await sql<{ response: unknown }[]>`
        select clinical.send_doctor_delay_v1(${facilityId}::uuid,${doctorId}::uuid,${input['civilDate']}::date,
          ${input['delayMinutes']},${input['reason']}) as response`;
      return parseClinicSchedulingMutationResponse('sendDoctorDelay', row?.response);
    });
  }

  public declareDoctorAbsence(
    request: ClinicSchedulingMutationContext,
    facilityId: string,
    doctorId: string,
    input: AbsenceCommand,
  ): Promise<AbsenceResult> {
    return this.withRequest(request, 'absence.manage', ['appointment.scheduling'], async (sql) => {
      const [row] = await sql<{ response: unknown }[]>`
        select clinical.declare_doctor_absence_v1(${facilityId}::uuid,${doctorId}::uuid,${input['civilDate']}::date,
          ${input['startsAt']}::timestamptz,${input['endsAt']}::timestamptz,${input['reason']}) as response`;
      return parseClinicSchedulingMutationResponse('declareDoctorAbsence', row?.response);
    });
  }

  public listAvailability(
    actor: ClinicSchedulingActor,
    scheduleId: string,
    civilDate: string,
  ): Promise<readonly ScheduleAvailabilityRow[]> {
    return this.withActor(
      actor,
      'appointment.discovery',
      ['appointment.discovery'],
      async (sql) => {
        const rows = await sql<AvailabilityDbRow[]>`
        select starts_at,ends_at,timezone_name,civil_date,local_start,delay_minutes
        from clinical.list_availability_v1(${scheduleId}::uuid,${civilDate}::date)
        order by starts_at limit 500`;
        return rows.map((row) => ({
          startsAt: this.iso(row.starts_at),
          endsAt: this.iso(row.ends_at),
          timezone: row.timezone_name,
          civilDate: this.date(row.civil_date),
          localStart: String(row.local_start),
          ...(row.delay_minutes === null ? {} : { delayMinutes: Number(row.delay_minutes) }),
        }));
      },
    );
  }

  /**
   * Public discovery projection.  The function is SECURITY DEFINER and does
   * not require an actor context; we still run it inside the same bounded
   * transaction seam so timeouts and search_path attribution are consistent.
   */
  public async searchDoctors(
    actor: ClinicSchedulingPublicActor,
    filter: DoctorSearchFilter,
    page: BoundedReadPageInput,
  ): Promise<BoundedReadPage<DoctorSearchRow>> {
    const coordinates = this.coordinates(filter.near);
    const cursor = this.doctorCursor(page.cursor, filter);
    return this.withPublicActor(
      actor,
      'appointment.discovery',
      ['appointment.discovery'],
      async (sql) => {
        const rows = await sql<DoctorSearchDbRow[]>`
        select doctor_id,doctor_display_name,specialty,professional_license_verified,
          facility_id,facility_display_name,facility_verified,fee_minor_units,currency_code,
          payment_method,next_starts_at,next_ends_at,next_timezone,next_civil_date,next_local_start,
          distance_m,availability_version,updated_at,stale
        from clinical.search_doctors_v1(
          ${filter.specialty ?? null},${filter.facilityId ?? null}::uuid,
          ${coordinates?.latitude ?? null},${coordinates?.longitude ?? null},
          ${filter.radius ?? 25_000},${filter.date ?? null}::date,
          ${cursor?.distance ?? null}::double precision,
          ${cursor?.doctorId ?? null}::uuid,${cursor?.facilityId ?? null}::uuid,
          ${page.limit + 1}
        )`;
        const visible = rows.slice(0, page.limit);
        const nextCursor =
          rows.length > page.limit && visible.at(-1)
            ? this.encodeDoctorCursor(visible.at(-1)!, filter)
            : null;
        return {
          items: visible.map((row) => ({
            doctorId: row.doctor_id,
            doctorDisplayName: row.doctor_display_name,
            specialty: row.specialty,
            professionalLicenseVerified: true as const,
            facilityId: row.facility_id,
            facilityDisplayName: row.facility_display_name,
            facilityVerified: true as const,
            feeMinorUnits: Number(row.fee_minor_units),
            currency: this.currency(row.currency_code),
            paymentMethod: 'cash_on_arrival' as const,
            nextAvailableSlot:
              row.next_starts_at && row.next_ends_at && row.next_timezone && row.next_civil_date
                ? {
                    facilityId: row.facility_id,
                    doctorId: row.doctor_id,
                    startsAt: this.iso(row.next_starts_at),
                    endsAt: this.iso(row.next_ends_at),
                    timezone: row.next_timezone,
                    civilDate: this.date(row.next_civil_date),
                  }
                : null,
            distanceMeters: row.distance_m === null ? null : Number(row.distance_m),
            availabilityVersion: Number(row.availability_version),
            updatedAt: this.iso(row.updated_at),
            stale: Boolean(row.stale),
          })),
          nextCursor,
          freshness: 'fresh' as const,
        };
      },
    );
  }

  public listAvailabilityPage(
    actor: ClinicSchedulingPublicActor,
    facilityId: string,
    doctorId: string,
    filter: Pick<AvailabilityFilter, 'fromDate' | 'toDate'>,
    page: BoundedReadPageInput,
  ): Promise<AvailabilityReadPage> {
    return this.withPublicActor(
      actor,
      'appointment.discovery',
      ['appointment.discovery'],
      async (sql) => {
        const rows = await sql<AvailabilityDbRow[]>`
        select facility_id,doctor_id,starts_at,ends_at,timezone_name,civil_date,local_start,
          delay_minutes,fee_minor_units,currency_code,payment_method,schedule_version
        from clinical.list_doctor_availability_v1(
          ${facilityId}::uuid,${doctorId}::uuid,${filter.fromDate}::date,${filter.toDate}::date,
          ${this.timestampCursor(page.cursor)}::timestamptz,${page.limit + 1}
        )`;
        const pricingRows = rows.length
          ? []
          : await sql<PricingDbRow[]>`
            select fee_minor_units,currency_code,payment_method,schedule_version
            from clinical.read_schedule_public_pricing_v1(
              ${facilityId}::uuid,${doctorId}::uuid,${filter.fromDate}::date,${filter.toDate}::date
            )`;
        const first = rows[0];
        const pricing = first
          ? {
              feeMinorUnits: Number(first.fee_minor_units),
              currency: this.currency(first.currency_code),
              paymentMethod: 'cash_on_arrival' as const,
              version: Number(first.schedule_version),
            }
          : pricingRows[0]
            ? {
                feeMinorUnits: Number(pricingRows[0].fee_minor_units),
                currency: this.currency(pricingRows[0].currency_code),
                paymentMethod: 'cash_on_arrival' as const,
                version: Number(pricingRows[0].schedule_version),
              }
            : undefined;
        if (!pricing) throw new Error('Availability schedule is not available.');
        const visible = rows.slice(0, page.limit);
        return {
          items: visible.map((row) => ({
            facilityId: String(row.facility_id),
            doctorId: String(row.doctor_id),
            startsAt: this.iso(row.starts_at),
            endsAt: this.iso(row.ends_at),
            timezone: row.timezone_name,
            civilDate: this.date(row.civil_date),
            localStart: String(row.local_start),
            ...(row.delay_minutes === null ? {} : { delayMinutes: Number(row.delay_minutes) }),
          })),
          nextCursor: rows.length > page.limit ? this.iso(visible.at(-1)!.starts_at) : null,
          ...pricing,
          generatedAt: new Date().toISOString(),
          freshness: 'fresh' as const,
        };
      },
    );
  }

  public getAppointment(
    actor: ClinicSchedulingActor,
    appointmentId: string,
  ): Promise<Appointment | null> {
    return this.withActor(actor, 'appointment.manage', ['appointment.scheduling'], async (sql) => {
      const [row] = await sql<{ response: unknown }[]>`
        select clinical.read_appointment_projection_v1(${appointmentId}::uuid) as response`;
      if (row?.response === null || row?.response === undefined) return null;
      return parseClinicSchedulingResponse('getAppointment', row.response) as Appointment;
    });
  }

  public listAppointments(
    actor: ClinicSchedulingActor,
    filter: AppointmentFilter,
    page: BoundedReadPageInput,
  ): Promise<BoundedReadPage<AppointmentListRow>> {
    return this.withActor(actor, 'appointment.manage', ['appointment.scheduling'], async (sql) => {
      const rows = await sql<{ response: unknown }[]>`
        select response
        from clinical.list_appointments_v1(
          ${filter.patientId ?? null}::uuid,${filter.facilityId ?? null}::uuid,
          ${filter.doctorId ?? null}::uuid,${filter.status ?? null},${filter.date ?? null}::date,
          ${this.timestampCursor(page.cursor)}::timestamptz,${page.limit + 1}
        )`;
      const parsed = rows.map(
        (row) => parseClinicSchedulingResponse('getAppointment', row.response) as Appointment,
      );
      const visible = parsed.slice(0, page.limit);
      return {
        items: visible,
        nextCursor: parsed.length > page.limit ? (visible.at(-1)?.startsAt ?? null) : null,
        freshness: 'fresh' as const,
      };
    });
  }

  public async getQueue(
    actor: ClinicSchedulingActor,
    filter: Pick<QueueFilter, 'doctorId' | 'date'> & { readonly facilityId: string },
    page: BoundedReadPageInput,
  ): Promise<BoundedReadPage<QueueRow>> {
    const cursor = this.queueCursor(page.cursor, filter);
    return this.withActor(actor, 'queue.manage', ['queue.operation'], async (sql) => {
      const [row] = await sql<{ response: unknown }[]>`
        select clinical.read_queue_projection_v1(
          ${filter.facilityId}::uuid,${filter.doctorId}::uuid,${filter.date}::date,
          ${cursor?.stateRank ?? null}::integer,${cursor?.waitingOrder ?? null}::integer,
          ${cursor?.queueNumber ?? null}::bigint,${cursor?.entryId ?? null}::uuid,
          ${cursor?.queueVersion ?? null}::integer,${page.limit + 1}
        ) as response`;
      if (row?.response === null || row?.response === undefined)
        return { items: [], nextCursor: null, freshness: 'fresh' as const };
      const queue = this.parseQueue(row.response);
      const visibleEntries = queue.entries.slice(0, page.limit);
      const nextCursor =
        queue.entries.length > page.limit && visibleEntries.at(-1)
          ? this.encodeQueueCursor(visibleEntries.at(-1)!, queue.version, filter)
          : null;
      const pagedQueue = { ...queue, entries: visibleEntries, nextCursor };
      return { items: [pagedQueue], nextCursor, freshness: 'fresh' as const };
    });
  }

  public getMyQueuePosition(
    actor: ClinicSchedulingActor,
    appointmentId: string,
  ): Promise<QueuePosition | null> {
    return this.withActor(actor, 'appointment.manage', ['appointment.scheduling'], async (sql) => {
      const [row] = await sql<{ response: unknown }[]>`
        select clinical.read_queue_position_v1(${appointmentId}::uuid) as response`;
      if (row?.response === null || row?.response === undefined) return null;
      return this.parseQueuePosition(row.response, appointmentId);
    });
  }

  public readMyAppointment(
    actor: ClinicSchedulingActor,
    appointmentId: string,
  ): Promise<SubjectAppointmentProjection | null> {
    return this.withActor(actor, 'appointment.manage', ['appointment.scheduling'], async (sql) => {
      const [row] = await sql<SubjectAppointmentDbRow[]>`
        select id,starts_at,ends_at,status,version
        from clinical.read_my_appointment_v1(${appointmentId}::uuid)`;
      return row
        ? {
            id: row.id,
            startsAt: this.iso(row.starts_at),
            endsAt: this.iso(row.ends_at),
            status: row.status,
            version: Number(row.version),
          }
        : null;
    });
  }

  public readMyQueuePosition(
    actor: ClinicSchedulingActor,
    appointmentId: string,
  ): Promise<SubjectQueueProjection | null> {
    return this.withActor(actor, 'appointment.manage', ['appointment.scheduling'], async (sql) => {
      const [row] = await sql<SubjectQueueDbRow[]>`
        select queue_number,waiting_order,state,estimated_service_at,version,updated_at
        from clinical.read_my_queue_position_v1(${appointmentId}::uuid)`;
      return row
        ? {
            appointmentId,
            queueNumber: Number(row.queue_number),
            position: row.waiting_order === null ? null : Number(row.waiting_order),
            state: row.state,
            estimatedServiceAt:
              row.estimated_service_at === null ? null : this.iso(row.estimated_service_at),
            queueVersion: Number(row.version),
            updatedAt: this.iso(row.updated_at),
            stale: false,
          }
        : null;
    });
  }

  private withRequest<T>(
    request: ClinicSchedulingMutationContext,
    action: string,
    purposes: readonly string[],
    work: (sql: TransactionSql) => Promise<T>,
    requireIdempotency = true,
  ): Promise<T> {
    const actor = request.actor;
    if ((request.idempotencyKey === undefined) !== (request.requestHash === undefined)) {
      throw new Error('Idempotency key and request hash must be supplied together.');
    }
    if (requireIdempotency && (!request.idempotencyKey || !request.requestHash)) {
      throw new Error('An idempotency key and request hash are required for mutations.');
    }
    return this.repository.withRawTransaction(async (sql) => {
      await sql`
        select set_config('shifaa.person_id',${actor.personId},true),
          set_config('shifaa.principal',${actor.principal},true),
          set_config('shifaa.request_id',${actor.requestId},true),
          set_config('shifaa.trace_id',${actor.traceId},true),
          set_config('shifaa.aal',${String(actor.aal)},true),
          set_config('shifaa.action',${action},true),
          set_config('shifaa.purposes',${purposes.join(',')},true),
          set_config('shifaa.environment',${this.environment},true),
          set_config('shifaa.idempotency_key',${request.idempotencyKey ?? ''},true),
          set_config('shifaa.request_hash',${request.requestHash ?? ''},true),
          set_config('statement_timeout','5000',true),set_config('lock_timeout','2000',true)
      `;
      return work(sql);
    });
  }

  private withActor<T>(
    actor: ClinicSchedulingActor,
    action: string,
    purposes: readonly string[],
    work: (sql: TransactionSql) => Promise<T>,
  ): Promise<T> {
    return this.withRequest({ actor }, action, purposes, work, false);
  }

  private withPublicActor<T>(
    actor: ClinicSchedulingPublicActor,
    action: string,
    purposes: readonly string[],
    work: (sql: TransactionSql) => Promise<T>,
  ): Promise<T> {
    return this.repository.withRawTransaction(async (sql) => {
      await sql`
        select set_config('shifaa.person_id',${actor?.personId ?? ''},true),
          set_config('shifaa.principal',${actor?.principal ?? ''},true),
          set_config('shifaa.request_id',${actor?.requestId ?? 'public-read'},true),
          set_config('shifaa.trace_id',${actor?.traceId ?? 'public-read'},true),
          set_config('shifaa.aal',${String(actor?.aal ?? 0)},true),
          set_config('shifaa.action',${action},true),
          set_config('shifaa.purposes',${purposes.join(',')},true),
          set_config('shifaa.environment',${this.environment},true),
          set_config('statement_timeout','5000',true),set_config('lock_timeout','2000',true)
      `;
      return work(sql);
    });
  }

  private coordinates(
    value: string | undefined,
  ): { latitude: number; longitude: number } | undefined {
    if (!value) return undefined;
    const parts = value.split(',');
    const latitude = Number(parts[0]);
    const longitude = Number(parts[1]);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude))
      throw new Error('Invalid discovery coordinates.');
    return { latitude, longitude };
  }

  private doctorCursor(
    value: string | undefined,
    filter: DoctorSearchFilter,
  ): DoctorSearchCursor | null {
    if (value === undefined || value === '') return null;
    let parsed: unknown;
    try {
      parsed = JSON.parse(Buffer.from(value, 'base64url').toString('utf8')) as unknown;
    } catch {
      throw this.cursorError('Invalid discovery cursor.');
    }
    if (!parsed || typeof parsed !== 'object') throw this.cursorError('Invalid discovery cursor.');
    const cursor = parsed as Partial<DoctorSearchCursor>;
    if (
      cursor.version !== 1 ||
      (cursor.distance !== null &&
        (typeof cursor.distance !== 'number' ||
          !Number.isFinite(cursor.distance) ||
          cursor.distance < 0)) ||
      typeof cursor.doctorId !== 'string' ||
      typeof cursor.facilityId !== 'string' ||
      cursor.filterBinding !== this.doctorFilterBinding(filter) ||
      !this.isUuid(cursor.doctorId) ||
      !this.isUuid(cursor.facilityId)
    ) {
      throw this.cursorError('Invalid discovery cursor.');
    }
    return cursor as DoctorSearchCursor;
  }

  private encodeDoctorCursor(row: DoctorSearchDbRow, filter: DoctorSearchFilter): string {
    const cursor: DoctorSearchCursor = {
      version: 1,
      distance: row.distance_m === null ? null : Number(row.distance_m),
      doctorId: row.doctor_id,
      facilityId: row.facility_id,
      filterBinding: this.doctorFilterBinding(filter),
    };
    return Buffer.from(JSON.stringify(cursor), 'utf8').toString('base64url');
  }

  private doctorFilterBinding(filter: DoctorSearchFilter): string {
    return createHash('sha256')
      .update(
        JSON.stringify([
          filter.specialty ?? null,
          filter.facilityId ?? null,
          filter.near ?? null,
          filter.radius ?? null,
          filter.date ?? null,
        ]),
        'utf8',
      )
      .digest('hex');
  }

  private queueCursor(
    value: string | undefined,
    filter: Pick<QueueFilter, 'doctorId' | 'date'> & { readonly facilityId: string },
  ): QueueCursor | null {
    if (value === undefined || value === '') return null;
    let parsed: unknown;
    try {
      parsed = JSON.parse(Buffer.from(value, 'base64url').toString('utf8')) as unknown;
    } catch {
      throw this.cursorError('Invalid queue cursor.');
    }
    if (!parsed || typeof parsed !== 'object') throw this.cursorError('Invalid queue cursor.');
    const cursor = parsed as Partial<QueueCursor>;
    const stateRank = cursor.stateRank;
    const waitingOrder = cursor.waitingOrder;
    const queueNumber = cursor.queueNumber;
    const queueVersion = cursor.queueVersion;
    if (
      cursor.version !== 1 ||
      typeof stateRank !== 'number' ||
      !Number.isSafeInteger(stateRank) ||
      stateRank < 0 ||
      stateRank > 3 ||
      (waitingOrder !== null &&
        (typeof waitingOrder !== 'number' ||
          !Number.isSafeInteger(waitingOrder) ||
          waitingOrder < 1)) ||
      typeof queueNumber !== 'number' ||
      !Number.isSafeInteger(queueNumber) ||
      queueNumber < 1 ||
      typeof cursor.entryId !== 'string' ||
      !this.isUuid(cursor.entryId) ||
      typeof queueVersion !== 'number' ||
      !Number.isSafeInteger(queueVersion) ||
      queueVersion < 1 ||
      cursor.filterBinding !== this.queueFilterBinding(filter)
    ) {
      throw this.cursorError('Invalid queue cursor.');
    }
    return cursor as QueueCursor;
  }

  private encodeQueueCursor(
    entry: QueueEntry,
    queueVersion: number,
    filter: Pick<QueueFilter, 'doctorId' | 'date'> & { readonly facilityId: string },
  ): string {
    const cursor: QueueCursor = {
      version: 1,
      stateRank: this.queueStateRank(entry.state),
      waitingOrder: entry.position ?? null,
      queueNumber: entry.queueNumber,
      entryId: entry.id,
      queueVersion,
      filterBinding: this.queueFilterBinding(filter),
    };
    return Buffer.from(JSON.stringify(cursor), 'utf8').toString('base64url');
  }

  private queueFilterBinding(
    filter: Pick<QueueFilter, 'doctorId' | 'date'> & { readonly facilityId: string },
  ): string {
    return createHash('sha256')
      .update(JSON.stringify([filter.facilityId, filter.doctorId, filter.date]), 'utf8')
      .digest('hex');
  }

  private queueStateRank(state: QueueEntry['state']): number {
    return state === 'waiting' ? 0 : state === 'called' ? 1 : state === 'in_service' ? 2 : 3;
  }

  private isUuid(value: string): boolean {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
  }

  private cursorError(message: string): Error & { readonly code: 'cursor-invalid' } {
    const error = new Error(message) as Error & { code: 'cursor-invalid' };
    error.code = 'cursor-invalid';
    return error;
  }

  private timestampCursor(value: string | undefined): string | null {
    if (value === undefined || value === '') return null;
    if (!Number.isFinite(Date.parse(value))) throw new Error('Invalid read cursor.');
    return value;
  }

  private currency(value: string | undefined): 'EGP' {
    if (value !== undefined && value !== 'EGP') throw new Error('Unexpected currency projection.');
    return 'EGP';
  }

  private parseQueue(raw: unknown): Queue {
    return parseClinicSchedulingResponse('getQueue', raw) as Queue;
  }

  private parseQueuePosition(raw: unknown, appointmentId: string): QueuePosition {
    const value = parseClinicSchedulingResponse('getMyQueuePosition', raw) as QueuePosition;
    return value.appointmentId === appointmentId ? value : { ...value, appointmentId };
  }

  private localStart(value: string, timezone: string): string {
    const formatted = new Intl.DateTimeFormat('en-GB', {
      timeZone: timezone,
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }).format(new Date(value));
    return formatted;
  }

  private iso(value: Date | string): string {
    return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
  }

  private date(value: Date | string): string {
    return value instanceof Date ? value.toISOString().slice(0, 10) : String(value).slice(0, 10);
  }

  private nextDate(value: string): string {
    const date = new Date(`${value}T00:00:00.000Z`);
    date.setUTCDate(date.getUTCDate() + 1);
    return date.toISOString().slice(0, 10);
  }
}

export const PostgresClinicSchedulingRepository = PostgresClinicSchedulingService;
