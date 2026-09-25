import assert from 'node:assert/strict';
import test from 'node:test';

import {
  clinicSchedulingArEG,
  clinicSchedulingEnEG,
  clinicSchedulingMessageKeys,
  interpolateClinicScheduling,
} from './clinic-scheduling.ts';

const appointmentStates = [
  'requested',
  'confirmed',
  'checked_in',
  'in_queue',
  'in_consultation',
  'completed',
  'cancelled',
  'no_show',
  'reschedule_required',
] as const;
const queueStates = ['waiting', 'called', 'in_service', 'completed', 'removed'] as const;
const routeFamilies = [
  'discover',
  'doctor',
  'appointmentNew',
  'appointment',
  'today',
  'queue',
  'schedule',
  'clinicAppointment',
] as const;

test('Feature 009 Arabic source and English catalog have exact parity', () => {
  assert.deepEqual(
    Object.keys(clinicSchedulingEnEG).sort(),
    Object.keys(clinicSchedulingArEG).sort(),
  );
  assert.equal(clinicSchedulingMessageKeys.length, Object.keys(clinicSchedulingArEG).length);
  assert.ok(Object.values(clinicSchedulingArEG).every(Boolean));
  assert.ok(Object.values(clinicSchedulingEnEG).every(Boolean));
});

test('all eight route families and canonical state inventories have copy', () => {
  for (const route of routeFamilies) {
    assert.ok(clinicSchedulingArEG[`clinic.route.${route}.title`]);
    assert.ok(clinicSchedulingEnEG[`clinic.route.${route}.title`]);
  }
  for (const state of appointmentStates) {
    assert.ok(clinicSchedulingArEG[`clinic.appointment.status.${state}`]);
    assert.ok(clinicSchedulingEnEG[`clinic.appointment.status.${state}`]);
  }
  for (const state of queueStates) {
    assert.ok(clinicSchedulingArEG[`clinic.queue.status.${state}`]);
    assert.ok(clinicSchedulingEnEG[`clinic.queue.status.${state}`]);
  }
});

test('copy covers cash, confirmation, results, and every degraded state', () => {
  for (const key of [
    'clinic.payment.cashOnArrival',
    'clinic.payment.cashInstruction',
    'clinic.confirm.bookingTitle',
    'clinic.confirm.cancelTitle',
    'clinic.confirm.rescheduleTitle',
    'clinic.result.success',
    'clinic.result.reference',
    'clinic.result.nextStep',
    'clinic.state.loading',
    'clinic.state.empty',
    'clinic.state.error',
    'clinic.state.offline',
    'clinic.state.stale',
    'clinic.state.conflict',
    'clinic.state.success',
  ] as const) {
    assert.ok(clinicSchedulingArEG[key]);
    assert.ok(clinicSchedulingEnEG[key]);
  }
  assert.match(clinicSchedulingEnEG['clinic.payment.cashInstruction'], /Cash on arrival/);
  assert.match(clinicSchedulingEnEG['clinic.notification.productionDisabled'], /disabled/i);
  assert.doesNotMatch(
    clinicSchedulingEnEG['clinic.notification.productionDisabled'],
    /delivered successfully/i,
  );
});

test('dynamic values are directionally isolated and missing values remain unchanged', () => {
  const rendered = interpolateClinicScheduling(clinicSchedulingArEG['clinic.result.reference'], {
    reference: 'APT-009-42',
  });
  assert.equal(rendered, 'المرجع: \u2066APT-009-42\u2069');
  assert.equal(
    interpolateClinicScheduling(clinicSchedulingEnEG['clinic.result.time'], {
      timestamp: '2026-04-15T09:00:00Z',
    }),
    'Time: \u20662026-04-15T09:00:00Z\u2069',
  );
  assert.equal(interpolateClinicScheduling('{missing}', {}), '{missing}');
});
