import { describe, expect, it } from 'vitest';

import {
  evaluateEncounterCompletion,
  evaluateEncounterOpening,
  evaluateEncounterReferences,
  evaluateNoteSigning,
} from './encounter-policy.js';

const encounterId = 'encounter-1';
const responsibleClinicianId = 'clinician-1';

describe('Feature 010 encounter policy', () => {
  it('opens only from the checked-in and called handoff with one responsible interval', () => {
    expect(
      evaluateEncounterOpening({
        appointmentState: 'checked_in',
        queueState: 'called',
        responsibleClinicianId,
      }),
    ).toEqual({
      allowed: true,
      code: 'allowed',
      encounterState: 'open',
      appointmentState: 'in_consultation',
      queueState: 'in_service',
      responsibleClinicianId,
      activeResponsibleIntervals: 1,
    });
  });

  it('fails closed for a missing, mismatched, or unspecified handoff state', () => {
    const invalidHandoffs: Array<[string, string | undefined]> = [
      ['checked_in', undefined],
      ['checked_in', 'waiting'],
      ['confirmed', 'called'],
      ['no_show', 'removed'],
      ['unknown', 'called'],
    ];
    for (const [appointmentState, queueState] of invalidHandoffs) {
      expect(
        evaluateEncounterOpening({
          appointmentState,
          ...(queueState === undefined ? {} : { queueState }),
          responsibleClinicianId,
        }),
      ).toMatchObject({ allowed: false, code: 'state-transition-invalid' });
    }
  });

  it('accepts zero or many optional existing references without creating resources', () => {
    expect(evaluateEncounterReferences({ encounterState: 'open' })).toEqual({
      allowed: true,
      code: 'allowed',
      conditionIds: [],
      observationIds: [],
      orderIds: [],
    });

    expect(
      evaluateEncounterReferences({
        encounterState: 'open',
        conditionIds: ['condition-1', 'condition-2'],
        observationIds: ['observation-1'],
        orderIds: ['order-1', 'order-2'],
      }),
    ).toEqual({
      allowed: true,
      code: 'allowed',
      conditionIds: ['condition-1', 'condition-2'],
      observationIds: ['observation-1'],
      orderIds: ['order-1', 'order-2'],
    });

    expect(
      evaluateEncounterReferences({ encounterState: 'open', conditionIds: [''] }),
    ).toMatchObject({ allowed: false, code: 'references-invalid' });
    expect(
      evaluateEncounterReferences({ encounterState: 'completed', conditionIds: ['condition-1'] }),
    ).toMatchObject({ allowed: false, code: 'encounter-not-open' });
  });

  it('completes with a nonblank summary and structural confirmation even with no references', () => {
    expect(
      evaluateEncounterCompletion({
        encounterState: 'open',
        appointmentState: 'in_consultation',
        queueState: 'in_service',
        actorPersonId: responsibleClinicianId,
        responsibleClinicianId,
        expectedVersion: 3,
        currentVersion: 3,
        summary: 'Consultation completed.',
        structurallyConfirmed: true,
      }),
    ).toMatchObject({
      allowed: true,
      code: 'allowed',
      encounterState: 'completed',
      appointmentState: 'completed',
      queueState: 'completed',
      contextAccessEnded: true,
      conditionIds: [],
      observationIds: [],
      orderIds: [],
    });
  });

  it('denies incomplete, unauthorized, stale, or unspecified completion decisions', () => {
    const base = {
      encounterState: 'open',
      appointmentState: 'in_consultation',
      queueState: 'in_service',
      actorPersonId: responsibleClinicianId,
      responsibleClinicianId,
      expectedVersion: 3,
      currentVersion: 3,
      summary: 'Consultation completed.',
      structurallyConfirmed: true,
    };

    for (const invalid of [
      { summary: '  ' },
      { structurallyConfirmed: false },
      { actorPersonId: 'another-clinician' },
      { currentVersion: 2 },
      { encounterState: 'draft' },
      { appointmentState: 'checked_in' },
      { queueState: 'called' },
    ]) {
      expect(evaluateEncounterCompletion({ ...base, ...invalid })).toMatchObject({
        allowed: false,
      });
    }
  });

  it('allows only the two contracted note visibility values for an authorized treating clinician', () => {
    for (const visibility of ['private', 'patient_visible']) {
      expect(
        evaluateNoteSigning({
          encounterId,
          encounterState: 'open',
          signerPersonId: responsibleClinicianId,
          authorizedTreatingClinician: true,
          visibility,
        }),
      ).toMatchObject({
        allowed: true,
        code: 'allowed',
        visibility,
        appendOnly: true,
      });
    }

    expect(
      evaluateNoteSigning({
        encounterId,
        encounterState: 'open',
        signerPersonId: responsibleClinicianId,
        authorizedTreatingClinician: true,
        visibility: 'public',
      }),
    ).toMatchObject({ allowed: false, code: 'visibility-invalid' });
  });

  it('allows same-encounter supersession by the original author or responsible clinician and preserves history', () => {
    const prior = {
      id: 'note-1',
      encounterId,
      authorPersonId: 'author-1',
      visibility: 'private',
      signed: true,
    };
    const input = {
      encounterId,
      encounterState: 'open',
      signerPersonId: responsibleClinicianId,
      responsibleClinicianId,
      authorizedTreatingClinician: true,
      visibility: 'patient_visible',
      supersedes: prior,
    };

    expect(evaluateNoteSigning(input)).toMatchObject({
      allowed: true,
      appendOnly: true,
      priorVersionPreserved: true,
      priorVisibility: 'private',
    });
    expect(evaluateNoteSigning({ ...input, signerPersonId: prior.authorPersonId })).toMatchObject({
      allowed: true,
      appendOnly: true,
      priorVersionPreserved: true,
      priorVisibility: 'private',
    });
    expect(evaluateNoteSigning({ ...input, signerPersonId: 'unrelated-clinician' })).toMatchObject({
      allowed: false,
      code: 'supersession-signer-invalid',
    });
    expect(
      evaluateNoteSigning({ ...input, supersedes: { ...prior, encounterId: 'other-encounter' } }),
    ).toMatchObject({ allowed: false, code: 'supersession-invalid' });
    expect(
      evaluateNoteSigning({ ...input, supersedes: { ...prior, signed: false } }),
    ).toMatchObject({
      allowed: false,
      code: 'supersession-invalid',
    });
  });

  it('rejects note signing for closed encounters or without current treating authority', () => {
    const base = {
      encounterId,
      encounterState: 'open',
      signerPersonId: responsibleClinicianId,
      authorizedTreatingClinician: true,
      visibility: 'private',
    };
    expect(evaluateNoteSigning({ ...base, encounterState: 'completed' })).toMatchObject({
      allowed: false,
      code: 'encounter-not-open',
    });
    expect(evaluateNoteSigning({ ...base, authorizedTreatingClinician: false })).toMatchObject({
      allowed: false,
      code: 'treating-authority-required',
    });
  });
});
