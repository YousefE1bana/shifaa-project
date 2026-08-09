export const allowedEventTypes = [
  'identity.verification.changed',
  'identity.manual_review.requested',
  'consent.changed',
] as const;
export type EventType = (typeof allowedEventTypes)[number];
export type IdentityEvent = {
  id: string;
  type: EventType;
  occurredAt: string;
  payload: Record<string, unknown>;
};
export type Receipt = {
  eventId: string;
  state: 'processed' | 'retry' | 'dead_letter';
  attempts: number;
  nextAttemptAt?: string;
  reason?: string;
};

const payloadAllowList: Record<EventType, readonly string[]> = {
  'identity.verification.changed': ['subject_id', 'case_id', 'status'],
  'identity.manual_review.requested': ['subject_id', 'case_id', 'status'],
  'consent.changed': ['subject_id', 'purpose_id', 'status'],
};

export const projectEvent = (event: IdentityEvent): IdentityEvent => {
  const allowed = payloadAllowList[event.type];
  const payload = Object.fromEntries(
    Object.entries(event.payload).filter(([key]) => allowed.includes(key)),
  );
  return { ...event, payload };
};

export class IdentityOnboardingWorker {
  readonly receipts = new Map<string, Receipt>();
  private readonly maxAttempts: number;
  private readonly baseDelayMs: number;

  constructor(maxAttempts = 4, baseDelayMs = 1_000) {
    this.maxAttempts = maxAttempts;
    this.baseDelayMs = baseDelayMs;
  }

  async consume(
    event: IdentityEvent,
    handler: (event: IdentityEvent) => Promise<void>,
    now = new Date(),
  ): Promise<Receipt> {
    const previous = this.receipts.get(event.id);
    if (previous?.state === 'processed' || previous?.state === 'dead_letter') return previous;
    const attempts = (previous?.attempts ?? 0) + 1;
    try {
      await handler(projectEvent(event));
      const receipt: Receipt = { eventId: event.id, state: 'processed', attempts };
      this.receipts.set(event.id, receipt);
      return receipt;
    } catch (error) {
      if (attempts >= this.maxAttempts) {
        const receipt: Receipt = {
          eventId: event.id,
          state: 'dead_letter',
          attempts,
          reason: 'handler_failed',
        };
        this.receipts.set(event.id, receipt);
        return receipt;
      }
      const delay = Math.min(this.baseDelayMs * 2 ** (attempts - 1), 60_000);
      const receipt: Receipt = {
        eventId: event.id,
        state: 'retry',
        attempts,
        nextAttemptAt: new Date(now.getTime() + delay).toISOString(),
        reason: error instanceof Error ? error.name : 'handler_failed',
      };
      this.receipts.set(event.id, receipt);
      return receipt;
    }
  }
}
