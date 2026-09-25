import Fastify from 'fastify';
import { describe, expect, it, vi } from 'vitest';

import { clinicSchedulingOperations } from '@shifaa/contracts';

import { installIdentityErrorHandler } from './identity-onboarding.js';
import {
  registerClinicSchedulingRoutes,
  registeredClinicSchedulingOperationIds,
  type ClinicSchedulingRouteService,
} from './clinic-scheduling.js';

const id = '11111111-1111-4111-8111-111111111111';
const appointment = {
  id,
  patientId: id,
  facilityId: id,
  doctorId: id,
  startsAt: '2030-01-01T08:00:00.000Z',
  endsAt: '2030-01-01T08:30:00.000Z',
  timezone: 'Africa/Cairo',
  civilDate: '2030-01-01',
  status: 'confirmed',
  feeMinorUnits: 100,
  currency: 'EGP',
  paymentMethod: 'cash_on_arrival',
  version: 1,
} as const;

function routeUrl(path: string): string {
  return `/v1${path.replaceAll(/\{([^}]+)\}/g, ':$1')}`;
}

function service(): ClinicSchedulingRouteService {
  return {
    searchDoctors: vi.fn(async () => ({ items: [], nextCursor: null, freshness: 'fresh' })),
    listDoctorAvailability: vi.fn(async () => ({
      items: [],
      nextCursor: null,
      feeMinorUnits: 100,
      currency: 'EGP',
      paymentMethod: 'cash_on_arrival',
      version: 1,
      freshness: 'fresh',
    })),
    createSchedule: vi.fn(),
    updateSchedule: vi.fn(),
    createScheduleException: vi.fn(),
    listAppointments: vi.fn(),
    createAppointment: vi.fn(),
    getAppointment: vi.fn(),
    cancelAppointment: vi.fn(),
    rescheduleAppointment: vi.fn(),
    checkInAppointment: vi.fn(),
    getQueue: vi.fn(),
    getMyQueuePosition: vi.fn(),
    callQueueEntry: vi.fn(),
    reorderQueueEntry: vi.fn(),
    completeQueueEntry: vi.fn(),
    sendDoctorDelay: vi.fn(),
    declareDoctorAbsence: vi.fn(),
  } as unknown as ClinicSchedulingRouteService;
}

describe('clinic scheduling HTTP contract', () => {
  it('registers exactly the 18 reconciled operation IDs and paths', async () => {
    const app = Fastify({ logger: false });
    installIdentityErrorHandler(app);
    await registerClinicSchedulingRoutes(app, {
      service: service(),
      syntheticMode: true,
    });

    expect(registeredClinicSchedulingOperationIds).toEqual(
      clinicSchedulingOperations.map(({ operationId }) => operationId),
    );
    expect(registeredClinicSchedulingOperationIds).toHaveLength(18);
    for (const operation of clinicSchedulingOperations) {
      expect(
        app.hasRoute({ method: operation.method, url: routeUrl(operation.path) }),
        `${operation.method} ${routeUrl(operation.path)}`,
      ).toBe(true);
    }
    await app.close();
  });

  it('keeps discovery public while protected reads fail closed and errors are no-store', async () => {
    const app = Fastify({ logger: false });
    installIdentityErrorHandler(app);
    const injected = service();
    await registerClinicSchedulingRoutes(app, {
      service: injected,
      syntheticMode: true,
    });

    const publicResponse = await app.inject({
      method: 'GET',
      url: '/v1/discovery/doctors',
    });
    expect(publicResponse.statusCode).toBe(200);
    expect(publicResponse.headers['cache-control']).toBe('private, no-store');
    expect(injected.searchDoctors).toHaveBeenCalledWith(null, {}, { limit: 100 });

    vi.mocked(injected.searchDoctors).mockResolvedValueOnce({
      items: [{}],
      nextCursor: null,
    } as never);
    const invalidResponse = await app.inject({
      method: 'GET',
      url: '/v1/discovery/doctors',
    });
    expect(invalidResponse.statusCode).toBe(500);
    expect(invalidResponse.json()).toMatchObject({ code: 'response-invalid' });
    expect(invalidResponse.headers['cache-control']).toBe('private, no-store');

    const protectedResponse = await app.inject({
      method: 'GET',
      url: '/v1/appointments',
    });
    expect(protectedResponse.statusCode).toBe(401);
    expect(protectedResponse.headers['content-type']).toContain('application/problem+json');
    expect(protectedResponse.headers['cache-control']).toBe('private, no-store');
    expect(protectedResponse.json()).toMatchObject({
      code: 'authentication-required',
      request_id: expect.any(String),
    });
    await app.close();
  });

  it('uses generated request validation before authentication or mutation work', async () => {
    const app = Fastify({ logger: false });
    installIdentityErrorHandler(app);
    const injected = service();
    await registerClinicSchedulingRoutes(app, {
      service: injected,
      syntheticMode: true,
    });

    const response = await app.inject({
      method: 'POST',
      url: `/v1/clinics/${id}/schedules`,
      headers: { authorization: `Bearer synthetic-person:${id}` },
      payload: { doctorId: id },
    });
    expect(response.statusCode).toBe(400);
    expect(injected.createSchedule).not.toHaveBeenCalled();
    expect(response.headers['content-type']).toContain('application/problem+json');
    await app.close();
  });

  it('preserves read freshness at the HTTP boundary and labels cached discovery stale', async () => {
    const app = Fastify({ logger: false });
    installIdentityErrorHandler(app);
    const injected = service();
    vi.mocked(injected.searchDoctors).mockResolvedValueOnce({
      items: [
        {
          doctorId: id,
          doctorDisplayName: 'Synthetic Doctor',
          specialty: 'dentistry',
          professionalLicenseVerified: true,
          facilityId: id,
          facilityDisplayName: 'Synthetic Clinic',
          facilityVerified: true,
          feeMinorUnits: 100,
          currency: 'EGP',
          paymentMethod: 'cash_on_arrival',
          nextAvailableSlot: null,
          distanceMeters: null,
          availabilityVersion: 1,
          updatedAt: '2030-01-01T00:00:00.000Z',
          stale: false,
        },
      ],
      nextCursor: null,
      freshness: 'stale',
      degraded: true,
    });
    await registerClinicSchedulingRoutes(app, { service: injected, syntheticMode: true });

    const response = await app.inject({ method: 'GET', url: '/v1/discovery/doctors' });

    expect(response.statusCode).toBe(200);
    expect(response.headers['x-data-freshness']).toBe('stale');
    expect(response.headers['x-data-degraded']).toBe('true');
    expect(response.json().items[0].stale).toBe(true);
    await app.close();
  });

  it('returns availability freshness without treating cached slots as confirmed', async () => {
    const app = Fastify({ logger: false });
    installIdentityErrorHandler(app);
    const injected = service();
    vi.mocked(injected.listDoctorAvailability).mockResolvedValueOnce({
      items: [],
      nextCursor: null,
      feeMinorUnits: 100,
      currency: 'EGP',
      paymentMethod: 'cash_on_arrival',
      version: 1,
      freshness: 'unknown',
      degraded: true,
    });
    await registerClinicSchedulingRoutes(app, { service: injected, syntheticMode: true });

    const response = await app.inject({
      method: 'GET',
      url: `/v1/clinics/${id}/doctors/${id}/availability?fromDate=2030-01-01&toDate=2030-01-02`,
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ freshness: 'unknown', items: [] });
    expect(response.headers['x-data-freshness']).toBe('unknown');
    expect(response.headers['x-data-degraded']).toBe('true');
    await app.close();
  });

  it('requires appointment-page freshness and labels cached appointment DTOs in headers', async () => {
    const app = Fastify({ logger: false });
    installIdentityErrorHandler(app);
    const injected = service();
    vi.mocked(injected.listAppointments).mockResolvedValueOnce({
      items: [appointment],
      nextCursor: null,
      freshness: 'fresh',
      degraded: false,
    } as never);
    vi.mocked(injected.getAppointment).mockResolvedValueOnce({
      value: appointment,
      freshness: 'stale',
      degraded: true,
    } as never);
    await registerClinicSchedulingRoutes(app, { service: injected, syntheticMode: true });

    const headers = {
      authorization: `Bearer synthetic-person:${id}`,
      'accept-language': 'en-EG',
    };
    const listResponse = await app.inject({ method: 'GET', url: '/v1/appointments', headers });
    expect(listResponse.statusCode).toBe(200);
    expect(listResponse.json()).toMatchObject({ items: [appointment], freshness: 'fresh' });

    const getResponse = await app.inject({
      method: 'GET',
      url: `/v1/appointments/${id}`,
      headers,
    });
    expect(getResponse.statusCode).toBe(200);
    expect(getResponse.json()).toEqual(appointment);
    expect(getResponse.headers['x-data-freshness']).toBe('stale');
    expect(getResponse.headers['x-data-degraded']).toBe('true');
    await app.close();
  });
});
