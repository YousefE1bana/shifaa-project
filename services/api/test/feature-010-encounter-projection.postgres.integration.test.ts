import postgres from 'postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Value } from '@sinclair/typebox/value';
import {
  EncounterProjectionSchema,
  EncounterStartResultSchema,
  EncounterCompleteResultSchema,
  ParticipantProjectionSchema,
} from '@shifaa/contracts';

import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';

const database = process.env['SHIFAA_F010_C28_DATABASE'];
const patient = 'f0101000-0000-4000-8000-000000000002';
const clinician = 'f0101000-0000-4000-8000-000000000001';
const foreign = 'f0101000-0000-4000-8000-000000000006';
const openEncounter = 'f0101000-0000-4000-8800-000000000002';
const missingEncounter = 'f0101000-0000-4000-8800-000000000099';
let harness: Awaited<ReturnType<typeof buildApp>>;
let sql: ReturnType<typeof postgres>;

function headers(person: string, key = 'f010-c28-projection-read-01') {
  return {
    authorization: `Bearer synthetic-person:${person}`,
    'x-aal': '2',
    'x-purpose': 'appointment.scheduling',
    'accept-language': 'en-EG',
    'idempotency-key': key,
  };
}

async function read(person: string, encounter = openEncounter, fields = 'participants') {
  return harness.app.inject({
    method: 'GET',
    url: `/v1/encounters/${encounter}?fields=${fields}`,
    headers: headers(person),
  });
}

describe.skipIf(!database)('C28 prerequisite encounter contract against real PostgreSQL', () => {
  beforeAll(async () => {
    if (!database) throw new Error('The isolated C28 PostgreSQL database is required.');
    const url = `postgresql://shifaa_api:synthetic_api_only@${process.env['SHIFAA_PG_HOST'] ?? '127.0.0.1'}:${process.env['SHIFAA_PG_PORT'] ?? '5432'}/${database}`;
    sql = postgres(url, { max: 1, onnotice: () => undefined });
    harness = await buildApp({
      config: {
        ...loadConfig({ NODE_ENV: 'test' }),
        repositoryAdapter: 'postgres',
        databaseUrl: url,
        identityOnboardingEnabled: true,
        syntheticMode: true,
      },
    });
  });
  afterAll(async () => {
    await harness?.app.close();
    await sql?.end();
  });

  it('reads a valid authorized OPEN SQL projection through the approved API schema', async () => {
    const raw = await sql.begin(async (transaction) => {
      await transaction`select set_config('shifaa.person_id',${clinician},true),
        set_config('shifaa.actor_role','CLN',true), set_config('shifaa.action','getEncounter',true),
        set_config('shifaa.aal','2',true), set_config('shifaa.purposes','appointment.scheduling',true),
        set_config('shifaa.environment','ci',true)`;
      const [row] = await transaction<{ projection: Record<string, unknown> }[]>`
        select clinical.feature_010_get_encounter_projection_v1(${openEncounter}::uuid) as projection`;
      return row!.projection;
    });
    // These assertions establish real live authorization/valid fixture before the RED boundary.
    expect(raw).toMatchObject({ id: openEncounter, status: 'open', endedAt: null });
    const participants = raw['participants'] as Record<string, unknown>[];
    expect(participants).toHaveLength(2);
    const active = participants.find((participant) => participant['personId'] === clinician)!;
    const ended = participants.find((participant) => participant['personId'] !== clinician)!;
    expect(active).not.toHaveProperty('endedAt');
    expect(ended['endedAt']).toEqual(expect.any(String));
    expect(
      participants.every((participant) => Value.Check(ParticipantProjectionSchema, participant)),
    ).toBe(true);
    // The adapter deliberately replaces raw SQL note metadata via the approved note boundary.
    const { notes: _metadata, ...notesFree } = raw;
    expect(Value.Check(EncounterProjectionSchema, notesFree)).toBe(false);
    const { endedAt: _null, ...contractShape } = notesFree;
    expect(Value.Check(EncounterProjectionSchema, contractShape)).toBe(true);
    for (const person of [patient, clinician]) {
      const response = await read(person);
      expect(response.statusCode, 'Authorized OPEN encounter must not return HTTP 500').toBe(200);
      expect(response.json()).not.toHaveProperty('endedAt');
      expect(Value.Check(EncounterProjectionSchema, response.json())).toBe(true);
      expect(response.json()).not.toHaveProperty('notes');
      expect(response.json().participants).toEqual(participants);
    }
  });

  it('preserves create/update/completion, note privacy, field selection and hidden-resource behavior', async () => {
    const created = await harness.app.inject({
      method: 'POST',
      url: '/v1/encounters',
      headers: headers(clinician, 'f010-c28-create-encounter-01'),
      payload: {
        appointmentId: 'f0101000-0000-4000-8500-000000000001',
        patientId: patient,
        encounterType: 'consultation',
      },
    });
    expect(created.statusCode).toBe(201);
    expect(Value.Check(EncounterStartResultSchema, created.json())).toBe(true);
    const encounter = created.json().encounter.id as string;
    expect(created.json().encounter).not.toHaveProperty('endedAt');
    const privateBody = 'C28 synthetic private note projection canary.';
    const visibleBody = 'C28 synthetic released note projection canary.';
    let privateId = '';
    for (const [visibility, body] of [
      ['private', privateBody],
      ['patient_visible', visibleBody],
    ] as const) {
      const signed = await harness.app.inject({
        method: 'POST',
        url: `/v1/encounters/${encounter}/notes`,
        headers: headers(clinician, `f010-c28-sign-${visibility}-01`),
        payload: { noteType: 'assessment', visibility, body },
      });
      expect(signed.statusCode).toBe(201);
      if (visibility === 'private') privateId = signed.json().id as string;
    }
    const patientNotes = await read(patient, encounter, 'notes');
    const clinicianNotes = await read(clinician, encounter, 'notes');
    expect(patientNotes.statusCode).toBe(200);
    expect(clinicianNotes.statusCode).toBe(200);
    expect(Value.Check(EncounterProjectionSchema, patientNotes.json())).toBe(true);
    expect(Value.Check(EncounterProjectionSchema, clinicianNotes.json())).toBe(true);
    expect(patientNotes.json().notes).toHaveLength(1);
    expect(patientNotes.body).toContain(visibleBody);
    expect(patientNotes.body).not.toContain(privateBody);
    expect(patientNotes.body).not.toContain(privateId);
    expect(clinicianNotes.json().notes).toHaveLength(2);
    expect(clinicianNotes.body).toContain(privateBody);
    for (const property of ['participants', 'conditionIds', 'observationIds', 'orderIds']) {
      expect(patientNotes.json()).not.toHaveProperty(property);
    }
    expect((await read(patient, encounter, 'notes,private')).statusCode).toBe(422);
    const filtered = await read(patient, encounter, 'participants');
    expect(filtered.json()).not.toHaveProperty('notes');
    expect(filtered.body).not.toContain(privateId);

    const updated = await harness.app.inject({
      method: 'PATCH',
      url: `/v1/encounters/${encounter}`,
      headers: {
        ...headers(clinician, 'f010-c28-update-encounter-01'),
        'if-match': `"${clinicianNotes.json().version}"`,
      },
      payload: { observationIds: [] },
    });
    expect(updated.statusCode).toBe(200);
    expect(updated.json()).not.toHaveProperty('endedAt');
    expect(Value.Check(EncounterProjectionSchema, updated.json())).toBe(true);
    const completed = await harness.app.inject({
      method: 'POST',
      url: `/v1/encounters/${encounter}/complete`,
      headers: {
        ...headers(clinician, 'f010-c28-complete-encounter-01'),
        'if-match': `"${updated.json().version}"`,
      },
      payload: { summary: 'Synthetic C28 completion.', structuralConfirmation: true },
    });
    expect(completed.statusCode).toBe(200);
    expect(Value.Check(EncounterCompleteResultSchema, completed.json())).toBe(true);
    expect(completed.json().encounter.status).toBe('completed');
    expect(completed.json().encounter.endedAt).toEqual(expect.any(String));
    expect(Number.isFinite(Date.parse(completed.json().encounter.endedAt as string))).toBe(true);
    const history = await read(patient, encounter, 'notes,participants');
    expect(history.statusCode).toBe(200);
    expect(Value.Check(EncounterProjectionSchema, history.json())).toBe(true);
    expect(history.json().endedAt).toEqual(completed.json().encounter.endedAt);
    expect(history.body).not.toContain(privateBody);
    expect(
      history
        .json()
        .participants.every((participant: unknown) =>
          Value.Check(ParticipantProjectionSchema, participant),
        ),
    ).toBe(true);
    // Completion closes encounter/chat authority without rewriting participant
    // interval history. This interval remains represented by omission.
    expect(history.json().participants[0]).not.toHaveProperty('endedAt');

    // C26 protects existence across both open and completed state/version branches.
    for (const id of [openEncounter, encounter, missingEncounter]) {
      const hidden = await read(foreign, id, 'notes,participants');
      expect(hidden.statusCode).toBe(404);
      expect(hidden.json().code).toBe('not-found');
      expect(hidden.body).not.toContain(privateBody);
      expect(hidden.body).not.toContain(visibleBody);
      const denied = await harness.app.inject({
        method: 'PATCH',
        url: `/v1/encounters/${id}`,
        headers: { ...headers(foreign, `f010-c28-foreign-${id.slice(-4)}`), 'if-match': '"999"' },
        payload: { observationIds: [] },
      });
      expect(denied.statusCode).toBe(404);
      expect(denied.json().code).toBe('not-found');
    }
  }, 30_000);
});
