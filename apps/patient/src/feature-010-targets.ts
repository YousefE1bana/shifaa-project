import type {
  AvailabilityPage,
  PendingSubjectReferralProjection,
  PublicDoctorProjection,
  TargetSlot,
} from '@shifaa/contracts';
import type { PatientClinicSchedulingApi } from './clinic-scheduling-api';

export type ReferralTargetChoice = {
  doctor: PublicDoctorProjection;
  slot: TargetSlot;
  terms: Pick<AvailabilityPage, 'feeMinorUnits' | 'currency' | 'paymentMethod'>;
};

export const referralDoctorKey = (
  doctor: Pick<PublicDoctorProjection, 'doctorId' | 'facilityId'>,
) => `${doctor.doctorId}:${doctor.facilityId}`;

export const referralSlotKey = (target: ReferralTargetChoice) =>
  `${referralDoctorKey(target.doctor)}:${target.slot.startsAt}:${target.slot.endsAt}`;

/** Discovery owns schedule truth; query each civil date in the referral window. */
export async function listReferralTargets(
  api: Pick<PatientClinicSchedulingApi, 'searchDoctors' | 'listDoctorAvailability'>,
  referral: PendingSubjectReferralProjection,
  window: { fromDate: string; toDate: string },
  assertCurrent: () => void,
): Promise<ReferralTargetChoice[]> {
  const doctors = new Map<string, PublicDoctorProjection>();
  const start = Date.parse(`${window.fromDate}T00:00:00Z`);
  const end = Date.parse(`${window.toDate}T00:00:00Z`);
  if (
    !Number.isFinite(start) ||
    !Number.isFinite(end) ||
    end < start ||
    end - start > 30 * 86400000
  )
    throw new Error('invalid-referral-window');
  for (let day = start; day <= end; day += 86400000) {
    let cursor: string | undefined;
    const seen = new Set<string>();
    for (let pageNumber = 0; ; pageNumber += 1) {
      if (pageNumber >= 20) throw new Error('discovery-page-limit');
      assertCurrent();
      const page = await api.searchDoctors({
        specialty: referral.targetSpecialty,
        ...(referral.targetFacilityId ? { facilityId: referral.targetFacilityId } : {}),
        date: new Date(day).toISOString().slice(0, 10),
        ...(cursor ? { cursor } : {}),
      });
      assertCurrent();
      if (page.freshness !== 'fresh' || page.items.some((doctor) => doctor.stale))
        throw new Error('stale-discovery-projection');
      for (const doctor of page.items) {
        if (referral.targetDoctorId && doctor.doctorId !== referral.targetDoctorId) continue;
        if (referral.targetFacilityId && doctor.facilityId !== referral.targetFacilityId) continue;
        doctors.set(referralDoctorKey(doctor), doctor);
      }
      if (!page.nextCursor) break;
      if (seen.has(page.nextCursor)) throw new Error('discovery-cursor-loop');
      seen.add(page.nextCursor);
      cursor = page.nextCursor;
    }
  }

  const targets = new Map<string, ReferralTargetChoice>();
  for (const doctor of doctors.values()) {
    let cursor: string | undefined;
    let first: AvailabilityPage | undefined;
    const seen = new Set<string>();
    for (let pageNumber = 0; ; pageNumber += 1) {
      if (pageNumber >= 20) throw new Error('availability-page-limit');
      assertCurrent();
      const page = await api.listDoctorAvailability(doctor.facilityId, doctor.doctorId, {
        ...window,
        ...(cursor ? { cursor } : {}),
      });
      assertCurrent();
      if (
        page.freshness !== 'fresh' ||
        (first &&
          (page.version !== first.version ||
            page.feeMinorUnits !== first.feeMinorUnits ||
            page.currency !== first.currency ||
            page.paymentMethod !== first.paymentMethod))
      )
        throw new Error('stale-availability-projection');
      first ??= page;
      for (const slot of page.items) {
        if (slot.facilityId !== doctor.facilityId || slot.doctorId !== doctor.doctorId) continue;
        const target: ReferralTargetChoice = {
          doctor,
          slot: { ...slot, availabilityVersion: page.version },
          terms: {
            feeMinorUnits: page.feeMinorUnits,
            currency: page.currency,
            paymentMethod: page.paymentMethod,
          },
        };
        targets.set(referralSlotKey(target), target);
      }
      if (!page.nextCursor) break;
      if (seen.has(page.nextCursor)) throw new Error('availability-cursor-loop');
      seen.add(page.nextCursor);
      cursor = page.nextCursor;
    }
  }
  return [...targets.values()];
}
