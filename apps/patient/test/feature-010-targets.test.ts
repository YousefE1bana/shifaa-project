import assert from 'node:assert/strict';
import test from 'node:test';
import {
  listReferralTargets,
  referralDoctorKey,
  referralSlotKey,
} from '../src/feature-010-targets.ts';
import type {
  AvailabilityPage,
  PublicDoctorProjection,
  PendingSubjectReferralProjection,
} from '@shifaa/contracts';

const doctor: PublicDoctorProjection = {
  doctorId: 'a1000000-0000-4000-8000-000000000001',
  facilityId: 'a1000000-0000-4000-8000-000000000002',
  doctorDisplayName: 'Synthetic Doctor',
  facilityDisplayName: 'Synthetic Clinic',
  specialty: 'cardiology',
  professionalLicenseVerified: true,
  facilityVerified: true,
  feeMinorUnits: 10000,
  currency: 'EGP',
  paymentMethod: 'cash_on_arrival',
  nextAvailableSlot: null,
  distanceMeters: null,
  availabilityVersion: 1,
  updatedAt: '2030-01-01T00:00:00Z',
  stale: false,
};
const referral: PendingSubjectReferralProjection = {
  id: doctor.doctorId,
  sourceEncounterId: doctor.facilityId,
  status: 'pending',
  version: 1,
  targetSpecialty: 'cardiology',
  reasonSummary: 'Synthetic reason',
};
const window = { fromDate: '2030-01-01', toDate: '2030-01-31' };
const availability = (facilityId: string, count = 1): AvailabilityPage => ({
  items: Array.from({ length: count }, (_, index) => ({
    doctorId: doctor.doctorId,
    facilityId,
    startsAt: new Date(Date.UTC(2030, 0, 2, 0, index)).toISOString(),
    endsAt: new Date(Date.UTC(2030, 0, 2, 0, index + 1)).toISOString(),
    civilDate: '2030-01-02',
    timezone: 'Africa/Cairo',
  })),
  feeMinorUnits: 12500,
  currency: 'EGP',
  paymentMethod: 'cash_on_arrival',
  version: 3,
  freshness: 'fresh',
  nextCursor: null,
});

test('discovery covers future starts; doctor/facility pairs and server-priced later-page slots stay distinct', async () => {
  const dates: string[] = [];
  const secondFacility = 'a1000000-0000-4000-8000-000000000003';
  const targets = await listReferralTargets(
    {
      searchDoctors: async (query) => {
        dates.push(query?.date!);
        return {
          items:
            query?.date === '2030-01-02' ? [doctor, { ...doctor, facilityId: secondFacility }] : [],
          nextCursor: null,
          freshness: 'fresh',
        };
      },
      listDoctorAvailability: async (facilityId, _doctorId, query) => {
        const first = availability(facilityId, 100);
        return query?.cursor
          ? {
              ...availability(facilityId),
              items: [
                {
                  ...first.items[0]!,
                  startsAt: '2030-01-03T00:00:00Z',
                  endsAt: '2030-01-03T00:30:00Z',
                },
              ],
            }
          : { ...first, nextCursor: 'second' };
      },
    },
    referral,
    window,
    () => {},
  );
  assert.equal(dates.length, 31);
  assert.equal(targets.length, 202);
  assert.equal(new Set(targets.map((target) => referralDoctorKey(target.doctor))).size, 2);
  assert.equal(new Set(targets.map(referralSlotKey)).size, 202);
  assert.ok(targets.every((target) => target.doctor.facilityId === target.slot.facilityId));
  assert.deepEqual(targets[100]?.terms, {
    feeMinorUnits: 12500,
    currency: 'EGP',
    paymentMethod: 'cash_on_arrival',
  });
  assert.equal(targets[100]?.slot.availabilityVersion, 3);
});

test('availability rejects loops, page bounds and changing freshness/version/prices', async () => {
  for (const failure of ['loop', 'bound', 'stale', 'version', 'price'] as const) {
    let calls = 0;
    await assert.rejects(
      listReferralTargets(
        {
          searchDoctors: async () => ({ items: [doctor], nextCursor: null, freshness: 'fresh' }),
          listDoctorAvailability: async (facilityId) => {
            calls += 1;
            return {
              ...availability(facilityId),
              nextCursor: failure === 'bound' ? String(calls) : 'same',
              ...(calls > 1 && failure === 'stale' ? { freshness: 'stale' as const } : {}),
              ...(calls > 1 && failure === 'version' ? { version: 4 } : {}),
              ...(calls > 1 && failure === 'price' ? { feeMinorUnits: 15000 } : {}),
            };
          },
        },
        referral,
        window,
        () => {},
      ),
    );
    assert.ok(calls <= 20);
  }
});
