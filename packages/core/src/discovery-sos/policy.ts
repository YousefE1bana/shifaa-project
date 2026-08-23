import type {
  CapacityCountBand,
  CapacityFact,
  CapacityFreshness,
  EmergencyContactProjectionInput,
  EmergencyProfileSources,
  EmergencyShareField,
  EmergencyShareStatus,
  FacilityEligibilityInput,
  FacilitySearchFilter,
  RankedFacility,
  SosIncidentStatus,
  SosPermissionContext,
} from './types.js';
import { emergencyShareFields } from './types.js';

export function facilityMatchesDiscovery(
  facility: FacilityEligibilityInput,
  filter: FacilitySearchFilter,
): boolean {
  if (!facility.active || !facility.locationVerified || !facility.licenseVerified) return false;
  if (facility.licenseExpiresAt && facility.licenseExpiresAt <= filter.now) return false;
  if (filter.facilityType && facility.facilityType !== filter.facilityType) return false;
  return !filter.service || facility.services.includes(filter.service);
}

export function capacityFreshness(
  capacity: CapacityFact | undefined,
  now: Date,
  allowedSourceCode: string | undefined,
): CapacityFreshness {
  if (!capacity || !allowedSourceCode) return 'unknown';
  if (capacity.sourceCode !== allowedSourceCode) return 'unknown';
  return capacity.observedAt <= now && now <= capacity.freshUntil ? 'fresh' : 'stale';
}

export function capacityQualifies(
  capacity: CapacityFact | undefined,
  now: Date,
  allowedSourceCode: string | undefined,
): boolean {
  if (!capacity || capacityFreshness(capacity, now, allowedSourceCode) !== 'fresh') return false;
  return ['available', 'limited'].includes(capacity.signal) && capacity.availableCount > 0;
}

export function capacityCountBand(capacity: CapacityFact | undefined): CapacityCountBand {
  if (!capacity || capacity.signal === 'unknown') return 'unknown';
  if (capacity.availableCount <= 0) return 'none';
  if (capacity.availableCount <= 4) return 'one_to_four';
  if (capacity.availableCount <= 9) return 'five_to_nine';
  return 'ten_or_more';
}

export function rankFacilities(facilities: readonly RankedFacility[]): RankedFacility[] {
  return [...facilities].sort((left, right) => {
    if (left.distanceM === null && right.distanceM !== null) return 1;
    if (left.distanceM !== null && right.distanceM === null) return -1;
    const distanceOrder = (left.distanceM ?? 0) - (right.distanceM ?? 0);
    return distanceOrder || left.facilityId.localeCompare(right.facilityId);
  });
}

const incidentTransitions: Record<SosIncidentStatus, readonly SosIncidentStatus[]> = {
  active_unmatched: ['closed'],
  matched: ['accepted', 'closed'],
  accepted: ['closed'],
  closed: [],
};

export function canTransitionSosIncident(
  current: SosIncidentStatus,
  next: SosIncidentStatus,
): boolean {
  return incidentTransitions[current].includes(next);
}

const shareTransitions: Record<EmergencyShareStatus, readonly EmergencyShareStatus[]> = {
  active: ['used', 'revoked', 'expired'],
  used: [],
  revoked: [],
  expired: [],
};

export function canTransitionEmergencyShare(
  current: EmergencyShareStatus,
  next: EmergencyShareStatus,
): boolean {
  return shareTransitions[current].includes(next);
}

export function authorizeSosPermission(context: SosPermissionContext): boolean {
  if (context.isSelf) return true;
  return (
    context.relationshipActive &&
    context.relationshipValidNow &&
    context.permissions.includes(context.requestedPermission)
  );
}

export function normalizeEmergencyShareScope(
  selectedFields: readonly EmergencyShareField[],
): EmergencyShareField[] {
  const selected = new Set(selectedFields);
  return emergencyShareFields.filter((field) => selected.has(field));
}

export function projectEmergencyShare(
  selectedFields: readonly EmergencyShareField[],
  sources: EmergencyProfileSources,
): {
  available_fields: Partial<Record<EmergencyShareField, unknown>>;
  unavailable_fields: EmergencyShareField[];
} {
  const availableFields: Partial<Record<EmergencyShareField, unknown>> = {};
  const unavailableFields: EmergencyShareField[] = [];
  for (const field of normalizeEmergencyShareScope(selectedFields)) {
    if (field === 'blood_group' && sources.blood_group)
      availableFields[field] = sources.blood_group;
    else unavailableFields.push(field);
  }
  return { available_fields: availableFields, unavailable_fields: unavailableFields };
}

export function projectEmergencyContact(input: EmergencyContactProjectionInput):
  | { allowed: true; fields: Record<string, string> }
  | {
      allowed: false;
      reason:
        | 'incident-inactive'
        | 'preference-none'
        | 'contact-unconfirmed'
        | 'location-unavailable';
    } {
  if (!input.incidentActive) return { allowed: false, reason: 'incident-inactive' };
  if (input.contactPreference !== 'all_confirmed')
    return { allowed: false, reason: 'preference-none' };
  if (input.contactStatus !== 'confirmed') return { allowed: false, reason: 'contact-unconfirmed' };
  const fields: Record<string, string> = {
    patient_display_name: input.patientDisplayName,
    message_code: 'needs_urgent_help',
    incident_time: input.incidentTime,
    callback_number: input.callbackNumber,
  };
  if (input.locationPrecision === 'coarse') {
    if (!input.coarseLocation) return { allowed: false, reason: 'location-unavailable' };
    fields['location'] = input.coarseLocation;
    fields['location_precision'] = 'coarse';
  }
  if (input.locationPrecision === 'exact') {
    if (!input.exactLocation) return { allowed: false, reason: 'location-unavailable' };
    fields['location'] = input.exactLocation;
    fields['location_precision'] = 'exact';
  }
  return { allowed: true, fields };
}

export const sosGuidance = Object.freeze({
  call_ambulance_123: true,
  ambulance_dispatched: false,
  bed_reserved: false,
});
