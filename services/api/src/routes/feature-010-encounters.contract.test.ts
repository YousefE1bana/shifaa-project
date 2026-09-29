import Fastify from 'fastify';
import { Value } from '@sinclair/typebox/value';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  EncounterStartResultSchema,
  feature010Operations,
  type EncounterStartResult,
} from '@shifaa/contracts';

import { installIdentityErrorHandler } from './identity-onboarding.js';
import {
  registerFeature010EncounterRoutes,
  registeredFeature010EncounterOperationIds,
} from './feature-010-encounters.js';

const clinician = 'f0100000-0000-4000-8000-000000000001';
const patient = 'f0100000-0000-4000-8000-000000000002';
const appointment = 'f0100000-0000-4000-8500-000000000001';
const encounter = 'f0100000-0000-4000-8800-000000000001';
const response: EncounterStartResult = {
  encounter: {
    id: encounter,
    patientId: patient,
    facilityId: 'f0100000-0000-4000-8200-000000000001',
    appointmentId: appointment,
    encounterType: 'consultation',
    responsibleClinicianId: clinician,
    status: 'open',
    startedAt: '2026-09-27T08:00:00.000Z',
    version: 1,
    conditionIds: [],
    observationIds: [],
    orderIds: [],
    participants: [
      {
        personId: clinician,
        roleCode: 'responsible_clinician',
        startedAt: '2026-09-27T08:00:00.000Z',
      },
    ],
  },
  appointmentStatus: 'in_consultation',
  queueStatus: 'in_service',
  queueEntryId: 'f0100000-0000-4000-8700-000000000001',
};

function headers(personId = clinician, overrides: Record<string, string> = {}) {
  return {
    authorization: `Bearer synthetic-person:${personId}`,
    'idempotency-key': 'f010-c10-test-key-0001',
    'x-aal': '2',
    'x-purpose': 'appointment.scheduling',
    ...overrides,
  };
}

function serviceStub() {
  return {
    createEncounter: vi.fn(async () => response),
    getEncounter: vi.fn(async () => response.encounter),
    signEncounterNote: vi.fn(),
    updateEncounter: vi.fn(async () => response.encounter),
  };
}

describe('Feature 010 encounter HTTP contract', () => {
  const apps: ReturnType<typeof Fastify>[] = [];
  afterEach(async () => Promise.all(apps.splice(0).map((app) => app.close())));

  it('registers the approved create, read, update, and note signing operations', async () => {
    const service = serviceStub();
    const app = Fastify({ logger: false });
    apps.push(app);
    await registerFeature010EncounterRoutes(app, { service, syntheticMode: true });
    installIdentityErrorHandler(app);

    expect(registeredFeature010EncounterOperationIds).toEqual(
      feature010Operations
        .filter(({ operationId }) =>
          ['createEncounter', 'getEncounter', 'updateEncounter', 'signEncounterNote'].includes(
            operationId,
          ),
        )
        .map(({ operationId }) => operationId),
    );
    expect(app.hasRoute({ method: 'POST', url: '/v1/encounters' })).toBe(true);
    expect(app.hasRoute({ method: 'GET', url: '/v1/encounters/:encounterId' })).toBe(true);
    expect(app.hasRoute({ method: 'PATCH', url: '/v1/encounters/:encounterId' })).toBe(true);
    expect(app.hasRoute({ method: 'POST', url: '/v1/encounters/:encounterId/notes' })).toBe(true);
  });

  it('rejects client-supplied workforce identity fields before calling the service', async () => {
    const service = serviceStub();
    const app = Fastify({ logger: false });
    apps.push(app);
    await registerFeature010EncounterRoutes(app, { service, syntheticMode: true });
    installIdentityErrorHandler(app);
    const result = await app.inject({
      method: 'POST',
      url: '/v1/encounters',
      headers: headers(),
      payload: {
        appointmentId: appointment,
        patientId: patient,
        encounterType: 'consultation',
        responsibleClinicianId: clinician,
      },
    });

    expect(result.statusCode).toBe(422);
    expect(service.createEncounter).not.toHaveBeenCalled();
  });

  it('requires the seeded-synthetic session gate, AAL2 and a purpose for create', async () => {
    const unavailable = serviceStub();
    const closedApp = Fastify({ logger: false });
    apps.push(closedApp);
    await registerFeature010EncounterRoutes(closedApp, {
      service: unavailable,
      syntheticMode: false,
    });
    installIdentityErrorHandler(closedApp);
    const blocked = await closedApp.inject({
      method: 'POST',
      url: '/v1/encounters',
      headers: headers(),
      payload: { appointmentId: appointment, patientId: patient, encounterType: 'consultation' },
    });
    expect(blocked.statusCode).toBe(503);
    expect(unavailable.createEncounter).not.toHaveBeenCalled();

    const service = serviceStub();
    const app = Fastify({ logger: false });
    apps.push(app);
    await registerFeature010EncounterRoutes(app, { service, syntheticMode: true });
    installIdentityErrorHandler(app);
    const missingSession = await app.inject({
      method: 'POST',
      url: '/v1/encounters',
      payload: { appointmentId: appointment, patientId: patient, encounterType: 'consultation' },
    });
    const missingAal = await app.inject({
      method: 'POST',
      url: '/v1/encounters',
      headers: headers(clinician, { 'x-aal': '1' }),
      payload: { appointmentId: appointment, patientId: patient, encounterType: 'consultation' },
    });
    const missingPurpose = await app.inject({
      method: 'POST',
      url: '/v1/encounters',
      headers: headers(clinician, { 'x-purpose': '' }),
      payload: { appointmentId: appointment, patientId: patient, encounterType: 'consultation' },
    });

    expect(missingSession.statusCode).toBe(401);
    expect(missingAal.statusCode).toBe(403);
    expect(missingPurpose.statusCode).toBe(403);
    expect(service.createEncounter).not.toHaveBeenCalled();
  });

  it('returns the canonical create response and sets no-store headers', async () => {
    const service = serviceStub();
    const app = Fastify({ logger: false });
    apps.push(app);
    await registerFeature010EncounterRoutes(app, { service, syntheticMode: true });
    installIdentityErrorHandler(app);
    const result = await app.inject({
      method: 'POST',
      url: '/v1/encounters',
      headers: headers(),
      payload: { appointmentId: appointment, patientId: patient, encounterType: 'consultation' },
    });

    expect(result.statusCode).toBe(201);
    expect(Value.Check(EncounterStartResultSchema, result.json())).toBe(true);
    expect(result.headers['cache-control']).toBe('private, no-store');
    expect(service.createEncounter).toHaveBeenCalledWith(
      expect.objectContaining({
        actor: expect.objectContaining({ personId: clinician, aal: 2 }),
        idempotencyKey: 'f010-c10-test-key-0001',
      }),
      { appointmentId: appointment, patientId: patient, encounterType: 'consultation' },
    );
  });

  it('passes different request hashes for changed bodies that reuse an idempotency key', async () => {
    const seen: Array<{ idempotencyKey: string; requestHash: string }> = [];
    const service = {
      createEncounter: vi.fn(async (context: { idempotencyKey: string; requestHash: string }) => {
        seen.push(context);
        return response;
      }),
      getEncounter: vi.fn(async () => response.encounter),
      signEncounterNote: vi.fn(),
      updateEncounter: vi.fn(async () => response.encounter),
    };
    const app = Fastify({ logger: false });
    apps.push(app);
    await registerFeature010EncounterRoutes(app, { service, syntheticMode: true });
    installIdentityErrorHandler(app);
    const first = await app.inject({
      method: 'POST',
      url: '/v1/encounters',
      headers: headers(),
      payload: { appointmentId: appointment, patientId: patient, encounterType: 'consultation' },
    });
    const changed = await app.inject({
      method: 'POST',
      url: '/v1/encounters',
      headers: headers(),
      payload: { appointmentId: appointment, patientId: patient, encounterType: 'follow_up' },
    });

    expect(first.statusCode).toBe(201);
    expect(changed.statusCode).toBe(201);
    expect(seen).toHaveLength(2);
    expect(seen[0]?.idempotencyKey).toBe(seen[1]?.idempotencyKey);
    expect(seen[0]?.requestHash).not.toBe(seen[1]?.requestHash);
  });

  it('returns a current authorized role projection and rejects unknown query fields', async () => {
    const service = serviceStub();
    service.getEncounter.mockResolvedValue({
      ...response.encounter,
      notes: [
        {
          id: encounter,
          encounterId: encounter,
          authorId: clinician,
          noteType: 'follow_up',
          visibility: 'private',
          signedAt: '2026-09-27T08:00:00.000Z',
          body: 'private note body',
        },
      ],
    });
    const app = Fastify({ logger: false });
    apps.push(app);
    await registerFeature010EncounterRoutes(app, { service, syntheticMode: true });
    const result = await app.inject({
      method: 'GET',
      url: `/v1/encounters/${encounter}?fields=participants`,
      headers: headers(),
    });
    const unknown = await app.inject({
      method: 'GET',
      url: `/v1/encounters/${encounter}?includePrivate=true`,
      headers: headers(),
    });

    expect(result.statusCode).toBe(200);
    expect(result.json()).toEqual({
      ...response.encounter,
      conditionIds: undefined,
      observationIds: undefined,
      orderIds: undefined,
    });
    expect(result.json()).not.toHaveProperty('notes');
    expect(result.body).not.toContain('private note body');
    expect(service.getEncounter).toHaveBeenCalledWith(expect.any(Object), encounter, [
      'participants',
    ]);
    expect(unknown.statusCode).toBe(422);
    expect(unknown.json().code).toBe('validation-failed');
  });

  it('returns the authorized note projection when note bodies are explicitly requested', async () => {
    const service = serviceStub();
    service.getEncounter.mockResolvedValue({ ...response.encounter, notes: [] });
    const app = Fastify({ logger: false });
    apps.push(app);
    await registerFeature010EncounterRoutes(app, { service, syntheticMode: true });
    installIdentityErrorHandler(app);
    const result = await app.inject({
      method: 'GET',
      url: `/v1/encounters/${encounter}?fields=notes`,
      headers: headers(),
    });

    expect(result.statusCode).toBe(200);
    expect(result.json()).toHaveProperty('notes', []);
    expect(service.getEncounter).toHaveBeenCalledWith(expect.any(Object), encounter, ['notes']);
  });

  it('maps a stale checked-in/called transition to the catalogued conflict code', async () => {
    const service = serviceStub();
    service.createEncounter.mockRejectedValue(
      Object.assign(new Error('matching called queue entry is required'), { code: '40001' }),
    );
    const app = Fastify({ logger: false });
    apps.push(app);
    await registerFeature010EncounterRoutes(app, { service, syntheticMode: true });
    installIdentityErrorHandler(app);
    const result = await app.inject({
      method: 'POST',
      url: '/v1/encounters',
      headers: headers(),
      payload: { appointmentId: appointment, patientId: patient, encounterType: 'consultation' },
    });

    expect(result.statusCode).toBe(409);
    expect(result.json().code).toBe('state-transition-invalid');
  });
});
