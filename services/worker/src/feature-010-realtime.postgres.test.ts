import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { after, before, describe, it } from 'node:test';

import postgres, { type Sql } from 'postgres';

const realtimeUrl = new URL('./feature-010-realtime.ts', import.meta.url);
const realtimeModule = existsSync(realtimeUrl)
  ? ((await import(realtimeUrl.href)) as Record<string, unknown>)
  : undefined;
const ownerDatabaseUrl = process.env['SHIFAA_F010_C23_OWNER_DATABASE_URL'];
const workerDatabaseUrl = process.env['SHIFAA_F010_C23_WORKER_DATABASE_URL'];
const databaseReady = Boolean(ownerDatabaseUrl && workerDatabaseUrl);
const markerType = 'clinical.context_message.created.v1';
const consumer = 'feature-010-realtime-hints';
const safeErrorCodes = {
  publishFailed: 'f010_hint_publish_failed',
  projectionInvalid: 'f010_hint_projection_invalid',
  retriesExhausted: 'f010_hint_retries_exhausted',
} as const;
const c22CiphertextFixtureHex = '01' + 'a1'.repeat(12) + 'b2'.repeat(16) + 'c3'.repeat(32);

type ClaimedMarker = {
  eventId: string;
  eventType: string;
  aggregateType: string;
  aggregateId: string;
  aggregateVersion: number;
  contextId: string | null;
  attemptCount: number;
  leaseExpiresAt: string;
};
type RealtimeStore = {
  claimNext(input: {
    workerId: string;
    leaseSeconds: number;
    now: string;
  }): Promise<ClaimedMarker | null>;
  completeClaim(input: {
    eventId: string;
    workerId: string;
    outcome: 'delivered' | 'retry' | 'dead_letter';
    safeErrorCode?: string;
    retryAt?: string;
  }): Promise<boolean>;
  close(): Promise<void>;
};
type StoreConstructor = new (databaseUrl: string, environment?: 'local' | 'ci') => RealtimeStore;
type RefreshHint = { eventId: string; contextId: string; version: number };
type ProcessorConstructor = new (
  ports: RealtimeStore,
  sink: { publish(hint: RefreshHint): Promise<void> },
  workerId: string,
  clock: () => Date,
) => { processNext(): Promise<'idle' | 'delivered' | 'retry' | 'dead_letter'> };

function storeConstructor(): StoreConstructor {
  const constructor = realtimeModule?.['PostgresFeature010RealtimeHintStore'];
  assert.equal(
    typeof constructor,
    'function',
    'C23_REALTIME_DURABLE_BOUNDARY_MISSING: PostgresFeature010RealtimeHintStore',
  );
  return constructor as StoreConstructor;
}

describe('Feature 010 realtime durable worker boundary', () => {
  it('exposes the PostgreSQL adapter boundary without a database dependency', () => {
    storeConstructor();
  });
});

describe('Feature 010 realtime durable PostgreSQL behavior', { skip: !databaseReady }, () => {
  let owner: Sql;
  let worker: Sql;
  let store: RealtimeStore;
  let fixture: { personId: string; facilityId: string; scheduleId: string; appointmentId: string };
  const insertedMessageIds = new Set<string>();
  const insertedEventIds = new Set<string>();

  before(
    async () => {
      const Store = storeConstructor();
      owner = postgres(ownerDatabaseUrl!, { max: 4, connect_timeout: 10 });
      worker = postgres(workerDatabaseUrl!, { max: 2, connect_timeout: 10 });
      store = new Store(workerDatabaseUrl!, 'local');
      await owner`
      update platform.feature_flags set enabled=true
      where code='feature_010.realtime_hints' and environment='local'
    `;
      fixture = {
        personId: randomUUID(),
        facilityId: randomUUID(),
        scheduleId: randomUUID(),
        appointmentId: randomUUID(),
      };
      await owner.begin(async (sql) => {
        await sql`
        insert into identity.people(id,user_id,display_name,profile_status)
        values(${fixture.personId}::uuid,${randomUUID()}::uuid,'F010 synthetic realtime worker fixture','active')
      `;
        await sql`
        insert into identity.facilities(
          id,facility_type,name_ar,name_en,facility_status,governorate_code,city,district,address_line,created_by_person_id
        ) values(
          ${fixture.facilityId}::uuid,'clinic','عيادة اختبارية','F010 synthetic realtime clinic','active',
          'C','Cairo','Test','Synthetic address',${fixture.personId}::uuid
        )
      `;
        await sql`
        insert into clinical.schedules(
          id,facility_id,doctor_person_id,timezone_name,valid_from,valid_to,
          slot_duration_minutes,fee_minor_units,currency_code,created_by_person_id,updated_by_person_id
        ) values(
          ${fixture.scheduleId}::uuid,${fixture.facilityId}::uuid,${fixture.personId}::uuid,'Africa/Cairo',
          '2030-04-01','2030-04-30',30,10000,'EGP',${fixture.personId}::uuid,${fixture.personId}::uuid
        )
      `;
        await sql`
        insert into clinical.appointments(
          id,patient_person_id,facility_id,doctor_person_id,schedule_id,starts_at,ends_at,
          timezone_name,civil_date,local_start,fee_minor_units,currency_code,payment_method,status,
          created_by_person_id,updated_by_person_id
        ) values(
          ${fixture.appointmentId}::uuid,${fixture.personId}::uuid,${fixture.facilityId}::uuid,
          ${fixture.personId}::uuid,${fixture.scheduleId}::uuid,'2030-04-05T06:00:00Z',
          '2030-04-05T06:30:00Z','Africa/Cairo','2030-04-05','08:00',10000,'EGP',
          'cash_on_arrival','confirmed',${fixture.personId}::uuid,${fixture.personId}::uuid
        )
      `;
      });
    },
    { timeout: 45_000 },
  );

  after(
    async () => {
      try {
        if (owner) {
          await owner.begin(async (sql) => {
            if (insertedEventIds.size) {
              const eventIds = [...insertedEventIds];
              await sql`delete from platform.event_receipts where event_id=any(${eventIds}::uuid[])`;
              await sql`delete from platform.outbox_events where id=any(${eventIds}::uuid[])`;
            }
            if (insertedMessageIds.size)
              await sql`delete from trust.messages where id=any(${[...insertedMessageIds]}::uuid[])`;
            if (fixture) {
              await sql`delete from clinical.appointments where id=${fixture.appointmentId}::uuid`;
              await sql`delete from clinical.schedules where id=${fixture.scheduleId}::uuid`;
              await sql`delete from identity.facilities where id=${fixture.facilityId}::uuid`;
              await sql`delete from identity.people where id=${fixture.personId}::uuid`;
            }
            await sql`
              update platform.feature_flags set enabled=false
              where code='feature_010.realtime_hints' and environment='local'
            `;
          });
        }
      } finally {
        const closeResults = await Promise.allSettled([
          store?.close(),
          owner?.end({ timeout: 5 }),
          worker?.end({ timeout: 5 }),
        ]);
        const closeFailure = closeResults.find(
          (result): result is PromiseRejectedResult => result.status === 'rejected',
        );
        if (closeFailure) throw closeFailure.reason;
      }
    },
    { timeout: 30_000 },
  );

  async function seedMessage(): Promise<string> {
    const messageId = randomUUID();
    await owner`
      insert into trust.messages(id,context_type,context_id,sender_person_id,body_ciphertext)
      values(${messageId}::uuid,'appointment',${fixture.appointmentId}::uuid,
        ${fixture.personId}::uuid,decode(${c22CiphertextFixtureHex},'hex'))
    `;
    insertedMessageIds.add(messageId);
    return messageId;
  }

  async function seedMarker(messageId: string, version = 1): Promise<string> {
    const eventId = randomUUID();
    await owner`
      insert into platform.outbox_events(
        id,aggregate_type,aggregate_id,aggregate_version,event_type,payload
      ) values(
        ${eventId}::uuid,'context_message',${messageId}::uuid,${version},${markerType},
        jsonb_build_object('aggregateId',${messageId}::uuid,'version',${version}::integer)
      )
    `;
    insertedEventIds.add(eventId);
    return eventId;
  }

  async function claim(workerId: string): Promise<ClaimedMarker | null> {
    return store.claimNext({ workerId, leaseSeconds: 30, now: new Date().toISOString() });
  }

  it('blocks a later aggregate version behind an earlier retry and a missing version gap', async () => {
    const messageId = await seedMessage();
    const firstId = await seedMarker(messageId, 1);
    await seedMarker(messageId, 3);
    const first = await claim('c23-order-worker');
    assert.equal(first?.eventId, firstId);
    assert.equal(first?.contextId, fixture.appointmentId);
    assert.deepEqual(Object.keys(first ?? {}).toSorted(), [
      'aggregateId',
      'aggregateType',
      'aggregateVersion',
      'attemptCount',
      'contextId',
      'eventId',
      'eventType',
      'leaseExpiresAt',
    ]);

    assert.equal(
      await store.completeClaim({
        eventId: firstId,
        workerId: 'c23-order-worker',
        outcome: 'retry',
        safeErrorCode: safeErrorCodes.publishFailed,
        retryAt: new Date(Date.now() + 60_000).toISOString(),
      }),
      true,
    );
    assert.equal(
      await claim('c23-order-worker'),
      null,
      'retrying version one blocks version three',
    );

    await owner`update platform.outbox_events set available_at=statement_timestamp()-interval '1 second' where id=${firstId}::uuid`;
    const retried = await claim('c23-order-worker');
    assert.equal(retried?.eventId, firstId);
    assert.equal(
      await store.completeClaim({
        eventId: firstId,
        workerId: 'c23-order-worker',
        outcome: 'delivered',
      }),
      true,
    );
    assert.equal(
      await claim('c23-order-worker'),
      null,
      'version three stays blocked while version two is absent',
    );
    const secondId = await seedMarker(messageId, 2);
    const second = await claim('c23-order-worker');
    assert.equal(second?.eventId, secondId);
    assert.equal(
      await store.completeClaim({
        eventId: secondId,
        workerId: 'c23-order-worker',
        outcome: 'delivered',
      }),
      true,
    );
    const third = await claim('c23-order-worker');
    assert.equal(third?.aggregateVersion, 3);
    assert.equal(
      await store.completeClaim({
        eventId: third!.eventId,
        workerId: 'c23-order-worker',
        outcome: 'delivered',
      }),
      true,
    );
  });

  it('uses SKIP LOCKED semantics for concurrent claims and gives each worker a distinct event', async () => {
    const firstMessage = await seedMessage();
    const secondMessage = await seedMessage();
    const firstId = await seedMarker(firstMessage);
    const secondId = await seedMarker(secondMessage);
    const claims = await Promise.all([claim('c23-parallel-a'), claim('c23-parallel-b')]);
    const claimedIds = claims.flatMap((item) => (item ? [item.eventId] : []));
    assert.equal(claimedIds.length, 2);
    assert.deepEqual(new Set(claimedIds), new Set([firstId, secondId]));
    for (const [index, item] of claims.entries()) {
      assert.equal(
        await store.completeClaim({
          eventId: item!.eventId,
          workerId: index === 0 ? 'c23-parallel-a' : 'c23-parallel-b',
          outcome: 'delivered',
        }),
        true,
      );
    }
  });

  it('records one terminal receipt and makes duplicate completion and claim harmless', async () => {
    const messageId = await seedMessage();
    const eventId = await seedMarker(messageId);
    const claimed = await claim('c23-dedupe-worker');
    assert.equal(claimed?.eventId, eventId);
    const completion = { eventId, workerId: 'c23-dedupe-worker', outcome: 'delivered' as const };
    assert.equal(await store.completeClaim(completion), true);
    assert.equal(await store.completeClaim(completion), false);
    const [row] = await owner<{ receipt_count: number }[]>`
      select count(*)::integer as receipt_count from platform.event_receipts
      where event_id=${eventId}::uuid and consumer=${consumer}
    `;
    assert.equal(row?.receipt_count, 1);
    assert.equal(await claim('c23-dedupe-worker'), null);
  });

  it('reclaims an expired lease and fences completion from its stale owner', async () => {
    const messageId = await seedMessage();
    const eventId = await seedMarker(messageId);
    const stale = await claim('c23-stale-owner');
    assert.equal(stale?.eventId, eventId);
    await owner`update platform.outbox_events set lease_expires_at=statement_timestamp()-interval '1 second' where id=${eventId}::uuid`;
    const reclaimed = await claim('c23-new-owner');
    assert.equal(reclaimed?.eventId, eventId);
    assert.equal(reclaimed?.attemptCount, (stale?.attemptCount ?? 0) + 1);
    assert.equal(
      await store.completeClaim({
        eventId,
        workerId: 'c23-stale-owner',
        outcome: 'delivered',
      }),
      false,
    );
    assert.equal(
      await store.completeClaim({
        eventId,
        workerId: 'c23-new-owner',
        outcome: 'delivered',
      }),
      true,
    );
  });

  it('stores only fixed retry and DLQ error codes and never returns marker payload', async () => {
    const messageId = await seedMessage();
    const eventId = await seedMarker(messageId);
    for (let attempt = 1; attempt <= 5; attempt += 1) {
      const claimed = await claim('c23-safe-error-worker');
      assert.equal(claimed?.eventId, eventId);
      assert.equal(claimed?.attemptCount, attempt);
      assert.equal('payload' in (claimed ?? {}), false);
      if (attempt === 1) {
        const nullDlqCode = await store
          .completeClaim({ eventId, workerId: 'c23-safe-error-worker', outcome: 'dead_letter' })
          .then(() => null)
          .catch((error: { code?: string }) => error.code ?? null);
        assert.equal(nullDlqCode, '22023');
        const hostileErrorCode = await store
          .completeClaim({
            eventId,
            workerId: 'c23-safe-error-worker',
            outcome: 'retry',
            safeErrorCode: 'f010_noteBody_sensitive_canary',
            retryAt: new Date(Date.now() + 60_000).toISOString(),
          })
          .then(() => null)
          .catch((error: { code?: string }) => error.code ?? null);
        assert.equal(hostileErrorCode, '22023');
      }
      assert.equal(
        await store.completeClaim({
          eventId,
          workerId: 'c23-safe-error-worker',
          outcome: 'retry',
          safeErrorCode: safeErrorCodes.publishFailed,
          retryAt: new Date(Date.now() + 60_000).toISOString(),
        }),
        true,
      );
      const [retryRow] = await owner<{ last_error_code: string | null }[]>`
        select last_error_code from platform.outbox_events where id=${eventId}::uuid
      `;
      assert.equal(retryRow?.last_error_code, safeErrorCodes.publishFailed);
      await owner`update platform.outbox_events set available_at=statement_timestamp()-interval '1 second' where id=${eventId}::uuid`;
    }
    const exhausted = await claim('c23-safe-error-worker');
    assert.equal(exhausted?.eventId, eventId);
    assert.equal(exhausted?.attemptCount, 6);
    assert.equal(
      await store.completeClaim({
        eventId,
        workerId: 'c23-safe-error-worker',
        outcome: 'dead_letter',
        safeErrorCode: safeErrorCodes.retriesExhausted,
      }),
      true,
    );
    const [terminal] = await owner<
      {
        state: string;
        last_error_code: string | null;
        receipt_count: number;
        payload: unknown;
      }[]
    >`
      select event.state,event.last_error_code,count(receipt.id)::integer as receipt_count,event.payload
      from platform.outbox_events event
      left join platform.event_receipts receipt on receipt.event_id=event.id and receipt.consumer=${consumer}
      where event.id=${eventId}::uuid group by event.id
    `;
    assert.deepEqual(terminal, {
      state: 'dead_letter',
      last_error_code: safeErrorCodes.retriesExhausted,
      receipt_count: 1,
      payload: { aggregateId: messageId, version: 1 },
    });
  });

  it('rejects extra clinical payload fields before they can enter the durable marker', async () => {
    const messageId = await seedMessage();
    const eventId = randomUUID();
    const result = await owner`
      insert into platform.outbox_events(
        id,aggregate_type,aggregate_id,aggregate_version,event_type,payload
      ) values(
        ${eventId}::uuid,'context_message',${messageId}::uuid,1,${markerType},
        jsonb_build_object('aggregateId',${messageId}::uuid,'version',1,'noteBody','redacted-test-value')
      )
    `
      .then(() => ({ accepted: true, code: null as string | null }))
      .catch((error: { code?: string }) => ({ accepted: false, code: error.code ?? null }));
    assert.deepEqual(result, { accepted: false, code: '23514' });
    const [stored] = await owner<{ event_count: number }[]>`
      select count(*)::integer as event_count from platform.outbox_events where id=${eventId}::uuid
    `;
    assert.equal(stored?.event_count, 0);
  });

  it('denies the worker role direct reads of ciphertext and the shared queue tables', async () => {
    const messageId = await seedMessage();
    const eventId = await seedMarker(messageId);
    const [privileges] = await owner<{ message_read: boolean; receipts_read: boolean }[]>`
      select has_table_privilege('shifaa_worker','trust.messages'::regclass,'SELECT') as message_read,
        has_table_privilege('shifaa_worker','platform.event_receipts'::regclass,'SELECT') as receipts_read
    `;
    assert.deepEqual(privileges, { message_read: false, receipts_read: false });
    await assert.rejects(worker`select body_ciphertext from trust.messages limit 1`);
    const markerRows = await worker.begin(async (sql) => {
      await sql`select set_config('shifaa.environment','local',true)`;
      return sql<{ id: string; payload: unknown }[]>`
        select id,payload from platform.outbox_events where id=${eventId}::uuid
      `;
    });
    assert.equal(
      markerRows.length,
      0,
      'F010 marker payload is hidden by outbox RLS from the worker role',
    );
    await owner`delete from platform.outbox_events where id=${eventId}::uuid`;
  });

  it('publishes only the three-field hint and records the durable terminal receipt', async () => {
    const Processor = realtimeModule?.['Feature010RealtimeHintProcessor'] as
      | ProcessorConstructor
      | undefined;
    assert.equal(typeof Processor, 'function', 'C23_REALTIME_PROCESSOR_BOUNDARY_MISSING');
    const messageId = await seedMessage();
    const eventId = await seedMarker(messageId);
    const hints: RefreshHint[] = [];
    const processor = new Processor!(
      store,
      {
        async publish(hint) {
          hints.push(hint);
        },
      },
      'c23-processor-worker',
      () => new Date(),
    );
    assert.equal(await processor.processNext(), 'delivered');
    assert.deepEqual(hints, [{ eventId, contextId: fixture.appointmentId, version: 1 }]);
    assert.deepEqual(Object.keys(hints[0] ?? {}).toSorted(), ['contextId', 'eventId', 'version']);
    const [durable] = await owner<{ state: string; receipt_count: number }[]>`
      select event.state,count(receipt.id)::integer as receipt_count
      from platform.outbox_events event
      left join platform.event_receipts receipt on receipt.event_id=event.id and receipt.consumer=${consumer}
      where event.id=${eventId}::uuid group by event.id
    `;
    assert.deepEqual(durable, { state: 'delivered', receipt_count: 1 });
  });

  it('dead-letters a body-free marker with no current message routing row', async () => {
    const Processor = realtimeModule?.['Feature010RealtimeHintProcessor'] as
      | ProcessorConstructor
      | undefined;
    assert.equal(typeof Processor, 'function', 'C23_REALTIME_PROCESSOR_BOUNDARY_MISSING');
    const missingMessageId = randomUUID();
    const eventId = randomUUID();
    await owner`
      insert into platform.outbox_events(
        id,aggregate_type,aggregate_id,aggregate_version,event_type,payload
      ) values(
        ${eventId}::uuid,'context_message',${missingMessageId}::uuid,1,${markerType},
        jsonb_build_object('aggregateId',${missingMessageId}::uuid,'version',1)
      )
    `;
    insertedEventIds.add(eventId);
    const hints: RefreshHint[] = [];
    const processor = new Processor!(
      store,
      {
        async publish(hint) {
          hints.push(hint);
        },
      },
      'c23-missing-route-worker',
      () => new Date(),
    );
    assert.equal(await processor.processNext(), 'dead_letter');
    assert.deepEqual(hints, []);
    const [poison] = await owner<
      { state: string; last_error_code: string | null; receipt_count: number }[]
    >`
      select event.state,event.last_error_code,count(receipt.id)::integer as receipt_count
      from platform.outbox_events event
      left join platform.event_receipts receipt on receipt.event_id=event.id and receipt.consumer=${consumer}
      where event.id=${eventId}::uuid group by event.id
    `;
    assert.deepEqual(poison, {
      state: 'dead_letter',
      last_error_code: safeErrorCodes.projectionInvalid,
      receipt_count: 1,
    });
  });

  it('keeps the production gate disabled and rejects even a tampered production activation', async () => {
    const messageId = await seedMessage();
    await seedMarker(messageId);
    const [initial] = await owner<{ enabled: boolean }[]>`
      select enabled from platform.feature_flags
      where code='feature_010.realtime_hints' and environment='production'
    `;
    assert.equal(initial?.enabled, false);
    await owner`
      update platform.feature_flags set enabled=true
      where code='feature_010.realtime_hints' and environment='production'
    `;
    try {
      const claims = await worker.begin(async (sql) => {
        await sql`select set_config('shifaa.environment','production',true)`;
        return sql<{ event_id: string }[]>`
          select event_id from platform.claim_next_feature_010_realtime_hint_event('c23-production-probe',30)
        `;
      });
      assert.equal(claims.length, 0);
    } finally {
      await owner`
        update platform.feature_flags set enabled=false
        where code='feature_010.realtime_hints' and environment='production'
      `;
    }
  });
});
