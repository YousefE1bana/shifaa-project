import { createHash } from 'node:crypto';

import type { MessagingAdapter, MessagingResult } from '../privacy-dsr-notifications.ts';

export class LocalSyntheticMessagingAdapter implements MessagingAdapter {
  public readonly code = 'local-synthetic' as const;
  public readonly visibleMessages = new Map<string, { destinationAlias: string; digest: string }>();
  public readonly attempts: string[] = [];
  private readonly outcomes: MessagingResult['outcome'][];
  public constructor(outcomes: MessagingResult['outcome'][] = ['delivered']) {
    this.outcomes = outcomes;
  }

  public async send(input: {
    idempotencyKey: string;
    destinationAlias: string;
    renderedBody: string;
  }): Promise<MessagingResult> {
    if (!input.destinationAlias.startsWith('SYNTHETIC-'))
      throw new Error('production-messaging-disabled');
    this.attempts.push(input.idempotencyKey);
    const existing = this.visibleMessages.get(input.idempotencyKey);
    if (existing)
      return {
        outcome: 'delivered',
        providerReceiptReference: `synthetic-receipt-${input.idempotencyKey.slice(0, 16)}`,
      };
    const outcome = this.outcomes.shift() ?? 'delivered';
    if (outcome === 'accepted' || outcome === 'delivered')
      this.visibleMessages.set(input.idempotencyKey, {
        destinationAlias: input.destinationAlias,
        digest: createHash('sha256').update(input.renderedBody).digest('hex'),
      });
    return {
      outcome,
      ...(outcome === 'delivered'
        ? { providerReceiptReference: `synthetic-receipt-${input.idempotencyKey.slice(0, 16)}` }
        : { safeErrorCode: `synthetic-${outcome}` }),
    };
  }
}

export class ProductionMessagingAdapterDisabled {
  public async send(): Promise<never> {
    throw new Error('OPEN-VENDOR-002: production SMS adapter is disabled');
  }
}
