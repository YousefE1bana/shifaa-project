import type { DoctorSearchPage, PublicDoctorProjection, ReadFreshness } from '@shifaa/contracts';
import { clinicSchedulingArEG, clinicSchedulingEnEG, type Locale } from '@shifaa/i18n';

export function doctorResultStatus(
  freshness: ReadFreshness,
  doctorStale: boolean,
  hasSlot: boolean,
): 'available' | 'unavailable' | 'stale' | 'unknown' {
  if (doctorStale || freshness === 'stale') return 'stale';
  if (freshness === 'unknown') return 'unknown';
  return hasSlot ? 'available' : 'unavailable';
}

export function canContinueToBooking(
  freshness: ReadFreshness,
  hasSelectedSlot: boolean,
  online: boolean,
): boolean {
  return freshness === 'fresh' && hasSelectedSlot && online;
}

export function slotMatchesDoctor(value: unknown, facilityId: string, doctorId: string): boolean {
  if (!value || typeof value !== 'object') return false;
  const slot = value as Record<string, unknown>;
  return (
    slot['facilityId'] === facilityId &&
    slot['doctorId'] === doctorId &&
    typeof slot['startsAt'] === 'string' &&
    typeof slot['endsAt'] === 'string' &&
    typeof slot['civilDate'] === 'string' &&
    typeof slot['timezone'] === 'string'
  );
}

export function currentDoctorIdentity(
  page: DoctorSearchPage,
  facilityId: string,
  doctorId: string,
): PublicDoctorProjection | null {
  if (page.freshness !== 'fresh') return null;
  const match = page.items.find(
    (item) => item.facilityId === facilityId && item.doctorId === doctorId,
  );
  return match && !match.stale && isValidDoctorProjection(match, facilityId, doctorId)
    ? match
    : null;
}

/** Bounded public search traversal; never infer identity from a partial or stale page. */
export async function findCurrentDoctorIdentity(
  fetchPage: (cursor?: string) => Promise<DoctorSearchPage>,
  facilityId: string,
  doctorId: string,
): Promise<PublicDoctorProjection | null> {
  const visited = new Set<string>();
  let cursor: string | undefined;
  for (let pageNumber = 0; pageNumber < 20; pageNumber += 1) {
    const page = await fetchPage(cursor);
    if (page.freshness !== 'fresh') return null;
    const doctor = currentDoctorIdentity(page, facilityId, doctorId);
    if (doctor) return doctor;
    if (!page.nextCursor || visited.has(page.nextCursor)) return null;
    visited.add(page.nextCursor);
    cursor = page.nextCursor;
  }
  return null;
}

/** Validate the public projection again at the UI boundary before displaying trust or fees. */
export function isValidDoctorProjection(
  value: unknown,
  facilityId: string,
  doctorId: string,
): boolean {
  if (!value || typeof value !== 'object') return false;
  const item = value as Record<string, unknown>;
  return (
    item['facilityId'] === facilityId &&
    item['doctorId'] === doctorId &&
    item['facilityVerified'] === true &&
    item['professionalLicenseVerified'] === true &&
    item['currency'] === 'EGP' &&
    item['paymentMethod'] === 'cash_on_arrival' &&
    typeof item['feeMinorUnits'] === 'number' &&
    Number.isInteger(item['feeMinorUnits']) &&
    (item['feeMinorUnits'] as number) >= 0
  );
}

export function doctorResultPresentation(
  value: unknown,
  locale: Locale,
  freshness: ReadFreshness,
): null | {
  direction: 'rtl' | 'ltr';
  verifiedLabel: string;
  feeLabel: string;
  paymentLabel: string;
  availabilityLabel: string;
  viewDoctorLabel: string;
} {
  if (!value || typeof value !== 'object') return null;
  const doctor = value as Record<string, unknown>;
  if (
    typeof doctor['doctorId'] !== 'string' ||
    typeof doctor['facilityId'] !== 'string' ||
    !isValidDoctorProjection(doctor, doctor['facilityId'], doctor['doctorId'])
  )
    return null;
  const copy = locale === 'ar-EG' ? clinicSchedulingArEG : clinicSchedulingEnEG;
  const status = doctorResultStatus(
    freshness,
    doctor['stale'] === true,
    doctor['nextAvailableSlot'] !== null,
  );
  const slot = doctor['nextAvailableSlot'];
  const startsAt =
    slot && typeof slot === 'object' && 'startsAt' in slot && typeof slot.startsAt === 'string'
      ? slot.startsAt
      : null;
  return {
    direction: locale === 'ar-EG' ? 'rtl' : 'ltr',
    verifiedLabel: copy['clinic.discover.verified'],
    feeLabel: `${copy['clinic.discover.fee']}: ${(doctor['feeMinorUnits'] as number) / 100} EGP`,
    paymentLabel: copy['clinic.payment.cashInstruction'],
    availabilityLabel:
      status === 'available' && startsAt
        ? `${copy['clinic.discover.available']}: ${startsAt}`
        : copy[`clinic.discover.${status}`],
    viewDoctorLabel: `${copy['clinic.discover.viewDoctor']}: ${String(doctor['doctorDisplayName'] ?? '')}`,
  };
}
