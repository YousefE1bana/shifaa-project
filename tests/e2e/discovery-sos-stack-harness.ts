import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';

import { buildApp } from '../../services/api/src/app.ts';
import { loadConfig } from '../../services/api/src/config.ts';
import {
  discoverySosSyntheticConfig,
  discoverySosSyntheticContact,
  discoverySosSyntheticFacilities,
  discoverySosSyntheticLocations,
  discoverySosSyntheticPatients,
  discoverySosSyntheticPeople,
  discoverySosSyntheticRelationships,
} from '../../packages/test-kit/src/discovery-sos.ts';
import postgres from 'postgres';

export const ownerDatabaseUrl =
  'postgresql://shifaa_owner:synthetic_owner_only@127.0.0.1:5432/shifaa';
export const apiDatabaseUrl = 'postgresql://shifaa_api:synthetic_api_only@127.0.0.1:5432/shifaa';
export const workerDatabaseUrl =
  'postgresql://shifaa_worker:synthetic_worker_only@127.0.0.1:5432/shifaa';

export async function createDiscoverySosStack() {
  const owner = postgres(ownerDatabaseUrl, { max: 2 });

  // Load baseline discovery-sos facility/license/capacity fixtures if not already present
  const fixturePath = new URL('../../infra/db/fixtures/discovery-sos.sql', import.meta.url);
  await owner.unsafe(readFileSync(fixturePath, 'utf8'));

  // Ensure synthetic capacity projection freshness window is aligned with current transaction time
  await owner`
    UPDATE hospital.capacity_projections
    SET observed_at = statement_timestamp() - interval '1 minute',
        fresh_until = CASE facility_id
          WHEN '63000000-0000-4000-8000-000000000003'::uuid THEN statement_timestamp() - interval '1 second'
          ELSE statement_timestamp() + interval '10 minutes'
        END,
        signal = CASE facility_id
          WHEN '63000000-0000-4000-8000-000000000001'::uuid THEN 'available'
          WHEN '63000000-0000-4000-8000-000000000002'::uuid THEN 'limited'
          ELSE signal
        END,
        emergency_available_count = CASE facility_id
          WHEN '63000000-0000-4000-8000-000000000001'::uuid THEN 5
          WHEN '63000000-0000-4000-8000-000000000002'::uuid THEN 1
          ELSE emergency_available_count
        END,
        emergency_held_count = CASE facility_id
          WHEN '63000000-0000-4000-8000-000000000001'::uuid THEN 1
          WHEN '63000000-0000-4000-8000-000000000002'::uuid THEN 0
          ELSE emergency_held_count
        END
  `;

  // Clean any lingering runtime incidents from previous runs before starting
  await cleanRuntimeState(owner);

  const baseConfig = loadConfig({ NODE_ENV: 'test' });
  const harness = await buildApp({
    config: {
      ...baseConfig,
      repositoryAdapter: 'postgres',
      databaseUrl: apiDatabaseUrl,
      discoverySosEnabled: true,
    },
    clock: { now: () => new Date() },
  });

  return {
    ...harness,
    owner,
    ids: {
      people: discoverySosSyntheticPeople,
      patients: discoverySosSyntheticPatients,
      facilities: discoverySosSyntheticFacilities,
      locations: discoverySosSyntheticLocations,
      config: discoverySosSyntheticConfig,
      relationships: discoverySosSyntheticRelationships,
      contact: discoverySosSyntheticContact,
    },
    clean: () => cleanRuntimeState(owner),
    close: async () => {
      await cleanRuntimeState(owner);
      await harness.app.close();
      await owner.end({ timeout: 5 });
    },
  };
}

async function cleanRuntimeState(owner: postgres.Sql) {
  await owner.begin(async (sql) => {
    await sql`alter table platform.sos_incidents disable trigger user`;
    await sql`alter table platform.emergency_share_links disable trigger user`;
    await sql`alter table platform.outbox_events disable trigger user`;
    await sql`alter table platform.notifications disable trigger user`;
    await sql`alter table platform.notification_delivery_attempts disable trigger user`;
    await sql`alter table platform.synthetic_message_receipts disable trigger user`;
    await sql`alter table platform.idempotency_records disable trigger user`;
    await sql`alter table audit.events disable trigger user`;

    await sql`delete from platform.event_receipts where consumer = 'discovery-sos-contact-worker' or event_id in (select id from platform.outbox_events where event_type in ('sos.incident.created','sos.incident.accepted','sos.incident.closed','sos.share.created','sos.share.revoked','sos.share.viewed','sos.emergency_contact.requested') or aggregate_type in ('sos-incident','sos-contact','discovery-sos'))`;
    await sql`delete from platform.notification_delivery_attempts where source_event_id in (select id from platform.outbox_events where event_type = 'sos.emergency_contact.requested')`;
    await sql`delete from platform.synthetic_message_receipts where true`;
    await sql`delete from platform.notifications where recipient_type = 'emergency_contact'`;
    await sql`delete from platform.outbox_events where event_type in ('sos.incident.created','sos.incident.accepted','sos.incident.closed','sos.share.created','sos.share.revoked','sos.share.viewed','sos.emergency_contact.requested') or aggregate_type in ('sos-incident','sos-contact','discovery-sos')`;
    await sql`delete from platform.emergency_share_links where true`;
    await sql`delete from platform.sos_incidents where true`;
    await sql`delete from platform.idempotency_records where route like '%sos%' or route like '%discovery%'`;
    await sql`delete from audit.events where resource_type in ('discovery-sos','emergency-share') or action like 'sos.%'`;

    await sql`alter table audit.events enable trigger user`;
    await sql`alter table platform.idempotency_records enable trigger user`;
    await sql`alter table platform.notification_delivery_attempts enable trigger user`;
    await sql`alter table platform.synthetic_message_receipts enable trigger user`;
    await sql`alter table platform.notifications enable trigger user`;
    await sql`alter table platform.outbox_events enable trigger user`;
    await sql`alter table platform.emergency_share_links enable trigger user`;
    await sql`alter table platform.sos_incidents enable trigger user`;
  });
}

export const person = (id: string) => `Bearer synthetic-person:${id}`;
export const admin = (role: string, id: string) => `Bearer synthetic-admin:${role}:${id}`;
export const key = (label?: string) => `discovery-sos-e2e-${label ?? randomUUID()}`;
