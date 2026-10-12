import { it, expect } from 'vitest';
import {
  canCreateAllergy,
  canVerifyAllergy,
  knownOrUnknown,
  requiresCodingSource,
} from './allergy-policy.js';
const context = {
  nativeSession: true,
  purpose: true,
  aal2: true,
  careContextCurrent: true,
  feature010ContextCurrent: true,
};
it.each(['PAT', 'CLN'])('%s reports only self_reported', (actor) =>
  expect(canCreateAllergy({ ...context, actor, patientIsSelf: true })).toBe(true),
);
it.each(['GUA', 'DEL'])('%s never creates', (actor) =>
  expect(canCreateAllergy({ ...context, actor, patientIsSelf: true })).toBe(false),
);
it('patient cannot report another patient', () =>
  expect(canCreateAllergy({ ...context, actor: 'PAT', patientIsSelf: false })).toBe(false));
it.each(['nativeSession', 'purpose', 'aal2', 'careContextCurrent', 'feature010ContextCurrent'])(
  'missing clinician %s denies',
  (key) =>
    expect(canCreateAllergy({ ...context, [key]: false, actor: 'CLN', patientIsSelf: false })).toBe(
      false,
    ),
);
it('correction requires exact same-patient terminal assertion', () => {
  expect(
    canCreateAllergy({
      ...context,
      actor: 'PAT',
      patientIsSelf: true,
      correction: { samePatient: true, status: 'entered_in_error' },
    }),
  ).toBe(true);
  expect(
    canCreateAllergy({
      ...context,
      actor: 'PAT',
      patientIsSelf: true,
      correction: { samePatient: false, status: 'entered_in_error' },
    }),
  ).toBe(false);
  expect(
    canCreateAllergy({
      ...context,
      actor: 'PAT',
      patientIsSelf: true,
      correction: { samePatient: true, status: 'refuted' },
    }),
  ).toBe(false);
});
const statuses = ['self_reported', 'clinician_confirmed', 'refuted', 'entered_in_error'] as const;
const edges = new Set([
  'self_reported>clinician_confirmed',
  'self_reported>refuted',
  'self_reported>entered_in_error',
  'clinician_confirmed>refuted',
  'clinician_confirmed>entered_in_error',
  'refuted>clinician_confirmed',
  'refuted>entered_in_error',
]);
for (const from of statuses)
  for (const to of statuses)
    it(from + '>' + to + ' exact approved edge', () =>
      expect(
        canVerifyAllergy({
          ...context,
          actor: 'CLN',
          from,
          to,
          currentVersion: 2,
          expectedVersion: 2,
          newRevisionVersion: 3,
          reasonPresent: true,
          evidenceExact: true,
        }),
      ).toBe(edges.has(from + '>' + to)),
    );
it.each([
  'reasonPresent',
  'evidenceExact',
  'nativeSession',
  'purpose',
  'aal2',
  'careContextCurrent',
  'feature010ContextCurrent',
])('verification missing %s denies', (key) =>
  expect(
    canVerifyAllergy({
      ...context,
      actor: 'CLN',
      from: 'self_reported',
      to: 'clinician_confirmed',
      currentVersion: 2,
      expectedVersion: 2,
      newRevisionVersion: 3,
      reasonPresent: true,
      evidenceExact: true,
      [key]: false,
    }),
  ).toBe(false),
);
it('stale CAS and nonclinician verification deny', () => {
  const input = {
    ...context,
    actor: 'CLN',
    from: 'self_reported',
    to: 'refuted',
    currentVersion: 2,
    expectedVersion: 1,
    newRevisionVersion: 3,
    reasonPresent: true,
    evidenceExact: true,
  };
  expect(canVerifyAllergy(input)).toBe(false);
  expect(canVerifyAllergy({ ...input, actor: 'PAT', expectedVersion: 2 })).toBe(false);
});
it('unknown is preserved; omitted becomes explicit unknown', () => {
  expect(knownOrUnknown()).toEqual({ knowledge: 'unknown' });
  expect(knownOrUnknown({ knowledge: 'known', value: 'reported' })).toEqual({
    knowledge: 'known',
    value: 'reported',
  });
});
it('historical known coding does not claim new validation; changed known requires source', () => {
  const known = {
    knowledge: 'known' as const,
    value: { system: 'synthetic', code: 'old', display: 'original' },
  };
  expect(requiresCodingSource(known, known)).toBe(false);
  expect(requiresCodingSource(known, undefined)).toBe(false);
  expect(requiresCodingSource(known, { knowledge: 'unknown' })).toBe(false);
  expect(requiresCodingSource(known, { ...known, value: { ...known.value, code: 'new' } })).toBe(
    true,
  );
});
