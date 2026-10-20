import { randomUUID } from 'node:crypto';
import postgres from 'postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createFeature010Client } from '@shifaa/api-client/feature-010';

import { buildApp } from '../../services/api/src/app.js';
import { loadConfig } from '../../services/api/src/config.js';

const database = process.env['SHIFAA_F010_C28_DATABASE'];
const patientId = 'f0101000-0000-4000-8000-000000000002';
const clinicianId = 'f0101000-0000-4000-8000-000000000001';
const appointmentId = 'f0101000-0000-4000-8500-000000000001';
const visibleBody = 'F03 synthetic current patient-visible note.';
const supersededBody = 'F03 synthetic superseded patient-visible note.';
const privateMetadata = 'F03-PRIVATE-NOTE-METADATA-CANARY';
const privateBody = `F03 synthetic private note must remain hidden. ${privateMetadata}`;
let harness: Awaited<ReturnType<typeof buildApp>>;
let sql: ReturnType<typeof postgres>;

function headers(person: string, key = `pre011-patient-notes-${randomUUID()}`) {
  return {
    authorization: `Bearer synthetic-person:${person}`,
    'x-aal': '2',
    'x-purpose': 'appointment.scheduling',
    'accept-language': 'en-EG',
    'idempotency-key': key,
  };
}

function apiFetch(app: typeof harness.app): typeof fetch {
  return async (input, init) => {
    const url = new URL(String(input));
    const response = await app.inject({
      method: (init?.method ?? 'GET') as 'GET' | 'POST' | 'PATCH',
      url: `${url.pathname}${url.search}`,
      headers: Object.fromEntries(new Headers(init?.headers).entries()),
      ...(typeof init?.body === 'string' ? { payload: init.body } : {}),
    });
    const responseHeaders = new Headers();
    for (const [name, value] of Object.entries(response.headers)) {
      if (typeof value === 'string') responseHeaders.set(name, value);
    }
    return new Response(response.body, { status: response.statusCode, headers: responseHeaders });
  };
}

describe.skipIf(!database)(
  'F03 patient notes projection through PostgreSQL API composition',
  () => {
    beforeAll(async () => {
      if (!database) throw new Error('The isolated C28 PostgreSQL database is required.');
      const url = `postgresql://shifaa_api:synthetic_api_only@${process.env['SHIFAA_PG_HOST'] ?? '127.0.0.1'}:${process.env['SHIFAA_PG_PORT'] ?? '5432'}/${database}`;
      sql = postgres(url, { max: 1, onnotice: () => undefined });
      const [connection] = await sql<{ role: string }[]>`select current_user as role`;
      expect(connection?.role).toBe('shifaa_api');
      harness = await buildApp({
        config: {
          ...loadConfig({ NODE_ENV: 'test' }),
          repositoryAdapter: 'postgres',
          databaseUrl: url,
          syntheticMode: true,
        },
      });
    });

    afterAll(async () => {
      await harness?.app.close();
      await sql?.end();
    });

    it('preserves released note history while hiding private content and metadata from PAT', async () => {
      const created = await harness.app.inject({
        method: 'POST',
        url: '/v1/encounters',
        headers: headers(clinicianId),
        payload: { appointmentId, patientId, encounterType: 'consultation' },
      });
      expect(created.statusCode).toBe(201);
      const encounterId = created.json().encounter.id as string;

      const privateNote = await harness.app.inject({
        method: 'POST',
        url: `/v1/encounters/${encounterId}/notes`,
        headers: headers(clinicianId),
        payload: { noteType: 'assessment', visibility: 'private', body: privateBody },
      });
      expect(privateNote.statusCode).toBe(201);
      const privateNoteId = privateNote.json().id as string;

      const superseded = await harness.app.inject({
        method: 'POST',
        url: `/v1/encounters/${encounterId}/notes`,
        headers: headers(clinicianId),
        payload: { noteType: 'assessment', visibility: 'patient_visible', body: supersededBody },
      });
      expect(superseded.statusCode).toBe(201);
      const supersededId = superseded.json().id as string;

      const current = await harness.app.inject({
        method: 'POST',
        url: `/v1/encounters/${encounterId}/notes`,
        headers: headers(clinicianId),
        payload: {
          noteType: 'assessment',
          visibility: 'patient_visible',
          body: visibleBody,
          supersedesId: supersededId,
        },
      });
      expect(current.statusCode).toBe(201);
      const currentNoteId = current.json().id as string;

      const token = `synthetic-person:${patientId}`;
      const fetch = apiFetch(harness.app);
      const directClient = createFeature010Client({
        baseUrl: 'http://shifaa.test',
        accessToken: () => token,
        purpose: 'appointment.scheduling',
        sessionAal: () => 2,
        fetch,
      });
      const defaultProjection = await directClient.getEncounter(encounterId);
      expect(defaultProjection).not.toHaveProperty('notes');
      const directProjection = await directClient.getEncounter(encounterId, { fields: ['notes'] });
      expect(directProjection.notes).toHaveLength(2);
      expect(directProjection.notes).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ id: supersededId, body: supersededBody }),
          expect.objectContaining({ id: currentNoteId, body: visibleBody }),
        ]),
      );
      expect(directProjection.notes?.every((note) => !('supersedesId' in note))).toBe(true);
      expect(JSON.stringify(directProjection)).not.toContain(privateBody);
      expect(JSON.stringify(directProjection)).not.toContain(privateNoteId);
      expect(JSON.stringify(directProjection)).not.toContain(privateMetadata);

      const [{ PatientFeature010EncounterApi }, { rememberFeature010Session }] = await Promise.all([
        import(new URL('../../apps/patient/src/feature-010-encounter.ts', import.meta.url).href),
        import(new URL('../../apps/patient/src/feature-010-session.ts', import.meta.url).href),
      ]);
      rememberFeature010Session(token, 2);
      const patientApi = new PatientFeature010EncounterApi({
        locale: 'en-EG',
        accessToken: token,
        apiBaseUrl: 'http://shifaa.test',
        fetch,
      });
      const patientProjection = await patientApi.getEncounter(encounterId);

      expect(patientProjection.notes, 'F03 conditional patient notes projection missing').toEqual(
        directProjection.notes,
      );
    }, 30_000);
  },
);
