export type AllergyStatus =
  | 'self_reported'
  | 'clinician_confirmed'
  | 'refuted'
  | 'entered_in_error';
export interface AllergyContextFacts {
  actor: string;
  nativeSession: boolean;
  purpose: boolean;
  aal2: boolean;
  careContextCurrent: boolean;
  feature010ContextCurrent: boolean;
}
export interface CreationFacts extends AllergyContextFacts {
  patientIsSelf: boolean;
  correction?: { samePatient: boolean; status: string };
}
function clinicianContext(input: AllergyContextFacts): boolean {
  return (
    input.actor === 'CLN' &&
    input.nativeSession &&
    input.purpose &&
    input.aal2 &&
    input.careContextCurrent &&
    input.feature010ContextCurrent
  );
}
/** Reporting creates self_reported only; clinical status is never inferred. */
export function canCreateAllergy(input: CreationFacts): boolean {
  const authorized =
    (input.actor === 'PAT' &&
      input.nativeSession &&
      input.purpose &&
      input.aal2 &&
      input.patientIsSelf) ||
    clinicianContext(input);
  return (
    authorized &&
    (!input.correction ||
      (input.correction.samePatient && input.correction.status === 'entered_in_error'))
  );
}
export interface VerificationFacts extends AllergyContextFacts {
  from: string;
  to: string;
  currentVersion: number;
  expectedVersion: number;
  newRevisionVersion: number;
  reasonPresent: boolean;
  evidenceExact: boolean;
}
const transitions: Readonly<Record<AllergyStatus, readonly AllergyStatus[]>> = {
  self_reported: ['clinician_confirmed', 'refuted', 'entered_in_error'],
  clinician_confirmed: ['refuted', 'entered_in_error'],
  refuted: ['clinician_confirmed', 'entered_in_error'],
  entered_in_error: [],
};
export function canVerifyAllergy(input: VerificationFacts): boolean {
  if (
    !clinicianContext(input) ||
    !input.reasonPresent ||
    !input.evidenceExact ||
    !Number.isSafeInteger(input.currentVersion) ||
    !Number.isSafeInteger(input.newRevisionVersion) ||
    input.currentVersion < 1 ||
    input.expectedVersion !== input.currentVersion ||
    input.newRevisionVersion !== input.currentVersion + 1
  )
    return false;
  return (
    Object.hasOwn(transitions, input.from) &&
    transitions[input.from as AllergyStatus].some((target) => target === input.to)
  );
}
export type KnownUnknown<T> = { knowledge: 'unknown' } | { knowledge: 'known'; value: T };
export function knownOrUnknown<T>(input?: KnownUnknown<T>): KnownUnknown<T> {
  return input ?? { knowledge: 'unknown' };
}
export type Coding = KnownUnknown<{ system: string; code: string; display: string }>;
export function requiresCodingSource(
  before: Coding | undefined,
  after: Coding | undefined,
): boolean {
  if (after === undefined || after.knowledge === 'unknown') return false;
  return (
    before?.knowledge !== 'known' ||
    before.value.system !== after.value.system ||
    before.value.code !== after.value.code ||
    before.value.display !== after.value.display
  );
}
