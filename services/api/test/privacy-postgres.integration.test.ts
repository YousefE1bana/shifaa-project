import { randomUUID } from 'node:crypto';

import { signProviderCallback } from '@shifaa/core/privacy-dsr-notifications';
import postgres from 'postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';

const enabled = process.env['SHIFAA_RUN_PRIVACY_POSTGRES'] === 'true';
const ownerUrl = 'postgresql://shifaa_owner:synthetic_owner_only@127.0.0.1:5432/shifaa';
const apiUrl = 'postgresql://shifaa_api:synthetic_api_only@127.0.0.1:5432/shifaa';
const requestId = '52000000-0000-4000-8000-000000000001';
const patient = '50000000-0000-4000-8000-000000000001';
const patientId = '51000000-0000-4000-8000-000000000001';
const dpo = '50000000-0000-4000-8000-000000000006';
const operator = '50000000-0000-4000-8000-000000000010';
const now = new Date('2026-08-13T09:00:00.000Z');

describe.skipIf(!enabled)('privacy PostgreSQL adapter', () => {
  const owner = postgres(ownerUrl, { max: 1 });
  let harness: Awaited<ReturnType<typeof buildApp>>;
  beforeAll(async () => {
    const base = loadConfig({ NODE_ENV: 'test' });
    harness = await buildApp({
      config: { ...base, repositoryAdapter: 'postgres', databaseUrl: apiUrl },
      clock: { now: () => new Date(now) },
    });
  });
  afterAll(async () => {
    await harness?.app.close();
    await owner.end({ timeout: 5 });
  });

  it('uses forced RLS for patient and purpose-limited assigned DPO projections', async () => {
    const own = await harness.app.inject({
      method: 'GET',
      url: `/v1/privacy/requests?managed_patient_id=${patientId}`,
      headers: {
        authorization: `Bearer synthetic-person:${patient}`,
        'x-shifaa-patient-context': patientId,
        'x-aal': '2',
      },
    });
    expect(own.statusCode, own.body).toBe(200);
    const ownItems = own.json().items as { id: string; patient_id: string }[];
    expect(ownItems.some((request) => request.id === requestId)).toBe(true);
    expect(ownItems.every((request) => request.patient_id === patientId)).toBe(true);
    const assigned = await harness.app.inject({
      method: 'GET',
      url: '/v1/admin/privacy/requests',
      headers: {
        authorization: `Bearer synthetic-dpo:${dpo}`,
        'x-aal': '2',
        'x-purpose': 'privacy.dsr.review',
      },
    });
    expect(assigned.statusCode, assigned.body).toBe(200);
    const [assignmentScope] = await owner<{ request_ids: string[] }[]>`
      select array_agg(request_id::text order by request_id) request_ids
      from consent.dsr_assignments
      where dpo_person_id=${dpo}::uuid and revoked_at is null`;
    const returnedIds = assigned
      .json()
      .items.map((request: { id: string }) => request.id)
      .sort();
    expect(returnedIds).toContain(requestId);
    expect(returnedIds.every((id: string) => assignmentScope?.request_ids.includes(id))).toBe(true);
  });

  it('atomically persists decision, fulfilment, audit, outbox, response, and idempotency', async () => {
    const headers = {
      authorization: `Bearer synthetic-dpo:${dpo}`,
      'x-aal': '2',
      'x-purpose': 'privacy.dsr.review',
    };
    const decisionKey = `synthetic-privacy-pg-${randomUUID()}`;
    const decided = await harness.app.inject({
      method: 'POST',
      url: `/v1/admin/privacy/requests/${requestId}/decision`,
      headers: { ...headers, 'if-match': '"2"', 'idempotency-key': decisionKey },
      payload: {
        decision: 'approve',
        reason_code: 'request.valid',
        evidence_object_id: '53000000-0000-4000-8000-000000000001',
      },
    });
    expect(decided.statusCode, decided.body).toBe(200);
    const fulfilKey = `synthetic-privacy-pg-${randomUUID()}`;
    const fulfilled = await harness.app.inject({
      method: 'POST',
      url: `/v1/admin/privacy/requests/${requestId}/fulfilment`,
      headers: { ...headers, 'if-match': '"3"', 'idempotency-key': fulfilKey },
      payload: {
        action_codes: ['export.released'],
        action_summary: 'Synthetic export released',
        evidence_object_id: '53000000-0000-4000-8000-000000000003',
        subject_notice_code: 'DSR_EXPORT_READY',
      },
    });
    expect(fulfilled.statusCode, fulfilled.body).toBe(200);
    const [counts] = await owner<any[]>`select
      (select count(*)::int from consent.data_subject_request_events where request_id=${requestId}::uuid) events,
      (select count(*)::int from audit.events where resource_id=${requestId}::uuid and action='privacy.dsr.status_changed') audits,
      (select count(*)::int from platform.outbox_events where aggregate_id=${requestId}::uuid and event_type='privacy.dsr.status_changed') outbox,
      (select count(*)::int from platform.idempotency_records where idempotency_key in (${decisionKey},${fulfilKey}) and state='completed') idempotency`;
    expect(counts).toEqual({ events: 4, audits: 2, outbox: 2, idempotency: 2 });
  });

  it('issues and consumes a private export capability once without storing plaintext', async () => {
    const headers = {
      authorization: `Bearer synthetic-person:${patient}`,
      'x-shifaa-patient-context': patientId,
      'x-aal': '2',
      'idempotency-key': `synthetic-privacy-pg-${randomUUID()}`,
    };
    const issued = await harness.app.inject({
      method: 'POST',
      url: `/v1/privacy/requests/${requestId}/download-link`,
      headers,
    });
    expect(issued.statusCode, issued.body).toBe(200);
    const token = new URL(
      `https://synthetic.invalid${issued.json().download_url}`,
    ).searchParams.get('capability')!;
    const consumeKey = `synthetic-privacy-pg-${randomUUID()}`;
    const consumed = await harness.app.inject({
      method: 'POST',
      url: `/v1/privacy/requests/${requestId}/download-link`,
      headers: { ...headers, 'idempotency-key': consumeKey },
      payload: { capability_token: token },
    });
    expect(consumed.statusCode, consumed.body).toBe(200);
    expect(consumed.headers['cache-control']).toBe('private, no-store');
    const idempotentReplay = await harness.app.inject({
      method: 'POST',
      url: `/v1/privacy/requests/${requestId}/download-link`,
      headers: { ...headers, 'idempotency-key': consumeKey },
      payload: { capability_token: token },
    });
    expect(idempotentReplay.statusCode, idempotentReplay.body).toBe(200);
    expect(idempotentReplay.rawPayload).toEqual(consumed.rawPayload);
    expect(idempotentReplay.headers['cache-control']).toBe('private, no-store');
    const replay = await harness.app.inject({
      method: 'POST',
      url: `/v1/privacy/requests/${requestId}/download-link`,
      headers: { ...headers, 'idempotency-key': `synthetic-privacy-pg-${randomUUID()}` },
      payload: { capability_token: token },
    });
    expect(replay.statusCode).toBe(410);
    const [row] = await owner<
      any[]
    >`select octet_length(token_hmac)::int digest_bytes from consent.dsr_export_capabilities where request_id=${requestId}::uuid`;
    expect(row.digest_bytes).toBe(32);
  });

  it('atomically records signed callbacks and appends authorized dead-letter replay', async () => {
    const callbackBody = {
      event_reference: randomUUID(),
      receipt_reference: `synthetic-receipt-${randomUUID()}`,
      delivery_status: 'delivered' as const,
      occurred_at: now.toISOString(),
      nonce: `synthetic-nonce-${randomUUID()}`,
    };
    const signature = signProviderCallback(
      JSON.stringify(callbackBody),
      now.toISOString(),
      'synthetic-005-callback-secret-not-production',
    );
    const callback = () =>
      harness.app.inject({
        method: 'POST',
        url: '/v1/internal/callbacks/messages/local-synthetic',
        headers: {
          'x-provider-signature': signature,
          'x-provider-timestamp': now.toISOString(),
        },
        payload: callbackBody,
      });
    expect((await callback()).statusCode).toBe(200);
    expect((await callback()).statusCode).toBe(409);
    const original = randomUUID();
    const aggregate = randomUUID();
    await owner`insert into platform.outbox_events(id,aggregate_type,aggregate_id,aggregate_version,event_type,payload,state) values(${original}::uuid,'notification-delivery',${aggregate}::uuid,1,'notification.delivery.requested','{}'::jsonb,'dead_letter')`;
    const replay = await harness.app.inject({
      method: 'POST',
      url: `/v1/internal/outbox/dead-letters/${original}/replay`,
      headers: {
        authorization: `Bearer synthetic-admin:platform_operator:${operator}`,
        'x-aal': '2',
        'x-purpose': 'platform.outbox.replay',
        'if-match': '"1"',
        'idempotency-key': `synthetic-privacy-pg-${randomUUID()}`,
      },
      payload: { reason_code: 'delivery.retry' },
    });
    expect(replay.statusCode, replay.body).toBe(202);
    const [effects] = await owner<any[]>`select
      (select count(*)::int from platform.provider_callback_receipts where event_reference=${callbackBody.event_reference}) receipts,
      (select count(*)::int from audit.events where action='notification.delivery.receipt_recorded' and resource_id=(select id from platform.provider_callback_receipts where event_reference=${callbackBody.event_reference})) callback_audits,
      (select count(*)::int from platform.outbox_replay_attempts where original_event_id=${original}::uuid) replays`;
    expect(effects).toEqual({ receipts: 1, callback_audits: 1, replays: 1 });
  });
});
