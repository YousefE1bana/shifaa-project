import { createHash } from 'node:crypto';

import {
  projectDsrNotification,
  retryDecision,
} from '@shifaa/core/privacy-dsr-notifications/policy';
import type {
  DeliveryFailureKind,
  NotificationProjectionInput,
  NotificationTemplateRelease,
} from '@shifaa/core/privacy-dsr-notifications/types';

export interface PrivacyNotificationEvent extends NotificationProjectionInput {
  aggregateId: string;
  aggregateVersion: number;
  destinationAlias: string;
}
export interface MessagingResult {
  outcome: 'accepted' | 'delivered' | 'transient_failure' | 'permanent_failure' | 'timeout';
  providerReceiptReference?: string;
  safeErrorCode?: string;
}
export interface MessagingAdapter {
  readonly code: 'local-synthetic';
  send(input: {
    idempotencyKey: string;
    destinationAlias: string;
    renderedBody: string;
  }): Promise<MessagingResult>;
}
type Receipt = {
  payloadDigest: string;
  attempts: number;
  state: 'delivered' | 'retry' | 'dead_letter';
  visibleDeliveries: number;
  nextAttemptAt?: string;
};

export class PrivacyNotificationWorker {
  public readonly receipts = new Map<string, Receipt>();
  private readonly aggregateVersions = new Map<string, number>();
  private readonly inFlight = new Map<string, Promise<Receipt>>();
  private readonly adapter: MessagingAdapter;
  private readonly now: () => Date;

  public constructor(adapter: MessagingAdapter, now = () => new Date()) {
    this.adapter = adapter;
    this.now = now;
  }

  public async consume(event: PrivacyNotificationEvent, release: NotificationTemplateRelease) {
    if (release.status !== 'published') throw new Error('notification-template-not-published');
    const projected = projectDsrNotification(event);
    if (!projected.allowed) throw new Error(projected.reason);
    const receiptKey = `${release.id}\u0000${event.sourceEventId}\u0000${event.recipientPersonId}\u0000${release.channel}`;
    const payloadDigest = createHash('sha256')
      .update(JSON.stringify(projected.payload))
      .digest('hex');
    const previous = this.receipts.get(receiptKey);
    if (previous && previous.payloadDigest !== payloadDigest)
      throw new Error('notification-dedup-payload-mismatch');
    if (previous?.state === 'delivered' || previous?.state === 'dead_letter') return previous;
    const pending = this.inFlight.get(receiptKey);
    if (pending) return pending;
    const expectedVersion = (this.aggregateVersions.get(event.aggregateId) ?? 0) + 1;
    if (event.aggregateVersion !== expectedVersion) throw new Error('notification-aggregate-gap');
    const work = this.deliver(receiptKey, payloadDigest, event, release, previous);
    this.inFlight.set(receiptKey, work);
    try {
      return await work;
    } finally {
      this.inFlight.delete(receiptKey);
    }
  }

  private async deliver(
    receiptKey: string,
    payloadDigest: string,
    event: PrivacyNotificationEvent,
    release: NotificationTemplateRelease,
    previous?: Receipt,
  ) {
    const body = event.locale === 'ar-EG' ? release.arabicBody : release.englishBody;
    const renderedBody = body.replace(/\{\{([a-z][a-z0-9_]*)\}\}/g, (_whole, name: string) =>
      String(event.fields[name]),
    );
    const result = await this.adapter.send({
      idempotencyKey: createHash('sha256').update(receiptKey).digest('hex'),
      destinationAlias: event.destinationAlias,
      renderedBody,
    });
    const attempts = (previous?.attempts ?? 0) + 1;
    if (result.outcome === 'accepted' || result.outcome === 'delivered') {
      const receipt = {
        payloadDigest,
        attempts,
        state: 'delivered' as const,
        visibleDeliveries: 1,
      };
      this.receipts.set(receiptKey, receipt);
      this.aggregateVersions.set(event.aggregateId, event.aggregateVersion);
      return receipt;
    }
    const failure: DeliveryFailureKind =
      result.outcome === 'timeout'
        ? 'timeout'
        : result.outcome === 'transient_failure'
          ? 'transient'
          : 'permanent';
    const decision = retryDecision(failure, attempts, 0);
    const receipt =
      decision.state === 'dead_letter'
        ? { payloadDigest, attempts, state: 'dead_letter' as const, visibleDeliveries: 0 }
        : {
            payloadDigest,
            attempts,
            state: 'retry' as const,
            visibleDeliveries: 0,
            nextAttemptAt: new Date(this.now().getTime() + decision.delayMs).toISOString(),
          };
    this.receipts.set(receiptKey, receipt);
    if (receipt.state === 'dead_letter')
      this.aggregateVersions.set(event.aggregateId, event.aggregateVersion);
    return receipt;
  }
}

export { PostgresPrivacyNotificationProcessor } from './postgres-privacy-notification-processor.ts';
