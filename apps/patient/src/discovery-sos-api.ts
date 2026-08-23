import { DiscoverySosClient } from '@shifaa/api-client/discovery-sos';
import type { Locale } from '@shifaa/i18n';

export type FacilityProjection = {
  facility_id: string;
  facility_type: string;
  name: string;
  address?: string;
  services: string[];
  distance_m: number | null;
  operational_signal: {
    signal: 'available' | 'limited' | 'unavailable' | 'unknown';
    count_band: 'none' | 'one_to_four' | 'five_to_nine' | 'ten_or_more' | 'unknown';
    freshness: 'fresh' | 'stale' | 'unknown';
    observed_at: string | null;
  };
};

export type SosIncidentProjection = {
  incident_id: string;
  managed_patient_id: string;
  status: 'active_unmatched' | 'matched' | 'accepted' | 'closed';
  qualifying_reason_code: 'medical_emergency' | 'accident_or_injury' | 'other_life_safety';
  matched_facility: FacilityProjection | null;
  initiated_at: string;
  accepted_at?: string | null;
  closed_at?: string | null;
  contact_delivery?: 'not_requested' | 'pending' | 'delayed' | 'delivered' | 'failed';
  version: number;
};

export type DiscoverySosClientShape = Pick<
  DiscoverySosClient,
  | 'searchFacilities'
  | 'getFacilityCapacity'
  | 'createSosIncident'
  | 'getSosIncident'
  | 'closeSosIncident'
  | 'createEmergencyShare'
  | 'revokeEmergencyShare'
  | 'viewEmergencyShare'
>;

export const syntheticDiscoverySosIds = {
  person: '60000000-0000-4000-8000-000000000001',
  patient: '61000000-0000-4000-8000-000000000001',
} as const;

export function createPatientDiscoverySosClient(locale: Locale): DiscoverySosClientShape {
  const client = new DiscoverySosClient({
    baseUrl: process.env['EXPO_PUBLIC_API_BASE_URL'] ?? 'http://127.0.0.1:3000',
    accessToken: `synthetic-person:${syntheticDiscoverySosIds.person}`,
    acceptLanguage: locale,
  });
  const subject = { patientId: syntheticDiscoverySosIds.patient } as const;
  return {
    searchFacilities: (query) => client.searchFacilities(query),
    getFacilityCapacity: (facilityId) => client.getFacilityCapacity(facilityId),
    createSosIncident: (body, key) => client.createSosIncident(body, key),
    getSosIncident: (incidentId, options) =>
      client.getSosIncident(incidentId, { ...options, ...subject }),
    closeSosIncident: (incidentId, body, version, key) =>
      client.closeSosIncident(incidentId, body, version, key, subject),
    createEmergencyShare: (incidentId, body, key) =>
      client.createEmergencyShare(incidentId, body, key, subject),
    revokeEmergencyShare: (shareId, version, key) =>
      client.revokeEmergencyShare(shareId, version, key, subject),
    viewEmergencyShare: (token) => client.viewEmergencyShare(token),
  };
}

export function discoverySosMutationKey(action: string) {
  return `synthetic-ui-006-${action}-${Date.now()}`;
}

export type MutationIntentRef = {
  current: { signature: string; key: string } | null;
};

export function retainedMutationKey(
  ref: MutationIntentRef,
  action: string,
  intent: unknown,
): string {
  const signature = JSON.stringify(intent);
  if (!ref.current || ref.current.signature !== signature) {
    ref.current = { signature, key: discoverySosMutationKey(action) };
  }
  return ref.current.key;
}

export function hasDiscoverySosStatus(error: unknown, status: number): boolean {
  return Boolean(
    error &&
      typeof error === 'object' &&
      'status' in error &&
      (error as { status: unknown }).status === status,
  );
}

export function assertDiscoverySosOnline() {
  if (typeof navigator !== 'undefined' && !navigator.onLine) throw new Error('offline-no-queue');
}

export function consumeEmergencyShareFragment(): string | null {
  if (typeof window === 'undefined' || !window.location.hash) return null;
  const token = new URLSearchParams(window.location.hash.slice(1)).get('token');
  const scrub = () =>
    window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}`);
  scrub();
  window.requestAnimationFrame(scrub);
  window.setTimeout(scrub, 0);
  return token;
}

export function dataArray(payload: unknown): unknown[] {
  if (!payload || typeof payload !== 'object') return [];
  const data = (payload as { data?: unknown }).data;
  return Array.isArray(data) ? data : [];
}
