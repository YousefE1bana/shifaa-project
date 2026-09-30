import postgres, { type TransactionSql } from 'postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const database = process.env['SHIFAA_F010_C28_DATABASE'];
const clinician = 'f0101000-0000-4000-8000-000000000001';
const patient = 'f0101000-0000-4000-8000-000000000002';
const facility = 'f0101000-0000-4000-8200-000000000001';
const appointment = 'f0101000-0000-4000-8500-000000000001';
let sql: ReturnType<typeof postgres>;
const authorities = [
  {
    table: 'identity.facilities',
    column: 'facility_status',
    where: `id='${facility}'`,
    active: 'active',
  },
  {
    table: 'identity.facility_memberships',
    column: 'membership_status',
    where: `facility_id='${facility}' AND person_id='${clinician}'`,
    active: 'active',
  },
  {
    table: 'identity.professional_licenses',
    column: 'status',
    where: `person_id='${clinician}'`,
    active: 'verified',
  },
  {
    table: 'identity.people',
    column: 'profile_status',
    where: `id='${clinician}'`,
    active: 'active',
  },
  {
    table: 'identity.people',
    column: 'profile_status',
    where: `id='${patient}'`,
    active: 'active',
  },
] as const;
const deferred = () => {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
};

async function waitForLock(applicationName: string) {
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    const [state] =
      await sql`select wait_event_type from pg_stat_activity where application_name=${applicationName}`;
    if (state?.['wait_event_type'] === 'Lock') return;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error('Expected overlapping authority transaction to block on a row lock.');
}

async function create(transaction: TransactionSql, name: string) {
  await transaction`select set_config('application_name',${name},true),
    set_config('shifaa.person_id',${clinician},true), set_config('shifaa.actor_role','CLN',true),
    set_config('shifaa.action','createEncounter',true), set_config('shifaa.aal','2',true),
    set_config('shifaa.environment','ci',true), set_config('shifaa.test_now','2030-04-05T08:00:00Z',true),
    set_config('shifaa.purposes','appointment.scheduling',true),
    set_config('shifaa.idempotency_key',${name},true), set_config('shifaa.request_hash',${'a'.repeat(64)},true)`;
  await transaction`set local role shifaa_api`;
  return transaction`select clinical.create_encounter_api_v1(${transaction.json({ appointmentId: appointment, patientId: patient, encounterType: 'consultation' })}::jsonb)`;
}

async function restoreAuthority(authority: (typeof authorities)[number]) {
  await sql.begin(async (tx) => {
    // Fixture restoration only, in this disposable database. Revocations above
    // use the real authority triggers and creation uses the online API role.
    await tx.unsafe(`ALTER TABLE ${authority.table} DISABLE TRIGGER USER`);
    await tx.unsafe(
      `UPDATE ${authority.table} SET ${authority.column}='${authority.active}' WHERE ${authority.where}`,
    );
    await tx.unsafe(`ALTER TABLE ${authority.table} ENABLE TRIGGER USER`);
  });
}

describe.skipIf(!database)(
  'PR394 encounter authority revocation races against real PostgreSQL',
  () => {
    beforeAll(() => {
      sql = postgres(
        `postgres://shifaa_owner:synthetic_owner_only@127.0.0.1:${process.env['SHIFAA_PG_PORT'] ?? '5432'}/${database}`,
        { max: 4, onnotice: () => undefined },
      );
    });
    afterAll(async () => {
      await sql?.end();
    });

    for (const [index, authority] of authorities.entries()) {
      it(`holds ${authority.table}.${authority.column} through creation and rechecks a winning revocation`, async () => {
        const ready = deferred();
        const release = deferred();
        const creatorName = `pr394-create-first-${index}`;
        const revokerName = `pr394-revoke-after-${index}`;
        const creator = sql
          .begin(async (tx) => {
            await create(tx, creatorName);
            ready.resolve();
            await release.promise;
            throw new Error('rollback synthetic successful creation');
          })
          .catch((error: Error) => error);
        let revoker: Promise<unknown> | undefined;
        try {
          await Promise.race([
            ready.promise,
            creator.then((error) => {
              throw error;
            }),
          ]);
          revoker = sql.begin(async (tx) => {
            await tx`select set_config('application_name',${revokerName},true)`;
            await tx.unsafe(
              `UPDATE ${authority.table} SET ${authority.column}='suspended' WHERE ${authority.where}`,
            );
          });
          await waitForLock(revokerName);
        } finally {
          release.resolve();
          await creator;
          await revoker;
        }
        await restoreAuthority(authority);

        const revoked = deferred();
        const commitRevocation = deferred();
        const revocation = sql.begin(async (tx) => {
          await tx.unsafe(
            `UPDATE ${authority.table} SET ${authority.column}='suspended' WHERE ${authority.where}`,
          );
          revoked.resolve();
          await commitRevocation.promise;
        });
        const contenderName = `pr394-revoked-first-${index}`;
        let contender: Promise<unknown> | undefined;
        try {
          await Promise.race([
            revoked.promise,
            revocation.then(() => {
              throw new Error('Revocation ended before readiness.');
            }),
          ]);
          contender = sql.begin((tx) => create(tx, contenderName)).catch((error: unknown) => error);
          await waitForLock(contenderName);
          commitRevocation.resolve();
          await revocation;
          expect(await contender).toMatchObject({ code: '42501' });
          const [effects] = await sql`select
          (select count(*)::int from clinical.encounters where appointment_id=${appointment}::uuid) as encounters,
          (select status from clinical.appointments where id=${appointment}::uuid) as appointment,
          (select state from clinical.queue_entries where appointment_id=${appointment}::uuid) as queue,
          (select count(*)::int from platform.idempotency_records where route_template='/v1/encounters') as idempotency`;
          expect(effects).toMatchObject({
            encounters: 0,
            appointment: 'checked_in',
            queue: 'called',
            idempotency: 0,
          });
        } finally {
          commitRevocation.resolve();
          await revocation;
          await contender;
          await restoreAuthority(authority);
        }
      }, 15000);
    }
  },
);
