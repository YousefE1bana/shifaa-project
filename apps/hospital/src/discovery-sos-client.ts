import { DiscoverySosClient } from '@shifaa/api-client/discovery-sos';
import type { Locale } from '@shifaa/i18n';
import {
  discoverySosSyntheticFacilities,
  discoverySosSyntheticPeople,
} from '@shifaa/test-kit/discovery-sos';

export type HospitalDiscoverySosClient = {
  getFacilityCapacity(facilityId: string): Promise<unknown>;
  listSosPrearrivals(facilityId: string, query?: Record<string, unknown>): Promise<unknown>;
  acceptSosPrearrival(
    facilityId: string,
    incidentId: string,
    body: { acknowledgement: true; capacity_note_code: string },
    version: number,
    key: string,
  ): Promise<unknown>;
};

export const syntheticHospitalContext = {
  facilityId: discoverySosSyntheticFacilities.nearestFreshHospital,
  personId: discoverySosSyntheticPeople.hospitalAOwner,
  facilityNameAr: 'مستشفى القاهرة الاصطناعي',
  facilityNameEn: 'Synthetic Cairo Hospital',
} as const;

export function createHospitalDiscoverySosClient(locale: Locale): HospitalDiscoverySosClient {
  return new DiscoverySosClient({
    baseUrl: process.env['NEXT_PUBLIC_API_BASE_URL'] ?? 'http://127.0.0.1:3000',
    accessToken: `synthetic-person:${syntheticHospitalContext.personId}`,
    acceptLanguage: locale,
    defaultHeaders: { 'X-AAL': '2', 'X-Purpose': 'sos_prearrival_coordination' },
  }) as unknown as HospitalDiscoverySosClient;
}

export function hospitalMutationKey(action: string) {
  return `synthetic-ui-006-hospital-${action}-${Date.now()}`;
}

export function retainedHospitalMutationKey(
  ref: { current: { signature: string; key: string } | null },
  action: string,
  intent: unknown,
) {
  const signature = JSON.stringify(intent);
  if (!ref.current || ref.current.signature !== signature) {
    ref.current = { signature, key: hospitalMutationKey(action) };
  }
  return ref.current.key;
}
