import Fastify from 'fastify';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type {
  Feature010Uuid,
  ReferralAcceptanceResult,
  AcceptReferralRequest,
} from '@shifaa/contracts';

import { installIdentityErrorHandler } from '../src/routes/identity-onboarding.js';
import {
  registerFeature010ReferralRoutes,
  registeredFeature010ReferralOperationIds,
} from '../src/routes/feature-010-referrals.js';

const patientId = 'f0100000-0000-4000-8000-000000000003';
const facilityId = 'f0100000-0000-4000-8200-000000000001';
const doctorId = 'f0100000-0000-4000-8000-000000000002';
const encounterId = 'f0100000-0000-4000-8800-000000000001';
const referralId = 'f0100000-0000-4000-8a00-000000000001' as Feature010Uuid;
const appointmentId = 'f0100000-0000-4000-8500-000000000001';
const slot = {
  facilityId,
  doctorId,
  startsAt: '2030-04-05T11:00:00.000Z',
  endsAt: '2030-04-05T11:30:00.000Z',
  timezone: 'Africa/Cairo',
  civilDate: '2030-04-05',
  availabilityVersion: 1,
};
const body: AcceptReferralRequest = {
  authorizedFieldCodes: ['reason_summary'],
  targetSlot: slot,
};
const accepted: ReferralAcceptanceResult = {
  referral: {
    id: referralId,
    sourceEncounterId: encounterId as Feature010Uuid,
    status: 'accepted',
    version: 2,
    targetSpecialty: 'cardiology',
    targetFacilityId: facilityId,
    targetDoctorId: doctorId,
    reasonSummary: 'Synthetic referral reason.',
    acceptedFieldCodes: ['reason_summary'],
    resultingAppointmentId: appointmentId as Feature010Uuid,
  },
  appointment: {
    id: appointmentId as Feature010Uuid,
    sourceReferralId: referralId,
    status: 'confirmed',
    facilityId,
    doctorId,
    startsAt: slot.startsAt,
    endsAt: slot.endsAt,
    feeMinorUnits: 12500,
    currency: 'EGP',
    paymentMethod: 'cash_on_arrival',
    version: 1,
  },
};

function headers(overrides: Record<string, string> = {}) {
  return {
    authorization: `Bearer synthetic-person:${patientId}`,
    'idempotency-key': 'f010-c18-accept-referral-001',
    'if-match': '"1"',
    'x-aal': '2',
    'x-purpose': 'appointment.scheduling',
    'accept-language': 'en-EG',
    ...overrides,
  };
}

function referralService() {
  const acceptReferral = vi.fn(async () => accepted);
  return { acceptReferral, createReferral: vi.fn(), listReferrals: vi.fn() };
}

describe('Feature 010 acceptReferral HTTP integration', () => {
  const apps: ReturnType<typeof Fastify>[] = [];

  afterEach(async () => Promise.all(apps.splice(0).map((app) => app.close())));

  async function appFor(service: ReturnType<typeof referralService>) {
    const app = Fastify({ logger: false });
    apps.push(app);
    await registerFeature010ReferralRoutes(app, { service, syntheticMode: true });
    installIdentityErrorHandler(app);
    return app;
  }

  it('accepts only the approved disclosure and returns the booked server-priced appointment', async () => {
    const service = referralService();
    const app = await appFor(service);
    const result = await app.inject({
      method: 'POST',
      url: `/v1/referrals/${referralId}/accept`,
      headers: headers(),
      payload: body,
    });

    expect(result.statusCode).toBe(200);
    expect(result.headers['x-request-id']).toEqual(expect.any(String));
    expect(registeredFeature010ReferralOperationIds).toContain('acceptReferral');
    expect(app.hasRoute({ method: 'POST', url: '/v1/referrals/:referralId/accept' })).toBe(true);
    expect(result.headers['cache-control']).toBe('private, no-store');
    expect(result.json()).toEqual(accepted);
    expect(result.json().appointment).toMatchObject({
      feeMinorUnits: 12500,
      currency: 'EGP',
      paymentMethod: 'cash_on_arrival',
    });
    expect(service.acceptReferral).toHaveBeenCalledWith(
      expect.objectContaining({ idempotencyKey: headers()['idempotency-key'] }),
      referralId,
      1,
      body,
    );
  });

  it.each([
    ['missing If-Match', headers({ 'if-match': '' }), body, 422],
    ['malformed If-Match', headers({ 'if-match': '1' }), body, 422],
    ['missing Idempotency-Key', headers({ 'idempotency-key': '' }), body, 422],
    ['missing AAL2', headers({ 'x-aal': '1' }), body, 403],
    ['missing purpose', headers({ 'x-purpose': '' }), body, 403],
    ['extra client price', headers(), { ...body, feeMinorUnits: 100 }, 422],
    ['extra client currency', headers(), { ...body, currency: 'USD' }, 422],
    ['extra client payment', headers(), { ...body, paymentMethod: 'prepaid' }, 422],
    [
      'overbroad disclosure',
      headers(),
      { ...body, authorizedFieldCodes: ['reason_summary', 'encounter_type', 'private_note'] },
      422,
    ],
    [
      'malformed selected slot',
      headers(),
      { ...body, targetSlot: { ...slot, startsAt: 'not-a-date' } },
      422,
    ],
  ])(
    'rejects %s before calling the acceptance service',
    async (_name, requestHeaders, payload, status) => {
      const service = referralService();
      const app = await appFor(service);
      const result = await app.inject({
        method: 'POST',
        url: `/v1/referrals/${referralId}/accept`,
        headers: requestHeaders,
        payload,
      });

      expect(result.statusCode).toBe(status);
      expect(service.acceptReferral).not.toHaveBeenCalled();
    },
  );

  it('rejects a malformed referral identifier before calling the acceptance service', async () => {
    const service = referralService();
    const app = await appFor(service);
    const result = await app.inject({
      method: 'POST',
      url: '/v1/referrals/not-a-uuid/accept',
      headers: headers(),
      payload: body,
    });

    expect(result.statusCode).toBe(422);
    expect(service.acceptReferral).not.toHaveBeenCalled();
  });

  it.each([
    ['stale referral or slot version', '40001', 'stale referral version', 'version-conflict'],
    [
      'effective slot conflict',
      '23P01',
      'appointment selected slot unavailable',
      'slot-no-longer-available',
    ],
    ['changed idempotency request', '23505', 'idempotency key reused', 'idempotency-key-reused'],
  ])('maps %s to its stable API error', async (_name, code, message, expectedCode) => {
    const service = referralService();
    service.acceptReferral.mockRejectedValueOnce(Object.assign(new Error(message), { code }));
    const app = await appFor(service);
    const result = await app.inject({
      method: 'POST',
      url: `/v1/referrals/${referralId}/accept`,
      headers: headers(),
      payload: body,
    });

    expect(result.statusCode).toBe(409);
    expect(result.json().code).toBe(expectedCode);
  });

  it('returns the same hidden-resource problem for a subject-authority denial', async () => {
    const service = referralService();
    service.acceptReferral.mockRejectedValueOnce(
      Object.assign(new Error('requested referral is unavailable'), { code: 'P0002' }),
    );
    const app = await appFor(service);
    const result = await app.inject({
      method: 'POST',
      url: `/v1/referrals/${referralId}/accept`,
      headers: headers(),
      payload: body,
    });

    expect(result.statusCode).toBe(404);
    expect(result.json().code).toBe('not-found');
    expect(result.body).not.toContain('pending');
    expect(result.body).not.toContain('reasonSummary');
  });
});
