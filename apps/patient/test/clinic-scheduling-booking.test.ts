import assert from 'node:assert/strict';
import test from 'node:test';

import {
  BookingAttemptGate,
  bookingResultMatchesSelection,
  bookingSuccessSnapshot,
  isUncertainBookingError,
  preservesUncertainBooking,
  validateBookingSelection,
} from '../src/clinic-scheduling-booking.ts';

const slot = {
  facilityId: 'facility-1',
  doctorId: 'doctor-1',
  startsAt: '2026-09-21T09:00:00Z',
  endsAt: '2026-09-21T09:30:00Z',
  civilDate: '2026-09-21',
  timezone: 'Africa/Cairo',
};
const page = {
  items: [slot],
  feeMinorUnits: 35000,
  currency: 'EGP' as const,
  paymentMethod: 'cash_on_arrival' as const,
  version: 2,
  freshness: 'fresh' as const,
};

test('booking review accepts only exact fresh server slot, EGP cash, and unchanged fee', () => {
  assert.equal(validateBookingSelection(page, slot, 35000), 'ready');
  assert.equal(validateBookingSelection({ ...page, freshness: 'stale' }, slot, 35000), 'stale');
  assert.equal(validateBookingSelection({ ...page, freshness: 'unknown' }, slot, 35000), 'stale');
  assert.equal(validateBookingSelection({ ...page, items: [] }, slot, 35000), 'conflict');
  assert.equal(
    validateBookingSelection({ ...page, feeMinorUnits: 36000 }, slot, 35000),
    'conflict',
  );
  assert.equal(
    validateBookingSelection({ ...page, currency: 'USD' } as unknown as typeof page, slot, 35000),
    'invalid',
  );
  assert.equal(
    validateBookingSelection(
      { ...page, paymentMethod: 'card' } as unknown as typeof page,
      slot,
      35000,
    ),
    'invalid',
  );
  assert.equal(
    validateBookingSelection(page, { ...slot, doctorId: 'doctor-2' }, 35000),
    'conflict',
  );
});

test('uncertain transport and server outcomes retain the booking retry path', () => {
  assert.equal(isUncertainBookingError(new TypeError('connection reset')), true);
  for (const status of [408, 429, 500, 503])
    assert.equal(isUncertainBookingError({ status }), true);
  for (const status of [400, 401, 403, 409])
    assert.equal(isUncertainBookingError({ status }), false);
});

test('synchronous booking gate rejects a second rapid submission until release', () => {
  const gate = new BookingAttemptGate();
  assert.equal(gate.enter(), true);
  assert.equal(gate.enter(), false);
  gate.leave();
  assert.equal(gate.enter(), true);
});

test('uncertain same-key retry is preserved only for unchanged slot selection', () => {
  assert.equal(preservesUncertainBooking('slot-1', 'slot-1', true), true);
  assert.equal(preservesUncertainBooking('slot-1', 'slot-2', true), false);
  assert.equal(preservesUncertainBooking('slot-1', 'slot-1', false), false);
});

test('success copy uses authoritative booked fee rather than preflight review fee', () => {
  const booked = {
    feeMinorUnits: 37000,
    currency: 'EGP',
    paymentMethod: 'cash_on_arrival',
  } as Parameters<typeof bookingSuccessSnapshot>[0];
  const ar = bookingSuccessSnapshot(booked, 'ar-EG');
  const en = bookingSuccessSnapshot(booked, 'en-EG');
  assert.match(ar.fee, /370 EGP/);
  assert.match(en.fee, /370 EGP/);
  assert.match(ar.payment, /نقدًا/);
  assert.match(en.payment, /cash/i);
  assert.match(en.nextStep, /reference/);
});

test('booking result must match patient and every selected slot identity field', () => {
  const booked = {
    ...slot,
    id: 'appointment-1',
    patientId: 'patient-1',
    status: 'confirmed',
    feeMinorUnits: 35000,
    currency: 'EGP',
    paymentMethod: 'cash_on_arrival',
    version: 1,
  } as Parameters<typeof bookingResultMatchesSelection>[0];
  assert.equal(bookingResultMatchesSelection(booked, slot, 'patient-1'), true);
  for (const [key, value] of Object.entries({
    patientId: 'patient-2',
    facilityId: 'facility-2',
    doctorId: 'doctor-2',
    startsAt: 'other-start',
    endsAt: 'other-end',
    civilDate: '2026-09-22',
    timezone: 'UTC',
    status: 'requested',
    currency: 'USD',
    paymentMethod: 'card',
  })) {
    assert.equal(
      bookingResultMatchesSelection(
        { ...booked, [key]: value } as typeof booked,
        slot,
        'patient-1',
      ),
      false,
      key,
    );
  }
});
