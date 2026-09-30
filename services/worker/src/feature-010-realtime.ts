import postgres, { type Sql, type TransactionSql } from 'postgres';

import { retryDecision } from '@shifaa/core/privacy-dsr-notifications/policy';

export const FEATURE_010_REALTIME_HINT_LEASE_SECONDS = 30;

export type Feature010RealtimeHintOutcome = 'delivered' | 'retry' | 'dead_letter';

export type Feature010RealtimeHintMarker = {
  readonly eventId: string;
  readonly eventType: 'clinical.context_message.created.v1';
  readonly aggregateType: 'context_message';
  readonly aggregateId: string;
  readonly aggregateVersion: number;
  readonly contextId: string | null;
  readonly attemptCount: number;
  readonly leaseExpiresAt: string;
};

export type Feature010RealtimeHintCompletion = {
  readonly eventId: string;
  readonly workerId: string;
  readonly outcome: Feature010RealtimeHintOutcome;
  readonly safeErrorCode?: string;
  readonly retryAt?: string;
};

export type Feature010RealtimeHintPorts = {
  claimNext(input: {
    readonly workerId: string;
    readonly leaseSeconds: number;
    readonly now: string;
  }): Promise<Feature010RealtimeHintMarker | null>;
  completeClaim(input: Feature010RealtimeHintCompletion): Promise<boolean>;
};

export type Feature010RealtimeHint = {
  readonly eventId: string;
  readonly contextId: string;
  readonly version: number;
};

export type Feature010RealtimeHintSink = {
  publish(hint: Feature010RealtimeHint): Promise<void>;
};

const SAFE_ERROR_CODES = {
  projectionInvalid: 'f010_hint_projection_invalid',
  publishFailed: 'f010_hint_publish_failed',
  retriesExhausted: 'f010_hint_retries_exhausted',
} as const;

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Consumes only the body-free Feature 010 context-message marker. The hint is
 * a cache invalidation signal; callers must reauthorize through REST.
 */
export class Feature010RealtimeHintProcessor {
  private readonly ports: Feature010RealtimeHintPorts;
  private readonly sink: Feature010RealtimeHintSink;
  private readonly workerId: string;
  private readonly clock: () => Date;

  public constructor(
    ports: Feature010RealtimeHintPorts,
    sink: Feature010RealtimeHintSink,
    workerId: string,
    clock: () => Date,
  ) {
    this.ports = ports;
    this.sink = sink;
    this.workerId = workerId;
    this.clock = clock;
  }

  public async processNext(): Promise<'idle' | Feature010RealtimeHintOutcome> {
    const now = this.clock();
    const marker = await this.ports.claimNext({
      workerId: this.workerId,
      leaseSeconds: FEATURE_010_REALTIME_HINT_LEASE_SECONDS,
      now: now.toISOString(),
    });
    if (marker === null) return 'idle';

    if (!isValidMarker(marker))
      return this.finish(marker.eventId, 'dead_letter', SAFE_ERROR_CODES.projectionInvalid);

    const hint: Feature010RealtimeHint = {
      eventId: marker.eventId,
      contextId: marker.contextId,
      version: marker.aggregateVersion,
    };

    try {
      await this.sink.publish(hint);
    } catch {
      const decision = retryDecision('transient', marker.attemptCount, Math.random() * 2 - 1);
      if (decision.state === 'dead_letter')
        return this.finish(marker.eventId, 'dead_letter', SAFE_ERROR_CODES.retriesExhausted);
      const retryAt = new Date(this.clock().getTime() + decision.delayMs).toISOString();
      return this.finish(marker.eventId, 'retry', SAFE_ERROR_CODES.publishFailed, retryAt);
    }

    return this.finish(marker.eventId, 'delivered');
  }

  private async finish(
    eventId: string,
    outcome: Feature010RealtimeHintOutcome,
    safeErrorCode?: string,
    retryAt?: string,
  ): Promise<Feature010RealtimeHintOutcome> {
    const completed = await this.ports.completeClaim({
      eventId,
      workerId: this.workerId,
      outcome,
      ...(safeErrorCode ? { safeErrorCode } : {}),
      ...(retryAt ? { retryAt } : {}),
    });
    if (!completed) throw new Error('feature-010-realtime-hint-lease-lost');
    return outcome;
  }
}

type SqlClaim = {
  event_id: string;
  event_type: string;
  aggregate_type: string;
  aggregate_id: string;
  aggregate_version: number;
  context_id: string | null;
  attempt_count: number;
  lease_expires_at: Date | string;
};

/** PostgreSQL adapter that exposes only the approved marker projection. */
export class PostgresFeature010RealtimeHintStore implements Feature010RealtimeHintPorts {
  private readonly sql: Sql;
  private readonly environment: 'local' | 'ci';

  public constructor(databaseUrl: string, environment: 'local' | 'ci' = 'local') {
    this.sql = postgres(databaseUrl, { max: 2, prepare: true });
    this.environment = environment;
  }

  public close() {
    return this.sql.end({ timeout: 5 });
  }

  public async claimNext(input: {
    readonly workerId: string;
    readonly leaseSeconds: number;
    readonly now: string;
  }): Promise<Feature010RealtimeHintMarker | null> {
    const [row] = await this.withSyntheticEnvironment(
      (sql) => sql<SqlClaim[]>`
        select event_id,event_type,aggregate_type,aggregate_id,aggregate_version,
          context_id,attempt_count,lease_expires_at
        from platform.claim_next_feature_010_realtime_hint_event(
          ${input.workerId},${input.leaseSeconds}
        )
      `,
    );
    if (!row) return null;
    return {
      eventId: row.event_id,
      eventType: row.event_type as Feature010RealtimeHintMarker['eventType'],
      aggregateType: row.aggregate_type as Feature010RealtimeHintMarker['aggregateType'],
      aggregateId: row.aggregate_id,
      aggregateVersion: Number(row.aggregate_version),
      contextId: row.context_id,
      attemptCount: Number(row.attempt_count),
      leaseExpiresAt: new Date(row.lease_expires_at).toISOString(),
    };
  }

  public async completeClaim(input: Feature010RealtimeHintCompletion): Promise<boolean> {
    const [row] = await this.withSyntheticEnvironment(
      (sql) => sql<{ completed: boolean }[]>`
        select platform.complete_feature_010_realtime_hint_event(
          ${input.eventId}::uuid,${input.workerId},${input.outcome},
          ${input.safeErrorCode ?? null},${input.retryAt ?? null}
        ) completed
      `,
    );
    return row?.completed === true;
  }

  private withSyntheticEnvironment<T>(query: (sql: TransactionSql) => Promise<T>): Promise<T> {
    return this.sql.begin(async (sql) => {
      await sql`select set_config('shifaa.environment',${this.environment},true)`;
      return query(sql);
    }) as Promise<T>;
  }
}

function isValidMarker(
  marker: Feature010RealtimeHintMarker,
): marker is Feature010RealtimeHintMarker & { readonly contextId: string } {
  return (
    marker.eventType === 'clinical.context_message.created.v1' &&
    marker.aggregateType === 'context_message' &&
    UUID_PATTERN.test(marker.eventId) &&
    UUID_PATTERN.test(marker.aggregateId) &&
    typeof marker.contextId === 'string' &&
    UUID_PATTERN.test(marker.contextId) &&
    Number.isSafeInteger(marker.aggregateVersion) &&
    marker.aggregateVersion > 0 &&
    Number.isSafeInteger(marker.attemptCount) &&
    marker.attemptCount > 0 &&
    Number.isFinite(Date.parse(marker.leaseExpiresAt))
  );
}
