import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { buildApp, type AppHarness } from '../src/app.js';

const ids = {
  selfPerson: '60000000-0000-4000-8000-000000000001',
  activateDelegate: '60000000-0000-4000-8000-000000000002',
  shareDelegate: '60000000-0000-4000-8000-000000000003',
  hospitalMember: '60000000-0000-4000-8000-000000000004',
  patient: '61000000-0000-4000-8000-000000000001',
  hospital: '63000000-0000-4000-8000-000000000001',
} as const;

const patientHeaders = (personId: string = ids.selfPerson) => ({
  authorization: `Bearer synthetic-person:${personId}`,
  'x-shifaa-patient-context': ids.patient,
  'accept-language': 'en-EG',
});
const hospitalHeaders = (purpose: string, aal: 1 | 2 = 2) => ({
  authorization: `Bearer synthetic-person:${ids.hospitalMember}`,
  'x-purpose': purpose,
  'x-aal': String(aal),
  'accept-language': 'en-EG',
});
const activationBody = {
  managed_patient_id: ids.patient,
  coordinates: { latitude: 30.0444, longitude: 31.2357 },
  qualifying_reason_code: 'medical_emergency',
  contact_preference: 'all_confirmed',
  callback_source: 'patient_verified_contact',
  explicit_activation: true,
} as const;

describe('discovery and SOS routes', () => {
  let harness: AppHarness;

  beforeEach(async () => {
    harness = await buildApp({ clock: { now: () => new Date('2026-08-20T10:00:00.000Z') } });
  });
  afterEach(async () => harness.app.close());

  it('returns only minimum stable discovery and capacity projections', async () => {
    const discovery = await harness.app.inject({
      method: 'GET',
      url: '/v1/discovery/facilities?type=hospital&service=emergency&near=30.0444,31.2357',
      headers: { 'accept-language': 'en-EG' },
    });
    expect(discovery.statusCode).toBe(200);
    expect(discovery.headers['content-language']).toBe('en-EG');
    const body = discovery.json();
    expect(body.data.map((entry: { facility_id: string }) => entry.facility_id)).toEqual([
      ids.hospital,
      '63000000-0000-4000-8000-000000000002',
    ]);
    expect(JSON.stringify(body)).not.toMatch(/patient|ward|bed|license|available_count/);

    const capacity = await harness.app.inject({
      method: 'GET',
      url: `/v1/discovery/hospitals/${ids.hospital}/capacity`,
    });
    expect(capacity.json()).toMatchObject({
      facility_id: ids.hospital,
      capacity: { signal: 'available', count_band: 'one_to_four', freshness: 'fresh' },
    });
  });

  it('creates one explicit incident and returns canonical same-key replay', async () => {
    const request = {
      method: 'POST' as const,
      url: '/v1/sos/incidents',
      headers: { ...patientHeaders(), 'idempotency-key': 'synthetic-006-create-0001' },
      payload: activationBody,
    };
    const created = await harness.app.inject(request);
    const replay = await harness.app.inject(request);
    expect(created.statusCode).toBe(201);
    expect(replay.json()).toEqual(created.json());
    expect(created.headers['cache-control']).toBe('private, no-store');
    expect(created.json()).toMatchObject({
      incident: { status: 'matched', matched_facility: { facility_id: ids.hospital } },
      guidance: { ambulance_dispatched: false, bed_reserved: false },
    });
    const changed = await harness.app.inject({
      ...request,
      payload: { ...activationBody, contact_preference: 'none' },
    });
    expect(changed.statusCode).toBe(409);
    expect(changed.json()).toMatchObject({ code: 'idempotency-key-reused' });
  });

  it('keeps activate and share permissions independent', async () => {
    const denied = await harness.app.inject({
      method: 'POST',
      url: '/v1/sos/incidents',
      headers: {
        ...patientHeaders(ids.shareDelegate),
        'idempotency-key': 'synthetic-006-create-0002',
      },
      payload: activationBody,
    });
    expect(denied.statusCode).toBe(403);
    expect(denied.json()).toMatchObject({ code: 'sos-permission-required' });
  });

  it('accepts one matched pre-arrival only with exact facility purpose and AAL2', async () => {
    const created = await harness.app.inject({
      method: 'POST',
      url: '/v1/sos/incidents',
      headers: { ...patientHeaders(), 'idempotency-key': 'synthetic-006-create-0003' },
      payload: activationBody,
    });
    const incident = created.json().incident as { incident_id: string; version: number };
    const denied = await harness.app.inject({
      method: 'POST',
      url: `/v1/hospitals/${ids.hospital}/sos-incidents/${incident.incident_id}/accept`,
      headers: {
        ...hospitalHeaders('sos_prearrival', 1),
        'idempotency-key': 'synthetic-006-accept-0001',
        'if-match': `"${incident.version}"`,
      },
      payload: { acknowledgement: true, capacity_note_code: 'capacity_acknowledged' },
    });
    expect(denied.statusCode).toBe(403);
    const accepted = await harness.app.inject({
      method: 'POST',
      url: `/v1/hospitals/${ids.hospital}/sos-incidents/${incident.incident_id}/accept`,
      headers: {
        ...hospitalHeaders('sos_prearrival'),
        'idempotency-key': 'synthetic-006-accept-0002',
        'if-match': `"${incident.version}"`,
      },
      payload: { acknowledgement: true, capacity_note_code: 'capacity_acknowledged' },
    });
    expect(accepted.statusCode).toBe(200);
    expect(accepted.json()).toMatchObject({
      incident: { status: 'accepted', version: incident.version + 1 },
      guidance: { bed_reserved: false },
    });
  });

  it('consumes a digest-only minimum share once with uniform terminal failure', async () => {
    const created = await harness.app.inject({
      method: 'POST',
      url: '/v1/sos/incidents',
      headers: { ...patientHeaders(), 'idempotency-key': 'synthetic-006-create-0004' },
      payload: activationBody,
    });
    const incidentId = created.json().incident.incident_id as string;
    const shared = await harness.app.inject({
      method: 'POST',
      url: `/v1/sos/incidents/${incidentId}/share-links`,
      headers: {
        ...patientHeaders(ids.shareDelegate),
        'idempotency-key': 'synthetic-006-share-0001',
      },
      payload: { allowed_fields: ['blood_group', 'confirmed_allergies'] },
    });
    expect(shared.statusCode).toBe(201);
    expect(shared.headers['referrer-policy']).toBe('no-referrer');
    const shareUrl = new URL(shared.json().share_url as string);
    const token = new URLSearchParams(shareUrl.hash.slice(1)).get('token')!;
    const shares = (harness.discoverySosService as unknown as { shares: Map<string, unknown> })
      .shares;
    expect(JSON.stringify([...shares.values()])).not.toContain(token);
    const firstView = await harness.app.inject({ method: 'GET', url: `/v1/sos/share/${token}` });
    expect(firstView.statusCode).toBe(200);
    expect(firstView.headers['cache-control']).toBe('private, no-store');
    expect(firstView.headers['referrer-policy']).toBe('no-referrer');
    expect(firstView.json()).toMatchObject({
      available_fields: { blood_group: 'O+' },
      unavailable_fields: ['confirmed_allergies'],
    });
    const replay = await harness.app.inject({ method: 'GET', url: `/v1/sos/share/${token}` });
    expect(replay.statusCode).toBe(410);
    expect(replay.headers['cache-control']).toBe('private, no-store');
    expect(replay.headers['referrer-policy']).toBe('no-referrer');
    expect(replay.json().instance).toBe('/v1/sos/share/[REDACTED]');
    expect(replay.body).not.toContain(token);
    expect(replay.json()).toMatchObject({ code: 'emergency-share-expired' });
  });

  it('bounds token abuse without using bearer material as the limiter key', async () => {
    const invalidToken = 'x'.repeat(43);
    for (let attempt = 0; attempt < 30; attempt += 1) {
      const response = await harness.app.inject({
        method: 'GET',
        url: `/v1/sos/share/${invalidToken}`,
        headers: { authorization: `Bearer attacker-rotated-${attempt}` },
      });
      expect(response.statusCode).toBe(410);
    }
    const limited = await harness.app.inject({
      method: 'GET',
      url: `/v1/sos/share/${invalidToken}`,
      headers: { authorization: ['Bearer', 'attacker-rotated-final'].join(' ') },
    });
    expect(limited.statusCode).toBe(429);
    expect(limited.headers['retry-after']).toBeTruthy();
    expect(limited.headers['referrer-policy']).toBe('no-referrer');
    expect(limited.body).not.toContain(invalidToken);
    expect(limited.json()).toMatchObject({ code: 'rate-limited' });
  });

  it('bounds protected mutations by trusted network even when valid-shaped actors rotate', async () => {
    const incidentId = '70000000-0000-4000-8000-000000009999';
    for (let attempt = 0; attempt < 30; attempt += 1) {
      const actorId = `70000000-0000-4000-8000-${String(attempt).padStart(12, '0')}`;
      const response = await harness.app.inject({
        method: 'POST',
        url: `/v1/sos/incidents/${incidentId}/share-links`,
        headers: {
          authorization: `Bearer synthetic-person:${actorId}`,
          'x-shifaa-patient-context': ids.patient,
          'idempotency-key': `synthetic-rotated-actor-${String(attempt).padStart(4, '0')}`,
        },
        payload: { allowed_fields: ['blood_group'] },
      });
      expect(response.statusCode).toBe(404);
    }
    const limited = await harness.app.inject({
      method: 'POST',
      url: `/v1/sos/incidents/${incidentId}/share-links`,
      headers: {
        authorization: ['Bearer', 'synthetic-person:70000000-0000-4000-8000-000000009998'].join(
          ' ',
        ),
        'x-shifaa-patient-context': ids.patient,
        'idempotency-key': 'synthetic-rotated-actor-final',
      },
      payload: { allowed_fields: ['blood_group'] },
    });
    expect(limited.statusCode).toBe(429);
    expect(limited.json()).toMatchObject({ code: 'rate-limited' });
  });
});
