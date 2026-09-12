import { describe, expect, it } from 'vitest';

import {
  clinicSchedulingAppointmentStateFixtures,
  clinicSchedulingAppointmentStates,
  clinicSchedulingCivilTimeFixtures,
  clinicSchedulingDelayAbsenceFixtures,
  clinicSchedulingExceptionPrecedenceFixtures,
  clinicSchedulingIntervalFixtures,
  clinicSchedulingQueueStateFixtures,
  clinicSchedulingQueueStates,
  clinicSchedulingRaceFixtures,
  clinicSchedulingRetryFixtures,
} from './clinic-scheduling-fixtures.js';

describe('009 clinic scheduling deterministic fixtures', () => {
  it('pins normal, nonexistent, and ambiguous civil-time vectors', () => {
    expect(clinicSchedulingCivilTimeFixtures.map(({ kind }) => kind)).toEqual([
      'normal',
      'nonexistent',
      'ambiguous',
    ]);
    expect(clinicSchedulingCivilTimeFixtures.find(({ kind }) => kind === 'normal')?.expected).toBe(
      'one-slot',
    );
    expect(
      clinicSchedulingCivilTimeFixtures.find(({ kind }) => kind === 'nonexistent')?.expected,
    ).toBe('omit');
    expect(
      clinicSchedulingCivilTimeFixtures.find(({ kind }) => kind === 'ambiguous')?.expected,
    ).toBe('earlier-offset');
  });

  it('pins half-open boundary contact and positive overlap conflict', () => {
    expect(
      clinicSchedulingIntervalFixtures.boundaryTouching.every(
        ({ expected }) => expected === 'allowed',
      ),
    ).toBe(true);
    expect(clinicSchedulingIntervalFixtures.positiveOverlap.at(-1)?.expected).toBe('conflict');
  });

  it('preserves absence > blocked > added > base precedence', () => {
    expect(clinicSchedulingExceptionPrecedenceFixtures.map(({ id }) => id)).toEqual([
      'base-only',
      'added-over-base',
      'blocked-over-added',
      'absence-over-blocked',
    ]);
    expect(clinicSchedulingExceptionPrecedenceFixtures.at(-1)?.expected).toBe(
      'unavailable-absence',
    );
  });

  it('contains exactly the canonical appointment and queue state inventories', () => {
    expect(clinicSchedulingAppointmentStates).toHaveLength(9);
    expect(clinicSchedulingQueueStates).toHaveLength(5);
    expect(
      clinicSchedulingAppointmentStateFixtures
        .filter(({ producedByFeature009 }) => producedByFeature009)
        .map(({ state }) => state),
    ).toEqual(['confirmed', 'checked_in', 'cancelled', 'reschedule_required']);
    expect(clinicSchedulingAppointmentStateFixtures.map(({ producers }) => producers)).toEqual([
      [],
      ['createAppointment', 'rescheduleAppointment'],
      ['checkInAppointment'],
      [],
      [],
      [],
      ['cancelAppointment'],
      [],
      ['declareDoctorAbsence'],
    ]);
    expect(
      clinicSchedulingAppointmentStateFixtures.filter(({ state }) =>
        ['requested', 'in_queue', 'in_consultation', 'completed', 'no_show'].includes(state),
      ),
    ).toHaveLength(5);
    expect(
      clinicSchedulingQueueStateFixtures.find(({ state }) => state === 'in_service')
        ?.producedByFeature009,
    ).toBe(false);
    expect(
      clinicSchedulingQueueStateFixtures.find(({ state }) => state === 'removed')
        ?.producedByFeature009,
    ).toBe(true);
    expect(clinicSchedulingQueueStateFixtures.map(({ producer }) => producer)).toEqual([
      'checkInAppointment',
      'callQueueEntry',
      'none',
      'completeQueueEntry',
      'declareDoctorAbsence',
    ]);
  });

  it('pins non-accumulating delay and scoped absence effects', () => {
    expect(clinicSchedulingDelayAbsenceFixtures.delay.expected).toBe('latest-overlay-only');
    expect(clinicSchedulingDelayAbsenceFixtures.delay.unchanged).toEqual([
      'appointment-time',
      'queue-order',
      'appointment-state',
      'availability-slot',
    ]);
    expect(clinicSchedulingDelayAbsenceFixtures.absence.affectedAppointmentStates).toEqual([
      'confirmed',
      'checked_in',
    ]);
    expect(clinicSchedulingDelayAbsenceFixtures.absence.affectedQueueStates).toEqual([
      'waiting',
      'called',
    ]);
    expect(clinicSchedulingDelayAbsenceFixtures.absence.unaffectedAppointmentStates).toEqual([
      'requested',
      'in_queue',
      'in_consultation',
      'completed',
      'cancelled',
      'no_show',
      'reschedule_required',
    ]);
    expect(clinicSchedulingDelayAbsenceFixtures.absence.unaffectedQueueStates).toEqual([
      'in_service',
      'completed',
      'removed',
    ]);
  });

  it('pins same-key replay and changed-body conflict without duplicate effects', () => {
    expect(clinicSchedulingRetryFixtures.map(({ id }) => id)).toEqual([
      'same-key-same-body',
      'same-key-changed-body',
    ]);
    expect(clinicSchedulingRetryFixtures[0]).toMatchObject({ outcome: 'replay', effectCount: 1 });
    expect(clinicSchedulingRetryFixtures[1]).toMatchObject({ outcome: 'conflict', effectCount: 0 });
    expect(clinicSchedulingRetryFixtures[0]?.key).toBe(clinicSchedulingRetryFixtures[1]?.key);
  });

  it('pins stale-version and competing-writer vectors', () => {
    expect(clinicSchedulingRaceFixtures.map(({ resource }) => resource)).toEqual([
      'doctor-slot',
      'appointment-version',
      'queue-scope',
    ]);
    for (const fixture of clinicSchedulingRaceFixtures) {
      expect(fixture.writers).toHaveLength(2);
      expect(fixture.winnerCount).toBe(1);
      expect(fixture.loserEffectCount).toBe(0);
    }
  });
});
