import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';

import postgres from 'postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';

const enabled = process.env['SHIFAA_RUN_DISCOVERY_SOS_POSTGRES'] === 'true';
const ownerUrl = 'postgresql://shifaa_owner:synthetic_owner_only@127.0.0.1:5432/shifaa';
const apiUrl = 'postgresql://shifaa_api:synthetic_api_only@127.0.0.1:5432/shifaa';
const patientPersonId = '60000000-0000-4000-8000-000000000001';
const patientId = '61000000-0000-4000-8000-000000000001';
const hospitalMemberId = '60000000-0000-4000-8000-000000000007';
const hospitalId = '63000000-0000-4000-8000-000000000001';

async function cleanRuntimeState(sql: postgres.Sql) {
  await sql.begin(async (transaction) => {
    for (const table of [
      'platform.sos_incidents',
      'platform.emergency_share_links',
      'platform.outbox_events',
      'platform.notifications',
      'platform.notification_delivery_attempts',
      'platform.synthetic_message_receipts',
      'platform.idempotency_records',
      'audit.events',
    ]) {
      await transaction.unsafe(`alter table ${table} disable trigger user`);
    }
    await transaction`delete from platform.notification_delivery_attempts where source_event_id in (select id from platform.outbox_events where event_type='sos.emergency_contact.requested')`;
    await transaction`delete from platform.synthetic_message_receipts where true`;
    await transaction`delete from platform.notifications where recipient_type='emergency_contact'`;
    await transaction`delete from platform.outbox_events where event_type like 'sos.%' or aggregate_type in ('sos-incident','sos-contact','discovery-sos')`;
    await transaction`delete from platform.emergency_share_links where true`;
    await transaction`delete from platform.sos_incidents where true`;
    await transaction`delete from platform.idempotency_records where route like '%sos%' or route like '%discovery%'`;
    await transaction`delete from audit.events where resource_type in ('discovery-sos','emergency-share') or action like 'sos.%'`;
    for (const table of [
      'audit.events',
      'platform.idempotency_records',
      'platform.notification_delivery_attempts',
      'platform.synthetic_message_receipts',
      'platform.notifications',
      'platform.outbox_events',
      'platform.emergency_share_links',
      'platform.sos_incidents',
    ]) {
      await transaction.unsafe(`alter table ${table} enable trigger user`);
    }
  });
}

describe.skipIf(!enabled)('discovery and SOS PostgreSQL adapter', () => {
  const owner = postgres(ownerUrl, { max: 1 });
  let harness: Awaited<ReturnType<typeof buildApp>>;

  beforeAll(async () => {
    const fixturePath = new URL('../../../infra/db/fixtures/discovery-sos.sql', import.meta.url);
    await owner.unsafe(readFileSync(fixturePath, 'utf8'));
    await cleanRuntimeState(owner);
    const base = loadConfig({ NODE_ENV: 'test' });
    harness = await buildApp({
      config: { ...base, repositoryAdapter: 'postgres', databaseUrl: apiUrl },
    });
  });

  afterAll(async () => {
    await cleanRuntimeState(owner);
    await harness?.app.close();
    await owner.end({ timeout: 5 });
  });

  it('keeps discovery, SOS, acceptance, sharing, audit, and outbox in forced-RLS transactions', async () => {
    const discovery = await harness.app.inject({
      method: 'GET',
      url: '/v1/discovery/facilities?type=hospital&near=30.0444,31.2357&radius=25000',
      headers: { 'accept-language': 'en-EG' },
    });
    expect(discovery.statusCode, discovery.body).toBe(200);
    expect(discovery.json().data[0]).toMatchObject({
      facility_id: hospitalId,
      operational_signal: { count_band: 'five_to_nine', freshness: 'fresh' },
    });
    expect(JSON.stringify(discovery.json())).not.toMatch(
      /available_count|emergency_available_count/,
    );

    const patientHeaders = {
      authorization: `Bearer synthetic-person:${patientPersonId}`,
      'x-shifaa-patient-context': patientId,
      'x-purpose': 'emergency_care',
    };
    const created = await harness.app.inject({
      method: 'POST',
      url: '/v1/sos/incidents',
      headers: { ...patientHeaders, 'idempotency-key': `synthetic-pg-${randomUUID()}` },
      payload: {
        managed_patient_id: patientId,
        coordinates: { latitude: 30.0444, longitude: 31.2357 },
        qualifying_reason_code: 'medical_emergency',
        contact_preference: 'none',
        callback_source: 'patient_verified_contact',
        explicit_activation: true,
      },
    });
    expect(created.statusCode, created.body).toBe(201);
    const incident = created.json().incident as { incident_id: string; version: number };

    const accepted = await harness.app.inject({
      method: 'POST',
      url: `/v1/hospitals/${hospitalId}/sos-incidents/${incident.incident_id}/accept`,
      headers: {
        authorization: `Bearer synthetic-person:${hospitalMemberId}`,
        'x-purpose': 'sos_prearrival',
        'x-aal': '2',
        'if-match': `"${incident.version}"`,
        'idempotency-key': `synthetic-pg-${randomUUID()}`,
      },
      payload: { acknowledgement: true, capacity_note_code: 'capacity_acknowledged' },
    });
    expect(accepted.statusCode, accepted.body).toBe(200);
    const acceptedIncident = accepted.json().incident as { version: number };

    const shared = await harness.app.inject({
      method: 'POST',
      url: `/v1/sos/incidents/${incident.incident_id}/share-links`,
      headers: { ...patientHeaders, 'idempotency-key': `synthetic-pg-${randomUUID()}` },
      payload: { allowed_fields: ['blood_group', 'confirmed_allergies'] },
    });
    expect(shared.statusCode, shared.body).toBe(201);
    const shareUrl = new URL(shared.json().share_url as string);
    const token = new URLSearchParams(shareUrl.hash.slice(1)).get('token')!;
    const viewed = await harness.app.inject({ method: 'GET', url: `/v1/sos/share/${token}` });
    expect(viewed.statusCode, viewed.body).toBe(200);
    expect(viewed.json()).toMatchObject({
      available_fields: { blood_group: 'O+' },
      unavailable_fields: ['confirmed_allergies'],
    });

    const createShare = (key: string) =>
      harness.app.inject({
        method: 'POST',
        url: `/v1/sos/incidents/${incident.incident_id}/share-links`,
        headers: { ...patientHeaders, 'idempotency-key': key },
        payload: { allowed_fields: ['blood_group'] },
      });
    const secondShare = await createShare(`synthetic-pg-${randomUUID()}`);
    const thirdShare = await createShare(`synthetic-pg-${randomUUID()}`);
    expect(secondShare.statusCode, secondShare.body).toBe(201);
    expect(thirdShare.statusCode, thirdShare.body).toBe(201);
    const revokeKey = `synthetic-pg-revoke-${randomUUID()}`;
    const revoked = await harness.app.inject({
      method: 'POST',
      url: `/v1/sos/share-links/${secondShare.json().share.share_id}/revoke`,
      headers: {
        ...patientHeaders,
        'if-match': '"1"',
        'idempotency-key': revokeKey,
      },
    });
    expect(revoked.statusCode, revoked.body).toBe(200);
    const crossResourceReplay = await harness.app.inject({
      method: 'POST',
      url: `/v1/sos/share-links/${thirdShare.json().share.share_id}/revoke`,
      headers: {
        ...patientHeaders,
        'if-match': '"1"',
        'idempotency-key': revokeKey,
      },
    });
    expect(crossResourceReplay.statusCode, crossResourceReplay.body).toBe(409);
    expect(crossResourceReplay.json()).toMatchObject({ code: 'idempotency-key-reused' });
    const changedVersionReplay = await harness.app.inject({
      method: 'POST',
      url: `/v1/sos/share-links/${secondShare.json().share.share_id}/revoke`,
      headers: {
        ...patientHeaders,
        'if-match': '"2"',
        'idempotency-key': revokeKey,
      },
    });
    expect(changedVersionReplay.statusCode, changedVersionReplay.body).toBe(409);
    expect(changedVersionReplay.json()).toMatchObject({ code: 'idempotency-key-reused' });

    const [stored] = await owner<{ digest_bytes: number; audits: number; outbox_events: number }[]>`
      select
        (select octet_length(token_digest)::int from platform.emergency_share_links where incident_id=${incident.incident_id}::uuid order by created_at desc limit 1) digest_bytes,
        (select count(*)::int from audit.events where resource_id in (${incident.incident_id}::uuid,${shared.json().share.share_id}::uuid)) audits,
        (select count(*)::int from platform.outbox_events where aggregate_id in (${incident.incident_id}::uuid,${shared.json().share.share_id}::uuid)) outbox_events`;
    expect(stored).toMatchObject({ digest_bytes: 32 });
    expect(stored!.audits).toBeGreaterThanOrEqual(4);
    expect(stored!.outbox_events).toBeGreaterThanOrEqual(3);

    const closed = await harness.app.inject({
      method: 'POST',
      url: `/v1/sos/incidents/${incident.incident_id}/close`,
      headers: {
        ...patientHeaders,
        'if-match': `"${acceptedIncident.version}"`,
        'idempotency-key': `synthetic-pg-${randomUUID()}`,
      },
      payload: { outcome_code: 'help_received' },
    });
    expect(closed.statusCode, closed.body).toBe(200);
  });
});
