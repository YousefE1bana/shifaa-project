import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';

const database = process.env['SHIFAA_F010_C22_DATABASE'];
const host = process.env['SHIFAA_PG_HOST'] ?? '127.0.0.1';
const port = process.env['SHIFAA_PG_PORT'] ?? '5432';
const apiDatabaseUrl = database
  ? `postgresql://shifaa_api:synthetic_api_only@${host}:${port}/${database}`
  : undefined;
const patientId = 'f0101000-0000-4000-8000-000000000002';
const clinicianId = 'f0101000-0000-4000-8000-000000000001';
const endedClinicianId = 'f0101000-0000-4000-8000-000000000003';
const guardianId = 'f0101000-0000-4000-8000-000000000004';
const delegateId = 'f0101000-0000-4000-8000-000000000005';
const appointmentId = 'f0101000-0000-4000-8500-000000000004';
const encounterId = 'f0101000-0000-4000-8800-000000000002';
let harness: Awaited<ReturnType<typeof buildApp>> | undefined;

type RefreshHintFixture = Readonly<{
  eventId: string;
  contextId: string;
  version: number;
}>;

function headers(personId: string, key: string) {
  return {
    authorization: `Bearer synthetic-person:${personId}`,
    'idempotency-key': key,
    'x-aal': '2',
    'x-purpose': 'appointment.scheduling',
    'accept-language': 'en-EG',
  };
}

async function sendPayload(
  personId: string,
  key: string,
  payload: unknown,
  url = `/v1/contexts/appointment/${appointmentId}/messages`,
) {
  if (!harness) throw new Error('The C22 PostgreSQL API harness is unavailable.');
  return harness.app.inject({
    method: 'POST',
    url,
    headers: headers(personId, key),
    payload,
  });
}

async function send(personId: string, key: string, body: string) {
  return sendPayload(personId, key, { body });
}

async function list(personId: string, query = '', contextId = appointmentId) {
  if (!harness) throw new Error('The C22 PostgreSQL API harness is unavailable.');
  return harness.app.inject({
    method: 'GET',
    url: `/v1/contexts/appointment/${contextId}/messages${query}`,
    headers: headers(personId, 'f010-c22-list-key-0001'),
  });
}

async function observeRefreshHintAndRefetch(
  hint: RefreshHintFixture,
  personId: string,
  key: string,
  query = '',
) {
  // The hint carries only a context marker and ordering value. Authority comes from
  // the real REST request made after observing it, never from the hint fixture.
  return {
    history: await list(personId, query, hint.contextId),
    send: await send(personId, key, 'C23 refresh-hint authorization probe.'),
  };
}

describe.skipIf(!database)('Feature 010 message API against PostgreSQL', () => {
  beforeAll(async () => {
    if (!apiDatabaseUrl)
      throw new Error('SHIFAA_F010_C22_DATABASE is required for the PostgreSQL API smoke.');
    const base = loadConfig({ NODE_ENV: 'test' });
    harness = await buildApp({
      config: {
        ...base,
        repositoryAdapter: 'postgres',
        databaseUrl: apiDatabaseUrl,
        identityOnboardingEnabled: true,
        syntheticMode: true,
      },
    });
  });

  afterAll(async () => {
    await harness?.app.close();
  });

  it('encrypts sends, pages authorized history, replays canonically and reauthorizes revoked contexts', async () => {
    const patientBody = `${'C22 synthetic patient message canary '.padEnd(120, 'p')} مرحبًا، رسالة اختبارية طويلة.`;
    const clinicianBody = 'C22 synthetic clinician message canary.';
    const patientKey = 'f010-c22-patient-send-0001';
    const firstSend = await send(patientId, patientKey, patientBody);
    const replay = await send(patientId, patientKey, patientBody);
    const changedReplay = await send(patientId, patientKey, `${patientBody} changed`);
    const clinicianSend = await send(clinicianId, 'f010-c22-clinician-send-01', clinicianBody);

    expect(firstSend.statusCode).toBe(201);
    expect(replay.statusCode).toBe(201);
    expect(replay.json()).toEqual(firstSend.json());
    expect(changedReplay.statusCode).toBe(409);
    expect(changedReplay.json().code).toBe('idempotency-key-reused');
    expect(clinicianSend.statusCode).toBe(201);

    const rejectedPayloads: unknown[] = [
      {},
      { body: '   ' },
      ...[null, false, true, 0, 'attachment-canary', [], { type: 'image' }].flatMap((value) =>
        ['attachment', 'attachments'].map((property) => ({
          body: 'C22 invalid attachment plaintext canary.',
          [property]: value,
        })),
      ),
    ];
    for (const [index, payload] of rejectedPayloads.entries()) {
      const rejected = await sendPayload(
        patientId,
        `f010-c22-invalid-shape-${String(index).padStart(4, '0')}`,
        payload,
      );
      expect(rejected.statusCode).toBeGreaterThanOrEqual(400);
      expect(rejected.statusCode).toBeLessThan(500);
      expect(rejected.body).not.toContain('C22 invalid attachment plaintext canary.');
    }

    const foreignAppointment = await sendPayload(
      patientId,
      'f010-c22-foreign-appointment-01',
      { body: 'C22 foreign appointment plaintext canary.' },
      '/v1/contexts/appointment/f0101000-0000-4000-8500-000000000003/messages',
    );
    const foreignPerson = await sendPayload(
      'f0101000-0000-4000-8000-000000000006',
      'f010-c22-foreign-person-0001',
      { body: 'C22 foreign person plaintext canary.' },
    );
    const generalContext = await sendPayload(
      patientId,
      'f010-c22-general-context-01',
      { body: 'C22 general context plaintext canary.' },
      `/v1/contexts/general/${appointmentId}/messages`,
    );
    for (const [response, canary] of [
      [foreignAppointment, 'C22 foreign appointment plaintext canary.'],
      [foreignPerson, 'C22 foreign person plaintext canary.'],
      [generalContext, 'C22 general context plaintext canary.'],
    ] as const) {
      expect(response.statusCode).toBeGreaterThanOrEqual(400);
      expect(response.statusCode).toBeLessThan(500);
      expect(response.body).not.toContain(canary);
    }

    const foreignRead = await list(patientId, '', 'f0101000-0000-4000-8500-000000000003');
    const foreignPersonRead = await list('f0101000-0000-4000-8000-000000000006');
    for (const deniedRead of [foreignRead, foreignPersonRead]) {
      expect(deniedRead.statusCode).toBe(403);
      expect(deniedRead.body).not.toContain(patientBody);
      expect(deniedRead.body).not.toContain(clinicianBody);
    }

    const clinicianRead = await list(clinicianId);
    expect(clinicianRead.statusCode).toBe(200);
    expect(clinicianRead.body).toContain(patientBody);
    expect(clinicianRead.body).toContain(clinicianBody);

    const firstPage = await list(patientId, '?limit=1');
    expect(firstPage.statusCode).toBe(200);
    const cursor = firstPage.json().meta.nextCursor as string;
    expect(cursor).toBeTruthy();
    const secondPage = await list(patientId, `?limit=1&cursor=${encodeURIComponent(cursor)}`);
    expect(secondPage.statusCode).toBe(200);
    expect(`${firstPage.body}${secondPage.body}`).toContain(patientBody);
    expect(`${firstPage.body}${secondPage.body}`).toContain(clinicianBody);

    for (const deniedPerson of [guardianId, delegateId, endedClinicianId]) {
      const deniedRead = await list(deniedPerson);
      const deniedSend = await send(
        deniedPerson,
        `f010-c22-denied-${deniedPerson.slice(-4)}`,
        'Forbidden synthetic message.',
      );
      expect(deniedRead.statusCode).toBe(403);
      expect(deniedRead.body).not.toContain(patientBody);
      expect(deniedSend.statusCode).toBe(403);
      expect(deniedSend.body).not.toContain('Forbidden synthetic message.');
    }

    // Deliberately observe a duplicate and out-of-order marker IDs at version
    // 1, omitting a third marker. Each observation is followed by REST auth.
    const endedHintEvents = [
      'f0101000-0000-4000-8a00-000000000002',
      'f0101000-0000-4000-8a00-000000000001',
      'f0101000-0000-4000-8a00-000000000002',
    ];
    for (const [index, eventId] of endedHintEvents.entries()) {
      const observed = await observeRefreshHintAndRefetch(
        { eventId, contextId: appointmentId, version: 1 },
        endedClinicianId,
        `f010-c23-ended-hint-${String(index).padStart(2, '0')}`,
      );
      expect(observed.history.statusCode).toBe(403);
      expect(observed.history.body).not.toContain(patientBody);
      expect(observed.history.body).not.toContain(clinicianBody);
      expect(observed.send.statusCode).toBe(403);
      expect(observed.send.body).not.toContain('C23 refresh-hint authorization probe.');
    }

    if (!harness) throw new Error('The C22 PostgreSQL API harness is unavailable.');
    const completed = await harness.app.inject({
      method: 'POST',
      url: `/v1/encounters/${encounterId}/complete`,
      headers: { ...headers(clinicianId, 'f010-c22-complete-context-01'), 'if-match': '"5"' },
      payload: {
        summary: 'Synthetic C22 completion used to verify immediate message revocation.',
        structuralConfirmation: true,
      },
    });
    expect(completed.statusCode).toBe(200);
    const completedRead = await list(patientId);
    const completedCursorRead = await list(
      patientId,
      `?limit=1&cursor=${encodeURIComponent(cursor)}`,
    );
    const completedReplay = await send(patientId, patientKey, patientBody);
    const completedSend = await send(
      patientId,
      'f010-c22-after-completion-01',
      'After completion.',
    );
    expect(completedRead.statusCode).toBe(403);
    expect(completedRead.body).not.toContain(patientBody);
    expect(completedCursorRead.statusCode).toBe(403);
    expect(completedCursorRead.body).not.toContain(patientBody);
    expect(completedReplay.statusCode).toBe(403);
    expect(completedReplay.body).not.toContain(patientBody);
    expect(completedSend.statusCode).toBe(403);
    expect(completedSend.json().code).toBe('forbidden');

    // A stale page cursor and duplicate/out-of-order hints cannot revive the
    // completed context. History, paging, and sending still go through REST.
    const completedHintEvents = [
      'f0101000-0000-4000-8a00-000000000004',
      'f0101000-0000-4000-8a00-000000000003',
      'f0101000-0000-4000-8a00-000000000004',
    ];
    for (const [index, eventId] of completedHintEvents.entries()) {
      const observed = await observeRefreshHintAndRefetch(
        { eventId, contextId: appointmentId, version: 1 },
        patientId,
        `f010-c23-completed-hint-${String(index).padStart(2, '0')}`,
        `?limit=1&cursor=${encodeURIComponent(cursor)}`,
      );
      expect(observed.history.statusCode).toBe(403);
      expect(observed.history.body).not.toContain(patientBody);
      expect(observed.history.body).not.toContain(clinicianBody);
      expect(observed.send.statusCode).toBe(403);
      expect(observed.send.body).not.toContain('C23 refresh-hint authorization probe.');
    }
  }, 30_000);
});
