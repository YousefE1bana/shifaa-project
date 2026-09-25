/** Deterministic, synthetic inputs shared by Feature 009 tests. */

export const clinicSchedulingSyntheticIds = {
  facility: '90000000-0000-4000-8000-000000000001',
  secondFacility: '90000000-0000-4000-8000-000000000002',
  doctor: '91000000-0000-4000-8000-000000000001',
  secondDoctor: '91000000-0000-4000-8000-000000000002',
  patient: '92000000-0000-4000-8000-000000000001',
  appointment: '93000000-0000-4000-8000-000000000001',
  secondAppointment: '93000000-0000-4000-8000-000000000002',
  queueScope: '94000000-0000-4000-8000-000000000001',
  queueEntry: '95000000-0000-4000-8000-000000000001',
  schedule: '96000000-0000-4000-8000-000000000001',
} as const;

export const clinicSchedulingAppointmentStates = [
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

export type ClinicSchedulingAppointmentState = (typeof clinicSchedulingAppointmentStates)[number];

export const clinicSchedulingQueueStates = [
  'waiting',
  'called',
  'in_service',
  'completed',
  'removed',
] as const;

export type ClinicSchedulingQueueState = (typeof clinicSchedulingQueueStates)[number];

export type CivilTimeFixture = {
  id: string;
  kind: 'normal' | 'nonexistent' | 'ambiguous';
  timezone: string;
  civilDate: string;
  localStart: string;
  localEnd: string;
  expected: 'one-slot' | 'omit' | 'earlier-offset';
};

export const clinicSchedulingCivilTimeFixtures = [
  {
    id: 'normal-winter-slot',
    kind: 'normal',
    timezone: 'Europe/Berlin',
    civilDate: '2026-01-15',
    localStart: '09:00',
    localEnd: '09:30',
    expected: 'one-slot',
  },
  {
    id: 'nonexistent-spring-slot',
    kind: 'nonexistent',
    timezone: 'Europe/Berlin',
    civilDate: '2026-03-29',
    localStart: '02:30',
    localEnd: '03:00',
    expected: 'omit',
  },
  {
    id: 'ambiguous-autumn-slot',
    kind: 'ambiguous',
    timezone: 'Europe/Berlin',
    civilDate: '2026-10-25',
    localStart: '02:30',
    localEnd: '03:00',
    expected: 'earlier-offset',
  },
] as const satisfies readonly CivilTimeFixture[];

export type ScheduleIntervalFixture = {
  id: string;
  start: string;
  end: string;
  expected: 'allowed' | 'conflict';
};

export const clinicSchedulingIntervalFixtures = {
  boundaryTouching: [
    {
      id: 'base-window',
      start: '09:00',
      end: '09:30',
      expected: 'allowed',
    },
    {
      id: 'next-window',
      start: '09:30',
      end: '10:00',
      expected: 'allowed',
    },
  ],
  positiveOverlap: [
    {
      id: 'first-exception',
      start: '10:00',
      end: '11:00',
      expected: 'allowed',
    },
    {
      id: 'overlapping-exception',
      start: '10:30',
      end: '11:30',
      expected: 'conflict',
    },
  ],
} as const satisfies Readonly<{
  boundaryTouching: readonly ScheduleIntervalFixture[];
  positiveOverlap: readonly ScheduleIntervalFixture[];
}>;

export const clinicSchedulingExceptionPrecedenceFixtures = [
  {
    id: 'base-only',
    civilDate: '2026-02-10',
    intervals: [{ source: 'base', start: '09:00', end: '09:30' }],
    expected: 'available',
  },
  {
    id: 'added-over-base',
    civilDate: '2026-02-11',
    intervals: [
      { source: 'base', start: '09:00', end: '09:30' },
      { source: 'added', start: '10:00', end: '10:30' },
    ],
    expected: 'available-added-and-base',
  },
  {
    id: 'blocked-over-added',
    civilDate: '2026-02-12',
    intervals: [
      { source: 'added', start: '10:00', end: '10:30' },
      { source: 'blocked', start: '10:00', end: '10:30' },
    ],
    expected: 'unavailable',
  },
  {
    id: 'absence-over-blocked',
    civilDate: '2026-02-13',
    intervals: [
      { source: 'blocked', start: '10:00', end: '10:30' },
      { source: 'absence', start: '10:00', end: '10:30' },
    ],
    expected: 'unavailable-absence',
  },
] as const;

export type AppointmentStateFixture = {
  state: ClinicSchedulingAppointmentState;
  producedByFeature009: boolean;
  producers: readonly (
    | 'createAppointment'
    | 'rescheduleAppointment'
    | 'checkInAppointment'
    | 'cancelAppointment'
    | 'declareDoctorAbsence'
  )[];
};

const appointmentStateProducers: Record<
  ClinicSchedulingAppointmentState,
  AppointmentStateFixture['producers']
> = {
  requested: [],
  confirmed: ['createAppointment', 'rescheduleAppointment'],
  checked_in: ['checkInAppointment'],
  in_queue: [],
  in_consultation: [],
  completed: [],
  cancelled: ['cancelAppointment'],
  no_show: [],
  reschedule_required: ['declareDoctorAbsence'],
};

export const clinicSchedulingAppointmentStateFixtures = clinicSchedulingAppointmentStates.map(
  (state): AppointmentStateFixture => ({
    state,
    producers: appointmentStateProducers[state],
    producedByFeature009: appointmentStateProducers[state].length > 0,
  }),
);

export type QueueStateFixture = {
  state: ClinicSchedulingQueueState;
  producedByFeature009: boolean;
  producer:
    | 'checkInAppointment'
    | 'callQueueEntry'
    | 'completeQueueEntry'
    | 'declareDoctorAbsence'
    | 'none';
};

export const clinicSchedulingQueueStateFixtures = clinicSchedulingQueueStates.map(
  (state): QueueStateFixture => ({
    state,
    producedByFeature009: state !== 'in_service',
    producer:
      state === 'waiting'
        ? 'checkInAppointment'
        : state === 'called'
          ? 'callQueueEntry'
          : state === 'completed'
            ? 'completeQueueEntry'
            : state === 'removed'
              ? 'declareDoctorAbsence'
              : 'none',
  }),
);

export const clinicSchedulingDelayAbsenceFixtures = {
  delay: {
    facilityId: clinicSchedulingSyntheticIds.facility,
    doctorPersonId: clinicSchedulingSyntheticIds.doctor,
    civilDate: '2026-04-15',
    firstMinutes: 15,
    replacementMinutes: 30,
    expected: 'latest-overlay-only',
    unchanged: ['appointment-time', 'queue-order', 'appointment-state', 'availability-slot'],
  },
  absence: {
    facilityId: clinicSchedulingSyntheticIds.facility,
    doctorPersonId: clinicSchedulingSyntheticIds.doctor,
    civilDate: '2026-04-16',
    affectedAppointmentStates: ['confirmed', 'checked_in'],
    unaffectedAppointmentStates: [
      'requested',
      'in_queue',
      'in_consultation',
      'completed',
      'cancelled',
      'no_show',
      'reschedule_required',
    ],
    affectedQueueStates: ['waiting', 'called'],
    unaffectedQueueStates: ['in_service', 'completed', 'removed'],
    expectedAppointmentState: 'reschedule_required',
    expectedQueueState: 'removed',
  },
} as const;

export type RetryFixture = {
  id: string;
  key: string;
  bodyDigest: string;
  outcome: 'replay' | 'conflict';
  effectCount: 0 | 1;
};

export const clinicSchedulingRetryFixtures = [
  {
    id: 'same-key-same-body',
    key: 'synthetic-009-book-0001',
    bodyDigest: 'sha256:009-book-body-a',
    outcome: 'replay',
    effectCount: 1,
  },
  {
    id: 'same-key-changed-body',
    key: 'synthetic-009-book-0001',
    bodyDigest: 'sha256:009-book-body-b',
    outcome: 'conflict',
    effectCount: 0,
  },
] as const satisfies readonly RetryFixture[];

export type RaceFixture = {
  id: string;
  resource: 'doctor-slot' | 'appointment-version' | 'queue-scope';
  writers: readonly string[];
  winnerCount: 1;
  loserEffectCount: 0;
};

export const clinicSchedulingRaceFixtures = [
  {
    id: 'competing-bookings',
    resource: 'doctor-slot',
    writers: ['synthetic-writer-a', 'synthetic-writer-b'],
    winnerCount: 1,
    loserEffectCount: 0,
  },
  {
    id: 'stale-appointment-version',
    resource: 'appointment-version',
    writers: ['synthetic-update-a', 'synthetic-update-b'],
    winnerCount: 1,
    loserEffectCount: 0,
  },
  {
    id: 'competing-queue-writers',
    resource: 'queue-scope',
    writers: ['synthetic-queue-a', 'synthetic-queue-b'],
    winnerCount: 1,
    loserEffectCount: 0,
  },
] as const satisfies readonly RaceFixture[];

export const clinicSchedulingFixtureCatalog = {
  civilTime: clinicSchedulingCivilTimeFixtures,
  intervals: clinicSchedulingIntervalFixtures,
  precedence: clinicSchedulingExceptionPrecedenceFixtures,
  appointmentStates: clinicSchedulingAppointmentStateFixtures,
  queueStates: clinicSchedulingQueueStateFixtures,
  delayAbsence: clinicSchedulingDelayAbsenceFixtures,
  retries: clinicSchedulingRetryFixtures,
  races: clinicSchedulingRaceFixtures,
} as const;
