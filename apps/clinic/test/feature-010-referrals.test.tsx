import assert from 'node:assert/strict';
import test from 'node:test';
import {
  prepareReferralReview,
  resolveClinicReferralList,
  resolveReferralMutationFailure,
} from '../src/components/feature-010/ReferralWorkspace';

const sourceEncounterId = '95000000-0000-4000-8000-000000000001';
const referralId = '98000000-0000-4000-8000-000000000001';
const appointmentId = '93000000-0000-4000-8000-000000000001';
const facilityId = '90000000-0000-4000-8000-000000000001';
const doctorId = '96000000-0000-4000-8000-000000000001';
const updatedAt = '2026-09-29T09:00:00+03:00';

test('source encounter must be explicitly confirmed before referral review', () => {
  const review = prepareReferralReview({
    sourceEncounterId,
    sourceEncounterConfirmed: false,
    targetSpecialty: 'Cardiology',
    reasonSummary: 'Synthetic summary',
    includeEncounterType: false,
    sourceEncounterType: 'consultation',
  });

  assert.equal(review.ok, false);
  if (!review.ok) assert.equal(review.errors.sourceEncounterId, 'confirmation-required');
});

test('specialty and reason are required and review contains no precommitted referral identity', () => {
  const review = prepareReferralReview({
    sourceEncounterId,
    sourceEncounterConfirmed: true,
    targetSpecialty: '  ',
    reasonSummary: '  ',
    includeEncounterType: false,
    sourceEncounterType: 'consultation',
  });

  assert.equal(review.ok, false);
  if (!review.ok) {
    assert.equal(review.errors.targetSpecialty, 'required');
    assert.equal(review.errors.reasonSummary, 'required');
  }
});

test('valid review sends only approved referral fields and source type only after explicit selection', () => {
  const withoutType = prepareReferralReview({
    sourceEncounterId,
    sourceEncounterConfirmed: true,
    targetSpecialty: ' Cardiology ',
    reasonSummary: ' Synthetic summary ',
    includeEncounterType: false,
    sourceEncounterType: 'consultation',
  });
  assert.equal(withoutType.ok, true);
  if (!withoutType.ok) return;
  assert.deepEqual(withoutType.request, {
    encounterId: sourceEncounterId,
    body: { targetSpecialty: 'Cardiology', reasonSummary: 'Synthetic summary' },
  });
  assert.equal('id' in withoutType.request, false);
  assert.equal('status' in withoutType.request, false);

  const withType = prepareReferralReview({
    sourceEncounterId,
    sourceEncounterConfirmed: true,
    targetSpecialty: 'Cardiology',
    reasonSummary: 'Synthetic summary',
    includeEncounterType: true,
    sourceEncounterType: 'consultation',
  });
  assert.equal(withType.ok, true);
  if (withType.ok) assert.equal(withType.request.body.encounterType, 'consultation');
});

test('authoritative pending and accepted list projections retain only authorized source IDs', () => {
  const pending = resolveClinicReferralList({
    online: true,
    response: {
      data: [
        {
          id: referralId,
          sourceEncounterId,
          status: 'pending',
          version: 1,
          targetSpecialty: 'Cardiology',
          targetFacilityId: facilityId,
          targetDoctorId: doctorId,
          reasonSummary: 'Synthetic summary',
          privateNote: 'must not render',
          targetFacilityName: 'must not infer',
          appointmentSlot: 'must not infer',
        },
        {
          id: '98000000-0000-4000-8000-000000000002',
          status: 'accepted',
          version: 2,
          acceptedFieldCodes: ['reason_summary'],
          resultingAppointmentId: appointmentId,
          reasonSummary: 'Target-only accepted projection',
        },
        {
          id: '98000000-0000-4000-8000-000000000003',
          sourceEncounterId,
          status: 'accepted',
          version: 2,
          targetSpecialty: 'Cardiology',
          reasonSummary: 'Accepted projection missing its required appointment link',
        },
      ],
      meta: { nextCursor: null, lastUpdatedAt: updatedAt, stale: false },
    },
  });
  assert.equal(pending.kind, 'ready');
  if (pending.kind === 'ready') {
    assert.equal(pending.referrals[0]?.id, referralId);
    assert.equal(pending.referrals[0]?.status, 'pending');
    assert.equal(pending.lastUpdatedAt, updatedAt);
    assert.equal('privateNote' in (pending.referrals[0] ?? {}), false);
    assert.equal('targetFacilityName' in (pending.referrals[0] ?? {}), false);
    assert.equal('appointmentSlot' in (pending.referrals[0] ?? {}), false);
    assert.equal(
      pending.referrals.length,
      1,
      'target-only and incomplete accepted projections are excluded',
    );
  }

  const accepted = resolveClinicReferralList({
    online: true,
    response: {
      data: [
        {
          id: referralId,
          sourceEncounterId,
          status: 'accepted',
          version: 2,
          targetSpecialty: 'Cardiology',
          targetFacilityId: facilityId,
          targetDoctorId: doctorId,
          reasonSummary: 'Synthetic summary',
          acceptedFieldCodes: ['reason_summary'],
          resultingAppointmentId: appointmentId,
        },
      ],
      meta: { nextCursor: null, lastUpdatedAt: updatedAt, stale: false },
    },
  });
  assert.equal(accepted.kind, 'ready');
  if (accepted.kind === 'ready') {
    assert.equal(accepted.referrals[0]?.status, 'accepted');
    assert.equal(accepted.referrals[0]?.resultingAppointmentId, appointmentId);
    assert.equal(accepted.referrals[0]?.targetFacilityId, facilityId);
    assert.equal(accepted.referrals[0]?.targetDoctorId, doctorId);
    assert.equal('doctorName' in (accepted.referrals[0] ?? {}), false);
    assert.equal('facilityName' in (accepted.referrals[0] ?? {}), false);
    assert.equal('appointmentSlot' in (accepted.referrals[0] ?? {}), false);
  }
});

test('offline, stale, denied and failed reads clear previously known referral content', () => {
  const offline = resolveClinicReferralList({ online: false });
  assert.deepEqual(offline, { kind: 'offline', referrals: [] });

  const stale = resolveClinicReferralList({
    online: true,
    response: { data: [], meta: { nextCursor: null, lastUpdatedAt: updatedAt, stale: true } },
  });
  assert.deepEqual(stale, { kind: 'stale', referrals: [], lastUpdatedAt: updatedAt });

  const denied = resolveClinicReferralList({ online: true, error: 'forbidden' });
  assert.deepEqual(denied, { kind: 'denied', referrals: [] });

  const failed = resolveClinicReferralList({ online: true, error: 'recoverable' });
  assert.deepEqual(failed, { kind: 'recoverable', referrals: [] });
});

test('validation, stale conflict and idempotency replay mutation failures expose no optimistic row', () => {
  for (const code of ['validation', 'stale', 'replay', 'denied', 'offline'] as const) {
    assert.deepEqual(resolveReferralMutationFailure(code), {
      kind: code,
      referrals: [],
    });
  }
});
