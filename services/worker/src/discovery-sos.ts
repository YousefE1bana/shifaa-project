import { createHash } from 'node:crypto';

import { projectEmergencyAlert } from '@shifaa/core/family-care/policy';

import type { MessagingAdapter, MessagingResult } from './privacy-dsr-notifications.ts';

export const SOS_CONTACT_TEMPLATE_CODE = 'SOS_LIFE_SAFETY';

const templateFields = [
  'callback_number',
  'incident_time',
  'location',
  'location_precision',
  'patient_display_name',
] as const;
const requiredTemplateFields = [
  'callback_number',
  'incident_time',
  'patient_display_name',
] as const;
const prohibitedSourceField = /diagnos|medicat|lab|admission|record/i;
const placeholderPattern = /\{\{([a-z][a-z0-9_]*)\}\}/g;

export type SosContactLocale = 'ar-EG' | 'en-EG';
export type SosLocationPrecision = 'none' | 'coarse' | 'exact';
export type SosContactProcessingOutcome = 'delivered' | 'retry' | 'dead_letter';

export interface SosContactCandidate {
  contact_id: string;
  patient_id: string;
  patient_display_name: string;
  preferred_locale: SosContactLocale;
  location_precision: SosLocationPrecision;
  location_value: string | null;
  incident_time: Date;
  callback_number: string;
}

export interface SosContactTemplateRelease {
  id: string;
  template_code: string;
  release_version: number;
  channel: 'sms';
  arabic_body: string;
  english_body: string;
  allowed_recipient_types: readonly string[];
  allowed_field_schema: {
    properties: Record<string, { type: string }>;
    required: string[];
  };
  status: 'published';
  effective_at: Date;
}

export interface SosContactProjection {
  contactId: string;
  locale: SosContactLocale;
  locationPrecision: SosLocationPrecision;
  fields: Record<(typeof templateFields)[number], string>;
  renderedBody: string;
  renderedDigest: string;
  destinationAlias: string;
}

export function assertSafeSosEventPayload(payload: Record<string, unknown>): void {
  const pending: unknown[] = [payload];
  while (pending.length > 0) {
    const current = pending.pop();
    if (Array.isArray(current)) {
      pending.push(...current);
      continue;
    }
    if (!current || typeof current !== 'object') continue;
    for (const [field, value] of Object.entries(current)) {
      if (prohibitedSourceField.test(field)) throw new Error('sos-contact-source-field-denied');
      pending.push(value);
    }
  }
}

export function projectSosContactDelivery(
  candidate: SosContactCandidate,
  release: SosContactTemplateRelease,
): SosContactProjection {
  assertCandidate(candidate);
  assertTemplate(release);
  const projected = projectEmergencyAlert({
    sourceEventType: 'sos.emergency_contact.requested',
    incidentActive: true,
    incidentQualifying: true,
    contactStatus: 'confirmed',
    patientDisplayName: candidate.patient_display_name,
    incidentTime: candidate.incident_time.toISOString(),
    callbackNumber: candidate.callback_number,
    locationPrecision: candidate.location_precision,
    location:
      candidate.location_precision === 'coarse'
        ? { coarse: candidate.location_value ?? undefined }
        : { exact: candidate.location_value ?? undefined },
  });
  if (!projected.allowed) throw new Error(`sos-contact-${projected.reason}`);
  const fields = {
    callback_number: projected.payload.callback_number!,
    incident_time: projected.payload.incident_time!,
    location: projected.payload.location ?? '',
    location_precision: projected.payload.location_precision ?? '',
    patient_display_name: projected.payload.patient_display_name!,
  };
  const body = candidate.preferred_locale === 'ar-EG' ? release.arabic_body : release.english_body;
  const renderedBody = body.replace(
    placeholderPattern,
    (_placeholder, field: string) => fields[field as keyof typeof fields] ?? '',
  );
  return {
    contactId: candidate.contact_id,
    locale: candidate.preferred_locale,
    locationPrecision: candidate.location_precision,
    fields,
    renderedBody,
    renderedDigest: createHash('sha256').update(renderedBody).digest('hex'),
    destinationAlias: `SYNTHETIC-CONTACT-${candidate.contact_id}`,
  };
}

export function sosProviderIdempotencyKey(input: {
  releaseId: string;
  sourceEventId: string;
  contactId: string;
}): string {
  return createHash('sha256')
    .update(`${input.releaseId}\u0000${input.sourceEventId}\u0000${input.contactId}\u0000sms`)
    .digest('hex');
}

export function aggregateSosContactOutcomes(
  outcomes: readonly SosContactProcessingOutcome[],
): SosContactProcessingOutcome {
  if (outcomes.includes('retry')) return 'retry';
  if (outcomes.includes('dead_letter')) return 'dead_letter';
  return 'delivered';
}

export function sosFailureKind(outcome: MessagingResult['outcome']) {
  if (outcome === 'timeout') return 'timeout' as const;
  if (outcome === 'transient_failure') return 'transient' as const;
  return 'permanent' as const;
}

export function assertLocalSyntheticAdapter(adapter: MessagingAdapter): void {
  if (adapter.code !== 'local-synthetic') throw new Error('production-messaging-disabled');
}

function assertCandidate(candidate: SosContactCandidate): void {
  if (!['ar-EG', 'en-EG'].includes(candidate.preferred_locale))
    throw new Error('sos-contact-locale-invalid');
  if (!['none', 'coarse', 'exact'].includes(candidate.location_precision))
    throw new Error('sos-contact-location-precision-invalid');
  if (candidate.location_precision === 'none' && candidate.location_value !== null)
    throw new Error('sos-contact-location-overdisclosure');
  if (candidate.location_precision !== 'none' && !candidate.location_value)
    throw new Error('sos-contact-location-unavailable');
  if (!Number.isFinite(candidate.incident_time.getTime()))
    throw new Error('sos-contact-incident-time-invalid');
  if (!candidate.patient_display_name || !candidate.callback_number)
    throw new Error('sos-contact-required-field-missing');
}

function assertTemplate(release: SosContactTemplateRelease): void {
  if (
    release.template_code !== SOS_CONTACT_TEMPLATE_CODE ||
    release.channel !== 'sms' ||
    release.status !== 'published' ||
    release.allowed_recipient_types.length !== 1 ||
    release.allowed_recipient_types[0] !== 'emergency_contact'
  )
    throw new Error('sos-contact-template-governance-invalid');
  const properties = Object.keys(release.allowed_field_schema.properties).toSorted();
  const required = [...release.allowed_field_schema.required].toSorted();
  if (
    JSON.stringify(properties) !== JSON.stringify([...templateFields].toSorted()) ||
    JSON.stringify(required) !== JSON.stringify([...requiredTemplateFields].toSorted()) ||
    properties.some((field) => release.allowed_field_schema.properties[field]?.type !== 'string')
  )
    throw new Error('sos-contact-template-schema-invalid');
  if (prohibitedSourceField.test(`${release.arabic_body}\n${release.english_body}`))
    throw new Error('sos-contact-template-content-denied');
  const arabic = [...release.arabic_body.matchAll(placeholderPattern)]
    .map((match) => match[1]!)
    .toSorted();
  const english = [...release.english_body.matchAll(placeholderPattern)]
    .map((match) => match[1]!)
    .toSorted();
  if (
    JSON.stringify(arabic) !== JSON.stringify([...templateFields].toSorted()) ||
    JSON.stringify(english) !== JSON.stringify([...templateFields].toSorted())
  )
    throw new Error('sos-contact-template-placeholder-invalid');
}

export { PostgresDiscoverySosProcessor } from './postgres-discovery-sos-processor.ts';
