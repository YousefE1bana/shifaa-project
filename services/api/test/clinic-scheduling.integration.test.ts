import Fastify from 'fastify';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { ClinicSchedulingRouteService } from '../src/routes/clinic-scheduling.js';
import {
  registerClinicSchedulingRoutes,
  registeredClinicSchedulingOperationIds,
} from '../src/routes/clinic-scheduling.js';
import { installIdentityErrorHandler } from '../src/routes/identity-onboarding.js';
import { ApiPolicyError } from '../src/modules/identity-onboarding/errors.js';

const ids = {
  facility: 'a0900000-0000-4000-8000-000000000001',
  doctor: 'a0900000-0000-4000-8000-000000000002',
  patient: 'a0900000-0000-4000-8000-000000000003',
  appointment: 'a0900000-0000-4000-8000-000000000004',
  schedule: 'a0900000-0000-4000-8000-000000000005',
  queueEntry: 'a0900000-0000-4000-8000-000000000006',
  delay: 'a0900000-0000-4000-8000-000000000007',
  absence: 'a0900000-0000-4000-8000-000000000008',
} as const;

const actor = `synthetic-person:${ids.patient}`;
const auth = { authorization: `Bearer ${actor}` };
const key = (suffix: string) => `f009-http-key-${suffix.padEnd(16, '0')}`;

const schedule = {
  id: ids.schedule,
  facilityId: ids.facility,
  doctorId: ids.doctor,
  timezone: 'Africa/Cairo',
  validFrom: '2030-01-01',
  validTo: '2030-01-31',
  slotDurationMinutes: 30,
  feeMinorUnits: 10000,
  currency: 'EGP' as const,
  status: 'active' as const,
  windows: [{ isoWeekday: 2, localStart: '09:00:00Z', localEnd: '15:00:00Z' }],
  version: 2,
};
const appointment = {
  id: ids.appointment,
  patientId: ids.patient,
  facilityId: ids.facility,
  doctorId: ids.doctor,
  startsAt: '2030-01-07T07:00:00.000Z',
  endsAt: '2030-01-07T07:30:00.000Z',
  timezone: 'Africa/Cairo',
  civilDate: '2030-01-07',
  status: 'confirmed' as const,
  feeMinorUnits: 10000,
  currency: 'EGP' as const,
  paymentMethod: 'cash_on_arrival' as const,
  version: 1,
};
const queueEntry = {
  id: ids.queueEntry,
  appointmentId: ids.appointment,
  facilityId: ids.facility,
  doctorId: ids.doctor,
  civilDate: '2030-01-07',
  queueNumber: 1,
  position: 1,
  estimatedServiceAt: '2030-01-07T07:30:00.000Z',
  state: 'waiting' as const,
  version: 1,
};

function makeService() {
  const calls = {
    searchDoctors: vi.fn(async () => ({
      items: [
        {
          doctorId: ids.doctor,
          doctorDisplayName: 'Synthetic Doctor',
          specialty: 'General practice',
          professionalLicenseVerified: true as const,
          facilityId: ids.facility,
          facilityDisplayName: 'Synthetic Clinic',
          facilityVerified: true as const,
          feeMinorUnits: 10000,
          currency: 'EGP' as const,
          paymentMethod: 'cash_on_arrival' as const,
          nextAvailableSlot: null,
          distanceMeters: null,
          availabilityVersion: 2,
          updatedAt: '2030-01-01T00:00:00.000Z',
          stale: false,
        },
      ],
      nextCursor: null,
      freshness: 'fresh' as 'fresh' | 'stale' | 'unknown',
    })),
    listDoctorAvailability: vi.fn(async () => ({
      items: [
        {
          facilityId: ids.facility,
          doctorId: ids.doctor,
          startsAt: appointment.startsAt,
          endsAt: appointment.endsAt,
          timezone: 'Africa/Cairo',
          civilDate: '2030-01-07',
        },
      ],
      feeMinorUnits: 10000,
      currency: 'EGP' as const,
      paymentMethod: 'cash_on_arrival' as const,
      nextCursor: null,
      generatedAt: '2030-01-01T00:00:00.000Z',
      version: 2,
      freshness: 'fresh' as const,
    })),
    createSchedule: vi.fn(
      async (_context: unknown, _facilityId: string, input: { feeMinorUnits: number }) => ({
        ...schedule,
        feeMinorUnits: input.feeMinorUnits,
      }),
    ),
    updateSchedule: vi.fn(
      async (
        _context: unknown,
        _scheduleId: string,
        _version: number,
        input: { feeMinorUnits?: number },
      ) => ({
        ...schedule,
        feeMinorUnits: input.feeMinorUnits ?? schedule.feeMinorUnits,
      }),
    ),
    createScheduleException: vi.fn(async () => ({
      id: ids.delay,
      scheduleId: ids.schedule,
      facilityId: ids.facility,
      doctorId: ids.doctor,
      type: 'blocked' as const,
      startsAt: appointment.startsAt,
      endsAt: appointment.endsAt,
      civilDate: '2030-01-07',
      reason: 'Synthetic maintenance',
      version: 1,
    })),
    listAppointments: vi.fn(async () => ({
      items: [appointment],
      nextCursor: null,
      freshness: 'fresh' as const,
    })),
    createAppointment: vi.fn(async () => appointment),
    getAppointment: vi.fn(async () => ({
      value: appointment,
      freshness: 'fresh' as const,
      degraded: false,
    })),
    cancelAppointment: vi.fn(async () => ({
      ...appointment,
      status: 'cancelled' as const,
      version: 2,
    })),
    rescheduleAppointment: vi.fn(async () => ({ ...appointment, version: 2 })),
    checkInAppointment: vi.fn(async () => ({
      appointment: { ...appointment, status: 'checked_in' as const, version: 2 },
      queueEntry,
    })),
    getQueue: vi.fn(async () => ({
      items: [
        {
          facilityId: ids.facility,
          doctorId: ids.doctor,
          civilDate: '2030-01-07',
          version: 1,
          entries: [queueEntry],
        },
      ],
      nextCursor: null,
      freshness: 'fresh' as const,
    })),
    getMyQueuePosition: vi.fn(async () => ({
      appointmentId: ids.appointment,
      state: 'waiting' as const,
      queueNumber: 1,
      position: 1,
      estimatedServiceAt: queueEntry.estimatedServiceAt,
      queueVersion: 1,
      updatedAt: '2030-01-07T07:00:00.000Z',
      stale: false,
    })),
    callQueueEntry: vi.fn(async () => ({ ...queueEntry, state: 'called' as const, version: 2 })),
    reorderQueueEntry: vi.fn(async () => ({
      facilityId: ids.facility,
      doctorId: ids.doctor,
      civilDate: '2030-01-07',
      version: 2,
      entries: [queueEntry],
      nextCursor: null,
    })),
    completeQueueEntry: vi.fn(async () => ({
      ...queueEntry,
      state: 'completed' as const,
      version: 2,
    })),
    sendDoctorDelay: vi.fn(async () => ({
      delayId: ids.delay,
      facilityId: ids.facility,
      doctorId: ids.doctor,
      civilDate: '2030-01-07',
      delayMinutes: 20,
      version: 1,
      affectedAppointmentIds: [ids.appointment],
      outboxEventIds: [ids.delay],
    })),
    declareDoctorAbsence: vi.fn(async () => ({
      absenceId: ids.absence,
      affectedAppointmentIds: [ids.appointment],
      removedQueueEntryIds: [],
      replacementSuggestions: [],
    })),
  };
  return { calls, service: calls as unknown as ClinicSchedulingRouteService };
}

describe('Feature 009 HTTP contract and authorization', () => {
  let app: ReturnType<typeof Fastify>;
  let calls: ReturnType<typeof makeService>['calls'];

  beforeEach(async () => {
    app = Fastify({ logger: false });
    installIdentityErrorHandler(app);
    const fake = makeService();
    calls = fake.calls;
    await registerClinicSchedulingRoutes(app, { service: fake.service, syntheticMode: true });
    await app.ready();
  });
  afterEach(() => app.close());

  it('registers exactly the frozen 18 operations', () => {
    expect(registeredClinicSchedulingOperationIds).toHaveLength(18);
    expect(new Set(registeredClinicSchedulingOperationIds)).toEqual(
      new Set([
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
      ]),
    );
  });

  it('serves every operation with contract-shaped responses and private/no-store headers', async () => {
    const requests = [
      { method: 'GET', url: '/v1/discovery/doctors?specialty=General%20practice' },
      {
        method: 'GET',
        url: `/v1/clinics/${ids.facility}/doctors/${ids.doctor}/availability?fromDate=2030-01-01&toDate=2030-01-31`,
      },
      {
        method: 'POST',
        url: `/v1/clinics/${ids.facility}/schedules`,
        payload: {
          doctorId: ids.doctor,
          timezone: 'Africa/Cairo',
          validFrom: '2030-01-01',
          validTo: '2030-01-31',
          slotDurationMinutes: 30,
          feeMinorUnits: 10000,
          status: 'active',
          windows: schedule.windows,
        },
        headers: { ...auth, 'idempotency-key': key('create-schedule') },
      },
      {
        method: 'PATCH',
        url: `/v1/clinics/${ids.facility}/schedules/${ids.schedule}`,
        payload: { feeMinorUnits: 12000 },
        headers: { ...auth, 'idempotency-key': key('update-schedule'), 'if-match': '"1"' },
      },
      {
        method: 'POST',
        url: `/v1/clinics/${ids.facility}/schedules/${ids.schedule}/exceptions`,
        payload: {
          type: 'blocked',
          startsAt: appointment.startsAt,
          endsAt: appointment.endsAt,
          civilDate: '2030-01-07',
          reason: 'Synthetic maintenance',
        },
        headers: { ...auth, 'idempotency-key': key('exception'), 'if-match': '"1"' },
      },
      { method: 'GET', url: `/v1/appointments?patientId=${ids.patient}`, headers: auth },
      {
        method: 'POST',
        url: '/v1/appointments',
        payload: {
          patientId: ids.patient,
          facilityId: ids.facility,
          doctorId: ids.doctor,
          startsAt: appointment.startsAt,
          endsAt: appointment.endsAt,
          timezone: 'Africa/Cairo',
          civilDate: '2030-01-07',
          paymentMethod: 'cash_on_arrival',
        },
        headers: { ...auth, 'idempotency-key': key('create-appointment') },
      },
      { method: 'GET', url: `/v1/appointments/${ids.appointment}`, headers: auth },
      {
        method: 'POST',
        url: `/v1/appointments/${ids.appointment}/cancel`,
        payload: { reason: 'Synthetic cancellation' },
        headers: { ...auth, 'idempotency-key': key('cancel'), 'if-match': '"1"' },
      },
      {
        method: 'POST',
        url: `/v1/appointments/${ids.appointment}/reschedule`,
        payload: {
          startsAt: '2030-01-07T08:00:00.000Z',
          endsAt: '2030-01-07T08:30:00.000Z',
          timezone: 'Africa/Cairo',
          civilDate: '2030-01-07',
          reason: 'Synthetic reschedule request',
        },
        headers: { ...auth, 'idempotency-key': key('reschedule'), 'if-match': '"1"' },
      },
      {
        method: 'POST',
        url: `/v1/appointments/${ids.appointment}/check-in`,
        headers: { ...auth, 'idempotency-key': key('check-in'), 'if-match': '"1"' },
      },
      {
        method: 'GET',
        url: `/v1/clinics/${ids.facility}/queues?doctorId=${ids.doctor}&date=2030-01-07`,
        headers: auth,
      },
      { method: 'GET', url: `/v1/appointments/${ids.appointment}/queue-position`, headers: auth },
      {
        method: 'POST',
        url: `/v1/queue-entries/${ids.queueEntry}/call`,
        headers: { ...auth, 'idempotency-key': key('call'), 'if-match': '"1"' },
      },
      {
        method: 'POST',
        url: `/v1/queue-entries/${ids.queueEntry}/reorder`,
        payload: { targetPosition: 1, queueVersion: 1, reason: 'Synthetic reorder' },
        headers: { ...auth, 'idempotency-key': key('reorder'), 'if-match': '"1"' },
      },
      {
        method: 'POST',
        url: `/v1/queue-entries/${ids.queueEntry}/complete`,
        headers: { ...auth, 'idempotency-key': key('complete'), 'if-match': '"1"' },
      },
      {
        method: 'POST',
        url: `/v1/clinics/${ids.facility}/doctors/${ids.doctor}/delay`,
        payload: {
          civilDate: '2030-01-07',
          delayMinutes: 20,
          templateCode: 'F009_DELAY_CANDIDATE',
          reason: 'Synthetic delay',
        },
        headers: { ...auth, 'idempotency-key': key('delay') },
      },
      {
        method: 'POST',
        url: `/v1/clinics/${ids.facility}/doctors/${ids.doctor}/absence`,
        payload: {
          startsAt: appointment.startsAt,
          endsAt: appointment.endsAt,
          civilDate: '2030-01-07',
          reason: 'Synthetic absence',
        },
        headers: { ...auth, 'idempotency-key': key('absence') },
      },
    ] as const;
    expect(requests.filter((request) => !('headers' in request))).toHaveLength(2);
    for (const request of requests) {
      const response = await app.inject(request);
      expect(
        response.statusCode,
        `${request.method} ${request.url}: ${response.body}`,
      ).toBeGreaterThanOrEqual(200);
      expect(
        response.statusCode,
        `${request.method} ${request.url}: ${response.body}`,
      ).toBeLessThan(300);
      expect(response.headers['cache-control']).toBe('private, no-store');
      expect(response.headers['x-request-id']).toBeTruthy();
    }
  });

  it('rejects missing authentication for all 16 protected operations before service invocation', async () => {
    const requests = [
      {
        operation: 'createSchedule',
        method: 'POST',
        url: `/v1/clinics/${ids.facility}/schedules`,
        payload: {
          doctorId: ids.doctor,
          timezone: 'Africa/Cairo',
          validFrom: '2030-01-01',
          validTo: '2030-01-31',
          slotDurationMinutes: 30,
          feeMinorUnits: 10000,
          status: 'active',
          windows: schedule.windows,
        },
        headers: { 'idempotency-key': key('missing-create-schedule') },
      },
      {
        operation: 'updateSchedule',
        method: 'PATCH',
        url: `/v1/clinics/${ids.facility}/schedules/${ids.schedule}`,
        payload: { feeMinorUnits: 12000 },
        headers: { 'idempotency-key': key('missing-update-schedule'), 'if-match': '"1"' },
      },
      {
        operation: 'createScheduleException',
        method: 'POST',
        url: `/v1/clinics/${ids.facility}/schedules/${ids.schedule}/exceptions`,
        payload: {
          type: 'blocked',
          startsAt: appointment.startsAt,
          endsAt: appointment.endsAt,
          civilDate: '2030-01-07',
          reason: 'Synthetic maintenance',
        },
        headers: { 'idempotency-key': key('missing-exception'), 'if-match': '"1"' },
      },
      {
        operation: 'createAppointment',
        method: 'POST',
        url: '/v1/appointments',
        payload: {
          patientId: ids.patient,
          facilityId: ids.facility,
          doctorId: ids.doctor,
          startsAt: appointment.startsAt,
          endsAt: appointment.endsAt,
          timezone: 'Africa/Cairo',
          civilDate: '2030-01-07',
          paymentMethod: 'cash_on_arrival',
        },
        headers: { 'idempotency-key': key('missing-create-appointment') },
      },
      {
        operation: 'getAppointment',
        method: 'GET',
        url: `/v1/appointments/${ids.appointment}`,
      },
      {
        operation: 'listAppointments',
        method: 'GET',
        url: `/v1/appointments?patientId=${ids.patient}`,
      },
      {
        operation: 'cancelAppointment',
        method: 'POST',
        url: `/v1/appointments/${ids.appointment}/cancel`,
        payload: { reason: 'Synthetic cancellation' },
        headers: { 'idempotency-key': key('missing-cancel'), 'if-match': '"1"' },
      },
      {
        operation: 'rescheduleAppointment',
        method: 'POST',
        url: `/v1/appointments/${ids.appointment}/reschedule`,
        payload: {
          startsAt: '2030-01-07T08:00:00.000Z',
          endsAt: '2030-01-07T08:30:00.000Z',
          timezone: 'Africa/Cairo',
          civilDate: '2030-01-07',
          reason: 'Synthetic reschedule request',
        },
        headers: { 'idempotency-key': key('missing-reschedule'), 'if-match': '"1"' },
      },
      {
        operation: 'checkInAppointment',
        method: 'POST',
        url: `/v1/appointments/${ids.appointment}/check-in`,
        headers: { 'idempotency-key': key('missing-check-in'), 'if-match': '"1"' },
      },
      {
        operation: 'getQueue',
        method: 'GET',
        url: `/v1/clinics/${ids.facility}/queues?doctorId=${ids.doctor}&date=2030-01-07`,
      },
      {
        operation: 'getMyQueuePosition',
        method: 'GET',
        url: `/v1/appointments/${ids.appointment}/queue-position`,
      },
      {
        operation: 'callQueueEntry',
        method: 'POST',
        url: `/v1/queue-entries/${ids.queueEntry}/call`,
        headers: { 'idempotency-key': key('missing-call'), 'if-match': '"1"' },
      },
      {
        operation: 'reorderQueueEntry',
        method: 'POST',
        url: `/v1/queue-entries/${ids.queueEntry}/reorder`,
        payload: { targetPosition: 1, queueVersion: 1, reason: 'Synthetic reorder' },
        headers: { 'idempotency-key': key('missing-reorder'), 'if-match': '"1"' },
      },
      {
        operation: 'completeQueueEntry',
        method: 'POST',
        url: `/v1/queue-entries/${ids.queueEntry}/complete`,
        headers: { 'idempotency-key': key('missing-complete'), 'if-match': '"1"' },
      },
      {
        operation: 'sendDoctorDelay',
        method: 'POST',
        url: `/v1/clinics/${ids.facility}/doctors/${ids.doctor}/delay`,
        payload: {
          civilDate: '2030-01-07',
          delayMinutes: 20,
          templateCode: 'F009_DELAY_CANDIDATE',
          reason: 'Synthetic delay',
        },
        headers: { 'idempotency-key': key('missing-delay') },
      },
      {
        operation: 'declareDoctorAbsence',
        method: 'POST',
        url: `/v1/clinics/${ids.facility}/doctors/${ids.doctor}/absence`,
        payload: {
          startsAt: appointment.startsAt,
          endsAt: appointment.endsAt,
          civilDate: '2030-01-07',
          reason: 'Synthetic absence',
        },
        headers: { 'idempotency-key': key('missing-absence') },
      },
    ] as const;

    expect(requests).toHaveLength(16);
    for (const request of requests) {
      const { operation, ...injectRequest } = request;
      const response = await app.inject(injectRequest);
      expect(response.statusCode, operation).toBe(401);
      expect(response.headers['content-type'], operation).toContain('application/problem+json');
    }
    for (const [operation, serviceCall] of Object.entries(calls)) {
      expect(serviceCall, operation).not.toHaveBeenCalled();
    }
  });

  it('rejects malformed cursor and unknown query fields as RFC 9457 problems', async () => {
    const oversized = 'x'.repeat(513);
    const first = await app.inject({
      method: 'GET',
      url: `/v1/discovery/doctors?cursor=${oversized}`,
    });
    const second = await app.inject({ method: 'GET', url: '/v1/discovery/doctors?unexpected=1' });
    for (const response of [first, second]) {
      expect(response.statusCode, response.body).toBe(400);
      expect(response.headers['content-type']).toContain('application/problem+json');
      expect(response.json()).toMatchObject({ status: 400, code: 'validation-failed' });
      expect(response.json()).not.toHaveProperty('stack');
    }
  });

  it('preserves freshness labeling and cursor pagination on anonymous discovery reads', async () => {
    const baseline = await app.inject({ method: 'GET', url: '/v1/discovery/doctors' });
    expect(baseline.statusCode).toBe(200);
    const baselineDoctor = baseline.json().items[0];
    calls.searchDoctors.mockResolvedValueOnce({
      items: [{ ...baselineDoctor, stale: true }],
      nextCursor: null,
      freshness: 'stale',
    });

    const requestedCursor = 'synthetic-current-cursor';
    const response = await app.inject({
      method: 'GET',
      url: `/v1/discovery/doctors?cursor=${requestedCursor}`,
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      items: [{ stale: true }],
      nextCursor: null,
    });
    expect(calls.searchDoctors).toHaveBeenLastCalledWith(
      null,
      { cursor: requestedCursor },
      { cursor: requestedCursor, limit: 100 },
    );
  });

  // This HTTP seam proves pre-service rejection only; durable domain/audit/outbox effects require
  // the PostgreSQL integration tests and are not established by these mocks.
  it('rejects every I3 bypass payload before mocked service invocation', async () => {
    const update = { doctorId: ids.doctor, feeMinorUnits: 12000 };
    const updateCurrency = { currency: 'USD' };
    const exceptionBodies = [
      {
        type: 'delay',
        startsAt: appointment.startsAt,
        endsAt: appointment.endsAt,
        civilDate: '2030-01-07',
        reason: 'not here',
      },
      {
        type: 'absence',
        startsAt: appointment.startsAt,
        endsAt: appointment.endsAt,
        civilDate: '2030-01-07',
        reason: 'not here',
      },
      {
        type: 'blocked',
        startsAt: appointment.startsAt,
        endsAt: appointment.endsAt,
        civilDate: '2030-01-07',
        reason: 'not here',
        delayMinutes: 20,
      },
      {
        type: 'added',
        startsAt: appointment.startsAt,
        endsAt: appointment.endsAt,
        civilDate: '2030-01-07',
        reason: 'not here',
        delayMinutes: 20,
      },
    ];
    const responses = [
      await app.inject({
        method: 'PATCH',
        url: `/v1/clinics/${ids.facility}/schedules/${ids.schedule}`,
        headers: { ...auth, 'idempotency-key': key('i3-update'), 'if-match': '"1"' },
        payload: update,
      }),
      await app.inject({
        method: 'PATCH',
        url: `/v1/clinics/${ids.facility}/schedules/${ids.schedule}`,
        headers: { ...auth, 'idempotency-key': key('i3-update-currency'), 'if-match': '"1"' },
        payload: updateCurrency,
      }),
      ...(await Promise.all(
        exceptionBodies.map((body, index) =>
          app.inject({
            method: 'POST',
            url: `/v1/clinics/${ids.facility}/schedules/${ids.schedule}/exceptions`,
            headers: {
              ...auth,
              'idempotency-key': key(`i3-exception-${index}`),
              'if-match': '"1"',
            },
            payload: body,
          }),
        ),
      )),
      await app.inject({
        method: 'POST',
        url: '/v1/appointments',
        headers: { ...auth, 'idempotency-key': key('client-fee') },
        payload: {
          patientId: ids.patient,
          facilityId: ids.facility,
          doctorId: ids.doctor,
          startsAt: appointment.startsAt,
          endsAt: appointment.endsAt,
          timezone: 'Africa/Cairo',
          civilDate: '2030-01-07',
          paymentMethod: 'cash_on_arrival',
          feeMinorUnits: 1,
          currency: 'USD',
        },
      }),
    ];
    expect(
      responses.every((response) => response.statusCode >= 400 && response.statusCode < 500),
      responses.map((response) => `${response.statusCode}:${response.body}`).join('\n'),
    ).toBe(true);
    expect(calls.updateSchedule).not.toHaveBeenCalled();
    expect(calls.createScheduleException).not.toHaveBeenCalled();
    expect(calls.createAppointment).not.toHaveBeenCalled();
  });

  it('keeps fee authority on schedules and derives booking fee/currency from the server response', async () => {
    const createScheduleResponse = await app.inject({
      method: 'POST',
      url: `/v1/clinics/${ids.facility}/schedules`,
      headers: { ...auth, 'idempotency-key': key('pricing-create') },
      payload: {
        doctorId: ids.doctor,
        timezone: 'Africa/Cairo',
        validFrom: '2030-01-01',
        validTo: '2030-01-31',
        slotDurationMinutes: 30,
        feeMinorUnits: 12000,
        status: 'active',
        windows: schedule.windows,
      },
    });
    expect(createScheduleResponse.statusCode).toBe(201);
    expect(createScheduleResponse.json()).toMatchObject({ feeMinorUnits: 12000, currency: 'EGP' });
    const updateResponse = await app.inject({
      method: 'PATCH',
      url: `/v1/clinics/${ids.facility}/schedules/${ids.schedule}`,
      headers: { ...auth, 'idempotency-key': key('pricing-update'), 'if-match': '"1"' },
      payload: { feeMinorUnits: 12000 },
    });
    expect(updateResponse.statusCode).toBe(200);
    expect(updateResponse.json()).toMatchObject({ feeMinorUnits: 12000, currency: 'EGP' });
    expect(calls.updateSchedule).toHaveBeenCalledWith(expect.anything(), ids.schedule, 1, {
      feeMinorUnits: 12000,
    });
    const booking = await app.inject({
      method: 'POST',
      url: '/v1/appointments',
      headers: { ...auth, 'idempotency-key': key('pricing-booking') },
      payload: {
        patientId: ids.patient,
        facilityId: ids.facility,
        doctorId: ids.doctor,
        startsAt: appointment.startsAt,
        endsAt: appointment.endsAt,
        timezone: 'Africa/Cairo',
        civilDate: '2030-01-07',
        paymentMethod: 'cash_on_arrival',
      },
    });
    expect(booking.statusCode).toBe(201);
    expect(booking.json()).toMatchObject({
      feeMinorUnits: 10000,
      currency: 'EGP',
      paymentMethod: 'cash_on_arrival',
    });
    const bookingInput = (calls.createAppointment as ReturnType<typeof vi.fn>).mock.calls.at(
      -1,
    )?.[2];
    expect(bookingInput).not.toHaveProperty('feeMinorUnits');
    expect(bookingInput).not.toHaveProperty('currency');
  });

  it('requires and propagates the idempotency key to the database-owned mutation boundary', async () => {
    const request = () =>
      app.inject({
        method: 'POST',
        url: '/v1/appointments',
        headers: { ...auth, 'idempotency-key': key('replay') },
        payload: {
          patientId: ids.patient,
          facilityId: ids.facility,
          doctorId: ids.doctor,
          startsAt: appointment.startsAt,
          endsAt: appointment.endsAt,
          timezone: 'Africa/Cairo',
          civilDate: '2030-01-07',
          paymentMethod: 'cash_on_arrival',
        },
      });
    const [first, second] = await Promise.all([request(), request()]);
    expect(first.statusCode).toBe(201);
    expect(second.statusCode).toBe(201);
    expect(second.json()).toEqual(first.json());
    expect(calls.createAppointment).toHaveBeenCalledTimes(2);
    expect((calls.createAppointment as ReturnType<typeof vi.fn>).mock.calls[0]?.[0]).toMatchObject({
      idempotencyKey: key('replay'),
    });
    calls.createAppointment.mockRejectedValueOnce(
      Object.assign(new Error('idempotency key reused with changed request'), { code: '23505' }),
    );
    const changed = await app.inject({
      method: 'POST',
      url: '/v1/appointments',
      headers: { ...auth, 'idempotency-key': key('replay') },
      payload: {
        patientId: ids.patient,
        facilityId: ids.facility,
        doctorId: ids.doctor,
        startsAt: '2030-01-07T08:00:00.000Z',
        endsAt: '2030-01-07T08:30:00.000Z',
        timezone: 'Africa/Cairo',
        civilDate: '2030-01-07',
        paymentMethod: 'cash_on_arrival',
      },
    });
    expect(changed.statusCode).toBe(409);
    expect(changed.json()).toMatchObject({ code: 'idempotency-key-reused', status: 409 });
  });

  it('includes the reschedule reason in the idempotency fingerprint without retaining it in context', async () => {
    const reschedule = (reason: string) =>
      app.inject({
        method: 'POST',
        url: `/v1/appointments/${ids.appointment}/reschedule`,
        headers: {
          ...auth,
          'idempotency-key': key('reschedule-reason-replay'),
          'if-match': '"1"',
        },
        payload: {
          startsAt: '2030-01-07T08:00:00.000Z',
          endsAt: '2030-01-07T08:30:00.000Z',
          timezone: 'Africa/Cairo',
          civilDate: '2030-01-07',
          reason,
        },
      });

    const reason = 'Feature009-reschedule-reason-sentinel';
    const first = await reschedule(reason);
    const changed = await reschedule('Feature009-reschedule-reason-changed');
    expect(first.statusCode).toBe(200);
    expect(changed.statusCode).toBe(200);

    const contexts = (calls.rescheduleAppointment as ReturnType<typeof vi.fn>).mock.calls.map(
      (call) => call[0] as { requestHash: string },
    );
    expect(contexts).toHaveLength(2);
    expect(contexts[0]?.requestHash).not.toBe(contexts[1]?.requestHash);
    expect(JSON.stringify(contexts)).not.toContain(reason);
  });

  it('maps stale versions and authorization failures to deterministic problems', async () => {
    calls.updateSchedule.mockRejectedValueOnce(
      new ApiPolicyError('version-conflict', 409, 'Refresh the current schedule.'),
    );
    const stale = await app.inject({
      method: 'PATCH',
      url: `/v1/clinics/${ids.facility}/schedules/${ids.schedule}`,
      headers: { ...auth, 'idempotency-key': key('stale'), 'if-match': '"1"' },
      payload: { feeMinorUnits: 12000 },
    });
    expect(stale.statusCode).toBe(409);
    expect(stale.json()).toMatchObject({ code: 'version-conflict', status: 409 });
    calls.getAppointment.mockRejectedValueOnce(
      new ApiPolicyError('forbidden', 403, 'Not in this care scope.'),
    );
    const denied = await app.inject({
      method: 'GET',
      url: `/v1/appointments/${ids.appointment}`,
      headers: auth,
    });
    expect(denied.statusCode).toBe(403);
    expect(denied.json()).toMatchObject({ code: 'forbidden', status: 403 });
    calls.updateSchedule.mockRejectedValueOnce(
      Object.assign(new Error('stale schedule version'), { code: '40001' }),
    );
    const databaseStale = await app.inject({
      method: 'PATCH',
      url: `/v1/clinics/${ids.facility}/schedules/${ids.schedule}`,
      headers: { ...auth, 'idempotency-key': key('database-stale'), 'if-match': '"1"' },
      payload: { feeMinorUnits: 12000 },
    });
    expect(databaseStale.statusCode).toBe(409);
    expect(databaseStale.json()).toMatchObject({ code: 'version-conflict', status: 409 });
  });

  it('maps the PostgreSQL overlap constraint to a deterministic conflict', async () => {
    calls.createSchedule.mockRejectedValueOnce(
      Object.assign(new Error('schedule overlap'), { code: '23P01' }),
    );
    const overlap = await app.inject({
      method: 'POST',
      url: `/v1/clinics/${ids.facility}/schedules`,
      headers: { ...auth, 'idempotency-key': key('overlap') },
      payload: {
        doctorId: ids.doctor,
        timezone: 'Africa/Cairo',
        validFrom: '2030-01-01',
        validTo: '2030-01-31',
        slotDurationMinutes: 30,
        feeMinorUnits: 10000,
        status: 'active',
        windows: schedule.windows,
      },
    });
    expect(overlap.statusCode).toBe(409);
    expect(overlap.json()).toMatchObject({ code: 'schedule-conflict', status: 409 });
  });

  it('enforces a per-actor mutation throttle and reports retry metadata', async () => {
    const responses = [];
    for (let index = 0; index < 31; index += 1) {
      responses.push(
        await app.inject({
          method: 'POST',
          url: '/v1/appointments',
          headers: { ...auth, 'idempotency-key': key(`throttle-${index}`) },
          payload: {
            patientId: ids.patient,
            facilityId: ids.facility,
            doctorId: ids.doctor,
            startsAt: appointment.startsAt,
            endsAt: appointment.endsAt,
            timezone: 'Africa/Cairo',
            civilDate: '2030-01-07',
            paymentMethod: 'cash_on_arrival',
          },
        }),
      );
    }
    expect(responses.at(-1)?.statusCode).toBe(429);
    expect(responses.at(-1)?.headers['retry-after']).toBeTruthy();
    expect(responses.at(-1)?.json()).toMatchObject({ code: 'rate-limited', status: 429 });
  });

  it('fails closed when synthetic mode is disabled', async () => {
    const closed = Fastify({ logger: false });
    installIdentityErrorHandler(closed);
    const fake = makeService();
    await registerClinicSchedulingRoutes(closed, { service: fake.service, syntheticMode: false });
    await closed.ready();
    const response = await closed.inject({
      method: 'POST',
      url: '/v1/appointments',
      headers: { ...auth, 'idempotency-key': key('disabled') },
      payload: {
        patientId: ids.patient,
        facilityId: ids.facility,
        doctorId: ids.doctor,
        startsAt: appointment.startsAt,
        endsAt: appointment.endsAt,
        timezone: 'Africa/Cairo',
        civilDate: '2030-01-07',
        paymentMethod: 'cash_on_arrival',
      },
    });
    expect(response.statusCode).toBe(503);
    expect(response.json()).toMatchObject({ code: 'open-sec-001', status: 503 });
    await closed.close();
  });
});
