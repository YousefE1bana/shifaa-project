import { ClinicSchedulingClient } from '@shifaa/api-client/clinic-scheduling';
import type {
  Appointment,
  AppointmentListQuery,
  AvailabilityPage,
  AvailabilityQuery,
  CancelAppointmentInput,
  RescheduleInput,
  CheckInResult,
  QueuePosition,
  CreateAppointmentInput,
  DoctorSearchPage,
  DoctorSearchQuery,
} from '@shifaa/contracts';

import { resolvePatientApiBaseUrl } from './patient-api-base-url.ts';
import { patientPlatform } from './patient-auth-store.ts';

export interface PatientClinicSchedulingApiOptions {
  locale: 'ar-EG' | 'en-EG';
  patientId?: string;
  accessToken?: string | (() => string | undefined);
  apiBaseUrl?: string;
  fetch?: typeof globalThis.fetch;
}

export function isClinicSchedulingOffline(): boolean {
  return typeof navigator !== 'undefined' && navigator.onLine === false;
}

export function assertClinicSchedulingOnline(): void {
  if (isClinicSchedulingOffline()) throw new Error('offline-no-queue');
}

function mutationKey(action: string): string {
  const random = globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2);
  return `clinic-ui-009-${action}-${random}`;
}

export class PatientClinicSchedulingApi {
  private readonly options: PatientClinicSchedulingApiOptions;
  private readonly baseUrl: string;
  private readonly clientOptions: ConstructorParameters<typeof ClinicSchedulingClient>[0];
  private pendingBooking: { signature: string; key: string } | null = null;

  public constructor(options: PatientClinicSchedulingApiOptions) {
    this.options = options;
    this.baseUrl = resolvePatientApiBaseUrl({
      platform: patientPlatform,
      configuredBaseUrl: options.apiBaseUrl ?? process.env['EXPO_PUBLIC_API_BASE_URL'],
      ...(typeof globalThis.location?.origin === 'string'
        ? { webOrigin: globalThis.location.origin }
        : {}),
    });
    this.clientOptions = {
      baseUrl: this.baseUrl,
      acceptLanguage: options.locale,
      ...(options.fetch ? { fetch: options.fetch } : {}),
    };
  }

  public searchDoctors(query: DoctorSearchQuery = {}): Promise<DoctorSearchPage> {
    return this.client().searchDoctors(query);
  }

  public listDoctorAvailability(
    facilityId: string,
    doctorId: string,
    query: AvailabilityQuery,
  ): Promise<AvailabilityPage> {
    return this.client().listDoctorAvailability(facilityId, doctorId, query);
  }

  public listMyAppointments(query: Omit<AppointmentListQuery, 'patientId'> = {}) {
    const patientId = this.requirePatientContext();
    return this.privateClient().listAppointments({ ...query, patientId });
  }

  public getMyAppointment(appointmentId: string): Promise<Appointment> {
    this.requirePatientContext();
    return this.privateClient().getAppointment(appointmentId);
  }

  public getMyQueuePosition(appointmentId: string): Promise<QueuePosition> {
    this.requirePatientContext();
    return this.privateClient().getMyQueuePosition(appointmentId);
  }

  public cancelMyAppointment(
    id: string,
    body: CancelAppointmentInput,
    version: number,
    key: string,
  ): Promise<Appointment> {
    assertClinicSchedulingOnline();
    this.requirePatientContext();
    return this.privateClient().cancelAppointment(id, body, version, key);
  }

  public rescheduleMyAppointment(
    id: string,
    body: RescheduleInput,
    version: number,
    key: string,
  ): Promise<Appointment> {
    assertClinicSchedulingOnline();
    this.requirePatientContext();
    return this.privateClient().rescheduleAppointment(id, body, version, key);
  }

  public checkInMyAppointment(id: string, version: number, key: string): Promise<CheckInResult> {
    assertClinicSchedulingOnline();
    this.requirePatientContext();
    return this.privateClient().checkInAppointment(id, version, key);
  }

  public async createAppointment(
    input: Omit<CreateAppointmentInput, 'patientId'> & { patientId?: string },
    explicitKey?: string,
  ): Promise<Appointment> {
    assertClinicSchedulingOnline();
    this.requireAccessToken();
    const patientId = this.requirePatientContext();
    const allowedFields = new Set([
      'patientId',
      'facilityId',
      'doctorId',
      'startsAt',
      'endsAt',
      'timezone',
      'civilDate',
      'paymentMethod',
      'sourceReferralId',
    ]);
    if (Object.keys(input).some((field) => !allowedFields.has(field)))
      throw new Error('booking-input-invalid');
    if (input.patientId && input.patientId !== patientId)
      throw new Error('patient-context-mismatch');
    if (input.paymentMethod !== 'cash_on_arrival') throw new Error('cash-only');

    const body: CreateAppointmentInput = {
      ...input,
      patientId,
      paymentMethod: 'cash_on_arrival',
    };
    const signature = JSON.stringify(body);
    const key = explicitKey ?? this.retainBookingKey(signature);
    try {
      const result = await this.privateClient().createAppointment(body, key);
      this.pendingBooking = null;
      return result;
    } catch (error) {
      // Preserve the key only when the commit outcome is uncertain.
      if (!isUncertainBookingFailure(error)) this.pendingBooking = null;
      throw error;
    }
  }

  private retainBookingKey(signature: string): string {
    if (!this.pendingBooking || this.pendingBooking.signature !== signature)
      this.pendingBooking = { signature, key: mutationKey('create-appointment') };
    return this.pendingBooking.key;
  }

  private client(): ClinicSchedulingClient {
    const accessToken = this.readAccessToken();
    return new ClinicSchedulingClient({
      ...this.clientOptions,
      ...(accessToken ? { accessToken } : {}),
    });
  }

  private privateClient(): ClinicSchedulingClient {
    const accessToken = this.requireAccessToken();
    return new ClinicSchedulingClient({ ...this.clientOptions, accessToken });
  }

  private readAccessToken(): string | undefined {
    return typeof this.options.accessToken === 'function'
      ? this.options.accessToken()
      : this.options.accessToken;
  }

  private requireAccessToken(): string {
    const token = this.readAccessToken();
    if (!token) throw new Error('authentication-required');
    return token;
  }

  private requirePatientContext(): string {
    if (!this.options.patientId) throw new Error('patient-context-required');
    return this.options.patientId;
  }
}

function isUncertainBookingFailure(error: unknown): boolean {
  if (error instanceof TypeError) return true;
  if (!error || typeof error !== 'object' || !('status' in error)) return false;
  const status = (error as { status?: unknown }).status;
  return typeof status === 'number' && (status === 408 || status === 429 || status >= 500);
}

export const createPatientClinicSchedulingClient = (options: PatientClinicSchedulingApiOptions) =>
  new PatientClinicSchedulingApi(options);
