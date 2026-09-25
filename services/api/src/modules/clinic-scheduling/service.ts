import { createHmac, randomBytes } from 'node:crypto';

import type {
  AppointmentFilter,
  AppointmentListRow,
  AvailabilityFilter,
  AvailabilityReadPage,
  AvailabilityRow,
  BoundedReadPage,
  BoundedReadPageInput,
  ClinicSchedulingActor,
  ClinicSchedulingAuthorizationPort,
  ClinicSchedulingCachePort,
  ClinicSchedulingClockPort,
  ClinicSchedulingFeatureFlagPort,
  ClinicSchedulingPublicActor,
  ClinicSchedulingReadPort,
  ClinicSchedulingReadFreshness,
  ClinicSchedulingRepository,
  ClinicSchedulingRequestContext,
  DoctorSearchFilter,
  DoctorSearchRow,
  QueueFilter,
  QueueRow,
  RequestedScope,
} from './types.js';

const MAX_PAGE_SIZE = 100;
const MAX_CURSOR_SIZE = 512;
const CACHE_TTL_MS = 30_000;
const PUBLIC_READ_OPERATIONS = new Set(['searchDoctors', 'listDoctorAvailability']);
// Cache entries expire quickly. A process-local secret keeps identifiers and
// search inputs out of cache metadata; a different process simply misses them.
const CACHE_KEY_SECRET = randomBytes(32);

export class ClinicSchedulingServiceError extends Error {
  public constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'ClinicSchedulingServiceError';
  }
}

export interface ClinicSchedulingServiceDependencies {
  readonly authorization: ClinicSchedulingAuthorizationPort;
  readonly featureFlags: ClinicSchedulingFeatureFlagPort;
  readonly read: ClinicSchedulingReadPort;
  readonly clock: ClinicSchedulingClockPort;
  readonly cache: ClinicSchedulingCachePort;
  readonly repository?: ClinicSchedulingRepository;
}

export type ClinicSchedulingReadResult<TPage extends BoundedReadPage<unknown>> = TPage & {
  readonly degraded: boolean;
};

export interface ClinicSchedulingProjectionReadResult<T> {
  readonly value: T;
  readonly freshness: ClinicSchedulingReadFreshness;
  readonly degraded: boolean;
}

export class ClinicSchedulingService {
  private readonly authorization: ClinicSchedulingAuthorizationPort;
  private readonly featureFlags: ClinicSchedulingFeatureFlagPort;
  private readonly read: ClinicSchedulingReadPort;
  private readonly clock: ClinicSchedulingClockPort;
  private readonly cache: ClinicSchedulingCachePort;
  private readonly repository: ClinicSchedulingRepository | undefined;

  public constructor(dependencies: ClinicSchedulingServiceDependencies) {
    this.authorization = dependencies.authorization;
    this.featureFlags = dependencies.featureFlags;
    this.read = dependencies.read;
    this.clock = dependencies.clock;
    this.cache = dependencies.cache;
    this.repository = dependencies.repository;
  }

  public async searchDoctors(
    actor: ClinicSchedulingPublicActor,
    filter: DoctorSearchFilter,
    page: BoundedReadPageInput,
  ): Promise<ClinicSchedulingReadResult<BoundedReadPage<DoctorSearchRow>>> {
    this.validatePage(page);
    await this.requireServerRead();
    return this.readWithFallback(actor, 'searchDoctors', { filter, page }, () =>
      this.read.searchDoctors(actor, filter, page),
    );
  }

  public async listDoctorAvailability(
    actor: ClinicSchedulingPublicActor,
    facilityId: string,
    doctorId: string,
    filter: Pick<AvailabilityFilter, 'fromDate' | 'toDate'>,
    page: BoundedReadPageInput,
  ): Promise<ClinicSchedulingReadResult<AvailabilityReadPage>> {
    this.validatePage(page);
    await this.requireServerRead();
    return this.availabilityWithFallback(
      actor,
      'listDoctorAvailability',
      { facilityId, doctorId, filter, page },
      () => this.read.listAvailabilityPage(actor, facilityId, doctorId, filter, page),
    );
  }

  public async getAppointment(actor: ClinicSchedulingActor, appointmentId: string) {
    await this.requireServerRead();
    await this.authorize(actor, 'appointment.manage', { appointmentId });
    return this.projectionReadWithFallback(actor, 'getAppointment', { appointmentId }, () =>
      this.read.getAppointment(actor, appointmentId),
    );
  }

  public async listAppointments(
    actor: ClinicSchedulingActor,
    filter: AppointmentFilter,
    page: BoundedReadPageInput,
  ): Promise<ClinicSchedulingReadResult<BoundedReadPage<AppointmentListRow>>> {
    this.validatePage(page);
    await this.requireServerRead();
    await this.authorize(actor, 'appointment.manage', this.appointmentScope(filter));
    return this.readWithFallback(actor, 'listAppointments', { filter, page }, () =>
      this.read.listAppointments(actor, filter, page),
    );
  }

  public async getQueue(
    actor: ClinicSchedulingActor,
    filter: Pick<QueueFilter, 'doctorId' | 'date'> & { readonly facilityId: string },
    page: BoundedReadPageInput,
  ): Promise<ClinicSchedulingReadResult<BoundedReadPage<QueueRow>>> {
    this.validatePage(page);
    await this.requireServerRead();
    await this.authorize(actor, 'queue.manage', {
      facilityId: filter.facilityId,
      doctorId: filter.doctorId,
      civilDate: filter.date,
    });
    return this.readWithFallback(actor, 'getQueue', { filter, page }, () =>
      this.read.getQueue(actor, filter, page),
    );
  }

  public async getMyQueuePosition(actor: ClinicSchedulingActor, appointmentId: string) {
    await this.requireServerRead();
    await this.authorize(actor, 'appointment.manage', { appointmentId });
    return this.projectionWithFallback(
      actor,
      'getMyQueuePosition',
      { appointmentId },
      () => this.read.getMyQueuePosition(actor, appointmentId),
      (cached) => (cached ? { ...cached, stale: true } : cached),
    );
  }

  public async createSchedule(
    request: ClinicSchedulingRequestContext,
    facilityId: string,
    input: Parameters<ClinicSchedulingRepository['createSchedule']>[2],
  ) {
    await this.prepareMutation(request, 'schedule.manage', {
      facilityId,
      doctorId: input.doctorId,
    });
    return this.repositoryOrThrow().createSchedule(request, facilityId, input);
  }

  public async updateSchedule(
    request: ClinicSchedulingRequestContext,
    scheduleId: string,
    expectedVersion: number,
    input: Parameters<ClinicSchedulingRepository['updateSchedule']>[3],
  ) {
    this.rejectOwnProperty(input, 'doctorId');
    this.rejectOwnProperty(input, 'currency');
    this.rejectOwnProperty(input, 'currencyCode');
    this.rejectOwnProperty(input, 'currency_code');
    this.validateExpectedVersion(expectedVersion);
    await this.prepareMutation(request, 'schedule.manage', { scheduleId });
    return this.repositoryOrThrow().updateSchedule(request, scheduleId, expectedVersion, input);
  }

  public async createScheduleException(
    request: ClinicSchedulingRequestContext,
    scheduleId: string,
    expectedVersion: number,
    input: Parameters<ClinicSchedulingRepository['createScheduleException']>[3],
  ) {
    this.rejectExceptionBypass(input);
    this.validateReason(input.reason);
    this.validateExpectedVersion(expectedVersion);
    await this.prepareMutation(request, 'schedule.manage', { scheduleId });
    return this.repositoryOrThrow().createScheduleException(
      request,
      scheduleId,
      expectedVersion,
      input,
    );
  }

  public async createAppointment(
    request: ClinicSchedulingRequestContext,
    facilityId: string,
    input: Parameters<ClinicSchedulingRepository['createAppointment']>[2],
  ) {
    this.rejectOwnProperty(input as object, 'feeMinorUnits');
    this.rejectOwnProperty(input as object, 'currency');
    this.rejectOwnProperty(input as object, 'fee_minor_units');
    this.rejectOwnProperty(input as object, 'currency_code');
    if (input.facilityId !== facilityId) {
      throw new ClinicSchedulingServiceError(
        'facility-context-invalid',
        'The supplied facility does not match the route target.',
      );
    }
    if (input.paymentMethod !== 'cash_on_arrival') {
      throw new ClinicSchedulingServiceError(
        'payment-method-disabled',
        'Only cash on arrival is enabled for Feature 009.',
      );
    }
    await this.prepareMutation(request, 'appointment.manage', {
      facilityId,
      doctorId: input.doctorId,
      patientId: input.patientId,
    });
    return this.repositoryOrThrow().createAppointment(request, facilityId, input);
  }

  public async cancelAppointment(
    request: ClinicSchedulingRequestContext,
    appointmentId: string,
    expectedVersion: number,
    input: Parameters<ClinicSchedulingRepository['cancelAppointment']>[3],
  ) {
    this.validateExpectedVersion(expectedVersion);
    this.validateReason(input.reason);
    await this.prepareMutation(request, 'appointment.manage', { appointmentId });
    return this.repositoryOrThrow().cancelAppointment(
      request,
      appointmentId,
      expectedVersion,
      input,
    );
  }

  public async rescheduleAppointment(
    request: ClinicSchedulingRequestContext,
    appointmentId: string,
    expectedVersion: number,
    input: Parameters<ClinicSchedulingRepository['rescheduleAppointment']>[3],
  ) {
    this.validateExpectedVersion(expectedVersion);
    this.validateReason(input.reason);
    await this.prepareMutation(request, 'appointment.manage', { appointmentId });
    return this.repositoryOrThrow().rescheduleAppointment(
      request,
      appointmentId,
      expectedVersion,
      input,
    );
  }

  public async checkInAppointment(
    request: ClinicSchedulingRequestContext,
    appointmentId: string,
    expectedVersion: number,
  ) {
    this.validateExpectedVersion(expectedVersion);
    await this.prepareMutation(request, 'appointment.manage', { appointmentId });
    return this.repositoryOrThrow().checkInAppointment(request, appointmentId, expectedVersion);
  }

  public async callQueueEntry(
    request: ClinicSchedulingRequestContext,
    queueEntryId: string,
    expectedVersion: number,
  ) {
    this.validateExpectedVersion(expectedVersion);
    await this.prepareMutation(request, 'queue.manage', { queueEntryId });
    return this.repositoryOrThrow().callQueueEntry(request, queueEntryId, expectedVersion);
  }

  public async reorderQueueEntry(
    request: ClinicSchedulingRequestContext,
    queueEntryId: string,
    expectedVersion: number,
    expectedQueueVersion: number,
    targetPosition: number,
    reason: string,
  ) {
    this.validateExpectedVersion(expectedVersion);
    this.validateExpectedVersion(expectedQueueVersion);
    this.validateReason(reason);
    if (!Number.isSafeInteger(targetPosition) || targetPosition < 1) {
      throw new ClinicSchedulingServiceError(
        'target-position-invalid',
        'A positive target position is required.',
      );
    }
    await this.prepareMutation(request, 'queue.manage', { queueEntryId });
    return this.repositoryOrThrow().reorderQueueEntry(
      request,
      queueEntryId,
      expectedVersion,
      expectedQueueVersion,
      targetPosition,
      reason,
    );
  }

  public async completeQueueEntry(
    request: ClinicSchedulingRequestContext,
    queueEntryId: string,
    expectedVersion: number,
  ) {
    this.validateExpectedVersion(expectedVersion);
    await this.prepareMutation(request, 'queue.manage', { queueEntryId });
    return this.repositoryOrThrow().completeQueueEntry(request, queueEntryId, expectedVersion);
  }

  public async sendDoctorDelay(
    request: ClinicSchedulingRequestContext,
    facilityId: string,
    doctorId: string,
    input: Parameters<ClinicSchedulingRepository['sendDoctorDelay']>[3],
  ) {
    this.validateReason(input.reason);
    await this.prepareMutation(request, 'delay.manage', {
      facilityId,
      doctorId,
      civilDate: input.civilDate,
    });
    return this.repositoryOrThrow().sendDoctorDelay(request, facilityId, doctorId, input);
  }

  public async declareDoctorAbsence(
    request: ClinicSchedulingRequestContext,
    facilityId: string,
    doctorId: string,
    input: Parameters<ClinicSchedulingRepository['declareDoctorAbsence']>[3],
  ) {
    this.validateReason(input.reason);
    await this.prepareMutation(request, 'absence.manage', {
      facilityId,
      doctorId,
      civilDate: input.civilDate,
    });
    return this.repositoryOrThrow().declareDoctorAbsence(request, facilityId, doctorId, input);
  }

  private async requireServerRead(): Promise<void> {
    if (!(await this.featureFlags.enabled('clinic_scheduling.server'))) {
      throw new ClinicSchedulingServiceError(
        'feature-disabled',
        'Clinic scheduling is unavailable.',
      );
    }
  }

  private async prepareMutation(
    request: ClinicSchedulingRequestContext,
    action: Parameters<ClinicSchedulingAuthorizationPort['authorize']>[1],
    target: RequestedScope,
  ): Promise<void> {
    if (!(await this.featureFlags.enabled('clinic_scheduling.server'))) {
      throw new ClinicSchedulingServiceError(
        'feature-disabled',
        'Clinic scheduling is unavailable.',
      );
    }
    if (!(await this.featureFlags.enabled('clinic_scheduling.mutations'))) {
      throw new ClinicSchedulingServiceError(
        'mutations-disabled',
        'Clinic scheduling mutations are unavailable.',
      );
    }
    await this.authorize(request.actor, action, target);
  }

  private async authorize(
    actor: ClinicSchedulingActor,
    action: Parameters<ClinicSchedulingAuthorizationPort['authorize']>[1],
    target: RequestedScope,
  ): Promise<void> {
    await this.authorization.authorize(actor, action, target);
  }

  private repositoryOrThrow(): ClinicSchedulingRepository {
    if (!this.repository)
      throw new ClinicSchedulingServiceError(
        'dependency-unavailable',
        'Mutation repository is unavailable.',
      );
    return this.repository;
  }

  private async readWithFallback<T>(
    actor: ClinicSchedulingPublicActor,
    operation: string,
    cacheInput: unknown,
    readOperation: () => Promise<BoundedReadPage<T>>,
  ): Promise<ClinicSchedulingReadResult<BoundedReadPage<T>>> {
    const cacheKey = this.cacheKey(actor, operation, cacheInput);
    try {
      const page = await readOperation();
      try {
        await this.cache.set(cacheKey, page, {
          ttlMs: CACHE_TTL_MS,
          private: !PUBLIC_READ_OPERATIONS.has(operation),
        });
      } catch {
        // Cache writes are best effort.  A current authoritative read must
        // not be converted into a degraded response by cache unavailability.
      }
      return { ...page, freshness: page.freshness ?? 'unknown', degraded: false };
    } catch (readError) {
      const cached = await this.cache.get<BoundedReadPage<T>>(cacheKey);
      if (cached) return { ...cached.value, freshness: 'stale', degraded: true };
      throw readError;
    }
  }

  private async availabilityWithFallback(
    actor: ClinicSchedulingPublicActor,
    operation: string,
    cacheInput: unknown,
    readOperation: () => Promise<AvailabilityReadPage>,
  ): Promise<ClinicSchedulingReadResult<AvailabilityReadPage>> {
    const cacheKey = this.cacheKey(actor, operation, cacheInput);
    try {
      const page = await readOperation();
      try {
        await this.cache.set(cacheKey, page, { ttlMs: CACHE_TTL_MS, private: false });
      } catch {
        // Preserve the authoritative availability result when cache storage is unavailable.
      }
      return { ...page, freshness: page.freshness ?? 'unknown', degraded: false };
    } catch (readError) {
      const cached = await this.cache.get<AvailabilityReadPage>(cacheKey);
      if (cached) return { ...cached.value, freshness: 'stale', degraded: true };
      throw readError;
    }
  }

  private async projectionWithFallback<T>(
    actor: ClinicSchedulingActor,
    operation: string,
    cacheInput: unknown,
    readOperation: () => Promise<T>,
    cachedFallback?: (value: T) => T,
  ): Promise<T> {
    const cacheKey = this.cacheKey(actor, operation, cacheInput);
    try {
      const projection = await readOperation();
      try {
        await this.cache.set(cacheKey, projection, { ttlMs: CACHE_TTL_MS, private: true });
      } catch {
        // Cache writes are not part of the read's correctness boundary.
      }
      return projection;
    } catch (readError) {
      const cached = await this.cache.get<T>(cacheKey);
      if (cached) return cachedFallback ? cachedFallback(cached.value) : cached.value;
      throw readError;
    }
  }

  private async projectionReadWithFallback<T>(
    actor: ClinicSchedulingActor,
    operation: string,
    cacheInput: unknown,
    readOperation: () => Promise<T>,
  ): Promise<ClinicSchedulingProjectionReadResult<T>> {
    const cacheKey = this.cacheKey(actor, operation, cacheInput);
    try {
      const projection = await readOperation();
      try {
        await this.cache.set(cacheKey, projection, { ttlMs: CACHE_TTL_MS, private: true });
      } catch {
        // Cache writes are not part of the read's correctness boundary.
      }
      return { value: projection, freshness: 'fresh', degraded: false };
    } catch (readError) {
      const cached = await this.cache.get<T>(cacheKey);
      if (cached) return { value: cached.value, freshness: 'stale', degraded: true };
      throw readError;
    }
  }

  private cacheKey(actor: ClinicSchedulingPublicActor, operation: string, input: unknown): string {
    const isPublic = PUBLIC_READ_OPERATIONS.has(operation);
    const scope = isPublic ? 'public' : 'private';
    const digest = createHmac('sha256', CACHE_KEY_SECRET)
      .update(
        JSON.stringify([scope, isPublic ? null : (actor?.personId ?? null), operation, input]),
      )
      .digest('hex');
    return `clinic-scheduling:${scope}:${operation}:${digest}`;
  }

  private appointmentScope(filter: AppointmentFilter): RequestedScope {
    return {
      ...(filter.patientId ? { patientId: filter.patientId } : {}),
      ...(filter.facilityId ? { facilityId: filter.facilityId } : {}),
      ...(filter.doctorId ? { doctorId: filter.doctorId } : {}),
      ...(filter.date ? { civilDate: filter.date } : {}),
    };
  }

  private validatePage(page: BoundedReadPageInput): void {
    if (!Number.isSafeInteger(page.limit) || page.limit < 1 || page.limit > MAX_PAGE_SIZE) {
      throw new ClinicSchedulingServiceError(
        'page-limit-invalid',
        'Page limit must be between 1 and 100.',
      );
    }
    if (
      page.cursor !== undefined &&
      (typeof page.cursor !== 'string' || page.cursor.length > MAX_CURSOR_SIZE)
    ) {
      throw new ClinicSchedulingServiceError(
        'cursor-invalid',
        'Cursor exceeds the maximum length.',
      );
    }
  }

  private validateExpectedVersion(expectedVersion: number): void {
    if (!Number.isSafeInteger(expectedVersion) || expectedVersion < 1) {
      throw new ClinicSchedulingServiceError(
        'version-invalid',
        'A positive expected version is required.',
      );
    }
  }

  private rejectOwnProperty(input: object, property: string): void {
    if (Object.prototype.hasOwnProperty.call(input, property)) {
      throw new ClinicSchedulingServiceError(
        'input-not-allowed',
        `${property} cannot be changed here.`,
      );
    }
  }

  private rejectExceptionBypass(input: object & { readonly type?: string }): void {
    if (
      Object.prototype.hasOwnProperty.call(input, 'delayMinutes') ||
      Object.prototype.hasOwnProperty.call(input, 'delay_minutes') ||
      (Object.prototype.hasOwnProperty.call(input, 'type') &&
        (input.type === 'delay' || input.type === 'absence'))
    ) {
      throw new ClinicSchedulingServiceError(
        'input-not-allowed',
        'Delay and absence require their dedicated operation.',
      );
    }
  }

  private validateReason(reason: string): void {
    if (
      typeof reason !== 'string' ||
      reason.trim().length < 1 ||
      [...reason].length > 500 ||
      /[\p{Cc}]/u.test(reason)
    ) {
      throw new ClinicSchedulingServiceError(
        'reason-invalid',
        'A bounded restricted reason is required.',
      );
    }
  }
}
