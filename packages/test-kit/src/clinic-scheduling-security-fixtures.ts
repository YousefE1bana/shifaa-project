import { clinicSchedulingSyntheticIds } from './clinic-scheduling-fixtures.js';

export const clinicSchedulingActors = [
  'patient',
  'guardian',
  'delegate',
  'doctor',
  'owner',
  'clinic',
  'worker',
  'unrelated',
] as const;
export type ClinicSchedulingActor = (typeof clinicSchedulingActors)[number];

export const clinicSchedulingActions = [
  'searchDoctors',
  'listDoctorAvailability',
  'createSchedule',
  'updateSchedule',
  'createScheduleException',
  'createAppointment',
  'getAppointment',
  'listAppointments',
  'cancelAppointment',
  'rescheduleAppointment',
  'checkInAppointment',
  'getQueue',
  'getMyQueuePosition',
  'callQueueEntry',
  'reorderQueueEntry',
  'completeQueueEntry',
  'sendDoctorDelay',
  'declareDoctorAbsence',
] as const;
export type ClinicSchedulingAction = (typeof clinicSchedulingActions)[number];

type Relationship =
  | 'self'
  | 'guardian-current'
  | 'delegate-current'
  | 'membership'
  | 'worker-claim'
  | 'expired'
  | 'revoked'
  | 'none';
type Licence = 'current' | 'expired' | 'suspended' | 'not-applicable' | 'none';
type Scope = 'exact' | 'wrong' | 'adjacent' | 'none';
type Aal = 1 | 2 | null;
type Decision = 'allow' | 'deny';
type Projection =
  | 'public-doctor-availability'
  | 'patient-appointment-minimum'
  | 'patient-queue-position-minimum'
  | 'clinic-schedule-minimum'
  | 'clinic-worklist-minimum'
  | 'clinic-queue-minimum'
  | 'worker-event-minimum'
  | 'none';

export const clinicSchedulingInternalActions = ['workerDeliveryClaim'] as const;
export type ClinicSchedulingInternalAction = (typeof clinicSchedulingInternalActions)[number];
export type ClinicSchedulingSecurityAction =
  | ClinicSchedulingAction
  | ClinicSchedulingInternalAction;

export type ClinicSchedulingSecurityFixture = {
  id: string;
  actor: ClinicSchedulingActor;
  relationship: Relationship;
  licence: Licence;
  facility: Scope;
  doctor: Scope;
  civilDate: Scope;
  action: ClinicSchedulingSecurityAction;
  aal: Aal;
  purpose: string | null;
  decision: Decision;
  projection: Projection;
};

type SecurityContext = Omit<
  ClinicSchedulingSecurityFixture,
  'id' | 'actor' | 'action' | 'decision' | 'projection'
>;

const publicSearch: SecurityContext = {
  relationship: 'none',
  licence: 'not-applicable',
  facility: 'exact',
  doctor: 'exact',
  civilDate: 'exact',
  aal: null,
  purpose: null,
};

const participantContext = (
  relationship: Relationship,
  purpose: string | null,
): SecurityContext => ({
  relationship,
  licence: 'not-applicable',
  facility: 'exact',
  doctor: 'exact',
  civilDate: 'exact',
  aal: 2,
  purpose,
});

const clinicContext: SecurityContext = {
  relationship: 'membership',
  licence: 'not-applicable',
  facility: 'exact',
  doctor: 'exact',
  civilDate: 'exact',
  aal: 2,
  purpose: 'clinic.operations',
};

const doctorContext: SecurityContext = {
  ...clinicContext,
  licence: 'current',
};

const deniedContext: SecurityContext = {
  relationship: 'none',
  licence: 'none',
  facility: 'none',
  doctor: 'none',
  civilDate: 'none',
  aal: null,
  purpose: null,
};

const clinicScheduleActions = [
  'createSchedule',
  'updateSchedule',
  'createScheduleException',
] as const;
const clinicAppointmentActions = [
  'getAppointment',
  'listAppointments',
  'cancelAppointment',
  'rescheduleAppointment',
  'checkInAppointment',
] as const;
const clinicAppointmentReadActions = ['getAppointment', 'listAppointments'] as const;
const clinicQueueActions = [
  'getQueue',
  'callQueueEntry',
  'reorderQueueEntry',
  'completeQueueEntry',
] as const;
const clinicQueueReadActions = ['getQueue'] as const;
const publicActions = ['searchDoctors', 'listDoctorAvailability'] as const;
const participantActions = [
  'createAppointment',
  ...clinicAppointmentActions,
  'getMyQueuePosition',
] as const;
const publicActors = [
  'patient',
  'guardian',
  'delegate',
  'doctor',
  'owner',
  'clinic',
  'unrelated',
] as const satisfies readonly ClinicSchedulingActor[];
const participantActors = ['patient', 'guardian', 'delegate'] as const;

function allowedCell(
  actor: ClinicSchedulingActor,
  action: ClinicSchedulingSecurityAction,
  context: SecurityContext,
  projection: Projection,
): ClinicSchedulingSecurityFixture {
  return {
    id: `${actor}-${action}-allow`,
    actor,
    action,
    ...context,
    decision: 'allow',
    projection,
  };
}

const publicAllowed = publicActors.flatMap((actor) =>
  publicActions.map((action) =>
    allowedCell(actor, action, publicSearch, 'public-doctor-availability'),
  ),
);
const participantAllowed = participantActors.flatMap((actor) =>
  participantActions.map((action) => {
    const relationship =
      actor === 'patient' ? 'self' : actor === 'guardian' ? 'guardian-current' : 'delegate-current';
    const isQueuePosition = action === 'getMyQueuePosition';
    return allowedCell(
      actor,
      action,
      participantContext(relationship, isQueuePosition ? 'appointment.view' : 'appointment.manage'),
      isQueuePosition ? 'patient-queue-position-minimum' : 'patient-appointment-minimum',
    );
  }),
);
const doctorOwnerAllowed = (actor: 'doctor' | 'owner') => [
  ...clinicScheduleActions.map((action) =>
    allowedCell(
      actor,
      action,
      actor === 'doctor' ? doctorContext : clinicContext,
      'clinic-schedule-minimum',
    ),
  ),
  ...clinicAppointmentReadActions.map((action) =>
    allowedCell(
      actor,
      action,
      actor === 'doctor' ? doctorContext : clinicContext,
      'clinic-worklist-minimum',
    ),
  ),
  ...clinicQueueReadActions.map((action) =>
    allowedCell(
      actor,
      action,
      actor === 'doctor' ? doctorContext : clinicContext,
      'clinic-queue-minimum',
    ),
  ),
  ...(['sendDoctorDelay', 'declareDoctorAbsence'] as const).map((action) =>
    allowedCell(
      actor,
      action,
      actor === 'doctor' ? doctorContext : clinicContext,
      'clinic-worklist-minimum',
    ),
  ),
];
const clinicAllowed = [
  ...clinicAppointmentActions.map((action) =>
    allowedCell('clinic', action, clinicContext, 'clinic-worklist-minimum'),
  ),
  ...clinicQueueActions.map((action) =>
    allowedCell('clinic', action, clinicContext, 'clinic-queue-minimum'),
  ),
];
const workerAllowed = [
  allowedCell(
    'worker',
    'workerDeliveryClaim',
    {
      relationship: 'worker-claim',
      licence: 'not-applicable',
      facility: 'exact',
      doctor: 'exact',
      civilDate: 'exact',
      aal: null,
      purpose: 'notification.deliver',
    },
    'worker-event-minimum',
  ),
];

export const clinicSchedulingSecurityFixtures = [
  ...publicAllowed,
  ...participantAllowed,
  ...doctorOwnerAllowed('doctor'),
  ...doctorOwnerAllowed('owner'),
  ...clinicAllowed,
  ...workerAllowed,
  {
    id: 'unrelated-appointment-deny',
    actor: 'unrelated',
    action: 'getAppointment',
    ...deniedContext,
    decision: 'deny',
    projection: 'none',
  },
  {
    id: 'patient-cross-patient-deny',
    actor: 'patient',
    action: 'getAppointment',
    ...participantContext('none', 'appointment.view'),
    decision: 'deny',
    projection: 'none',
  },
  {
    id: 'guardian-expired-relationship-deny',
    actor: 'guardian',
    action: 'getAppointment',
    ...participantContext('expired', 'appointment.view'),
    decision: 'deny',
    projection: 'none',
  },
  {
    id: 'delegate-revoked-relationship-deny',
    actor: 'delegate',
    action: 'getAppointment',
    ...participantContext('revoked', 'appointment.view'),
    decision: 'deny',
    projection: 'none',
  },
  {
    id: 'delegate-wrong-facility-deny',
    actor: 'delegate',
    action: 'getAppointment',
    ...participantContext('delegate-current', 'appointment.view'),
    facility: 'wrong',
    decision: 'deny',
    projection: 'none',
  },
  {
    id: 'doctor-expired-licence-deny',
    actor: 'doctor',
    action: 'createSchedule',
    ...doctorContext,
    licence: 'expired',
    decision: 'deny',
    projection: 'none',
  },
  {
    id: 'doctor-suspended-licence-deny',
    actor: 'doctor',
    action: 'sendDoctorDelay',
    ...doctorContext,
    licence: 'suspended',
    decision: 'deny',
    projection: 'none',
  },
  {
    id: 'owner-wrong-facility-deny',
    actor: 'owner',
    action: 'updateSchedule',
    ...clinicContext,
    facility: 'wrong',
    decision: 'deny',
    projection: 'none',
  },
  {
    id: 'doctor-clinic-mutation-deny',
    actor: 'doctor',
    action: 'cancelAppointment',
    ...doctorContext,
    decision: 'deny',
    projection: 'none',
  },
  {
    id: 'owner-queue-mutation-deny',
    actor: 'owner',
    action: 'callQueueEntry',
    ...clinicContext,
    decision: 'deny',
    projection: 'none',
  },
  {
    id: 'clinic-wrong-doctor-date-deny',
    actor: 'clinic',
    action: 'getQueue',
    ...clinicContext,
    doctor: 'wrong',
    civilDate: 'wrong',
    decision: 'deny',
    projection: 'none',
  },
  {
    id: 'clinic-missing-membership-deny',
    actor: 'clinic',
    action: 'callQueueEntry',
    ...clinicContext,
    relationship: 'none',
    decision: 'deny',
    projection: 'none',
  },
  {
    id: 'worker-http-operation-deny',
    actor: 'worker',
    action: 'getAppointment',
    ...deniedContext,
    decision: 'deny',
    projection: 'none',
  },
  {
    id: 'patient-aal1-deny',
    actor: 'patient',
    action: 'createAppointment',
    ...participantContext('self', 'appointment.manage'),
    aal: 1,
    decision: 'deny',
    projection: 'none',
  },
  {
    id: 'patient-wrong-purpose-deny',
    actor: 'patient',
    action: 'cancelAppointment',
    ...participantContext('self', 'profile.view'),
    decision: 'deny',
    projection: 'none',
  },
  {
    id: 'patient-missing-purpose-deny',
    actor: 'patient',
    action: 'cancelAppointment',
    ...participantContext('self', null),
    decision: 'deny',
    projection: 'none',
  },
] as const satisfies readonly ClinicSchedulingSecurityFixture[];

export const clinicSchedulingAuthorizationFixtures = clinicSchedulingSecurityFixtures;

export const clinicSchedulingSecurityFixtureDefaults = {
  actor: 'unrelated' as const,
  relationship: 'none' as const,
  licence: 'none' as const,
  facility: 'none' as const,
  doctor: 'none' as const,
  civilDate: 'none' as const,
  action: 'getAppointment' as const,
  aal: null,
  purpose: null,
  decision: 'deny' as const,
  projection: 'none' as const,
};

export function clinicSchedulingDefaultDeny(
  overrides: Partial<ClinicSchedulingSecurityFixture> = {},
): ClinicSchedulingSecurityFixture {
  return {
    id: 'unspecified-default-deny',
    ...clinicSchedulingSecurityFixtureDefaults,
    ...overrides,
    decision: 'deny',
    projection: 'none',
  };
}

export const clinicSchedulingSecurityScope = {
  facilityId: clinicSchedulingSyntheticIds.facility,
  doctorPersonId: clinicSchedulingSyntheticIds.doctor,
  civilDate: '2026-04-15',
} as const;
