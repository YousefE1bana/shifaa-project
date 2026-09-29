import Fastify from 'fastify';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { EncounterProjection } from '@shifaa/contracts';

import { installIdentityErrorHandler } from '../src/routes/identity-onboarding.js';
import {
  registerFeature010EncounterRoutes,
  registeredFeature010EncounterOperationIds,
} from '../src/routes/feature-010-encounters.js';

const clinicianId = 'f0100000-0000-4000-8000-000000000001';
const patientId = 'f0100000-0000-4000-8000-000000000002';
const encounterId = 'f0100000-0000-4000-8800-000000000001';
const participantId = 'f0100000-0000-4000-8000-000000000003';
const conditionId = 'f0100000-0000-4000-8900-000000000001';
const startedAt = '2030-04-05T08:00:00.000Z';

const updatedEncounter: EncounterProjection = {
  id: encounterId,
  patientId,
  facilityId: 'f0100000-0000-4000-8200-000000000001',
  appointmentId: 'f0100000-0000-4000-8500-000000000001',
  encounterType: 'consultation',
  responsibleClinicianId: clinicianId,
  status: 'open',
  startedAt,
  version: 2,
  conditionIds: [conditionId],
  observationIds: [],
  orderIds: [],
  participants: [
    { personId: clinicianId, roleCode: 'responsible_clinician', startedAt },
    {
      personId: participantId,
      roleCode: 'consultant',
      startedAt,
      endedAt: '2030-04-05T08:10:00.000Z',
    },
  ],
};

const updateRequest = {
  conditionIds: [conditionId],
  participantIntervalsEnd: [{ personId: participantId, roleCode: 'consultant', startedAt }],
};

function requestHeaders() {
  return {
    authorization: `Bearer synthetic-person:${clinicianId}`,
    'idempotency-key': 'f010-c11-update-key-001',
    'if-match': '"1"',
    'x-aal': '2',
    'x-purpose': 'appointment.scheduling',
  };
}

describe('Feature 010 updateEncounter HTTP contract', () => {
  const apps: ReturnType<typeof Fastify>[] = [];

  afterEach(async () => Promise.all(apps.splice(0).map((app) => app.close())));

  it('registers the approved PATCH operation and returns the updated canonical projection', async () => {
    const service = {
      createEncounter: vi.fn(),
      getEncounter: vi.fn(),
      updateEncounter: vi.fn(
        async (context: { expectedVersion: number; requestHash: string }) => updatedEncounter,
      ),
    };
    const app = Fastify({ logger: false });
    apps.push(app);
    await registerFeature010EncounterRoutes(app, { service, syntheticMode: true });
    installIdentityErrorHandler(app);

    const result = await app.inject({
      method: 'PATCH',
      url: `/v1/encounters/${encounterId}`,
      headers: requestHeaders(),
      payload: updateRequest,
    });

    expect(registeredFeature010EncounterOperationIds).toContain('updateEncounter');
    expect(app.hasRoute({ method: 'PATCH', url: '/v1/encounters/:encounterId' })).toBe(true);
    expect(result.statusCode).toBe(200);
    expect(result.json()).toEqual(updatedEncounter);
    expect(result.headers['cache-control']).toBe('private, no-store');
    expect(service.updateEncounter).toHaveBeenCalledWith(
      expect.objectContaining({
        actor: expect.objectContaining({ personId: clinicianId, aal: 2 }),
        idempotencyKey: 'f010-c11-update-key-001',
        expectedVersion: 1,
      }),
      encounterId,
      updateRequest,
    );
  });

  it('requires AAL2 and current purpose before invoking the mutation service', async () => {
    const service = {
      createEncounter: vi.fn(),
      getEncounter: vi.fn(),
      updateEncounter: vi.fn(async () => updatedEncounter),
    };
    const app = Fastify({ logger: false });
    apps.push(app);
    await registerFeature010EncounterRoutes(app, { service, syntheticMode: true });
    installIdentityErrorHandler(app);

    const noAal = await app.inject({
      method: 'PATCH',
      url: `/v1/encounters/${encounterId}`,
      headers: { ...requestHeaders(), 'x-aal': '1' },
      payload: updateRequest,
    });
    const noPurpose = await app.inject({
      method: 'PATCH',
      url: `/v1/encounters/${encounterId}`,
      headers: { ...requestHeaders(), 'x-purpose': '' },
      payload: updateRequest,
    });

    expect(noAal.statusCode).toBe(403);
    expect(noPurpose.statusCode).toBe(403);
    expect(service.updateEncounter).not.toHaveBeenCalled();
  });

  it('requires If-Match and keeps the canonical body hash stable across stale-version retries', async () => {
    const service = {
      createEncounter: vi.fn(),
      getEncounter: vi.fn(),
      updateEncounter: vi.fn(
        async (context: { expectedVersion: number; requestHash: string }) => updatedEncounter,
      ),
    };
    const app = Fastify({ logger: false });
    apps.push(app);
    await registerFeature010EncounterRoutes(app, { service, syntheticMode: true });
    installIdentityErrorHandler(app);

    const missingHeaders: Record<string, string> = { ...requestHeaders() };
    delete missingHeaders['if-match'];
    const missingVersion = await app.inject({
      method: 'PATCH',
      url: `/v1/encounters/${encounterId}`,
      headers: missingHeaders,
      payload: updateRequest,
    });
    const first = await app.inject({
      method: 'PATCH',
      url: `/v1/encounters/${encounterId}`,
      headers: requestHeaders(),
      payload: updateRequest,
    });
    const replay = await app.inject({
      method: 'PATCH',
      url: `/v1/encounters/${encounterId}`,
      headers: { ...requestHeaders(), 'if-match': '"2"' },
      payload: updateRequest,
    });

    expect(missingVersion.statusCode).toBe(422);
    expect(first.statusCode).toBe(200);
    expect(replay.statusCode).toBe(200);
    expect(service.updateEncounter).toHaveBeenCalledTimes(2);
    const firstContext = service.updateEncounter.mock.calls[0]?.[0];
    const replayContext = service.updateEncounter.mock.calls[1]?.[0];
    expect(firstContext?.expectedVersion).toBe(1);
    expect(replayContext?.expectedVersion).toBe(2);
    expect(firstContext?.requestHash).toBe(replayContext?.requestHash);
  });

  it('strips C10 note metadata from the update response until the note body API exists', async () => {
    const service = {
      createEncounter: vi.fn(),
      getEncounter: vi.fn(),
      updateEncounter: vi.fn(async () => ({
        ...updatedEncounter,
        notes: [
          {
            id: 'f0100000-0000-4000-8900-000000000001',
            encounterId,
            authorId: clinicianId,
            noteType: 'assessment',
            visibility: 'private' as const,
            signedAt: startedAt,
            body: 'synthetic note body must not leave this response',
          },
        ],
      })),
    };
    const app = Fastify({ logger: false });
    apps.push(app);
    await registerFeature010EncounterRoutes(app, { service, syntheticMode: true });
    installIdentityErrorHandler(app);

    const result = await app.inject({
      method: 'PATCH',
      url: `/v1/encounters/${encounterId}`,
      headers: requestHeaders(),
      payload: updateRequest,
    });

    expect(result.statusCode).toBe(200);
    expect(result.json()).not.toHaveProperty('notes');
  });

  it('maps stale versions and closed encounters to their approved conflict codes', async () => {
    const staleVersion = Object.assign(new Error('encounter version changed'), { code: '40001' });
    const closedEncounter = Object.assign(new Error('encounter is no longer open'), {
      code: '55000',
    });
    const updateEncounter = vi
      .fn(async (context: { expectedVersion: number }) => updatedEncounter)
      .mockRejectedValueOnce(staleVersion)
      .mockRejectedValueOnce(closedEncounter);
    const service = {
      createEncounter: vi.fn(),
      getEncounter: vi.fn(),
      updateEncounter,
    };
    const app = Fastify({ logger: false });
    apps.push(app);
    await registerFeature010EncounterRoutes(app, { service, syntheticMode: true });
    installIdentityErrorHandler(app);

    const stale = await app.inject({
      method: 'PATCH',
      url: `/v1/encounters/${encounterId}`,
      headers: requestHeaders(),
      payload: updateRequest,
    });
    const closed = await app.inject({
      method: 'PATCH',
      url: `/v1/encounters/${encounterId}`,
      headers: requestHeaders(),
      payload: updateRequest,
    });

    expect(stale.statusCode).toBe(409);
    expect(stale.json().code).toBe('version-conflict');
    expect(closed.statusCode).toBe(409);
    expect(closed.json().code).toBe('state-transition-invalid');
  });

  it('rejects an unapproved participant-add property before calling the service', async () => {
    const service = {
      createEncounter: vi.fn(),
      getEncounter: vi.fn(),
      updateEncounter: vi.fn(async () => updatedEncounter),
    };
    const app = Fastify({ logger: false });
    apps.push(app);
    await registerFeature010EncounterRoutes(app, { service, syntheticMode: true });
    installIdentityErrorHandler(app);

    const result = await app.inject({
      method: 'PATCH',
      url: `/v1/encounters/${encounterId}`,
      headers: requestHeaders(),
      payload: { participantIds: [participantId] },
    });

    expect(result.statusCode).toBe(422);
    expect(service.updateEncounter).not.toHaveBeenCalled();
  });
});
