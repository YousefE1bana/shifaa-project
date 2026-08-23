export const discoveryFacilityTypes = ['clinic', 'pharmacy', 'hospital', 'laboratory'] as const;
export type DiscoveryFacilityType = (typeof discoveryFacilityTypes)[number];

export const capacitySignals = ['available', 'limited', 'unavailable', 'unknown'] as const;
export type CapacitySignal = (typeof capacitySignals)[number];
export type CapacityFreshness = 'fresh' | 'stale' | 'unknown';
export const capacityCountBands = [
  'none',
  'one_to_four',
  'five_to_nine',
  'ten_or_more',
  'unknown',
] as const;
export type CapacityCountBand = (typeof capacityCountBands)[number];

export interface CapacityFact {
  signal: CapacitySignal;
  availableCount: number;
  observedAt: Date;
  freshUntil: Date;
  sourceCode: string;
}

export interface FacilityEligibilityInput {
  active: boolean;
  locationVerified: boolean;
  licenseVerified: boolean;
  licenseExpiresAt?: Date | null;
  facilityType: DiscoveryFacilityType;
  services: readonly string[];
}

export interface FacilitySearchFilter {
  facilityType?: DiscoveryFacilityType;
  service?: string;
  now: Date;
}

export interface RankedFacility {
  facilityId: string;
  distanceM: number | null;
}

export const sosIncidentStatuses = ['active_unmatched', 'matched', 'accepted', 'closed'] as const;
export type SosIncidentStatus = (typeof sosIncidentStatuses)[number];
export const sosReasonCodes = [
  'medical_emergency',
  'accident_or_injury',
  'other_life_safety',
] as const;
export type SosReasonCode = (typeof sosReasonCodes)[number];

export const emergencyShareStatuses = ['active', 'used', 'revoked', 'expired'] as const;
export type EmergencyShareStatus = (typeof emergencyShareStatuses)[number];
export const emergencyShareFields = [
  'blood_group',
  'confirmed_allergies',
  'active_dispensed_medicines',
  'chronic_conditions',
  'emergency_notes',
] as const;
export type EmergencyShareField = (typeof emergencyShareFields)[number];

export interface SosPermissionContext {
  isSelf: boolean;
  relationshipActive: boolean;
  relationshipValidNow: boolean;
  permissions: readonly string[];
  requestedPermission: 'sos.activate' | 'sos.share';
}

export interface EmergencyProfileSources {
  blood_group?: string | null;
}

export interface EmergencyContactProjectionInput {
  incidentActive: boolean;
  contactPreference: 'none' | 'all_confirmed';
  contactStatus: 'pending' | 'confirmed' | 'declined' | 'revoked' | 'expired';
  locationPrecision: 'none' | 'coarse' | 'exact';
  coarseLocation?: string;
  exactLocation?: string;
  patientDisplayName: string;
  incidentTime: string;
  callbackNumber: string;
}
