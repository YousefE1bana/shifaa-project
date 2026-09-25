import { describe, expect, it } from 'vitest';

import {
  appointmentProducers,
  appointmentStates,
  evaluateAppointmentOperation,
  type AppointmentModel,
} from './appointment-policy.js';

const now = new Date('2026-04-15T09:00:00.000Z');
const original: AppointmentModel = {
  id: '93000000-0000-4000-8000-000000000001',
  state: 'confirmed',
  version: 4,
  startsAt: '2026-04-15T10:00:00.000Z',
  endsAt: '2026-04-15T10:30:00.000Z',
  paymentMethod: 'cash_on_arrival',
};
const replacement = {
  startsAt: '2026-04-16T10:00:00.000Z',
  endsAt: '2026-04-16T10:30:00.000Z',
  available: true,
};

describe('Feature 009 appointment policy', () => {
  it('keeps the exact nine states and producer allow-list', () => {
    expect(appointmentStates).toEqual([
      'requested',
      'confirmed',
      'checked_in',
      'in_queue',
      'in_consultation',
      'completed',
      'cancelled',
      'no_show',
      'reschedule_required',
    ]);
    expect(appointmentProducers).toEqual({
      requested: [],
      confirmed: ['createAppointment', 'rescheduleAppointment'],
      checked_in: ['checkInAppointment'],
      in_queue: [],
      in_consultation: [],
      completed: [],
      cancelled: ['cancelAppointment'],
      no_show: [],
      reschedule_required: ['declareDoctorAbsence'],
    });
  });

  it('creates confirmed appointments with cash on arrival and no refund consequence', () => {
    const result = evaluateAppointmentOperation({
      operation: 'createAppointment',
      now,
      slot: replacement,
    });

    expect(result).toMatchObject({
      allowed: true,
      nextState: 'confirmed',
      paymentMethod: 'cash_on_arrival',
      refund: false,
      producer: 'createAppointment',
    });
  });

  it('allows pre-start cancel, but denies post-start and post-check-in cancel/reschedule', () => {
    expect(
      evaluateAppointmentOperation({
        operation: 'cancelAppointment',
        current: original,
        expectedVersion: 4,
        now,
      }),
    ).toMatchObject({ allowed: true, nextState: 'cancelled', refund: false });

    expect(
      evaluateAppointmentOperation({
        operation: 'cancelAppointment',
        current: original,
        expectedVersion: 4,
        now: new Date('2026-04-15T10:00:00.000Z'),
      }),
    ).toMatchObject({ allowed: false, code: 'pre-start-required' });

    for (const operation of ['cancelAppointment', 'rescheduleAppointment'] as const) {
      expect(
        evaluateAppointmentOperation({
          operation,
          current: { ...original, state: 'checked_in' },
          expectedVersion: 4,
          now,
          slot: replacement,
        }),
      ).toMatchObject({ allowed: false, code: 'state-transition-invalid' });
    }
  });

  it('allows reschedule_required cancellation and valid future replacement only', () => {
    const required = { ...original, state: 'reschedule_required' as const };
    expect(
      evaluateAppointmentOperation({
        operation: 'cancelAppointment',
        current: required,
        expectedVersion: 4,
        now: new Date('2026-04-20T10:00:00.000Z'),
      }),
    ).toMatchObject({ allowed: true, nextState: 'cancelled' });

    expect(
      evaluateAppointmentOperation({
        operation: 'rescheduleAppointment',
        current: required,
        expectedVersion: 4,
        now,
        slot: replacement,
      }),
    ).toMatchObject({ allowed: true, nextState: 'confirmed', replacementAcquired: true });
  });

  it('requires current version and preserves the original on invalid replacement, conflict, or failure', () => {
    const cases = [
      {
        slot: { ...replacement, startsAt: '2026-04-14T10:00:00.000Z' },
        code: 'replacement-invalid',
      },
      { slot: { ...replacement, available: false }, code: 'replacement-invalid' },
      { slot: replacement, conflict: true, code: 'slot-conflict' },
      { slot: replacement, transaction: 'failed' as const, code: 'transaction-failed' },
    ];

    for (const input of cases) {
      const result = evaluateAppointmentOperation({
        operation: 'rescheduleAppointment',
        current: original,
        expectedVersion: 4,
        now,
        ...input,
      });
      expect(result).toMatchObject({
        allowed: false,
        code: input.code,
        originalAppointment: original,
        replacementAcquired: false,
        refund: false,
      });
    }

    expect(
      evaluateAppointmentOperation({
        operation: 'rescheduleAppointment',
        current: original,
        expectedVersion: 3,
        now,
        slot: replacement,
      }),
    ).toMatchObject({ allowed: false, code: 'version-conflict', originalAppointment: original });
  });

  it('checks in only confirmed appointments, creates waiting, and never advances unreachable states', () => {
    expect(
      evaluateAppointmentOperation({
        operation: 'checkInAppointment',
        current: original,
        expectedVersion: 4,
        now,
      }),
    ).toMatchObject({
      allowed: true,
      nextState: 'checked_in',
      queueState: 'waiting',
      producer: 'checkInAppointment',
    });

    for (const state of appointmentStates.filter((value) => value !== 'confirmed')) {
      const result = evaluateAppointmentOperation({
        operation: 'checkInAppointment',
        current: { ...original, state },
        expectedVersion: 4,
        now,
      });
      expect(result).toMatchObject({ allowed: false, code: 'state-transition-invalid' });
    }
  });

  it('applies the complete nine-state operation matrix without hidden producers', () => {
    const expected: Record<
      (typeof appointmentStates)[number],
      { cancel: boolean; reschedule: boolean; checkIn: boolean }
    > = {
      requested: { cancel: false, reschedule: false, checkIn: false },
      confirmed: { cancel: true, reschedule: true, checkIn: true },
      checked_in: { cancel: false, reschedule: false, checkIn: false },
      in_queue: { cancel: false, reschedule: false, checkIn: false },
      in_consultation: { cancel: false, reschedule: false, checkIn: false },
      completed: { cancel: false, reschedule: false, checkIn: false },
      cancelled: { cancel: false, reschedule: false, checkIn: false },
      no_show: { cancel: false, reschedule: false, checkIn: false },
      reschedule_required: { cancel: true, reschedule: true, checkIn: false },
    };

    for (const state of appointmentStates) {
      const current = { ...original, state };
      const inputs = {
        current,
        expectedVersion: 4,
        now,
        slot: replacement,
      } as const;
      expect(
        evaluateAppointmentOperation({ operation: 'cancelAppointment', ...inputs }).allowed,
      ).toBe(expected[state].cancel);
      expect(
        evaluateAppointmentOperation({ operation: 'rescheduleAppointment', ...inputs }).allowed,
      ).toBe(expected[state].reschedule);
      expect(
        evaluateAppointmentOperation({ operation: 'checkInAppointment', ...inputs }).allowed,
      ).toBe(expected[state].checkIn);
    }
  });
});
