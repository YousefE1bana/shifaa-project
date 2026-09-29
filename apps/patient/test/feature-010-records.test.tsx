import assert from 'node:assert/strict';
import test from 'node:test';
import {
  PatientFeature010ReferralApi,
  referralDisclosureFields,
  referralRecordsCopy,
} from '../src/feature-010-referrals.ts';

const referralId = 'a1000000-0000-4000-8000-000000000021';
const patientId = 'a1000000-0000-4000-8000-000000000022';
const facilityId = 'a1000000-0000-4000-8000-000000000023';
const doctorId = 'a1000000-0000-4000-8000-000000000024';
const appointmentId = 'a1000000-0000-4000-8000-000000000025';
const pendingReferral = {
  id: referralId,
  sourceEncounterId: 'a1000000-0000-4000-8000-000000000026',
  status: 'pending',
  version: 3,
  targetSpecialty: 'Cardiology',
  targetFacilityId: facilityId,
  targetDoctorId: doctorId,
  reasonSummary: 'Synthetic referral reason',
  encounterType: 'consultation',
};
const response = (payload: unknown, status = 200) =>
  new Response(JSON.stringify(payload), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'private, no-store' },
  });
const page = (data: unknown[], stale = false) => ({
  data,
  meta: { nextCursor: null, lastUpdatedAt: '2030-01-07T09:00:00Z', stale },
});
const targetSlot = {
  facilityId,
  doctorId,
  startsAt: '2030-01-08T09:00:00Z',
  endsAt: '2030-01-08T09:30:00Z',
  timezone: 'Africa/Cairo',
  civilDate: '2030-01-08',
  availabilityVersion: 4,
};

test('pending referral review shows only authorized fields and optional encounter type is affirmative opt-in', () => {
  assert.deepEqual(referralDisclosureFields('exclude'), ['reason_summary']);
  assert.deepEqual(referralDisclosureFields('include'), ['reason_summary', 'encounter_type']);
  assert.throws(() => referralDisclosureFields(null), /explicit/i);
  assert.match(referralRecordsCopy['ar-EG'].title, /سجلك|السجل/);
  assert.match(referralRecordsCopy['en-EG'].title, /record/i);
  assert.match(referralRecordsCopy['ar-EG'].accept, /قبول/);
  assert.match(referralRecordsCopy['en-EG'].accept, /accept/i);
});

test('PAT, GUA, and DEL list against the explicit patient context and current server authority', async () => {
  for (const actorRole of ['PAT', 'GUA', 'DEL'] as const) {
    let url = '';
    let init: RequestInit | undefined;
    const api = new PatientFeature010ReferralApi({
      locale: 'en-EG',
      actorRole,
      patientId,
      accessToken: `synthetic-${actorRole}-token`,
      apiBaseUrl: 'https://synthetic.invalid',
      fetch: async (input, options) => {
        url = String(input);
        init = options;
        return response(
          page([
            {
              ...pendingReferral,
              internalMetadata: 'MUST-NOT-REACH-THE-PATIENT',
              encryptionKeyId: 'SYNTHETIC-PRIVATE-METADATA',
            },
          ]),
        );
      },
    });
    assert.equal((await api.listPendingReferrals()).data[0]?.id, referralId);
    assert.equal(new URL(url).searchParams.get('patientId'), patientId);
    assert.equal(
      new Headers(init?.headers).get('Authorization'),
      `Bearer synthetic-${actorRole}-token`,
    );
    assert.equal(new Headers(init?.headers).get('Accept-Language'), 'en-EG');
    assert.equal(api.actingContext.actorRole, actorRole);
    assert.equal(api.actingContext.patientId, patientId);
    assert.doesNotMatch(JSON.stringify(api.currentReferrals), /MUST-NOT-REACH|SYNTHETIC-PRIVATE/);
  }
});

test('authority loss, stale, and offline reads clear protected referral state', async () => {
  let status = 200;
  let stale = false;
  let online = true;
  const api = new PatientFeature010ReferralApi({
    locale: 'ar-EG',
    actorRole: 'DEL',
    patientId,
    accessToken: 'synthetic-delegate-token',
    apiBaseUrl: 'https://synthetic.invalid',
    isOnline: () => online,
    fetch: async () =>
      status === 200
        ? response(page([pendingReferral], stale))
        : response({ code: 'forbidden' }, status),
  });
  await api.listPendingReferrals();
  assert.equal(api.currentReferrals.length, 1);
  stale = true;
  await assert.rejects(api.listPendingReferrals(), /stale/i);
  assert.deepEqual(api.currentReferrals, []);
  stale = false;
  status = 403;
  await assert.rejects(api.listPendingReferrals(), /403/);
  assert.deepEqual(api.currentReferrals, []);
  assert.equal(api.readState, 'denied');
  status = 200;
  await api.listPendingReferrals();
  online = false;
  await assert.rejects(api.listPendingReferrals(), /offline/i);
  assert.deepEqual(api.currentReferrals, []);
  assert.equal(api.readState, 'offline');
});

test('acceptance needs a fresh live mutation result and exposes its linked appointment details', async () => {
  let init: RequestInit | undefined;
  const api = new PatientFeature010ReferralApi({
    locale: 'en-EG',
    actorRole: 'GUA',
    patientId,
    accessToken: 'synthetic-guardian-token',
    apiBaseUrl: 'https://synthetic.invalid',
    fetch: async (input, options) => {
      init = options;
      if (init?.method === 'GET') return response(page([pendingReferral]));
      assert.equal(String(input), `https://synthetic.invalid/v1/referrals/${referralId}/accept`);
      return response({
        referral: {
          ...pendingReferral,
          status: 'accepted',
          version: 4,
          acceptedFieldCodes: ['reason_summary'],
          resultingAppointmentId: appointmentId,
          privateNoteBody: 'MUST-NOT-LEAK-CLINICAL-NOTE',
          internalMetadata: 'MUST-NOT-LEAK-REFERRAL-METADATA',
        },
        appointment: {
          id: appointmentId,
          sourceReferralId: referralId,
          status: 'confirmed',
          facilityId,
          doctorId,
          startsAt: targetSlot.startsAt,
          endsAt: targetSlot.endsAt,
          feeMinorUnits: 120000,
          currency: 'EGP',
          paymentMethod: 'cash_on_arrival',
          version: 1,
          internalFeeMetadata: 'MUST-NOT-LEAK-BOOKING-METADATA',
        },
      });
    },
  });
  await api.listPendingReferrals();
  const accepted = await api.acceptReferral(pendingReferral, true, 'exclude', targetSlot);
  assert.deepEqual(JSON.parse(String(init?.body)), {
    authorizedFieldCodes: ['reason_summary'],
    targetSlot,
  });
  assert.equal(accepted.appointment.id, appointmentId);
  assert.equal(accepted.appointment.doctorId, doctorId);
  assert.equal(accepted.appointment.facilityId, facilityId);
  assert.equal(accepted.appointment.startsAt, targetSlot.startsAt);
  assert.equal(accepted.appointment.paymentMethod, 'cash_on_arrival');
  assert.doesNotMatch(JSON.stringify(accepted), /MUST-NOT-LEAK/);
});

test('acceptance cannot post without explicit reason disclosure authorization', async () => {
  let requests = 0;
  const api = new PatientFeature010ReferralApi({
    locale: 'en-EG',
    actorRole: 'PAT',
    patientId,
    accessToken: 'synthetic-patient-token',
    apiBaseUrl: 'https://synthetic.invalid',
    fetch: async () => {
      requests += 1;
      return response({});
    },
  });
  await assert.rejects(
    api.acceptReferral(pendingReferral, false, 'exclude', targetSlot),
    /explicitly authorized/i,
  );
  assert.equal(requests, 0);
});

test('acceptance cannot post until the encounter type choice is explicit', async () => {
  let posts = 0;
  const api = new PatientFeature010ReferralApi({
    locale: 'en-EG',
    actorRole: 'PAT',
    patientId,
    accessToken: 'synthetic-patient-token',
    apiBaseUrl: 'https://synthetic.invalid',
    fetch: async (_input, init) => {
      if (init?.method === 'POST') posts += 1;
      return response(page([pendingReferral]));
    },
  });
  await api.listPendingReferrals();
  await assert.rejects(api.acceptReferral(pendingReferral, true, null, targetSlot), /explicit/i);
  assert.equal(posts, 0);
});

test('accepted booking conflict or denial never produces a success result', async () => {
  let status = 200;
  const api = new PatientFeature010ReferralApi({
    locale: 'en-EG',
    actorRole: 'PAT',
    patientId,
    accessToken: 'synthetic-patient-token',
    apiBaseUrl: 'https://synthetic.invalid',
    fetch: async (_input, init) =>
      init?.method === 'GET'
        ? response(page([pendingReferral]))
        : response({ code: 'referral-unavailable' }, status),
  });
  await api.listPendingReferrals();
  status = 409;
  await assert.rejects(api.acceptReferral(pendingReferral, true, 'exclude', targetSlot), /409/);
  status = 200;
  await api.listPendingReferrals();
  status = 412;
  await assert.rejects(api.acceptReferral(pendingReferral, true, 'exclude', targetSlot), /412/);
  status = 200;
  await api.listPendingReferrals();
  status = 403;
  await assert.rejects(api.acceptReferral(pendingReferral, true, 'exclude', targetSlot), /403/);
});
