import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

import {
  BookingAttemptGate,
  bookingResultMatchesSelection,
  bookingSuccessSnapshot,
  validateBookingSelection,
} from '../src/clinic-scheduling-booking.ts';
import {
  canContinueToBooking,
  doctorResultPresentation,
  doctorResultStatus,
  isValidDoctorProjection,
} from '../src/clinic-scheduling-discovery.ts';
import { clinicSchedulingArEG, clinicSchedulingEnEG } from '@shifaa/i18n';

const facilityId = '90000000-0000-4000-8000-000000000001';
const doctorId = '91000000-0000-4000-8000-000000000001';
const patientId = '91000000-0000-4000-8000-000000000003';
const slot = {
  facilityId,
  doctorId,
  startsAt: '2030-01-07T09:00:00+02:00',
  endsAt: '2030-01-07T09:30:00+02:00',
  civilDate: '2030-01-07',
  timezone: 'Africa/Cairo',
};
const doctor = {
  doctorId,
  doctorDisplayName: 'Synthetic Doctor',
  specialty: 'Internal medicine',
  professionalLicenseVerified: true as const,
  facilityId,
  facilityDisplayName: 'Synthetic Clinic',
  facilityVerified: true as const,
  feeMinorUnits: 35000,
  currency: 'EGP' as const,
  paymentMethod: 'cash_on_arrival' as const,
  nextAvailableSlot: slot,
  distanceMeters: null,
  availabilityVersion: 1,
  updatedAt: '2029-12-01T08:00:00.000Z',
  stale: false,
};
const availability = {
  items: [slot],
  feeMinorUnits: 35000,
  currency: 'EGP' as const,
  paymentMethod: 'cash_on_arrival' as const,
  version: 1,
  freshness: 'fresh' as const,
  generatedAt: '2029-12-01T08:00:00.000Z',
};

test('discovery presentation is bilingual, directional, verified, and cash-only', () => {
  assert.equal(isValidDoctorProjection(doctor, facilityId, doctorId), true);
  assert.equal(doctorResultStatus('fresh', false, true), 'available');
  assert.equal(doctorResultStatus('stale', false, true), 'stale');
  assert.equal(doctorResultStatus('unknown', false, true), 'unknown');
  for (const [locale, direction, copy] of [
    ['ar-EG', 'rtl', clinicSchedulingArEG],
    ['en-EG', 'ltr', clinicSchedulingEnEG],
  ] as const) {
    const presentation = doctorResultPresentation(doctor, locale, 'fresh');
    assert.ok(presentation);
    assert.equal(presentation.direction, direction);
    assert.match(presentation.feeLabel, /EGP/);
    assert.equal(presentation.paymentLabel, copy['clinic.payment.cashInstruction']);
  }
});

test('availability freshness gates booking and degraded states never present false availability', () => {
  assert.equal(validateBookingSelection(availability, slot), 'ready');
  assert.equal(validateBookingSelection({ ...availability, freshness: 'stale' }, slot), 'stale');
  assert.equal(validateBookingSelection({ ...availability, items: [] }, slot), 'conflict');
  assert.equal(
    validateBookingSelection({ ...availability, feeMinorUnits: 36000 }, slot, 35000),
    'conflict',
  );
  assert.equal(canContinueToBooking('fresh', true, true), true);
  assert.equal(canContinueToBooking('stale', true, true), false);
  assert.equal(canContinueToBooking('fresh', true, false), false);
});

test('booking gate permits one submit and result is scoped to the selected patient and slot', () => {
  const gate = new BookingAttemptGate();
  assert.equal(gate.enter(), true);
  assert.equal(gate.enter(), false);
  gate.leave();
  assert.equal(gate.enter(), true);
  gate.leave();
  const result = {
    id: '92000000-0000-4000-8000-000000000001',
    patientId,
    ...slot,
    status: 'confirmed' as const,
    feeMinorUnits: 35000,
    currency: 'EGP' as const,
    paymentMethod: 'cash_on_arrival' as const,
    version: 1,
  };
  assert.equal(bookingResultMatchesSelection(result, slot, patientId), true);
  assert.equal(
    bookingResultMatchesSelection(result, slot, '91000000-0000-4000-8000-000000000099'),
    false,
  );
  assert.match(bookingSuccessSnapshot(result, 'en-EG').payment, /cash/i);
});

test('patient routes expose the required accessible and responsive states (structural check only)', () => {
  const routes = [
    '../app/discover/index.tsx',
    '../app/doctors/[id].tsx',
    '../app/appointments/new.tsx',
    '../src/ClinicSchedulingShell.tsx',
  ];
  const source = routes
    .map((route) => fs.readFileSync(new URL(route, import.meta.url), 'utf8'))
    .join('\n');
  for (const marker of [
    'direction',
    'accessibilityRole',
    'accessibilityLabel',
    'accessibilityLiveRegion',
    'minHeight: 44',
    'minHeight: 48',
    'OfflineNoQueueBanner',
    'StalenessIndicator',
    'RouteStatePanel',
    'focus',
    'cash_on_arrival',
    'EGP',
  ])
    assert.match(source, new RegExp(marker.replace(/[.*+?^${}()|[\\]\\]/g, '\\$&')));
  // There is no browser/screen-reader runner in this repository; viewport, 200%/400%,
  // forced-colors, and reduced-motion remain live/manual evidence requirements.
});
