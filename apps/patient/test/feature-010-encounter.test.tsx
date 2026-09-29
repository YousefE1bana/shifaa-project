import assert from 'node:assert/strict';
import test from 'node:test';
import { PatientFeature010EncounterApi } from '../src/feature-010-encounter.ts';

const encounterId = 'a1000000-0000-4000-8000-000000000010';
const patientId = 'a1000000-0000-4000-8000-000000000011';
const projection = {
  id: encounterId,
  patientId,
  facilityId: 'a1000000-0000-4000-8000-000000000012',
  appointmentId: 'a1000000-0000-4000-8000-000000000013',
  encounterType: 'general',
  responsibleClinicianId: 'a1000000-0000-4000-8000-000000000014',
  status: 'open',
  startedAt: '2030-01-07T09:00:00Z',
  version: 1,
  notes: [
    {
      id: 'a1000000-0000-4000-8000-000000000015',
      encounterId,
      authorId: 'a1000000-0000-4000-8000-000000000014',
      noteType: 'assessment',
      visibility: 'patient_visible',
      signedAt: '2030-01-07T09:10:00Z',
      body: 'released note text',
    },
  ],
};
const response = (payload: unknown, status = 200) =>
  new Response(JSON.stringify(payload), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'private, no-store' },
  });

test('PAT, current GUA, and current DEL reads use generated getEncounter with locale and live server authority', async () => {
  for (const actor of ['PAT', 'GUA', 'DEL'] as const) {
    let url = '';
    let init: RequestInit | undefined;
    const api = new PatientFeature010EncounterApi({
      locale: 'en-EG',
      accessToken: `synthetic-${actor}-token`,
      apiBaseUrl: 'https://synthetic.invalid',
      fetch: async (input, options) => {
        url = String(input);
        init = options;
        return response(projection);
      },
    });
    assert.deepEqual(await api.getEncounter(encounterId), projection);
    assert.equal(url, `https://synthetic.invalid/v1/encounters/${encounterId}`);
    assert.equal(
      new Headers(init?.headers).get('Authorization'),
      `Bearer synthetic-${actor}-token`,
    );
    assert.equal(new Headers(init?.headers).get('Accept-Language'), 'en-EG');
    assert.equal(init?.method, 'GET');
  }
});

test('denied or revoked GUA/DEL authority fails closed and clears the previous projection', async () => {
  let status = 200;
  const api = new PatientFeature010EncounterApi({
    locale: 'ar-EG',
    accessToken: 'synthetic-representative-token',
    apiBaseUrl: 'https://synthetic.invalid',
    fetch: async () => response(status === 200 ? projection : { code: 'forbidden' }, status),
  });
  assert.equal((await api.getEncounter(encounterId)).id, encounterId);
  status = 403;
  await assert.rejects(api.getEncounter(encounterId), /403/);
  assert.equal(api.currentEncounter, null);
  assert.equal(api.readState, 'denied');
});

test('missing released encounter displays empty state without a clinical projection', async () => {
  const api = new PatientFeature010EncounterApi({
    locale: 'en-EG',
    accessToken: 'synthetic-patient-token',
    apiBaseUrl: 'https://synthetic.invalid',
    fetch: async () => response({ code: 'not-found' }, 404),
  });
  await assert.rejects(api.getEncounter(encounterId), /404/);
  assert.equal(api.currentEncounter, null);
  assert.equal(api.readState, 'empty');
});

test('private-note exclusion is indistinguishable from no private note in the patient projection', async () => {
  const noPrivateNotes = { ...projection, notes: projection.notes };
  const withPrivateNote = {
    ...projection,
    notes: [
      {
        ...projection.notes[0],
        supersedesId: 'a1000000-0000-4000-8000-000000000099',
        internalMetadata: { authorPrivateMemo: 'HIDDEN NOTE EXISTENCE CUE' },
        encryptionKeyId: 'SYNTHETIC-SECRET-METADATA',
      },
      {
        ...projection.notes[0],
        id: 'a1000000-0000-4000-8000-000000000016',
        body: 'PRIVATE TEST SECRET',
        visibility: 'private',
      },
    ],
    participants: [
      {
        personId: patientId,
        roleCode: 'PAT',
        startedAt: '2030-01-07T09:00:00Z',
        internalFacilityMetadata: 'DO-NOT-PROJECT',
      },
    ],
    internalEncounterMetadata: { staffOnlyFlag: true },
  };
  const createApi = (payload: unknown) =>
    new PatientFeature010EncounterApi({
      locale: 'ar-EG',
      accessToken: 'synthetic-patient-token',
      apiBaseUrl: 'https://synthetic.invalid',
      fetch: async () => response(payload),
    });
  const first = await createApi(noPrivateNotes).getEncounter(encounterId);
  const second = await createApi(withPrivateNote).getEncounter(encounterId);
  assert.deepEqual(second, first);
  assert.doesNotMatch(
    JSON.stringify(second),
    /PRIVATE TEST SECRET|HIDDEN NOTE EXISTENCE CUE|SYNTHETIC-SECRET-METADATA|DO-NOT-PROJECT|staffOnlyFlag|participants|privateNote|private-note/i,
  );
});

test('late successful response cannot replace the offline state', async () => {
  let resolveOldResponse!: (value: Response) => void;
  let oldFetchStarted!: () => void;
  const oldFetchReady = new Promise<void>((resolve) => {
    oldFetchStarted = resolve;
  });
  const api = new PatientFeature010EncounterApi({
    locale: 'en-EG',
    accessToken: 'synthetic-patient-token',
    apiBaseUrl: 'https://synthetic.invalid',
    fetch: async () =>
      new Promise<Response>((resolve) => {
        resolveOldResponse = resolve;
        oldFetchStarted();
      }),
  });
  const oldController = new AbortController();
  const oldRead = api.getEncounter(encounterId, oldController.signal);
  await oldFetchReady;
  oldController.abort();
  api.markOffline();
  resolveOldResponse(response(projection));
  await assert.rejects(
    oldRead,
    (error: unknown) => error instanceof DOMException && error.name === 'AbortError',
  );
  assert.equal(api.currentEncounter, null);
  assert.equal(api.readState, 'offline');
});

test('superseded late success cannot replace a newer denied read', async () => {
  let resolveOldResponse!: (value: Response) => void;
  let oldFetchStarted!: () => void;
  let calls = 0;
  const oldFetchReady = new Promise<void>((resolve) => {
    oldFetchStarted = resolve;
  });
  const api = new PatientFeature010EncounterApi({
    locale: 'en-EG',
    accessToken: 'synthetic-patient-token',
    apiBaseUrl: 'https://synthetic.invalid',
    fetch: async () => {
      calls += 1;
      if (calls === 1)
        return new Promise<Response>((resolve) => {
          resolveOldResponse = resolve;
          oldFetchStarted();
        });
      return response({ code: 'forbidden' }, 403);
    },
  });
  const oldController = new AbortController();
  const oldRead = api.getEncounter(encounterId, oldController.signal);
  await oldFetchReady;
  oldController.abort();
  await assert.rejects(api.getEncounter(encounterId), /403/);
  resolveOldResponse(response(projection));
  await assert.rejects(
    oldRead,
    (error: unknown) => error instanceof DOMException && error.name === 'AbortError',
  );
  assert.equal(api.currentEncounter, null);
  assert.equal(api.readState, 'denied');
});

test('completed encounter remains readable; denied offline/stale reads never reuse stale clinical content', async () => {
  const completed = { ...projection, status: 'completed', endedAt: '2030-01-07T10:00:00Z' };
  let online = true;
  let status = 200;
  const api = new PatientFeature010EncounterApi({
    locale: 'ar-EG',
    accessToken: 'synthetic-patient-token',
    apiBaseUrl: 'https://synthetic.invalid',
    isOnline: () => online,
    fetch: async () => response(completed, status),
  });
  assert.equal((await api.getEncounter(encounterId)).status, 'completed');
  online = false;
  await assert.rejects(api.getEncounter(encounterId), /offline/);
  assert.equal(api.currentEncounter, null);
  assert.equal(api.readState, 'offline');
  online = true;
  status = 503;
  await assert.rejects(api.getEncounter(encounterId), /503/);
  assert.equal(api.currentEncounter, null);
  assert.equal(api.readState, 'stale');
});
