import { describe, expect, it } from 'vitest';

import {
  clinicSchedulingActions,
  clinicSchedulingActors,
  clinicSchedulingAuthorizationFixtures,
  clinicSchedulingDefaultDeny,
  clinicSchedulingInternalActions,
  clinicSchedulingSecurityFixtures,
} from './clinic-scheduling-security-fixtures.js';

describe('009 clinic scheduling explicit authorization matrix', () => {
  it('names every actor and every operation in the matrix vocabulary', () => {
    expect(clinicSchedulingActors).toEqual([
      'patient',
      'guardian',
      'delegate',
      'doctor',
      'owner',
      'clinic',
      'worker',
      'unrelated',
    ]);
    expect(clinicSchedulingActions).toHaveLength(18);
    expect(clinicSchedulingInternalActions).toEqual(['workerDeliveryClaim']);
    expect(clinicSchedulingActions).not.toContain('workerDeliveryClaim');
  });

  it('has the exact canonical allowed actor/action cells and minimum projections', () => {
    const allowed = clinicSchedulingSecurityFixtures.filter(({ decision }) => decision === 'allow');
    expect(allowed.every(({ projection }) => projection !== 'none')).toBe(true);
    const publicActions = ['searchDoctors', 'listDoctorAvailability'];
    const participantActions = [
      'createAppointment',
      'getAppointment',
      'listAppointments',
      'cancelAppointment',
      'rescheduleAppointment',
      'checkInAppointment',
      'getMyQueuePosition',
    ];
    const clinicActions = [
      'getAppointment',
      'listAppointments',
      'cancelAppointment',
      'rescheduleAppointment',
      'checkInAppointment',
      'getQueue',
      'callQueueEntry',
      'reorderQueueEntry',
      'completeQueueEntry',
    ];
    const clinicianReadActions = ['getAppointment', 'listAppointments', 'getQueue'];
    const scheduleActions = [
      'createSchedule',
      'updateSchedule',
      'createScheduleException',
      ...clinicianReadActions,
      'sendDoctorDelay',
      'declareDoctorAbsence',
    ];
    const expectedAllowedByActor: Record<string, string[]> = {
      patient: [...publicActions, ...participantActions],
      guardian: [...publicActions, ...participantActions],
      delegate: [...publicActions, ...participantActions],
      doctor: [...publicActions, ...scheduleActions],
      owner: [...publicActions, ...scheduleActions],
      clinic: [...publicActions, ...clinicActions],
      worker: ['workerDeliveryClaim'],
      unrelated: publicActions,
    };
    for (const actor of clinicSchedulingActors) {
      const actual = allowed
        .filter((fixture) => fixture.actor === actor)
        .map((fixture) => fixture.action)
        .sort();
      expect(actual).toEqual([...(expectedAllowedByActor[actor] ?? [])].sort());
    }
    expect(allowed.filter(({ actor }) => actor === 'worker')).toHaveLength(1);
    expect(allowed.find(({ actor }) => actor === 'worker')?.projection).toBe(
      'worker-event-minimum',
    );
  });

  it('makes wrong relationship, licence, facility, doctor, date, AAL, and purpose explicit denials', () => {
    const deniedIds = new Set(
      clinicSchedulingSecurityFixtures
        .filter(({ decision }) => decision === 'deny')
        .map(({ id }) => id),
    );
    expect(deniedIds).toEqual(
      new Set([
        'unrelated-appointment-deny',
        'patient-cross-patient-deny',
        'guardian-expired-relationship-deny',
        'delegate-revoked-relationship-deny',
        'delegate-wrong-facility-deny',
        'doctor-expired-licence-deny',
        'doctor-suspended-licence-deny',
        'owner-wrong-facility-deny',
        'doctor-clinic-mutation-deny',
        'owner-queue-mutation-deny',
        'clinic-wrong-doctor-date-deny',
        'clinic-missing-membership-deny',
        'worker-http-operation-deny',
        'patient-aal1-deny',
        'patient-wrong-purpose-deny',
        'patient-missing-purpose-deny',
      ]),
    );
    expect(
      clinicSchedulingSecurityFixtures
        .filter(({ decision }) => decision === 'deny')
        .every(({ projection }) => projection === 'none'),
    ).toBe(true);
  });

  it('returns deny and no projection for every unspecified cell', () => {
    const defaultCell = clinicSchedulingDefaultDeny({
      actor: 'doctor',
      action: 'sendDoctorDelay',
      facility: 'wrong',
      doctor: 'wrong',
      civilDate: 'adjacent',
    });
    expect(defaultCell.decision).toBe('deny');
    expect(defaultCell.projection).toBe('none');
    expect(clinicSchedulingAuthorizationFixtures).toBe(clinicSchedulingSecurityFixtures);
  });
});
