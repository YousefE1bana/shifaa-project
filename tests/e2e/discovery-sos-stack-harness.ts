import { randomUUID, randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';

import {
  discoverySosSyntheticConfig,
  discoverySosSyntheticContact,
  discoverySosSyntheticFacilities,
  discoverySosSyntheticLocations,
  discoverySosSyntheticPatients,
  discoverySosSyntheticPeople,
  discoverySosSyntheticRelationships,
} from '../../packages/test-kit/src/discovery-sos.ts';
import type postgres from 'postgres';
import type { MessagingAdapter } from '../../services/worker/src/privacy-dsr-notifications.ts';

export async function createDiscoverySosStack(context?: object) {
  // Dynamic imports retain one ESM capability authority under Node/tsx's
  // CommonJS TypeScript loader; require(ESM) would create a second module realm.
  const { acquireTestLauncherContext, releaseTestLauncherContext, trackTestLauncherClose } =
    await import('../../tools/test-launcher-session.mjs');
  const {
    connectTestOwner,
    withTestResource,
    guardTestHandle,
    registerRunRecord,
    assertRunOwned,
    runRecordIds,
    revalidateTestResourceContext,
  } = await import('../../tools/test-resource-context.mjs');
  context = await acquireTestLauncherContext('discovery-sos', context);
  revalidateTestResourceContext(context, 'discovery-sos');
  const [{ default: postgres }, { buildApp }, { loadConfig }] = await Promise.all([
    import('postgres'),
    import('../../services/api/src/app.ts'),
    import('../../services/api/src/config.ts'),
  ]);
  const owner = (await connectTestOwner(context, 'discovery-sos', (url: string) =>
    postgres(url, { max: 2 }),
  )) as postgres.Sql;
  try {
    // Fixed-ID fixtures may be created only in the fresh, exclusively run-owned DB.
    // Reject preexisting fixture rows instead of silently upserting another run.
    const [existing] = await owner<
      { count: number }[]
    >`select count(*)::int as count from identity.facilities where id in ('63000000-0000-4000-8000-000000000001','63000000-0000-4000-8000-000000000002','63000000-0000-4000-8000-000000000003','63000000-0000-4000-8000-000000000004','63000000-0000-4000-8000-000000000005','63000000-0000-4000-8000-000000000006')`;
    if (existing?.count !== 0)
      throw new Error('test-resource-denied: preexisting discovery fixtures');
    const fixturePath = new URL('../../infra/db/fixtures/discovery-sos.sql', import.meta.url);
    await owner.unsafe(readFileSync(fixturePath, 'utf8'));

    for (const facility of Object.values(discoverySosSyntheticFacilities))
      registerRunRecord(context, 'discovery-sos', 'facility', facility);

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
    WHERE facility_id IN (${discoverySosSyntheticFacilities.nearestFreshHospital}::uuid, ${discoverySosSyntheticFacilities.fartherFreshHospital}::uuid, ${discoverySosSyntheticFacilities.staleHospital}::uuid)
  `;

    const baseConfig = loadConfig({ NODE_ENV: 'test' });
    const harness = await withTestResource(
      context,
      'discovery-sos',
      'api',
      async (databaseUrl: string) =>
        buildApp({
          config: {
            ...baseConfig,
            repositoryAdapter: 'postgres',
            databaseUrl,
            discoverySosEnabled: true,
          },
          clock: { now: () => new Date() },
        }),
    );

    const incidents = new Set<string>();
    const rawApp = harness.app;
    const inject = rawApp.inject.bind(rawApp);
    // Retain exact IDs returned by this run; no event-type/global cleanup.
    rawApp.inject = (async (options: any) => {
      revalidateTestResourceContext(context, 'discovery-sos');
      const response = await inject(options);
      if (
        options.method === 'POST' &&
        response.statusCode === 201 &&
        response.headers['content-type']?.includes('json')
      ) {
        const body = response.json();
        for (const [kind, value] of [
          ['incident', body.incident?.incident_id],
          ['share', body.share?.share_id],
        ] as const) {
          if (value) {
            registerRunRecord(context, 'discovery-sos', kind, value);
            if (kind === 'incident') incidents.add(value);
          }
        }
      }
      return response;
    }) as typeof rawApp.inject;
    harness.app = guardTestHandle(context, 'discovery-sos', rawApp, ['inject']);
    const clean = async () => {
      for (const incidentId of incidents) {
        assertRunOwned(context, 'discovery-sos', 'incident', incidentId);
        const headers = {
          authorization: person(discoverySosSyntheticPeople.patient),
          'x-shifaa-patient-context': discoverySosSyntheticPatients.subject,
          'x-purpose': 'emergency_care',
        };
        const current = await harness.app.inject({
          method: 'GET',
          url: `/v1/sos/incidents/${incidentId}`,
          headers,
        });
        if (current.statusCode !== 200)
          throw new Error('owned incident unavailable; preserve resources');
        const incident = current.json().incident;
        if (incident.status === 'closed') continue;
        const closed = await harness.app.inject({
          method: 'POST',
          url: `/v1/sos/incidents/${incidentId}/close`,
          headers: { ...headers, 'if-match': `"${incident.version}"`, 'idempotency-key': key() },
          payload: { outcome_code: 'no_longer_needed' },
        });
        if (closed.statusCode !== 200)
          throw new Error('owned incident close failed; preserve resources');
      }
    };

    const contact: { confirmed: string } = { ...discoverySosSyntheticContact };
    return {
      app: harness.app,
      owner,
      ids: {
        people: discoverySosSyntheticPeople,
        patients: discoverySosSyntheticPatients,
        facilities: discoverySosSyntheticFacilities,
        locations: discoverySosSyntheticLocations,
        config: discoverySosSyntheticConfig,
        relationships: discoverySosSyntheticRelationships,
        contact,
      },
      context,
      clean,
      createWorker: async (adapter: MessagingAdapter, workerId?: string) =>
        withTestResource(context, 'discovery-sos', 'worker', async (url: string) => {
          const { PostgresDiscoverySosProcessor } = await import(
            '../../services/worker/src/discovery-sos.ts'
          );
          revalidateTestResourceContext(context, 'discovery-sos');
          const worker = new PostgresDiscoverySosProcessor(url, adapter, workerId);
          worker.close = trackTestLauncherClose(
            'discovery-sos',
            context,
            worker.close.bind(worker),
          );
          return guardTestHandle(context, 'discovery-sos', worker, ['processNext']);
        }),
      createDurableProvider: async () =>
        withTestResource(context, 'discovery-sos', 'worker', async (url: string) => {
          const { DurableLocalSyntheticMessagingAdapter } = await import(
            '../../services/worker/src/adapters/local-synthetic-messaging.ts'
          );
          revalidateTestResourceContext(context, 'discovery-sos');
          const provider = new DurableLocalSyntheticMessagingAdapter(url);
          provider.close = trackTestLauncherClose(
            'discovery-sos',
            context,
            provider.close.bind(provider),
          );
          const guarded = guardTestHandle(context, 'discovery-sos', provider, ['send']);
          return Object.freeze({
            code: provider.code,
            send: guarded.send,
            close: guarded.close,
          });
        }),
      setContactPrecision: async (precision: 'none' | 'coarse' | 'exact') => {
        const previous = contact.confirmed;
        assertRunOwned(context, 'discovery-sos', 'contact', previous);
        const replacement = randomUUID();
        const invitation = randomBytes(32);
        await owner.begin(async (sql) => {
          await sql`select set_config('shifaa.person_id',${discoverySosSyntheticPeople.patient},true)`;
          await sql`update identity.emergency_contacts set status='revoked',revoked_by_person_id=${discoverySosSyntheticPeople.patient}::uuid,revoked_at=statement_timestamp(),decision_reason_code='owner_revoked' where id=${previous}::uuid and subject_patient_id=${discoverySosSyntheticPatients.subject}::uuid`;
          await sql`insert into identity.emergency_contacts(id,subject_patient_id,created_by_person_id,display_name_ciphertext,display_name_nonce,display_name_authentication_tag,display_name_key_version,phone_ciphertext,phone_nonce,phone_authentication_tag,phone_key_version,masked_phone,phone_blind_index,preferred_locale,location_precision,status,invite_token_digest,invite_key_version,invite_expires_at)
          select ${replacement}::uuid,subject_patient_id,created_by_person_id,display_name_ciphertext,display_name_nonce,display_name_authentication_tag,display_name_key_version,phone_ciphertext,phone_nonce,phone_authentication_tag,phone_key_version,masked_phone,phone_blind_index,preferred_locale,${precision},'pending',${invitation},invite_key_version,statement_timestamp()+interval '1 day' from identity.emergency_contacts where id=${previous}::uuid and subject_patient_id=${discoverySosSyntheticPatients.subject}::uuid`;
          await sql`select * from platform.respond_emergency_contact_invite(${invitation},'confirmed')`;
        });
        registerRunRecord(context, 'discovery-sos', 'contact', replacement);
        contact.confirmed = replacement;
      },
      setCallbackRevoked: async (revoked: boolean) => {
        const callbacks = runRecordIds(context, 'discovery-sos', 'callback');
        if (callbacks.length !== 1) throw new Error('exact run-owned callback fixture required');
        const callbackId = callbacks[0]!;
        assertRunOwned(context, 'discovery-sos', 'callback', callbackId);
        await owner`update identity.callback_contact_verifications set revoked_at=${revoked ? new Date() : null} where person_id=${callbackId}::uuid and person_id=${discoverySosSyntheticPeople.patient}::uuid`;
      },
      close: async () => {
        try {
          await harness.app.close();
        } finally {
          await owner.end({ timeout: 5 });
        }
        releaseTestLauncherContext('discovery-sos', context);
      },
    };
  } catch (error) {
    await owner.end({ timeout: 5 });
    throw error;
  }
}

export const person = (id: string) => `Bearer synthetic-person:${id}`;
export const admin = (role: string, id: string) => `Bearer synthetic-admin:${role}:${id}`;
export const key = (label?: string) => `discovery-sos-e2e-${label ?? randomUUID()}`;
