import Fastify from 'fastify';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { CareTeamNoteProjection, EncounterProjection } from '@shifaa/contracts';

import { installIdentityErrorHandler } from '../src/routes/identity-onboarding.js';
import { registerFeature010EncounterRoutes } from '../src/routes/feature-010-encounters.js';

const clinicianId = 'f0100000-0000-4000-8000-000000000001';
const patientId = 'f0100000-0000-4000-8000-000000000002';
const encounterId = 'f0100000-0000-4000-8800-000000000001';
const noteId = 'f0100000-0000-4000-8900-000000000001';
const signedAt = '2030-04-05T08:10:00.000Z';
const noteBody = 'Synthetic signed encounter note.';
const note: CareTeamNoteProjection = {
  id: noteId,
  encounterId,
  authorId: clinicianId,
  noteType: 'assessment',
  visibility: 'private' as const,
  signedAt,
  body: noteBody,
};
const encounter: EncounterProjection = {
  id: encounterId,
  patientId,
  facilityId: 'f0100000-0000-4000-8200-000000000001',
  appointmentId: 'f0100000-0000-4000-8500-000000000001',
  encounterType: 'consultation',
  responsibleClinicianId: clinicianId,
  status: 'open' as const,
  startedAt: '2030-04-05T08:00:00.000Z',
  version: 1,
  notes: [note],
  participants: [{ personId: clinicianId, roleCode: 'responsible_clinician', startedAt: signedAt }],
};

function headers(personId = clinicianId, overrides: Record<string, string> = {}) {
  return {
    authorization: `Bearer synthetic-person:${personId}`,
    'idempotency-key': 'f010-c12-note-key-0001',
    'x-aal': '2',
    'x-purpose': 'appointment.scheduling',
    ...overrides,
  };
}

function serviceStub() {
  return {
    createEncounter: vi.fn(),
    getEncounter: vi.fn(async () => encounter),
    updateEncounter: vi.fn(),
    signEncounterNote: vi.fn(async () => note),
    completeEncounter: vi.fn(async () => {
      throw new Error('Unexpected completion request in the C12 integration fixture.');
    }),
  };
}

describe('Feature 010 signEncounterNote and note projection', () => {
  const apps: ReturnType<typeof Fastify>[] = [];

  afterEach(async () => Promise.all(apps.splice(0).map((app) => app.close())));

  it('registers the approved POST note-signing route and returns its signed note', async () => {
    const service = serviceStub();
    const app = Fastify({ logger: false });
    apps.push(app);
    await registerFeature010EncounterRoutes(app, {
      service,
      syntheticMode: true,
    });
    installIdentityErrorHandler(app);

    const result = await app.inject({
      method: 'POST',
      url: `/v1/encounters/${encounterId}/notes`,
      headers: headers(),
      payload: { noteType: 'assessment', body: noteBody, visibility: 'private' },
    });

    expect(result.statusCode).toBe(201);
    expect(result.json()).toEqual(note);
    expect(service.signEncounterNote).toHaveBeenCalledWith(
      expect.objectContaining({ idempotencyKey: 'f010-c12-note-key-0001' }),
      encounterId,
      { noteType: 'assessment', body: noteBody, visibility: 'private' },
    );
  });

  it('returns the current authorized note-body projection for fields=notes', async () => {
    const service = serviceStub();
    const app = Fastify({ logger: false });
    apps.push(app);
    await registerFeature010EncounterRoutes(app, {
      service,
      syntheticMode: true,
    });
    installIdentityErrorHandler(app);

    const result = await app.inject({
      method: 'GET',
      url: `/v1/encounters/${encounterId}?fields=notes`,
      headers: headers(),
    });

    expect(result.statusCode).toBe(200);
    expect(result.json()).toMatchObject({ id: encounterId, notes: [note] });
    expect(result.body).toContain(noteBody);
    expect(service.getEncounter).toHaveBeenCalledWith(expect.any(Object), encounterId, ['notes']);
  });

  it('keeps private note bodies out of subject projections even when notes are requested', async () => {
    const service = serviceStub();
    service.getEncounter.mockResolvedValue({
      ...encounter,
      notes: [{ ...note, visibility: 'patient_visible', body: 'Released synthetic note.' }],
    });
    const app = Fastify({ logger: false });
    apps.push(app);
    await registerFeature010EncounterRoutes(app, {
      service,
      syntheticMode: true,
    });
    installIdentityErrorHandler(app);

    const result = await app.inject({
      method: 'GET',
      url: `/v1/encounters/${encounterId}?fields=notes`,
      headers: headers(patientId),
    });

    expect(result.statusCode).toBe(200);
    expect(result.body).toContain('Released synthetic note.');
    expect(result.body).not.toContain(noteBody);
    expect(result.body).not.toContain('private');
  });

  it('rejects blank note bodies and missing AAL2 or purpose before the service call', async () => {
    const service = serviceStub();
    const app = Fastify({ logger: false });
    apps.push(app);
    await registerFeature010EncounterRoutes(app, { service, syntheticMode: true });
    installIdentityErrorHandler(app);

    const blankBody = await app.inject({
      method: 'POST',
      url: `/v1/encounters/${encounterId}/notes`,
      headers: headers(),
      payload: { noteType: 'assessment', body: '   ', visibility: 'private' },
    });
    const lowAal = await app.inject({
      method: 'POST',
      url: `/v1/encounters/${encounterId}/notes`,
      headers: headers(clinicianId, { 'x-aal': '1' }),
      payload: { noteType: 'assessment', body: noteBody, visibility: 'private' },
    });
    const noPurpose = await app.inject({
      method: 'POST',
      url: `/v1/encounters/${encounterId}/notes`,
      headers: headers(clinicianId, { 'x-purpose': '' }),
      payload: { noteType: 'assessment', body: noteBody, visibility: 'private' },
    });

    expect(blankBody.statusCode).toBe(422);
    expect(lowAal.statusCode).toBe(403);
    expect(lowAal.json().code).toBe('mfa-required');
    expect(noPurpose.statusCode).toBe(403);
    expect(noPurpose.json().code).toBe('purpose-required');
    expect(service.signEncounterNote).not.toHaveBeenCalled();
  });
});
