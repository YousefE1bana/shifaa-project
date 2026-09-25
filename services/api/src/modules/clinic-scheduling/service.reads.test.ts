import { describe, expect, it, vi } from 'vitest';

import type {
  ClinicSchedulingActor,
  ClinicSchedulingAuthorizationPort,
  ClinicSchedulingCachePort,
  ClinicSchedulingFeatureFlagPort,
  ClinicSchedulingPublicActor,
  ClinicSchedulingReadPort,
} from './types.js';
import { ClinicSchedulingService } from './service.js';

const actor: ClinicSchedulingActor = {
  personId: 'f0090000-0000-4000-8000-000000000001',
  principal: 'synthetic-principal',
  requestId: 'f0090000-0000-4000-8000-000000000010',
  traceId: 'f0090000-0000-4000-8000-000000000011',
  aal: 1,
  locale: 'en-EG',
};

const page = { limit: 2, cursor: 'opaque-cursor' } as const;
const dates = { fromDate: '2030-01-01', toDate: '2030-01-31' } as const;

function dependencies() {
  const authorize: ClinicSchedulingAuthorizationPort['authorize'] = vi.fn(
    async (_actor, action, target) => ({
      action,
      facilityId: target.facilityId ?? 'f0090000-0000-4000-8000-000000000100',
      ...(target.doctorId ? { doctorId: target.doctorId } : {}),
      facilityVerified: true as const,
      doctorLicenseVerified: true as const,
      relationship: 'self' as const,
    }),
  );
  const featureFlags: ClinicSchedulingFeatureFlagPort = {
    enabled: vi.fn(async () => true),
  };
  const read: ClinicSchedulingReadPort = {
    searchDoctors: vi.fn(async () => ({
      items: [],
      nextCursor: null,
      freshness: 'fresh' as const,
    })),
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
  const cache: ClinicSchedulingCachePort = {
    get: vi.fn(async () => undefined),
    set: vi.fn(async () => undefined),
  };

  return {
    authorization: { authorize },
    featureFlags,
    read,
    clock: { now: () => new Date('2030-01-01T00:00:00.000Z') },
    cache,
  };
}

describe('clinic-scheduling-reads', () => {
  it('allows anonymous public discovery reads without authorization and scopes cache keys safely', async () => {
    const deps = dependencies();
    const anonymous: ClinicSchedulingPublicActor = null;
    const service = new ClinicSchedulingService(deps);

    await service.searchDoctors(anonymous, { specialty: 'dentistry' }, page);
    await service.listDoctorAvailability(anonymous, 'facility-1', 'doctor-1', dates, page);

    expect(deps.authorization.authorize).not.toHaveBeenCalled();
    expect(deps.read.searchDoctors).toHaveBeenCalledWith(
      anonymous,
      { specialty: 'dentistry' },
      page,
    );
    expect(deps.read.listAvailabilityPage).toHaveBeenCalledWith(
      anonymous,
      'facility-1',
      'doctor-1',
      dates,
      page,
    );
    const cacheKeys = vi.mocked(deps.cache.set).mock.calls.map(([key]) => key);
    expect(cacheKeys[0]).toContain('clinic-scheduling:public:searchDoctors:');
    expect(cacheKeys[1]).toContain('clinic-scheduling:public:listDoctorAvailability:');
    expect(cacheKeys[0]).not.toContain('dentistry');
    expect(cacheKeys[0]).not.toContain(page.cursor);
    expect(cacheKeys[1]).not.toContain('facility-1');
    expect(cacheKeys[1]).not.toContain('doctor-1');
    expect(vi.mocked(deps.cache.set).mock.calls[0]?.[2]).toEqual({
      ttlMs: 30_000,
      private: false,
    });
  });

  it('uses opaque deterministic keys that isolate private actors and distinct read inputs', async () => {
    const deps = dependencies();
    const service = new ClinicSchedulingService(deps);
    const otherActor = { ...actor, personId: 'f0090000-0000-4000-8000-000000000099' };

    await service.getAppointment(actor, 'appointment-1');
    await new ClinicSchedulingService(deps).getAppointment(actor, 'appointment-1');
    await service.getAppointment(otherActor, 'appointment-1');
    await service.getAppointment(actor, 'appointment-2');
    const privateKeys = vi.mocked(deps.cache.set).mock.calls.map(([key]) => key);
    expect(privateKeys[0]).toMatch(/^clinic-scheduling:private:getAppointment:[a-f0-9]{64}$/);
    expect(privateKeys[1]).toBe(privateKeys[0]);
    expect(privateKeys[2]).not.toBe(privateKeys[0]);
    expect(privateKeys[3]).not.toBe(privateKeys[0]);
    for (const key of privateKeys) {
      expect(key).not.toContain(actor.personId);
      expect(key).not.toContain(otherActor.personId);
      expect(key).not.toContain('appointment-1');
      expect(key).not.toContain('appointment-2');
    }

    await service.searchDoctors(actor, { specialty: 'private-search-term' }, page);
    await service.searchDoctors(otherActor, { specialty: 'private-search-term' }, page);
    await service.searchDoctors(actor, { specialty: 'other-search-term' }, page);
    await service.searchDoctors(
      actor,
      { specialty: 'private-search-term' },
      {
        ...page,
        cursor: 'other-cursor',
      },
    );
    const publicKeys = vi
      .mocked(deps.cache.set)
      .mock.calls.slice(4)
      .map(([key]) => key);
    expect(publicKeys[0]).toBe(publicKeys[1]);
    expect(publicKeys[2]).not.toBe(publicKeys[0]);
    expect(publicKeys[3]).not.toBe(publicKeys[0]);
    for (const key of publicKeys) {
      expect(key).not.toContain('private-search-term');
      expect(key).not.toContain('other-search-term');
      expect(key).not.toContain('other-cursor');
      expect(key).not.toContain(page.cursor);
    }
  });

  it('keeps reads safe when the mutation kill switch is off and preserves bounded cursors', async () => {
    const deps = dependencies();
    const result = await new ClinicSchedulingService(deps).searchDoctors(
      actor,
      { specialty: 'dentistry' },
      page,
    );

    expect(result).toEqual({ items: [], nextCursor: null, freshness: 'fresh', degraded: false });
    expect(deps.featureFlags.enabled).toHaveBeenCalledWith('clinic_scheduling.server');
    expect(deps.featureFlags.enabled).not.toHaveBeenCalledWith('clinic_scheduling.mutations');
    expect(deps.authorization.authorize).not.toHaveBeenCalled();
    expect(deps.read.searchDoctors).toHaveBeenCalledWith(actor, { specialty: 'dentistry' }, page);
    expect(deps.cache.set).toHaveBeenCalled();
  });

  it('does not downgrade an authoritative read when cache storage is unavailable', async () => {
    const deps = dependencies();
    vi.mocked(deps.cache.set).mockRejectedValueOnce(new Error('cache unavailable'));

    const result = await new ClinicSchedulingService(deps).searchDoctors(
      actor,
      { specialty: 'dentistry' },
      page,
    );

    expect(result).toEqual({ items: [], nextCursor: null, freshness: 'fresh', degraded: false });
    expect(deps.cache.get).not.toHaveBeenCalled();
  });

  it('authorizes and delegates the authenticated minimum-disclosure read projections', async () => {
    const deps = dependencies();
    const service = new ClinicSchedulingService(deps);

    await service.listDoctorAvailability(actor, 'facility-1', 'doctor-1', dates, page);
    await service.getAppointment(actor, 'appointment-1');
    await service.listAppointments(actor, { status: 'confirmed' }, page);
    await service.getQueue(
      actor,
      { facilityId: 'facility-1', doctorId: 'doctor-1', date: '2030-01-01' },
      page,
    );
    await service.getMyQueuePosition(actor, 'appointment-1');

    expect(deps.authorization.authorize).toHaveBeenCalledTimes(4);
    expect(deps.read.listAvailabilityPage).toHaveBeenCalledWith(
      actor,
      'facility-1',
      'doctor-1',
      dates,
      page,
    );
    expect(deps.read.getAppointment).toHaveBeenCalledWith(actor, 'appointment-1');
    expect(deps.read.listAppointments).toHaveBeenCalledWith(actor, { status: 'confirmed' }, page);
    expect(deps.read.getQueue).toHaveBeenCalledWith(
      actor,
      { facilityId: 'facility-1', doctorId: 'doctor-1', date: '2030-01-01' },
      page,
    );
    expect(deps.read.getMyQueuePosition).toHaveBeenCalledWith(actor, 'appointment-1');
  });

  it('serves only an actor-scoped private cached projection after a read failure', async () => {
    const deps = dependencies();
    await new ClinicSchedulingService(deps).getAppointment(actor, 'appointment-1');
    const cachedKey = vi.mocked(deps.cache.set).mock.calls[0]?.[0];
    vi.mocked(deps.read.getAppointment).mockRejectedValueOnce(new Error('read unavailable'));
    vi.mocked(deps.cache.get).mockResolvedValueOnce({
      value: { id: 'appointment-1' },
      freshness: 'fresh',
    });

    const result = await new ClinicSchedulingService(deps).getAppointment(actor, 'appointment-1');

    expect(result).toEqual({
      value: { id: 'appointment-1' },
      freshness: 'stale',
      degraded: true,
    });
    expect(deps.cache.get).toHaveBeenCalledWith(cachedKey);
    expect(cachedKey).not.toContain(actor.personId);
    expect(cachedKey).not.toContain('appointment-1');
    expect(vi.mocked(deps.cache.set).mock.calls[0]?.[2]).toEqual({
      ttlMs: 30_000,
      private: true,
    });
  });

  it('labels an authoritative appointment projection fresh without changing its DTO', async () => {
    const deps = dependencies();
    const projection = {
      id: 'appointment-1',
      startsAt: '2030-01-01T08:00:00.000Z',
      endsAt: '2030-01-01T08:30:00.000Z',
      status: 'confirmed' as const,
      version: 1,
    };
    vi.mocked(deps.read.getAppointment).mockResolvedValueOnce(projection);

    const result = await new ClinicSchedulingService(deps).getAppointment(actor, 'appointment-1');

    expect(result).toEqual({
      value: projection,
      freshness: 'fresh',
      degraded: false,
    });
  });

  it('marks a cached queue position stale when the authoritative read is unavailable', async () => {
    const deps = dependencies();
    vi.mocked(deps.read.getMyQueuePosition).mockRejectedValueOnce(new Error('read unavailable'));
    vi.mocked(deps.cache.get).mockResolvedValueOnce({
      value: {
        appointmentId: 'appointment-1',
        state: 'waiting',
        queueNumber: 1,
        position: 1,
        estimatedServiceAt: '2030-01-01T08:00:00.000Z',
        queueVersion: 2,
        updatedAt: '2030-01-01T07:00:00.000Z',
        stale: false,
      },
      freshness: 'fresh',
    });

    const result = await new ClinicSchedulingService(deps).getMyQueuePosition(
      actor,
      'appointment-1',
    );

    expect(result).toMatchObject({ appointmentId: 'appointment-1', stale: true });
  });

  it('fails closed for invalid bounds and does not call authorization or the read port', async () => {
    const deps = dependencies();

    await expect(
      new ClinicSchedulingService(deps).listAppointments(actor, {}, { limit: 101 }),
    ).rejects.toMatchObject({ code: 'page-limit-invalid' });

    expect(deps.authorization.authorize).not.toHaveBeenCalled();
    expect(deps.read.listAppointments).not.toHaveBeenCalled();
  });
});
