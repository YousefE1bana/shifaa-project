import Fastify from 'fastify';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type {
  PendingSourceReferralProjection,
  ReferralPage,
  Feature010Uuid,
  CreateReferralRequest,
} from '@shifaa/contracts';

import { installIdentityErrorHandler } from '../src/routes/identity-onboarding.js';
import {
  registerFeature010ReferralRoutes,
  registeredFeature010ReferralOperationIds,
} from '../src/routes/feature-010-referrals.js';

const sourceClinicianId = 'f0100000-0000-4000-8000-000000000001';
const targetClinicianId = 'f0100000-0000-4000-8000-000000000002';
const patientId = 'f0100000-0000-4000-8000-000000000003';
const facilityId = 'f0100000-0000-4000-8200-000000000001';
const targetFacilityId = 'f0100000-0000-4000-8200-000000000002';
const encounterId = 'f0100000-0000-4000-8800-000000000001' as Feature010Uuid;
const referralId = 'f0100000-0000-4000-8a00-000000000001';
const lastUpdatedAt = '2030-04-05T08:00:00.000Z';
const body = {
  targetSpecialty: 'cardiology',
  targetFacilityId,
  targetDoctorId: targetClinicianId,
  reasonSummary: 'Synthetic reason summary for the referral.',
  encounterType: 'consultation',
};

const pendingSource: PendingSourceReferralProjection = {
  id: referralId,
  sourceEncounterId: encounterId,
  status: 'pending',
  version: 1,
  targetSpecialty: body.targetSpecialty,
  targetFacilityId,
  targetDoctorId: targetClinicianId,
  reasonSummary: body.reasonSummary,
  encounterType: body.encounterType,
};

function page(data: PendingSourceReferralProjection[]): ReferralPage {
  return {
    data,
    meta: { nextCursor: null, lastUpdatedAt, stale: false },
  };
}

function headers(personId = sourceClinicianId, key = 'f010-c17-idempotency-key-01') {
  return {
    authorization: `Bearer synthetic-person:${personId}`,
    'idempotency-key': key,
    'x-aal': '2',
    'x-purpose': 'clinical.care',
    'accept-language': 'en-EG',
  };
}

function referralService() {
  const records = new Map<
    string,
    { requestHash: string; response: PendingSourceReferralProjection }
  >();
  let writeCount = 0;
  const createReferral = vi.fn(
    async (
      context: { idempotencyKey: string; requestHash: string },
      _sourceEncounterId: Feature010Uuid,
      input: CreateReferralRequest,
    ) => {
      const previous = records.get(context.idempotencyKey);
      if (previous) {
        if (previous.requestHash !== context.requestHash) {
          throw Object.assign(new Error('idempotency key reused'), { code: '23505' });
        }
        return previous.response;
      }
      writeCount += 1;
      const response: PendingSourceReferralProjection = {
        id: referralId,
        sourceEncounterId: encounterId,
        status: 'pending',
        version: 1,
        targetSpecialty: input.targetSpecialty,
        reasonSummary: input.reasonSummary,
        ...(input.targetFacilityId ? { targetFacilityId: input.targetFacilityId } : {}),
        ...(input.targetDoctorId ? { targetDoctorId: input.targetDoctorId } : {}),
        ...(input.encounterType ? { encounterType: input.encounterType } : {}),
      };
      records.set(context.idempotencyKey, {
        requestHash: context.requestHash,
        response,
      });
      return response;
    },
  );
  const listReferrals = vi.fn(async (actor: { personId: string }) =>
    actor.personId === sourceClinicianId ? page([pendingSource]) : page([]),
  );
  return {
    createReferral,
    listReferrals,
    acceptReferral: vi.fn(async () => {
      throw new Error('C18 acceptance is not exercised by the C17 route vectors.');
    }),
    writeCount: () => writeCount,
  };
}

describe('Feature 010 createReferral/listReferrals HTTP integration', () => {
  const apps: ReturnType<typeof Fastify>[] = [];

  afterEach(async () => Promise.all(apps.splice(0).map((app) => app.close())));

  async function appFor(service: ReturnType<typeof referralService>) {
    const app = Fastify({ logger: false });
    apps.push(app);
    await registerFeature010ReferralRoutes(app, { service, syntheticMode: true });
    installIdentityErrorHandler(app);
    return app;
  }

  it('creates a pending internal referral with only the contracted fields', async () => {
    const service = referralService();
    const app = await appFor(service);

    const result = await app.inject({
      method: 'POST',
      url: `/v1/encounters/${encounterId}/referrals`,
      headers: headers(),
      payload: body,
    });

    expect(result.statusCode).toBe(201);
    expect(registeredFeature010ReferralOperationIds).toEqual([
      'createReferral',
      'listReferrals',
      'acceptReferral',
    ]);
    expect(app.hasRoute({ method: 'POST', url: '/v1/encounters/:encounterId/referrals' })).toBe(
      true,
    );
    expect(result.headers['cache-control']).toBe('private, no-store');
    expect(result.json()).toEqual(pendingSource);
    expect(result.json()).not.toHaveProperty('appointmentId');
    expect(result.json()).not.toHaveProperty('resultingAppointmentId');
    expect(result.json()).not.toHaveProperty('notes');
    expect(JSON.stringify(result.json())).not.toContain('private note');
    expect(service.writeCount()).toBe(1);
  });

  it.each([
    ['missing target specialty', { reasonSummary: body.reasonSummary }],
    ['missing reason summary', { targetSpecialty: body.targetSpecialty }],
    ['blank target specialty', { ...body, targetSpecialty: '   ' }],
    ['blank reason summary', { ...body, reasonSummary: '   ' }],
  ])('rejects %s without creating a referral', async (_name, payload) => {
    const service = referralService();
    const app = await appFor(service);

    const result = await app.inject({
      method: 'POST',
      url: `/v1/encounters/${encounterId}/referrals`,
      headers: headers(),
      payload,
    });

    expect(result.statusCode).toBe(422);
    expect(service.writeCount()).toBe(0);
  });

  it('accepts an explicitly selected source encounter type and preserves an omitted optional type', async () => {
    const service = referralService();
    const app = await appFor(service);

    const explicit = await app.inject({
      method: 'POST',
      url: `/v1/encounters/${encounterId}/referrals`,
      headers: headers(),
      payload: body,
    });
    const withoutOptionalType = await app.inject({
      method: 'POST',
      url: `/v1/encounters/${encounterId}/referrals`,
      headers: headers(sourceClinicianId, 'f010-c17-idempotency-key-02'),
      payload: {
        targetSpecialty: body.targetSpecialty,
        reasonSummary: body.reasonSummary,
      },
    });

    expect(explicit.statusCode).toBe(201);
    expect(explicit.json()).toHaveProperty('encounterType', 'consultation');
    expect(withoutOptionalType.statusCode).toBe(201);
    expect(withoutOptionalType.json()).not.toHaveProperty('encounterType');
  });

  it('replays the canonical response for an identical key/body and rejects changed-body reuse', async () => {
    const service = referralService();
    const app = await appFor(service);
    const url = `/v1/encounters/${encounterId}/referrals`;

    const first = await app.inject({ method: 'POST', url, headers: headers(), payload: body });
    const replay = await app.inject({ method: 'POST', url, headers: headers(), payload: body });
    const changed = await app.inject({
      method: 'POST',
      url,
      headers: headers(),
      payload: { ...body, reasonSummary: 'Changed synthetic reason summary.' },
    });

    expect(first.statusCode).toBe(201);
    expect(replay.statusCode).toBe(201);
    expect(replay.json()).toEqual(first.json());
    expect(changed.statusCode).toBe(409);
    expect(changed.json().code).toBe('idempotency-key-reused');
    expect(service.writeCount()).toBe(1);
  });

  it('treats changed whitespace as changed idempotency input while sending normalized fields', async () => {
    const service = referralService();
    const app = await appFor(service);
    const url = `/v1/encounters/${encounterId}/referrals`;
    const key = 'f010-c17-whitespace-key-001';
    const originalBody = { ...body, targetSpecialty: '  cardiology  ' };
    const normalizedBody = { ...body, targetSpecialty: 'cardiology' };

    const first = await app.inject({
      method: 'POST',
      url,
      headers: headers(sourceClinicianId, key),
      payload: originalBody,
    });
    const changed = await app.inject({
      method: 'POST',
      url,
      headers: headers(sourceClinicianId, key),
      payload: normalizedBody,
    });

    expect(first.statusCode).toBe(201);
    expect(changed.statusCode).toBe(409);
    expect(changed.json().code).toBe('idempotency-key-reused');
    expect(first.json()).toMatchObject({ targetSpecialty: 'cardiology' });
    expect(service.writeCount()).toBe(1);
  });

  it('lists pending referrals to the authorized source clinician while the target sees none', async () => {
    const service = referralService();
    const app = await appFor(service);

    const source = await app.inject({ method: 'GET', url: '/v1/referrals', headers: headers() });
    const target = await app.inject({
      method: 'GET',
      url: '/v1/referrals',
      headers: headers(targetClinicianId),
    });

    expect(source.statusCode).toBe(200);
    expect(source.json()).toEqual(page([pendingSource]));
    expect(target.statusCode).toBe(200);
    expect(target.json()).toEqual(page([]));
    expect(JSON.stringify(target.json())).not.toContain(referralId);
  });

  it('rejects missing AAL2, missing purpose and unknown request fields before invoking the service', async () => {
    const service = referralService();
    const app = await appFor(service);
    const url = `/v1/encounters/${encounterId}/referrals`;

    const lowAal = await app.inject({
      method: 'POST',
      url,
      headers: { ...headers(), 'x-aal': '1' },
      payload: body,
    });
    const noPurpose = await app.inject({
      method: 'POST',
      url,
      headers: { ...headers(), 'x-purpose': '' },
      payload: body,
    });
    const unknownField = await app.inject({
      method: 'POST',
      url,
      headers: headers(),
      payload: { ...body, privateNote: 'Synthetic private note must not be shared.' },
    });

    expect(lowAal.statusCode).toBe(403);
    expect(noPurpose.statusCode).toBe(403);
    expect(unknownField.statusCode).toBe(422);
    expect(service.writeCount()).toBe(0);
  });
});
