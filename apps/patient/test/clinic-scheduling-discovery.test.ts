import assert from 'node:assert/strict';
import test from 'node:test';

import {
  canContinueToBooking,
  currentDoctorIdentity,
  doctorResultPresentation,
  doctorResultStatus,
  findCurrentDoctorIdentity,
  isValidDoctorProjection,
  slotMatchesDoctor,
} from '../src/clinic-scheduling-discovery.ts';

test('doctor result never promotes unknown or stale availability to a current slot', () => {
  assert.equal(doctorResultStatus('fresh', false, true), 'available');
  assert.equal(doctorResultStatus('fresh', false, false), 'unavailable');
  assert.equal(doctorResultStatus('stale', false, true), 'stale');
  assert.equal(doctorResultStatus('unknown', false, true), 'unknown');
  assert.equal(doctorResultStatus('fresh', true, true), 'stale');
});

test('booking continuation requires one fresh server slot and online state', () => {
  assert.equal(canContinueToBooking('fresh', true, true), true);
  assert.equal(canContinueToBooking('stale', true, true), false);
  assert.equal(canContinueToBooking('unknown', true, true), false);
  assert.equal(canContinueToBooking('fresh', false, true), false);
  assert.equal(canContinueToBooking('fresh', true, false), false);
});

test('doctor projection must match route identity, verification, and fixed payment', () => {
  const item = {
    doctorId: 'doctor-1',
    facilityId: 'facility-1',
    facilityVerified: true,
    professionalLicenseVerified: true,
    currency: 'EGP',
    paymentMethod: 'cash_on_arrival',
    feeMinorUnits: 35000,
  };
  assert.equal(isValidDoctorProjection(item, 'facility-1', 'doctor-1'), true);
  assert.equal(isValidDoctorProjection(item, 'facility-1', 'doctor-2'), false);
  assert.equal(isValidDoctorProjection(item, 'facility-2', 'doctor-1'), false);
  assert.equal(
    isValidDoctorProjection({ ...item, facilityVerified: false }, 'facility-1', 'doctor-1'),
    false,
  );
  assert.equal(
    isValidDoctorProjection(
      { ...item, professionalLicenseVerified: false },
      'facility-1',
      'doctor-1',
    ),
    false,
  );
  assert.equal(
    isValidDoctorProjection({ ...item, currency: 'USD' }, 'facility-1', 'doctor-1'),
    false,
  );
  assert.equal(
    isValidDoctorProjection({ ...item, paymentMethod: 'card' }, 'facility-1', 'doctor-1'),
    false,
  );
  assert.equal(
    isValidDoctorProjection({ ...item, feeMinorUnits: -1 }, 'facility-1', 'doctor-1'),
    false,
  );
  assert.equal(isValidDoctorProjection(null, 'facility-1', 'doctor-1'), false);
});

test('doctor result presentation is bilingual, RTL/LTR, fee-bound, and never claims stale availability', () => {
  const doctor = {
    doctorId: 'doctor-1',
    facilityId: 'facility-1',
    doctorDisplayName: 'Test Doctor',
    facilityVerified: true,
    professionalLicenseVerified: true,
    currency: 'EGP',
    paymentMethod: 'cash_on_arrival',
    feeMinorUnits: 35000,
    stale: false,
    nextAvailableSlot: { startsAt: '2026-09-21T09:00:00Z' },
  };
  const ar = doctorResultPresentation(doctor, 'ar-EG', 'fresh');
  const en = doctorResultPresentation(doctor, 'en-EG', 'fresh');
  assert.equal(ar?.direction, 'rtl');
  assert.equal(en?.direction, 'ltr');
  assert.match(ar?.verifiedLabel ?? '', /موثقة/);
  assert.match(en?.verifiedLabel ?? '', /Verified/);
  assert.match(ar?.feeLabel ?? '', /350 EGP/);
  assert.match(en?.feeLabel ?? '', /350 EGP/);
  assert.match(ar?.paymentLabel ?? '', /نقدًا/);
  assert.match(en?.paymentLabel ?? '', /cash/i);
  assert.match(en?.viewDoctorLabel ?? '', /Test Doctor/);
  assert.match(en?.availabilityLabel ?? '', /2026-09-21/);
  assert.doesNotMatch(
    doctorResultPresentation(doctor, 'en-EG', 'stale')?.availabilityLabel ?? '',
    /2026-09-21/,
  );
  assert.equal(
    doctorResultPresentation({ ...doctor, facilityVerified: false }, 'en-EG', 'fresh'),
    null,
  );
  assert.equal(doctorResultPresentation({ ...doctor, currency: 'USD' }, 'en-EG', 'fresh'), null);
});

test('selected availability slot must retain the route doctor and facility', () => {
  const slot = {
    facilityId: 'facility-1',
    doctorId: 'doctor-1',
    startsAt: 'start',
    endsAt: 'end',
    civilDate: '2026-09-21',
    timezone: 'Africa/Cairo',
  };
  assert.equal(slotMatchesDoctor(slot, 'facility-1', 'doctor-1'), true);
  assert.equal(slotMatchesDoctor(slot, 'facility-1', 'doctor-2'), false);
  assert.equal(slotMatchesDoctor(slot, 'facility-2', 'doctor-1'), false);
  assert.equal(slotMatchesDoctor(null, 'facility-1', 'doctor-1'), false);
});

test('doctor detail cannot confirm identity from a missing, stale, or mismatched search page', () => {
  const doctor = {
    doctorId: 'doctor-1',
    facilityId: 'facility-1',
    doctorDisplayName: 'Doctor',
    specialty: 'General',
    facilityDisplayName: 'Clinic',
    facilityVerified: true as const,
    professionalLicenseVerified: true as const,
    currency: 'EGP' as const,
    paymentMethod: 'cash_on_arrival' as const,
    feeMinorUnits: 35000,
    nextAvailableSlot: null,
    distanceMeters: null,
    availabilityVersion: 1,
    updatedAt: '2026-09-21T09:00:00Z',
    stale: false,
  };
  const page = { items: [doctor], nextCursor: null, freshness: 'fresh' as const };
  assert.equal(currentDoctorIdentity(page, 'facility-1', 'doctor-1'), doctor);
  assert.equal(
    currentDoctorIdentity({ ...page, items: [], nextCursor: 'next' }, 'facility-1', 'doctor-1'),
    null,
  );
  assert.equal(currentDoctorIdentity(page, 'facility-2', 'doctor-1'), null);
  assert.equal(
    currentDoctorIdentity({ ...page, freshness: 'stale' }, 'facility-1', 'doctor-1'),
    null,
  );
  assert.equal(
    currentDoctorIdentity(
      { ...page, items: [{ ...doctor, stale: true }] },
      'facility-1',
      'doctor-1',
    ),
    null,
  );
});

test('detail identity lookup finds page two and fails closed on repeated cursor', async () => {
  const doctor = {
    doctorId: 'doctor-1',
    facilityId: 'facility-1',
    doctorDisplayName: 'Doctor',
    specialty: 'General',
    facilityDisplayName: 'Clinic',
    facilityVerified: true as const,
    professionalLicenseVerified: true as const,
    currency: 'EGP' as const,
    paymentMethod: 'cash_on_arrival' as const,
    feeMinorUnits: 35000,
    nextAvailableSlot: null,
    distanceMeters: null,
    availabilityVersion: 1,
    updatedAt: '2026-09-21T09:00:00Z',
    stale: false,
  };
  const seen: Array<string | undefined> = [];
  const found = await findCurrentDoctorIdentity(
    async (cursor) => {
      seen.push(cursor);
      return cursor
        ? { items: [doctor], nextCursor: null, freshness: 'fresh' }
        : { items: [], nextCursor: 'page-2', freshness: 'fresh' };
    },
    'facility-1',
    'doctor-1',
  );
  assert.equal(found, doctor);
  assert.deepEqual(seen, [undefined, 'page-2']);
  let requests = 0;
  const loop = await findCurrentDoctorIdentity(
    async () => {
      requests += 1;
      return { items: [], nextCursor: 'same', freshness: 'fresh' };
    },
    'facility-1',
    'doctor-1',
  );
  assert.equal(loop, null);
  assert.equal(requests, 2);
});
