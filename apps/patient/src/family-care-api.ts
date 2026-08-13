import { FamilyCareClient } from '@shifaa/api-client/family-care';

export const syntheticFamilyIds = {
  selfPerson: '40000000-0000-4000-8000-000000000001',
  delegatePerson: '40000000-0000-4000-8000-000000000004',
  selfPatient: '41000000-0000-4000-8000-000000000001',
  dependentPatient: '41000000-0000-4000-8000-000000000002',
  releasedEvidence: '42000000-0000-4000-8000-000000000001',
} as const;

export function consumeInvitationFragment(): Record<string, string> {
  if (typeof window === 'undefined' || !window.location.hash) return {};
  const values = Object.fromEntries(new URLSearchParams(window.location.hash.slice(1)));
  const scrub = () =>
    window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}`);
  scrub();
  // Expo Router completes its initial URL reconciliation after child effects. A
  // post-paint scrub prevents that reconciliation from restoring the secret.
  window.requestAnimationFrame(scrub);
  window.setTimeout(scrub, 0);
  return values;
}

export function createPatientFamilyClient(
  locale: 'ar-EG' | 'en-EG',
  personId: string = syntheticFamilyIds.selfPerson,
) {
  const baseUrl = process.env['EXPO_PUBLIC_API_BASE_URL'] ?? 'http://127.0.0.1:3000';
  return new FamilyCareClient({
    baseUrl,
    accessToken: `synthetic-person:${personId}`,
    acceptLanguage: locale,
  });
}

export function familyMutationKey(action: string) {
  return `synthetic-ui-004-${action}-${Date.now()}`;
}

export function assertOnline() {
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    throw new Error('offline-no-queue');
  }
}
