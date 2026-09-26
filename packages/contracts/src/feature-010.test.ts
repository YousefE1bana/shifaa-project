import { Value } from '@sinclair/typebox/value';
import { describe, expect, it } from 'vitest';

import {
  feature010Operations,
  feature010QuerySchemas,
  feature010RequestSchemas,
  feature010Schemas,
} from './index.js';

const operationIds = [
  'createEncounter',
  'getEncounter',
  'updateEncounter',
  'signEncounterNote',
  'completeEncounter',
  'createReferral',
  'listReferrals',
  'acceptReferral',
  'listContextMessages',
  'sendContextMessage',
] as const;

const encounterId = 'a1000000-0000-4000-8000-000000000001';
const patientId = 'a1000000-0000-4000-8000-000000000002';
const facilityId = 'a1000000-0000-4000-8000-000000000003';
const authorId = 'a1000000-0000-4000-8000-000000000004';
const timestamp = '2026-09-26T10:00:00Z';

function operation(operationId: (typeof operationIds)[number]) {
  const match = feature010Operations.find((item) => item.operationId === operationId);
  expect(match).toBeDefined();
  return match!;
}

describe('generated Feature 010 wire contract', () => {
  it('contains exactly the ten approved operation identifiers', () => {
    expect(feature010Operations).toHaveLength(10);
    expect(feature010Operations.map(({ operationId: id }) => id)).toEqual(operationIds);
    expect(new Set(feature010Operations.map(({ operationId: id }) => id)).size).toBe(10);
  });

  it('closes all seven mutation request bodies and rejects attachment or workforce injection', () => {
    const closedRequestSchemas = [
      feature010Schemas.CreateEncounterRequest,
      feature010Schemas.UpdateEncounterRequest,
      feature010Schemas.SignEncounterNoteRequest,
      feature010Schemas.CompleteEncounterRequest,
      feature010Schemas.CreateReferralRequest,
      feature010Schemas.AcceptReferralRequest,
      feature010Schemas.SendContextMessageRequest,
    ];
    for (const schema of closedRequestSchemas) expect(schema.additionalProperties).toBe(false);

    expect(
      Value.Check(feature010Schemas.CreateEncounterRequest, {
        appointmentId: encounterId,
        patientId,
        encounterType: 'consultation',
      }),
    ).toBe(true);
    expect(
      Value.Check(feature010Schemas.CreateEncounterRequest, {
        appointmentId: encounterId,
        patientId,
        encounterType: 'consultation',
        workforceParticipantIds: [authorId],
      }),
    ).toBe(false);
    expect(Value.Check(feature010Schemas.UpdateEncounterRequest, {})).toBe(false);
    const signedNote = {
      noteType: 'progress',
      body: 'synthetic note',
      visibility: 'private',
    };
    expect(Value.Check(feature010Schemas.SignEncounterNoteRequest, signedNote)).toBe(true);
    expect(
      Value.Check(feature010Schemas.SignEncounterNoteRequest, { ...signedNote, authorId }),
    ).toBe(false);
    expect(
      Value.Check(feature010Schemas.CreateReferralRequest, {
        targetSpecialty: 'cardiology',
        reasonSummary: 'synthetic referral summary',
      }),
    ).toBe(true);
    expect(
      Value.Check(feature010Schemas.AcceptReferralRequest, {
        authorizedFieldCodes: ['reason_summary'],
        targetSlot: {
          facilityId,
          doctorId: authorId,
          startsAt: timestamp,
          endsAt: '2026-09-26T10:30:00Z',
          timezone: 'Africa/Cairo',
          civilDate: '2026-09-26',
          availabilityVersion: 1,
        },
      }),
    ).toBe(true);
    expect(
      Value.Check(feature010Schemas.CompleteEncounterRequest, {
        summary: 'synthetic completion',
        structuralConfirmation: true,
      }),
    ).toBe(true);
    expect(
      Value.Check(feature010Schemas.CompleteEncounterRequest, {
        summary: 'synthetic completion',
        structuralConfirmation: false,
      }),
    ).toBe(false);
    expect(
      Value.Check(feature010Schemas.SendContextMessageRequest, { body: 'synthetic message' }),
    ).toBe(true);
    expect(
      Value.Check(feature010Schemas.SendContextMessageRequest, {
        body: 'synthetic message',
        attachment: null,
      }),
    ).toBe(false);
  });

  it('projects private notes only to the care team and accepted referral fields only to target care', () => {
    const careTeamNote = {
      id: encounterId,
      encounterId,
      authorId,
      noteType: 'progress',
      visibility: 'private',
      signedAt: timestamp,
      body: 'synthetic private note',
    };
    expect(Value.Check(feature010Schemas.CareTeamNoteProjection, careTeamNote)).toBe(true);
    expect(
      Value.Check(feature010Schemas.SubjectNoteProjection, {
        ...careTeamNote,
        visibility: 'private',
      }),
    ).toBe(false);
    expect(
      Value.Check(feature010Schemas.SubjectNoteProjection, {
        ...careTeamNote,
        visibility: 'patient_visible',
      }),
    ).toBe(true);
    expect(
      Value.Check(feature010Schemas.SubjectEncounterProjection, {
        id: encounterId,
        patientId,
        facilityId,
        appointmentId: encounterId,
        encounterType: 'consultation',
        responsibleClinicianId: authorId,
        status: 'open',
        startedAt: timestamp,
        version: 1,
        notes: [careTeamNote],
      }),
    ).toBe(false);

    expect(
      Value.Check(feature010Schemas.AcceptedTargetReasonReferralProjection, {
        id: encounterId,
        status: 'accepted',
        version: 1,
        acceptedFieldCodes: ['reason_summary'],
        resultingAppointmentId: patientId,
        reasonSummary: 'synthetic referral summary',
      }),
    ).toBe(true);
    expect(
      Value.Check(feature010Schemas.AcceptedTargetReasonReferralProjection, {
        id: encounterId,
        status: 'accepted',
        version: 1,
        acceptedFieldCodes: ['reason_summary'],
        resultingAppointmentId: patientId,
        reasonSummary: 'synthetic referral summary',
        encounterType: 'consultation',
      }),
    ).toBe(false);
    expect(feature010Schemas.AcceptedTargetReasonReferralProjection.properties).not.toHaveProperty(
      'sourceEncounterId',
    );
    expect(feature010Schemas.AcceptedTargetReasonReferralProjection.properties).not.toHaveProperty(
      'patientId',
    );
  });

  it('uses the approved RFC 9457 problem shape and bounded safe validation details', () => {
    expect(feature010Schemas.Problem.required).toEqual([
      'type',
      'title',
      'status',
      'detail',
      'instance',
      'code',
      'request_id',
    ]);
    expect(
      Value.Check(feature010Schemas.Problem, {
        type: 'about:blank',
        title: 'Validation failed',
        status: 422,
        detail: 'A submitted field is invalid.',
        instance: '/requests/synthetic',
        code: 'validation-failed',
        request_id: encounterId,
        errors: [{ pointer: '/reasonSummary', code: 'required' }],
      }),
    ).toBe(true);
    expect(
      Value.Check(feature010Schemas.Problem, {
        type: 'about:blank',
        title: 'Invalid status',
        status: 399,
        detail: 'synthetic',
        instance: '/requests/synthetic',
        code: 'validation-failed',
        request_id: encounterId,
      }),
    ).toBe(false);
    expect(
      Value.Check(feature010Schemas.Problem, {
        type: 'about:blank',
        title: 'Invalid details',
        status: 422,
        detail: 'synthetic',
        instance: '/requests/synthetic',
        code: 'validation-failed',
        request_id: encounterId,
        errors: [{ pointer: '/body', code: 'invalid', rejectedValue: 'clinical text' }],
      }),
    ).toBe(false);
  });

  it('marks exactly seven mutations idempotent and three mutations version-guarded', () => {
    const idempotent = [
      'createEncounter',
      'updateEncounter',
      'signEncounterNote',
      'completeEncounter',
      'createReferral',
      'acceptReferral',
      'sendContextMessage',
    ] as const;
    const versionGuarded = ['updateEncounter', 'completeEncounter', 'acceptReferral'] as const;
    expect(Object.keys(feature010RequestSchemas)).toEqual(idempotent);
    const operationsWithHeader = (headerName: string) =>
      feature010Operations
        .filter(({ headerParameters }) => headerParameters.some(({ name }) => name === headerName))
        .map(({ operationId: id }) => id);

    expect(operationsWithHeader('Idempotency-Key')).toEqual(idempotent);
    expect(operationsWithHeader('If-Match')).toEqual(versionGuarded);
    for (const id of idempotent) {
      const key = operation(id).headerParameters.find(({ name }) => name === 'Idempotency-Key');
      expect(key?.required).toBe(true);
      expect(key?.schema).toMatchObject({ type: 'string', minLength: 16, maxLength: 128 });
    }
    for (const id of versionGuarded) {
      const version = operation(id).headerParameters.find(({ name }) => name === 'If-Match');
      expect(version?.required).toBe(true);
      expect(version?.schema).toMatchObject({ type: 'string', pattern: '^"[1-9][0-9]*"$' });
    }
  });

  it('keeps cursor pagination defaulted to 25 and capped at 100', () => {
    for (const queryName of ['listReferrals', 'listContextMessages'] as const) {
      const query = feature010QuerySchemas[queryName];
      expect(query.properties.limit).toMatchObject({
        type: 'integer',
        minimum: 1,
        maximum: 100,
        default: 25,
      });
      expect(query.properties.cursor).toMatchObject({ type: 'string', maxLength: 512 });
      expect(Value.Check(query, { limit: 100, cursor: 'synthetic-cursor' })).toBe(true);
      expect(Value.Check(query, { limit: 101 })).toBe(false);
    }
  });
});
