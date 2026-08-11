export const facilityEventTypes = [
  'facility.changed',
  'professional_license.changed',
  'membership.changed',
  'admin_role.changed',
] as const;
export type FacilityEventType = (typeof facilityEventTypes)[number];
export interface FacilityEvent {
  id: string;
  type: FacilityEventType;
  occurredAt: string;
  payload: Record<string, unknown>;
}
const fields: Record<FacilityEventType, readonly string[]> = {
  'facility.changed': ['facility_id', 'facility_type', 'status', 'reason_code'],
  'professional_license.changed': [
    'license_id',
    'profession',
    'status',
    'expiry_band',
    'reason_code',
  ],
  'membership.changed': ['membership_id', 'facility_id', 'role_code', 'status'],
  'admin_role.changed': [
    'grant_id',
    'request_id',
    'role_code',
    'status',
    'proposer_id',
    'decider_id',
  ],
};
const prohibited =
  /license_number|document|object_key|upload_url|invite_token|address|phone|email/i;
export function projectFacilityEvent(event: FacilityEvent): FacilityEvent {
  const allowed = fields[event.type];
  const redacted = redact(event.payload) as Record<string, unknown>;
  const payload = Object.fromEntries(
    Object.entries(redacted).filter(([key]) => allowed.includes(key) && !prohibited.test(key)),
  );
  return {
    id: String(redact(event.id)),
    type: event.type,
    occurredAt: String(redact(event.occurredAt)),
    payload,
  };
}
export class FacilityEventWorker {
  readonly receipts = new Map<
    string,
    { attempts: number; state: 'processed' | 'retry' | 'dead_letter' }
  >();
  private readonly maxAttempts: number;
  private readonly inFlight = new Map<
    string,
    Promise<{ attempts: number; state: 'processed' | 'retry' | 'dead_letter' }>
  >();
  constructor(maxAttempts = 4) {
    this.maxAttempts = maxAttempts;
  }
  async consume(event: FacilityEvent, handler: (event: FacilityEvent) => Promise<void>) {
    const old = this.receipts.get(event.id);
    if (old?.state === 'processed' || old?.state === 'dead_letter') return old;
    const pending = this.inFlight.get(event.id);
    if (pending) return pending;
    const work = (async () => {
      const attempts = (this.receipts.get(event.id)?.attempts ?? 0) + 1;
      try {
        await handler(projectFacilityEvent(event));
        const next = { attempts, state: 'processed' as const };
        this.receipts.set(event.id, next);
        return next;
      } catch {
        const next = {
          attempts,
          state: (attempts >= this.maxAttempts ? 'dead_letter' : 'retry') as
            | 'dead_letter'
            | 'retry',
        };
        this.receipts.set(event.id, next);
        return next;
      } finally {
        this.inFlight.delete(event.id);
      }
    })();
    this.inFlight.set(event.id, work);
    return work;
  }
}
import { redact } from '@shifaa/observability';
