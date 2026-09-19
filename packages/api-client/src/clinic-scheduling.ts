// @generated from specs/009-clinic-scheduling-appointments-queue/contracts/openapi.yaml — DO NOT EDIT.

import type {
  AbsenceInput,
  AppointmentListQuery,
  AvailabilityQuery,
  CancelAppointmentInput,
  CreateAppointmentInput,
  CreateScheduleExceptionInput,
  CreateScheduleInput,
  DelayInput,
  DoctorSearchQuery,
  QueueQuery,
  ReorderInput,
  RescheduleInput,
  UpdateScheduleInput,
  DoctorSearchPage,
  AvailabilityPage,
  Schedule,
  ScheduleException,
  AppointmentPage,
  Appointment,
  CheckInResult,
  Queue,
  QueuePosition,
  QueueEntry,
  DelayResult,
  AbsenceResult,
} from '@shifaa/contracts';

export const generatedClinicSchedulingOperationIds = [
  'searchDoctors',
  'listDoctorAvailability',
  'createSchedule',
  'updateSchedule',
  'createScheduleException',
  'listAppointments',
  'createAppointment',
  'getAppointment',
  'cancelAppointment',
  'rescheduleAppointment',
  'checkInAppointment',
  'getQueue',
  'getMyQueuePosition',
  'callQueueEntry',
  'reorderQueueEntry',
  'completeQueueEntry',
  'sendDoctorDelay',
  'declareDoctorAbsence',
] as const;

export interface ClinicSchedulingClientOptions {
  baseUrl: string;
  accessToken?: string;
  fetch?: typeof globalThis.fetch;
  acceptLanguage?: 'ar-EG' | 'en-EG';
  defaultHeaders?: Record<string, string>;
}
export interface ClinicSchedulingRequestOptions {
  signal?: AbortSignal;
}
export class ClinicSchedulingApiError extends Error {
  public constructor(
    public readonly status: number,
    public readonly problem: unknown,
  ) {
    super(`SHIFAA clinic scheduling API failed with status ${status}.`);
    this.name = 'ClinicSchedulingApiError';
  }
}
export class ClinicSchedulingClient {
  private readonly fetcher: typeof globalThis.fetch;
  public constructor(private readonly options: ClinicSchedulingClientOptions) {
    this.fetcher = (options.fetch ?? globalThis.fetch).bind(globalThis);
  }
  private queryPath(path: string, query: object): string {
    const values = new URLSearchParams();
    for (const [key, value] of Object.entries(query))
      if (value !== undefined && value !== '') values.set(key, String(value));
    return values.size ? `${path}?${values}` : path;
  }
  public searchDoctors(
    query: DoctorSearchQuery = {},
    options: ClinicSchedulingRequestOptions = {},
  ): Promise<DoctorSearchPage> {
    return this.request<DoctorSearchPage>('GET', this.queryPath('/discovery/doctors', query), {
      anonymous: true,
      ...options,
    });
  }
  public listDoctorAvailability(
    facilityId: string,
    doctorId: string,
    query: AvailabilityQuery,
    options: ClinicSchedulingRequestOptions = {},
  ): Promise<AvailabilityPage> {
    return this.request<AvailabilityPage>(
      'GET',
      this.queryPath(
        `/clinics/${encodeURIComponent(facilityId)}/doctors/${encodeURIComponent(doctorId)}/availability`,
        query,
      ),
      { anonymous: true, ...options },
    );
  }
  public createSchedule(
    facilityId: string,
    body: CreateScheduleInput,
    idempotencyKey: string,
    options: ClinicSchedulingRequestOptions = {},
  ): Promise<Schedule> {
    return this.request<Schedule>('POST', `/clinics/${encodeURIComponent(facilityId)}/schedules`, {
      body,
      idempotencyKey,
      ...options,
    });
  }
  public updateSchedule(
    facilityId: string,
    scheduleId: string,
    body: UpdateScheduleInput,
    version: number,
    idempotencyKey: string,
    options: ClinicSchedulingRequestOptions = {},
  ): Promise<Schedule> {
    return this.request<Schedule>(
      'PATCH',
      `/clinics/${encodeURIComponent(facilityId)}/schedules/${encodeURIComponent(scheduleId)}`,
      { body, version, idempotencyKey, ...options },
    );
  }
  public createScheduleException(
    facilityId: string,
    scheduleId: string,
    body: CreateScheduleExceptionInput,
    version: number,
    idempotencyKey: string,
    options: ClinicSchedulingRequestOptions = {},
  ): Promise<ScheduleException> {
    return this.request<ScheduleException>(
      'POST',
      `/clinics/${encodeURIComponent(facilityId)}/schedules/${encodeURIComponent(scheduleId)}/exceptions`,
      { body, version, idempotencyKey, ...options },
    );
  }
  public listAppointments(
    query: AppointmentListQuery = {},
    options: ClinicSchedulingRequestOptions = {},
  ): Promise<AppointmentPage> {
    return this.request<AppointmentPage>('GET', this.queryPath('/appointments', query), {
      ...options,
    });
  }
  public createAppointment(
    body: CreateAppointmentInput,
    idempotencyKey: string,
    options: ClinicSchedulingRequestOptions = {},
  ): Promise<Appointment> {
    return this.request<Appointment>('POST', '/appointments', { body, idempotencyKey, ...options });
  }
  public getAppointment(
    appointmentId: string,
    options: ClinicSchedulingRequestOptions = {},
  ): Promise<Appointment> {
    return this.request<Appointment>('GET', `/appointments/${encodeURIComponent(appointmentId)}`, {
      ...options,
    });
  }
  public cancelAppointment(
    appointmentId: string,
    body: CancelAppointmentInput,
    version: number,
    idempotencyKey: string,
    options: ClinicSchedulingRequestOptions = {},
  ): Promise<Appointment> {
    return this.request<Appointment>(
      'POST',
      `/appointments/${encodeURIComponent(appointmentId)}/cancel`,
      { body, version, idempotencyKey, ...options },
    );
  }
  public rescheduleAppointment(
    appointmentId: string,
    body: RescheduleInput,
    version: number,
    idempotencyKey: string,
    options: ClinicSchedulingRequestOptions = {},
  ): Promise<Appointment> {
    return this.request<Appointment>(
      'POST',
      `/appointments/${encodeURIComponent(appointmentId)}/reschedule`,
      { body, version, idempotencyKey, ...options },
    );
  }
  public checkInAppointment(
    appointmentId: string,
    version: number,
    idempotencyKey: string,
    options: ClinicSchedulingRequestOptions = {},
  ): Promise<CheckInResult> {
    return this.request<CheckInResult>(
      'POST',
      `/appointments/${encodeURIComponent(appointmentId)}/check-in`,
      { version, idempotencyKey, ...options },
    );
  }
  public getQueue(
    facilityId: string,
    query: QueueQuery,
    options: ClinicSchedulingRequestOptions = {},
  ): Promise<Queue> {
    return this.request<Queue>(
      'GET',
      this.queryPath(`/clinics/${encodeURIComponent(facilityId)}/queues`, query),
      { ...options },
    );
  }
  public getMyQueuePosition(
    appointmentId: string,
    options: ClinicSchedulingRequestOptions = {},
  ): Promise<QueuePosition> {
    return this.request<QueuePosition>(
      'GET',
      `/appointments/${encodeURIComponent(appointmentId)}/queue-position`,
      { ...options },
    );
  }
  public callQueueEntry(
    queueEntryId: string,
    version: number,
    idempotencyKey: string,
    options: ClinicSchedulingRequestOptions = {},
  ): Promise<QueueEntry> {
    return this.request<QueueEntry>(
      'POST',
      `/queue-entries/${encodeURIComponent(queueEntryId)}/call`,
      { version, idempotencyKey, ...options },
    );
  }
  public reorderQueueEntry(
    queueEntryId: string,
    body: ReorderInput,
    version: number,
    idempotencyKey: string,
    options: ClinicSchedulingRequestOptions = {},
  ): Promise<Queue> {
    return this.request<Queue>(
      'POST',
      `/queue-entries/${encodeURIComponent(queueEntryId)}/reorder`,
      { body, version, idempotencyKey, ...options },
    );
  }
  public completeQueueEntry(
    queueEntryId: string,
    version: number,
    idempotencyKey: string,
    options: ClinicSchedulingRequestOptions = {},
  ): Promise<QueueEntry> {
    return this.request<QueueEntry>(
      'POST',
      `/queue-entries/${encodeURIComponent(queueEntryId)}/complete`,
      { version, idempotencyKey, ...options },
    );
  }
  public sendDoctorDelay(
    facilityId: string,
    doctorId: string,
    body: DelayInput,
    idempotencyKey: string,
    options: ClinicSchedulingRequestOptions = {},
  ): Promise<DelayResult> {
    return this.request<DelayResult>(
      'POST',
      `/clinics/${encodeURIComponent(facilityId)}/doctors/${encodeURIComponent(doctorId)}/delay`,
      { body, idempotencyKey, ...options },
    );
  }
  public declareDoctorAbsence(
    facilityId: string,
    doctorId: string,
    body: AbsenceInput,
    idempotencyKey: string,
    options: ClinicSchedulingRequestOptions = {},
  ): Promise<AbsenceResult> {
    return this.request<AbsenceResult>(
      'POST',
      `/clinics/${encodeURIComponent(facilityId)}/doctors/${encodeURIComponent(doctorId)}/absence`,
      { body, idempotencyKey, ...options },
    );
  }
  private async request<T>(
    method: 'GET' | 'POST' | 'PATCH',
    path: string,
    input: {
      body?: unknown;
      version?: number;
      idempotencyKey?: string;
      anonymous?: boolean;
      signal?: AbortSignal;
    } = {},
  ): Promise<T> {
    const headers = new Headers({
      Accept: 'application/json, application/problem+json',
      'Accept-Language': this.options.acceptLanguage ?? 'ar-EG',
      ...(this.options.defaultHeaders ?? {}),
    });
    if (input.anonymous) headers.delete('Authorization');
    else {
      if (!this.options.accessToken)
        throw new ClinicSchedulingApiError(401, { code: 'authentication-required' });
      headers.set('Authorization', `Bearer ${this.options.accessToken}`);
    }
    if (input.body !== undefined) {
      headers.set('Content-Type', 'application/json');
    }
    if (input.idempotencyKey) headers.set('Idempotency-Key', input.idempotencyKey);
    if (input.version !== undefined) headers.set('If-Match', `"${input.version}"`);
    const response = await this.fetcher(
      `${this.options.baseUrl.endsWith('/') ? this.options.baseUrl.slice(0, -1) : this.options.baseUrl}/v1${path}`,
      {
        method,
        headers,
        cache: 'no-store',
        ...(input.signal ? { signal: input.signal } : {}),
        ...(input.body === undefined ? {} : { body: JSON.stringify(input.body) }),
      },
    );
    const payload = response.status === 204 ? undefined : await response.json();
    if (!response.ok) throw new ClinicSchedulingApiError(response.status, payload);
    return payload as T;
  }
}
export const createClinicSchedulingClient = (options: ClinicSchedulingClientOptions) =>
  new ClinicSchedulingClient(options);
