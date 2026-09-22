import { describe, expect, it, vi } from 'vitest';

import type {
  ClinicSchedulingAuthorizationPort,
  ClinicSchedulingCachePort,
  ClinicSchedulingFeatureFlagPort,
  ClinicSchedulingReadPort,
  ClinicSchedulingRepository,
} from './types.js';
import { ClinicSchedulingService } from './service.js';

const actor = {
  personId: 'f0090000-0000-4000-8000-000000000001',
  principal: 'synthetic-principal',
  requestId: 'f0090000-0000-4000-8000-000000000010',
  traceId: 'f0090000-0000-4000-8000-000000000011',
  aal: 1 as const,
  locale: 'en-EG' as const,
};
const request = { actor, idempotencyKey: 'key-1', requestHash: 'a'.repeat(64) };

function dependencies() {
  const authorization: ClinicSchedulingAuthorizationPort = {
    authorize: vi.fn(async (_actor, action, target) => ({
      action,
      facilityId: target.facilityId ?? 'f0090000-0000-0000-0000-000000000001',
      facilityVerified: true as const,
      doctorLicenseVerified: true as const,
      relationship: 'self' as const,
    })),
  };
  const featureFlags: ClinicSchedulingFeatureFlagPort = {
    enabled: vi.fn(async () => true),
  };
  const read: ClinicSchedulingReadPort = {
    searchDoctors: vi.fn(async () => ({ items: [], nextCursor: null })),
    listAvailabilityPage: vi.fn(async () => ({
      items: [],
      nextCursor: null,
      feeMinorUnits: 100,
      currency: 'EGP' as const,
      paymentMethod: 'cash_on_arrival' as const,
      version: 1,
    })),
    getAppointment: vi.fn(async () => null),
    listAppointments: vi.fn(async () => ({ items: [], nextCursor: null })),
    getQueue: vi.fn(async () => ({ items: [], nextCursor: null })),
    getMyQueuePosition: vi.fn(async () => null),
  };
  const repository = {
    createAppointment: vi.fn(async () => ({ id: 'appointment-1' })),
    rescheduleAppointment: vi.fn(async () => ({ id: 'appointment-1' })),
    updateSchedule: vi.fn(async () => ({ id: 'schedule-1' })),
    createScheduleException: vi.fn(async () => ({ id: 'exception-1' })),
    callQueueEntry: vi.fn(async () => ({ id: 'entry-1' })),
    reorderQueueEntry: vi.fn(async () => ({ id: 'entry-1' })),
    completeQueueEntry: vi.fn(async () => ({ id: 'entry-1' })),
    sendDoctorDelay: vi.fn(async () => ({ id: 'delay-1' })),
    declareDoctorAbsence: vi.fn(async () => ({ affectedCount: 1 })),
  } as unknown as ClinicSchedulingRepository;
  const cache: ClinicSchedulingCachePort = {
    get: vi.fn(async () => undefined),
    set: vi.fn(async () => undefined),
  };
  return {
    authorization,
    featureFlags,
    read,
    repository,
    clock: { now: () => new Date('2030-01-01T00:00:00.000Z') },
    cache,
  };
}

describe('clinic-scheduling-mutations', () => {
  it('keeps private cache entries distinct for different bounded page cursors', async () => {
    const deps = dependencies();
    const service = new ClinicSchedulingService(deps);

    await service.searchDoctors(actor, {}, { limit: 1, cursor: 'cursor-a' });
    await service.searchDoctors(actor, {}, { limit: 1, cursor: 'cursor-b' });

    const cacheKeys = vi.mocked(deps.cache.set).mock.calls.map(([key]) => key);
    expect(cacheKeys).toHaveLength(2);
    expect(cacheKeys[0]).not.toBe(cacheKeys[1]);
  });

  it.each([
    { doctorId: 'doctor-2' },
    { currency: 'USD' },
    { currencyCode: 'USD' },
    { currency_code: 'USD' },
  ])(
    'rejects schedule ownership or currency input %# before any dependency call',
    async (input) => {
      const deps = dependencies();
      await expect(
        new ClinicSchedulingService(deps).updateSchedule(request, 'schedule-1', 1, input as never),
      ).rejects.toMatchObject({ code: 'input-not-allowed' });
      expect(deps.featureFlags.enabled).not.toHaveBeenCalled();
      expect(deps.authorization.authorize).not.toHaveBeenCalled();
      expect(deps.repository.updateSchedule).not.toHaveBeenCalled();
    },
  );

  it.each([0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1])(
    'rejects invalid expected version %s before mutation dependencies',
    async (expectedVersion) => {
      const deps = dependencies();
      await expect(
        new ClinicSchedulingService(deps).updateSchedule(request, 'schedule-1', expectedVersion, {
          timezone: 'Africa/Cairo',
        }),
      ).rejects.toMatchObject({ code: 'version-invalid' });
      expect(deps.featureFlags.enabled).not.toHaveBeenCalled();
      expect(deps.authorization.authorize).not.toHaveBeenCalled();
      expect(deps.repository.updateSchedule).not.toHaveBeenCalled();
    },
  );

  it.each([
    { input: { type: 'delay' }, label: 'delay type' },
    { input: { type: 'absence' }, label: 'absence type' },
    { input: { delayMinutes: 15 }, label: 'delay minutes' },
    { input: { delay_minutes: 15 }, label: 'delay minutes database casing' },
  ])('rejects an own-property $label before any dependency call', async ({ input }) => {
    const deps = dependencies();
    await expect(
      new ClinicSchedulingService(deps).createScheduleException(
        request,
        'schedule-1',
        1,
        input as never,
      ),
    ).rejects.toMatchObject({ code: 'input-not-allowed' });
    expect(deps.featureFlags.enabled).not.toHaveBeenCalled();
    expect(deps.authorization.authorize).not.toHaveBeenCalled();
    expect(deps.repository.createScheduleException).not.toHaveBeenCalled();
  });

  it('delegates appointment creation without a pre-transaction pricing resolution seam', async () => {
    const deps = dependencies();
    await new ClinicSchedulingService(deps).createAppointment(request, 'facility-1', {
      patientId: 'patient-1',
      facilityId: 'facility-1',
      doctorId: 'doctor-1',
      startsAt: '2030-01-07T07:00:00.000Z',
      endsAt: '2030-01-07T07:30:00.000Z',
      timezone: 'Africa/Cairo',
      civilDate: '2030-01-07',
      paymentMethod: 'cash_on_arrival',
    });
    expect(deps.repository.createAppointment).toHaveBeenCalledWith(
      request,
      'facility-1',
      expect.objectContaining({
        paymentMethod: 'cash_on_arrival',
        facilityId: 'facility-1',
      }),
    );
  });

  it.each([
    { feeMinorUnits: 10000 },
    { currency: 'USD' },
    { fee_minor_units: 10000 },
    { currency_code: 'USD' },
  ])('rejects caller-supplied appointment pricing %# before authorization', async (pricing) => {
    const deps = dependencies();
    await expect(
      new ClinicSchedulingService(deps).createAppointment(request, 'facility-1', {
        patientId: 'patient-1',
        facilityId: 'facility-1',
        doctorId: 'doctor-1',
        startsAt: '2030-01-07T07:00:00.000Z',
        endsAt: '2030-01-07T07:30:00.000Z',
        timezone: 'Africa/Cairo',
        civilDate: '2030-01-07',
        paymentMethod: 'cash_on_arrival',
        ...pricing,
      } as never),
    ).rejects.toMatchObject({ code: 'input-not-allowed' });
    expect(deps.featureFlags.enabled).not.toHaveBeenCalled();
    expect(deps.authorization.authorize).not.toHaveBeenCalled();
    expect(deps.repository.createAppointment).not.toHaveBeenCalled();
  });

  it('rejects a non-cash payment method before authorization or pricing resolution', async () => {
    const deps = dependencies();
    await expect(
      new ClinicSchedulingService(deps).createAppointment(request, 'facility-1', {
        patientId: 'patient-1',
        facilityId: 'facility-1',
        doctorId: 'doctor-1',
        startsAt: '2030-01-07T07:00:00.000Z',
        endsAt: '2030-01-07T07:30:00.000Z',
        timezone: 'Africa/Cairo',
        civilDate: '2030-01-07',
        paymentMethod: 'card',
      } as never),
    ).rejects.toMatchObject({ code: 'payment-method-disabled' });
    expect(deps.featureFlags.enabled).not.toHaveBeenCalled();
    expect(deps.authorization.authorize).not.toHaveBeenCalled();
    expect(deps.repository.createAppointment).not.toHaveBeenCalled();
  });

  it('delegates replacement validation and authoritative slot acquisition to the transaction function', async () => {
    const deps = dependencies();
    const input = {
      startsAt: '2030-01-07T07:00:00.000Z',
      endsAt: '2030-01-07T07:30:00.000Z',
      timezone: 'Africa/Cairo',
      civilDate: '2030-01-07',
      reason: 'Patient requested a different time',
    };

    await new ClinicSchedulingService(deps).rescheduleAppointment(
      request,
      'appointment-1',
      4,
      input,
    );

    expect(deps.repository.rescheduleAppointment).toHaveBeenCalledWith(
      request,
      'appointment-1',
      4,
      input,
    );
  });

  it.each([
    ['missing', undefined],
    ['empty', ''],
    ['oversized', 'x'.repeat(501)],
    ['carriage return', 'unsafe\rreason'],
    ['line feed', 'unsafe\nreason'],
    ['tab', 'unsafe\treason'],
  ])(
    'rejects a %s reschedule reason before authorization or persistence',
    async (_label, reason) => {
      const deps = dependencies();

      await expect(
        new ClinicSchedulingService(deps).rescheduleAppointment(request, 'appointment-1', 4, {
          startsAt: '2030-01-07T07:00:00.000Z',
          endsAt: '2030-01-07T07:30:00.000Z',
          timezone: 'Africa/Cairo',
          civilDate: '2030-01-07',
          reason,
        } as never),
      ).rejects.toMatchObject({ code: 'reason-invalid' });
      expect(deps.featureFlags.enabled).not.toHaveBeenCalled();
      expect(deps.authorization.authorize).not.toHaveBeenCalled();
      expect(deps.repository.rescheduleAppointment).not.toHaveBeenCalled();
    },
  );

  it('keeps queue mutations in the queue repository and does not transition appointments', async () => {
    const deps = dependencies();
    const service = new ClinicSchedulingService(deps);
    await service.callQueueEntry(request, 'entry-1', 3);
    await service.reorderQueueEntry(request, 'entry-1', 3, 2, 'operational reason');
    await service.completeQueueEntry(request, 'entry-1', 4);
    expect(deps.repository.callQueueEntry).toHaveBeenCalled();
    expect(deps.repository.reorderQueueEntry).toHaveBeenCalled();
    expect(deps.repository.completeQueueEntry).toHaveBeenCalled();
    expect(deps.repository.createAppointment).not.toHaveBeenCalled();
  });

  it('uses dedicated delay and absence repository operations without production dispatch', async () => {
    const deps = dependencies();
    const service = new ClinicSchedulingService(deps);
    await service.sendDoctorDelay(request, 'facility-1', 'doctor-1', {
      civilDate: '2030-01-07',
      delayMinutes: 15,
      templateCode: 'DELAY_CANDIDATE',
      reason: 'operational reason',
    });
    await service.declareDoctorAbsence(request, 'facility-1', 'doctor-1', {
      startsAt: '2030-01-07T07:00:00.000Z',
      endsAt: '2030-01-07T07:30:00.000Z',
      civilDate: '2030-01-07',
      reason: 'operational reason',
    });
    expect(deps.repository.sendDoctorDelay).toHaveBeenCalled();
    expect(deps.repository.declareDoctorAbsence).toHaveBeenCalled();
  });
});
