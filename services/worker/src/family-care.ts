import { createHash } from 'node:crypto';

import { projectEmergencyAlert } from '@shifaa/core/family-care/policy';
import {
  emergencyContactStatuses,
  familyPermissionCodes,
  relationshipStatuses,
  relationshipTypes,
  type EmergencyAlertInput,
} from '@shifaa/core/family-care/types';
import { redact } from '@shifaa/observability';

export const familyEventTypes = [
  'relationship.guardianship.created',
  'relationship.guardianship.active',
  'relationship.guardianship.rejected',
  'relationship.guardianship.revoked',
  'relationship.delegation.created',
  'relationship.delegation.accepted',
  'relationship.delegation.updated',
  'relationship.delegation.revoked',
  'emergency_contact.created',
  'emergency_contact.confirmed',
  'emergency_contact.declined',
  'emergency_contact.revoked',
  'sos.emergency_contact.requested',
  'sos.emergency_contact.denied',
] as const;

export type FamilyEventType = (typeof familyEventTypes)[number];

export interface FamilyEvent {
  id: string;
  type: FamilyEventType;
  occurredAt: string;
  payload: Record<string, unknown>;
}

const relationshipFields = [
  'relationship_id',
  'subject_patient_id',
  'relationship_type',
  'status',
  'permission_codes',
  'purpose_code',
  'valid_until',
  'request_id',
] as const;
const contactFields = [
  'contact_id',
  'subject_patient_id',
  'status',
  'preferred_locale',
  'location_precision',
  'request_id',
] as const;
const deniedAlertFields = [
  'contact_id',
  'subject_patient_id',
  'reason_code',
  'request_id',
] as const;

const prohibited =
  /token|digest|phone|email|diagnos|medicat|lab|record|document|evidence|object_key|identity/i;

function closedProjection(payload: Record<string, unknown>, allowed: readonly string[]) {
  const redacted = redact(payload) as Record<string, unknown>;
  return Object.fromEntries(
    Object.entries(redacted).filter(([key]) => allowed.includes(key) && !prohibited.test(key)),
  );
}

const boundedString = (value: unknown) =>
  typeof value === 'string' && value.length > 0 && value.length <= 160;
function assertFamilyEvent(event: FamilyEvent) {
  if (!boundedString(event.id) || !familyEventTypes.includes(event.type))
    throw new Error('family-event-envelope-invalid');
  if (!boundedString(event.occurredAt) || !Number.isFinite(Date.parse(event.occurredAt)))
    throw new Error('family-event-time-invalid');
  const payload = event.payload;
  for (const [key, value] of Object.entries(payload)) {
    const allowed = event.type.startsWith('relationship.')
      ? relationshipFields
      : event.type === 'sos.emergency_contact.denied'
        ? deniedAlertFields
        : contactFields;
    if (!allowed.includes(key as never) || prohibited.test(key)) continue;
    if (key === 'permission_codes') {
      if (
        !Array.isArray(value) ||
        value.length > familyPermissionCodes.length ||
        value.some((item) => !familyPermissionCodes.includes(item as never))
      )
        throw new Error('family-event-permissions-invalid');
    } else if (key === 'relationship_type') {
      if (!relationshipTypes.includes(value as never)) throw new Error('family-event-type-invalid');
    } else if (key === 'status') {
      const statuses = event.type.startsWith('relationship.')
        ? relationshipStatuses
        : emergencyContactStatuses;
      if (!statuses.includes(value as never)) throw new Error('family-event-status-invalid');
    } else if (key === 'preferred_locale') {
      if (!['ar-EG', 'en-EG'].includes(String(value)))
        throw new Error('family-event-locale-invalid');
    } else if (key === 'location_precision') {
      if (!['none', 'coarse', 'exact'].includes(String(value)))
        throw new Error('family-event-location-invalid');
    } else if (value !== null && !boundedString(value)) {
      throw new Error('family-event-value-invalid');
    }
  }
}

export function projectFamilyEvent(event: FamilyEvent): FamilyEvent {
  assertFamilyEvent(event);
  const allowed = event.type.startsWith('relationship.')
    ? relationshipFields
    : event.type === 'sos.emergency_contact.denied'
      ? deniedAlertFields
      : contactFields;
  return {
    id: String(redact(event.id)),
    type: event.type,
    occurredAt: String(redact(event.occurredAt)),
    payload: closedProjection(event.payload, allowed),
  };
}

export function projectEmergencyContactDelivery(input: EmergencyAlertInput) {
  return projectEmergencyAlert(input);
}

type Receipt = {
  attempts: number;
  state: 'processed' | 'retry' | 'dead_letter';
  payloadHash: string;
};

export class FamilyEventWorker {
  readonly receipts = new Map<string, Receipt>();
  private readonly inFlight = new Map<string, Promise<Receipt>>();
  private readonly maxAttempts: number;

  public constructor(maxAttempts = 4) {
    this.maxAttempts = maxAttempts;
  }

  public async consume(event: FamilyEvent, handler: (event: FamilyEvent) => Promise<void>) {
    const projected = projectFamilyEvent(event);
    const payloadHash = createHash('sha256').update(JSON.stringify(projected)).digest('hex');
    const recipient = String(
      projected.payload.contact_id ?? projected.payload.relationship_id ?? 'none',
    );
    const receiptKey = `${projected.id}\u0000${recipient}\u0000${projected.type}`;
    const previous = this.receipts.get(receiptKey);
    if (previous && previous.payloadHash !== payloadHash)
      throw new Error('family-event-replay-payload-mismatch');
    if (previous?.state === 'processed' || previous?.state === 'dead_letter') return previous;
    const pending = this.inFlight.get(receiptKey);
    if (pending) return pending;
    const work = (async (): Promise<Receipt> => {
      const attempts = (this.receipts.get(receiptKey)?.attempts ?? 0) + 1;
      try {
        await handler(projected);
        const next = { attempts, state: 'processed' as const, payloadHash };
        this.receipts.set(receiptKey, next);
        return next;
      } catch {
        const next: Receipt = {
          attempts,
          state: attempts >= this.maxAttempts ? 'dead_letter' : 'retry',
          payloadHash,
        };
        this.receipts.set(receiptKey, next);
        return next;
      } finally {
        this.inFlight.delete(receiptKey);
      }
    })();
    this.inFlight.set(receiptKey, work);
    return work;
  }
}
