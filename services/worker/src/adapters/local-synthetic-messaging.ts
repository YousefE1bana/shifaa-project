import { createHash } from 'node:crypto';

import postgres, { type Sql } from 'postgres';

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

export class DurableLocalSyntheticMessagingAdapter implements MessagingAdapter {
  public readonly code = 'local-synthetic' as const;
  private readonly sql: Sql;
  private readonly environment: 'local' | 'ci';

  public constructor(databaseUrl: string, environment: 'local' | 'ci' = 'local') {
    this.sql = postgres(databaseUrl, { max: 1, prepare: true });
    this.environment = environment;
  }

  public close() {
    return this.sql.end({ timeout: 5 });
  }

  public async send(input: {
    idempotencyKey: string;
    destinationAlias: string;
    renderedBody: string;
  }): Promise<MessagingResult> {
    if (!input.destinationAlias.startsWith('SYNTHETIC-')) {
      throw new Error('production-messaging-disabled');
    }
    const destinationDigest = createHash('sha256').update(input.destinationAlias).digest('hex');
    const renderedDigest = createHash('sha256').update(input.renderedBody).digest('hex');
    const receipt = await this.sql.begin(async (sql) => {
      await sql`select set_config('shifaa.environment',${this.environment},true)`;
      const [row] = await sql<{ receipt: string }[]>`
        select platform.deliver_local_synthetic_message(
          ${input.idempotencyKey},${destinationDigest},${renderedDigest}
        ) receipt`;
      if (!row) throw new Error('synthetic-provider-receipt-missing');
      return row.receipt;
    });
    return { outcome: 'delivered', providerReceiptReference: receipt };
  }
}

export class ProductionMessagingAdapterDisabled {
  public async send(): Promise<never> {
    throw new Error('OPEN-VENDOR-002: production SMS adapter is disabled');
  }
}
