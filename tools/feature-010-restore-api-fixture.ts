import assert from 'node:assert/strict';
import { Value } from '@sinclair/typebox/value';
import {
  CareTeamNoteProjectionSchema,
  EncounterProjectionSchema,
  EncounterStartResultSchema,
  Feature010UuidSchema,
  MessagePageSchema,
  MessageProjectionSchema,
} from '@shifaa/contracts';

import { buildApp } from '../services/api/src/app.js';
import { loadConfig } from '../services/api/src/config.js';

const patient = 'f0101000-0000-4000-8000-000000000002';
const clinician = 'f0101000-0000-4000-8000-000000000001';
const foreign = 'f0101000-0000-4000-8000-000000000006';
const appointment = 'f0101000-0000-4000-8500-000000000001';
const bodies = {
  private: 'C28 synthetic API restore private note.',
  visible: 'C28 synthetic API restore released note version one.',
  correction: 'C28 synthetic API restore released note correction.',
  message: 'C28 synthetic API restore encrypted contextual message.',
};
type Fixture = {
  encounterId: string;
  privateNoteId: string;
  visibleNoteId: string;
  correctionId: string;
  messageId: string;
};
let stage = 'initialization';
function headers(person: string, key: string) {
  return {
    authorization: `Bearer synthetic-person:${person}`,
    'x-aal': '2',
    'x-purpose': 'appointment.scheduling',
    'accept-language': 'en-EG',
    'idempotency-key': key,
  };
}

async function run(mode: string) {
  assert.ok(mode === 'seed' || mode === 'verify', 'Unknown restore API fixture operation.');
  const database = process.env['SHIFAA_F010_RESTORE_DATABASE'];
  assert.match(database ?? '', /^f010_c28_restore_[a-f0-9]{16}_(src|dst)$/);
  const port = process.env['SHIFAA_PG_PORT'];
  assert.match(port ?? '', /^\d+$/);
  const harness = await buildApp({
    config: {
      ...loadConfig({ NODE_ENV: 'test' }),
      repositoryAdapter: 'postgres',
      databaseUrl: `postgresql://shifaa_api:synthetic_api_only@127.0.0.1:${port}/${database}`,
      identityOnboardingEnabled: true,
      syntheticMode: true,
    },
  });
  try {
    if (mode === 'seed') {
      const created = await harness.app.inject({
        method: 'POST',
        url: '/v1/encounters',
        headers: headers(clinician, 'c28-restore-api-encounter'),
        payload: { appointmentId: appointment, patientId: patient, encounterType: 'consultation' },
      });
      assert.equal(created.statusCode, 201, 'Restore API encounter seed failed.');
      assert.ok(Value.Check(EncounterStartResultSchema, created.json()));
      const encounterId = created.json().encounter.id as string;
      const sign = async (
        key: string,
        body: string,
        visibility: 'private' | 'patient_visible',
        supersedesId?: string,
      ) => {
        const result = await harness.app.inject({
          method: 'POST',
          url: `/v1/encounters/${encounterId}/notes`,
          headers: headers(clinician, key),
          payload: {
            noteType: 'assessment',
            body,
            visibility,
            ...(supersedesId ? { supersedesId } : {}),
          },
        });
        assert.equal(result.statusCode, 201, 'Restore API signed note seed failed.');
        assert.ok(Value.Check(CareTeamNoteProjectionSchema, result.json()));
        return result.json().id as string;
      };
      const privateNoteId = await sign('c28-restore-api-private', bodies.private, 'private');
      const visibleNoteId = await sign(
        'c28-restore-api-visible',
        bodies.visible,
        'patient_visible',
      );
      const correctionId = await sign(
        'c28-restore-api-correction',
        bodies.correction,
        'patient_visible',
        visibleNoteId,
      );
      const sent = await harness.app.inject({
        method: 'POST',
        url: `/v1/contexts/appointment/${appointment}/messages`,
        headers: headers(patient, 'c28-restore-api-message'),
        payload: { body: bodies.message },
      });
      assert.equal(sent.statusCode, 201, 'Restore API encrypted message seed failed.');
      assert.ok(Value.Check(MessageProjectionSchema, sent.json()));
      return {
        encounterId,
        privateNoteId,
        visibleNoteId,
        correctionId,
        messageId: sent.json().id,
      } satisfies Fixture;
    }
    const fixture = JSON.parse(process.env['SHIFAA_F010_RESTORE_API_FIXTURE'] ?? 'null') as Fixture;
    stage = 'fixture-validation';
    assert.deepEqual(
      Object.keys(fixture).sort(),
      ['encounterId', 'privateNoteId', 'visibleNoteId', 'correctionId', 'messageId'].sort(),
    );
    assert.ok(Object.values(fixture).every((id) => Value.Check(Feature010UuidSchema, id)));
    for (const person of [patient, clinician]) {
      stage = person === patient ? 'patient-notes' : 'clinician-notes';
      const read = await harness.app.inject({
        method: 'GET',
        url: `/v1/encounters/${fixture.encounterId}?fields=notes`,
        headers: headers(person, 'c28-restored-note-read'),
      });
      assert.equal(read.statusCode, 200, 'Restored authorized encounter read failed.');
      assert.ok(Value.Check(EncounterProjectionSchema, read.json()));
      assert.ok(!Object.hasOwn(read.json(), 'endedAt'));
      const notes = read.json().notes as { id: string; body: string; supersedesId?: string }[];
      const expected =
        person === patient
          ? [fixture.visibleNoteId, fixture.correctionId]
          : [fixture.privateNoteId, fixture.visibleNoteId, fixture.correctionId];
      assert.deepEqual(notes.map((note) => note.id).sort(), expected.sort());
      assert.equal(notes.find((note) => note.id === fixture.visibleNoteId)?.body, bodies.visible);
      assert.equal(notes.find((note) => note.id === fixture.correctionId)?.body, bodies.correction);
      if (person === clinician) {
        assert.equal(
          notes.find((note) => note.id === fixture.correctionId)?.supersedesId,
          fixture.visibleNoteId,
        );
        assert.equal(notes.find((note) => note.id === fixture.privateNoteId)?.body, bodies.private);
      } else {
        assert.ok(notes.every((note) => !Object.hasOwn(note, 'supersedesId')));
        assert.ok(
          !read.body.includes(bodies.private) && !read.body.includes(fixture.privateNoteId),
        );
      }
      const messages = await harness.app.inject({
        method: 'GET',
        url: `/v1/contexts/appointment/${appointment}/messages`,
        headers: headers(person, 'c28-restored-message-read'),
      });
      stage = person === patient ? 'patient-messages' : 'clinician-messages';
      assert.equal(messages.statusCode, 200, 'Restored authorized encrypted history read failed.');
      assert.ok(Value.Check(MessagePageSchema, messages.json()));
      assert.equal(messages.json().data.length, 1);
      assert.equal(messages.json().data[0].id, fixture.messageId);
      assert.equal(messages.json().data[0].body, bodies.message);
    }
    const hidden = await harness.app.inject({
      method: 'GET',
      url: `/v1/encounters/${fixture.encounterId}?fields=notes`,
      headers: headers(foreign, 'c28-restored-foreign-read'),
    });
    stage = 'foreign-encounter';
    assert.equal(hidden.statusCode, 404);
    assert.ok(!hidden.body.includes(bodies.private) && !hidden.body.includes(bodies.visible));
    const denied = await harness.app.inject({
      method: 'GET',
      url: `/v1/contexts/appointment/${appointment}/messages`,
      headers: headers(foreign, 'c28-restored-foreign-chat'),
    });
    stage = 'foreign-messages';
    assert.equal(denied.statusCode, 403);
    assert.ok(!denied.body.includes(bodies.message));
    return {
      authorizedDecryption: 'PASS',
      signedCorrectionLink: 'PASS',
      privateNoteFiltering: 'PASS',
      foreignDenied: 'PASS',
    };
  } finally {
    await harness.app.close();
  }
}

run(process.argv[2] ?? '')
  .then((result) => process.stdout.write(`${JSON.stringify(result)}\n`))
  .catch(() => {
    // Never serialize an assertion's clinical actual/expected values or connection configuration.
    process.stderr.write(
      `C28 restore API fixture failed at ${stage}; no clinical diagnostics emitted.\n`,
    );
    process.exitCode = 1;
  });
