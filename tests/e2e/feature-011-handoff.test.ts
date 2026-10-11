import assert from 'node:assert/strict';
import test from 'node:test';
import { allergyEncounterContext } from '../../apps/clinic/src/lib/feature-011-context.ts';
import { allergyCopy, allergyDate } from '../../packages/i18n/src/feature-011.ts';
import type { EncounterProjection } from '@shifaa/contracts';
const person = 'f0110000-0000-4000-8000-000000000001',
  patient = 'f0110000-0000-4000-8100-000000000001',
  facility = 'f0110000-0000-4000-8200-000000000001',
  encounter = 'f0110000-0000-4000-8400-000000000001';
const value: EncounterProjection = {
  id: encounter,
  patientId: person,
  patientPersonId: person,
  managedPatientId: patient,
  facilityId: facility,
  appointmentId: crypto.randomUUID(),
  encounterType: 'consultation',
  responsibleClinicianId: crypto.randomUUID(),
  status: 'open',
  startedAt: '2026-10-08T00:00:00Z',
  version: 1,
};
test('clinic consumes canonical pair only from same current encounter/facility projection', () => {
  assert.equal(
    allergyEncounterContext(value, person, encounter, facility).managedPatientId,
    patient,
  );
  for (const changed of [
    { patientPersonId: patient },
    { patientId: patient },
    { managedPatientId: undefined },
    { status: 'completed' as const },
    { id: crypto.randomUUID() },
    { facilityId: crypto.randomUUID() },
  ])
    assert.throws(() =>
      allergyEncounterContext({ ...value, ...changed }, person, encounter, facility),
    );
  assert.throws(() => allergyEncounterContext(value, patient, encounter, facility));
});
test('Arabic and English preserve exact state/copy parity and readable dates', () => {
  assert.deepEqual(
    Object.keys(allergyCopy['ar-EG']).sort(),
    Object.keys(allergyCopy['en-EG']).sort(),
  );
  for (const locale of ['ar-EG', 'en-EG'] as const) {
    for (const word of Object.values(allergyCopy[locale])) assert.ok(word.length);
    assert.notEqual(allergyDate('2026-10-08T00:00:00Z', locale), '—');
  }
});
