import Fastify from 'fastify';
import { Value } from '@sinclair/typebox/value';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  EncounterCompleteResultSchema,
  type CompleteEncounterRequest,
  type EncounterCompleteResult,
  type Feature010Uuid,
} from '@shifaa/contracts';
import type { Feature010EncounterUpdateContext } from '../src/modules/feature-010/encounters.js';

import { installIdentityErrorHandler } from '../src/routes/identity-onboarding.js';
import {
  registerFeature010EncounterRoutes,
  registeredFeature010EncounterOperationIds,
} from '../src/routes/feature-010-encounters.js';

const clinicianId = 'f0100000-0000-4000-8000-000000000001';
const patientId = 'f0100000-0000-4000-8000-000000000002';
const facilityId = 'f0100000-0000-4000-8200-000000000001';
const appointmentId = 'f0100000-0000-4000-8500-000000000001';
const encounterId = 'f0100000-0000-4000-8800-000000000001';
const queueEntryId = 'f0100000-0000-4000-8700-000000000001';
const startedAt = '2030-04-05T07:00:00.000Z';
const completedAt = '2030-04-05T07:30:00.000Z';
const requestBody: CompleteEncounterRequest = {
  summary: 'Consultation completed with no additional references.',
  structuralConfirmation: true,
};

const completedResponse: EncounterCompleteResult = {
  encounter: {
    id: encounterId,
    patientId,
    facilityId,
    appointmentId,
    encounterType: 'consultation',
    responsibleClinicianId: clinicianId,
    status: 'completed',
    startedAt,
    endedAt: completedAt,
    completionSummary: requestBody.summary,
    version: 2,
    conditionIds: [],
    observationIds: [],
    orderIds: [],
    participants: [{ personId: clinicianId, roleCode: 'responsible_clinician', startedAt }],
  },
  appointmentId,
  appointmentVersion: 4,
  appointmentStatus: 'completed',
  queueStatus: 'completed',
  queueEntryId,
  queueVersion: 3,
  completedAt,
};

function requestHeaders(overrides: Record<string, string> = {}) {
  return {
    authorization: `Bearer synthetic-person:${clinicianId}`,
    'idempotency-key': 'f010-c13-complete-key-001',
    'if-match': '"1"',
    'x-aal': '2',
    'x-purpose': 'appointment.scheduling',
    ...overrides,
  };
}

function serviceStub() {
  return {
    createEncounter: vi.fn(),
    getEncounter: vi.fn(),
    updateEncounter: vi.fn(),
    signEncounterNote: vi.fn(),
    completeEncounter: vi.fn(
      async (
        _context: Feature010EncounterUpdateContext,
        _encounterId: Feature010Uuid,
        _input: CompleteEncounterRequest,
      ) => completedResponse,
    ),
  };
}

describe('Feature 010 completeEncounter HTTP contract', () => {
  const apps: ReturnType<typeof Fastify>[] = [];

  afterEach(async () => Promise.all(apps.splice(0).map((app) => app.close())));

  it('registers the approved POST operation and returns its versioned canonical result', async () => {
    const service = serviceStub();
    const app = Fastify({ logger: false });
    apps.push(app);
    await registerFeature010EncounterRoutes(app, { service, syntheticMode: true });
    installIdentityErrorHandler(app);

    const result = await app.inject({
      method: 'POST',
      url: `/v1/encounters/${encounterId}/complete`,
      headers: requestHeaders(),
      payload: requestBody,
    });

    expect(result.statusCode).toBe(200);
    expect(registeredFeature010EncounterOperationIds).toContain('completeEncounter');
    expect(app.hasRoute({ method: 'POST', url: '/v1/encounters/:encounterId/complete' })).toBe(
      true,
    );
    expect(result.json()).toEqual(completedResponse);
    expect(Value.Check(EncounterCompleteResultSchema, result.json())).toBe(true);
    expect(result.headers['cache-control']).toBe('private, no-store');
    expect(service.completeEncounter).toHaveBeenCalledWith(
      expect.objectContaining({
        actor: expect.objectContaining({ personId: clinicianId, aal: 2 }),
        idempotencyKey: 'f010-c13-complete-key-001',
        expectedVersion: 1,
      }),
      encounterId,
      requestBody,
    );
  });

  it.each([
    ['blank summary', { ...requestBody, summary: '   ' }, {}, 422],
    ['false structural confirmation', { ...requestBody, structuralConfirmation: false }, {}, 422],
    ['missing If-Match', requestBody, { 'if-match': '' }, 422],
    ['AAL1 actor', requestBody, { 'x-aal': '1' }, 403],
    ['missing purpose', requestBody, { 'x-purpose': '' }, 403],
  ] as const)(
    'rejects %s before invoking the completion service',
    async (_scenario, body, headerOverrides, expectedStatus) => {
      const service = serviceStub();
      const app = Fastify({ logger: false });
      apps.push(app);
      await registerFeature010EncounterRoutes(app, { service, syntheticMode: true });
      installIdentityErrorHandler(app);

      const result = await app.inject({
        method: 'POST',
        url: `/v1/encounters/${encounterId}/complete`,
        headers: requestHeaders(headerOverrides),
        payload: body,
      });

      expect(result.statusCode).toBe(expectedStatus);
      expect(service.completeEncounter).not.toHaveBeenCalled();
    },
  );

  it('keeps the body hash stable when an exact retry carries a newer If-Match value', async () => {
    const service = serviceStub();
    const app = Fastify({ logger: false });
    apps.push(app);
    await registerFeature010EncounterRoutes(app, { service, syntheticMode: true });
    installIdentityErrorHandler(app);

    const first = await app.inject({
      method: 'POST',
      url: `/v1/encounters/${encounterId}/complete`,
      headers: requestHeaders(),
      payload: requestBody,
    });
    const replay = await app.inject({
      method: 'POST',
      url: `/v1/encounters/${encounterId}/complete`,
      headers: requestHeaders({ 'if-match': '"2"' }),
      payload: requestBody,
    });

    expect(first.statusCode).toBe(200);
    expect(replay.statusCode).toBe(200);
    expect(replay.json()).toEqual(first.json());
    const firstCall = service.completeEncounter.mock.calls[0]?.[0];
    const replayCall = service.completeEncounter.mock.calls[1]?.[0];
    expect(firstCall?.expectedVersion).toBe(1);
    expect(replayCall?.expectedVersion).toBe(2);
    expect(replayCall?.requestHash).toBe(firstCall?.requestHash);
  });
});
