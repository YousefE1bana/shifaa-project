import assert from 'node:assert/strict';
import test from 'node:test';

import {
  PatientClinicSchedulingApi,
  isClinicSchedulingOffline,
} from '../src/clinic-scheduling-api.ts';
import {
  reconcileAvailability,
  reconcileBooking,
  reconcileDiscovery,
} from '../src/clinic-scheduling-view-models.ts';

const doctor = {
  doctorId: '91000000-0000-4000-8000-000000000001',
  doctorDisplayName: 'طبيب تجريبي',
  specialty: 'باطنة',
  professionalLicenseVerified: true as const,
  facilityId: '90000000-0000-4000-8000-000000000001',
  facilityDisplayName: 'عيادة تجريبية',
  facilityVerified: true as const,
  feeMinorUnits: 35000,
  currency: 'EGP' as const,
  paymentMethod: 'cash_on_arrival' as const,
  nextAvailableSlot: null,
  distanceMeters: null,
  availabilityVersion: 3,
  updatedAt: '2026-04-15T08:00:00.000Z',
  stale: false,
};
const patientId = '91000000-0000-4000-8000-000000000003';

const availability = {
  items: [],
  feeMinorUnits: 35000,
  currency: 'EGP' as const,
  paymentMethod: 'cash_on_arrival' as const,
  version: 3,
  freshness: 'fresh' as const,
};

const response = (payload: unknown, status = 200) =>
  new Response(JSON.stringify(payload), {
    status,
    headers: { 'content-type': 'application/json' },
  });

test('patient reads reconcile to server freshness and booking retains one idempotency key', async () => {
  const previousNavigator = globalThis.navigator;
  Object.defineProperty(globalThis, 'navigator', {
    configurable: true,
    value: { onLine: true },
  });
  const calls: Array<{ url: string; init: RequestInit }> = [];
  let bookingAttempt = 0;
  const fetcher: typeof fetch = async (input, init) => {
    const url = String(input);
    calls.push({ url, init: init ?? {} });
    if (url.includes('/discovery/doctors'))
      return response({ items: [doctor], nextCursor: null, freshness: 'fresh' });
    if (url.includes('/availability')) return response(availability);
    if (url.endsWith('/appointments')) {
      bookingAttempt += 1;
      if (bookingAttempt === 1) throw new TypeError('connection reset');
      return response({
        id: '92000000-0000-4000-8000-000000000001',
        patientId,
        facilityId: doctor.facilityId,
        doctorId: doctor.doctorId,
        startsAt: '2026-04-15T08:00:00.000Z',
        endsAt: '2026-04-15T08:30:00.000Z',
        timezone: 'Africa/Cairo',
        civilDate: '2026-04-15',
        status: 'confirmed',
        feeMinorUnits: 35000,
        currency: 'EGP',
        paymentMethod: 'cash_on_arrival',
        version: 1,
      });
    }
    return response({ code: 'unexpected-request' }, 500);
  };

  const api = new PatientClinicSchedulingApi({
    locale: 'ar-EG',
    apiBaseUrl: 'https://synthetic.invalid',
    accessToken: 'synthetic-person:70000000-0000-4000-8000-000000000001',
    patientId,
    fetch: fetcher,
  });

  try {
    const doctors = reconcileDiscovery(await api.searchDoctors({ specialty: 'باطنة' }));
    assert.equal(doctors.status, 'ready');
    assert.equal(doctors.data.items[0]?.feeMinorUnits, 35000);
    assert.equal(doctors.data.items[0]?.currency, 'EGP');

    const slots = reconcileAvailability(
      await api.listDoctorAvailability(doctor.facilityId, doctor.doctorId, {
        fromDate: '2026-04-15',
        toDate: '2026-04-15',
      }),
    );
    assert.equal(slots.status, 'empty');
    assert.equal(slots.freshness, 'fresh');

    const bookingInput = {
      facilityId: doctor.facilityId,
      doctorId: doctor.doctorId,
      startsAt: '2026-04-15T08:00:00.000Z',
      endsAt: '2026-04-15T08:30:00.000Z',
      timezone: 'Africa/Cairo',
      civilDate: '2026-04-15',
      paymentMethod: 'cash_on_arrival' as const,
    };
    await assert.rejects(api.createAppointment(bookingInput), /connection reset/);
    const booked = reconcileBooking(await api.createAppointment(bookingInput));
    assert.equal(booked.status, 'success');
    if (booked.status !== 'success') throw new Error('expected successful booking');
    assert.equal(booked.data.currency, 'EGP');
    assert.equal(booked.data.paymentMethod, 'cash_on_arrival');

    const firstBooking = calls.find((call) => call.url.endsWith('/appointments'))!;
    const secondBooking = calls.filter((call) => call.url.endsWith('/appointments'))[1]!;
    assert.equal(
      new Headers(firstBooking.init.headers).get('Idempotency-Key'),
      new Headers(secondBooking.init.headers).get('Idempotency-Key'),
    );
    const sentBody = JSON.parse(String(secondBooking.init.body)) as Record<string, unknown>;
    assert.equal(sentBody.patientId, patientId);
    assert.equal(sentBody.paymentMethod, 'cash_on_arrival');
    assert.equal('feeMinorUnits' in sentBody, false);
    assert.equal('currency' in sentBody, false);
  } finally {
    Object.defineProperty(globalThis, 'navigator', {
      configurable: true,
      value: previousNavigator,
    });
  }
});

test('patient mutation is denied offline and is never queued', async () => {
  const previousNavigator = globalThis.navigator;
  Object.defineProperty(globalThis, 'navigator', {
    configurable: true,
    value: { onLine: false },
  });
  try {
    assert.equal(isClinicSchedulingOffline(), true);
    const api = new PatientClinicSchedulingApi({
      locale: 'en-EG',
      apiBaseUrl: 'https://synthetic.invalid',
      accessToken: 'synthetic-person:70000000-0000-4000-8000-000000000001',
      patientId,
      fetch: async () => response({ code: 'must-not-call' }, 500),
    });
    await assert.rejects(
      api.createAppointment({
        facilityId: doctor.facilityId,
        doctorId: doctor.doctorId,
        startsAt: '2026-04-15T08:00:00.000Z',
        endsAt: '2026-04-15T08:30:00.000Z',
        timezone: 'Africa/Cairo',
        civilDate: '2026-04-15',
        paymentMethod: 'cash_on_arrival',
      }),
      /offline-no-queue/,
    );
  } finally {
    if (previousNavigator === undefined) delete (globalThis as { navigator?: Navigator }).navigator;
    else
      Object.defineProperty(globalThis, 'navigator', {
        configurable: true,
        value: previousNavigator,
      });
  }
});

test('public discovery reads work without patient context while private appointment access fails closed', async () => {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  const api = new PatientClinicSchedulingApi({
    locale: 'en-EG',
    apiBaseUrl: 'https://synthetic.invalid',
    fetch: async (input, init) => {
      calls.push({ url: String(input), init: init ?? {} });
      if (String(input).includes('/discovery/doctors'))
        return response({ items: [], nextCursor: null, freshness: 'fresh' });
      return response({
        items: [],
        feeMinorUnits: 0,
        currency: 'EGP',
        paymentMethod: 'cash_on_arrival',
        version: 1,
        freshness: 'fresh',
      });
    },
  });

  await api.searchDoctors();
  await api.listDoctorAvailability(doctor.facilityId, doctor.doctorId, {
    fromDate: '2026-04-15',
    toDate: '2026-04-15',
  });
  assert.equal(calls.length, 2);
  assert.ok(calls.every(({ init }) => !new Headers(init.headers).has('Authorization')));
  assert.throws(() => api.listMyAppointments(), /patient-context-required/);
});

test('booking remains available when a native navigator has no onLine property', async () => {
  const previousNavigator = globalThis.navigator;
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: {} });
  try {
    assert.equal(isClinicSchedulingOffline(), false);
    const api = new PatientClinicSchedulingApi({
      locale: 'en-EG',
      apiBaseUrl: 'https://synthetic.invalid',
      accessToken: 'synthetic-person:70000000-0000-4000-8000-000000000001',
      patientId,
      fetch: async () =>
        response({
          id: '92000000-0000-4000-8000-000000000001',
          patientId,
          facilityId: doctor.facilityId,
          doctorId: doctor.doctorId,
          startsAt: '2026-04-15T08:00:00.000Z',
          endsAt: '2026-04-15T08:30:00.000Z',
          timezone: 'Africa/Cairo',
          civilDate: '2026-04-15',
          status: 'confirmed',
          feeMinorUnits: 35000,
          currency: 'EGP',
          paymentMethod: 'cash_on_arrival',
          version: 1,
        }),
    });
    const result = await api.createAppointment({
      facilityId: doctor.facilityId,
      doctorId: doctor.doctorId,
      startsAt: '2026-04-15T08:00:00.000Z',
      endsAt: '2026-04-15T08:30:00.000Z',
      timezone: 'Africa/Cairo',
      civilDate: '2026-04-15',
      paymentMethod: 'cash_on_arrival',
    });
    assert.equal(result.status, 'confirmed');
  } finally {
    if (previousNavigator === undefined) delete (globalThis as { navigator?: Navigator }).navigator;
    else
      Object.defineProperty(globalThis, 'navigator', {
        configurable: true,
        value: previousNavigator,
      });
  }
});
