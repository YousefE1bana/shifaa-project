import { readFileSync } from 'node:fs';

import { describe, expect, it, vi } from 'vitest';

import {
  Feature010ApiError,
  Feature010Client,
  generatedFeature010OperationIds,
} from './feature-010.js';

type Assert<T extends true> = T;
type DoesNotHave<T, K extends PropertyKey> = [K] extends [keyof T] ? false : true;
type HasRequired<T, K extends keyof T> = {} extends Pick<T, K> ? false : true;
type GetOptions = Parameters<Feature010Client['getEncounter']>[2];
type GetOptionsHaveNoIdempotencyKey = Assert<DoesNotHave<GetOptions, 'idempotencyKey'>>;
type GetOptionsHaveNoVersion = Assert<DoesNotHave<GetOptions, 'version'>>;
type SignNoteOptions = Parameters<Feature010Client['signEncounterNote']>[2];
type SignNoteOptionsHaveNoVersion = Assert<DoesNotHave<SignNoteOptions, 'version'>>;
type CreateOptions = Parameters<Feature010Client['createEncounter']>[1];
type CreateRequiresIdempotencyKey = Assert<HasRequired<CreateOptions, 'idempotencyKey'>>;

const encounterId = 'a1000000-0000-4000-8000-000000000001';
const appointmentId = 'a2000000-0000-4000-8000-000000000001';
const patientId = 'a3000000-0000-4000-8000-000000000001';
const requestId = 'a4000000-0000-4000-8000-000000000001';

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json',
      'cache-control': 'private, no-store',
    },
  });

const problemResponse = (status: number, code: string) =>
  new Response(
    JSON.stringify({
      type: 'about:blank',
      title: 'Synthetic request rejected',
      status,
      detail: 'Synthetic redacted detail.',
      instance: '/v1/encounters/a1000000-0000-4000-8000-000000000001',
      code,
      request_id: requestId,
    }),
    {
      status,
      headers: {
        'content-type': 'application/problem+json',
        'cache-control': 'private, no-store',
      },
    },
  );

describe('generated Feature 010 API client', () => {
  it('exports exactly the ten approved operation identifiers', () => {
    expect(generatedFeature010OperationIds).toEqual([
      'createEncounter',
      'getEncounter',
      'updateEncounter',
      'signEncounterNote',
      'completeEncounter',
      'createReferral',
      'listReferrals',
      'acceptReferral',
      'listContextMessages',
      'sendContextMessage',
    ]);
    expect(new Set(generatedFeature010OperationIds).size).toBe(10);
  });

  it('uses the current session bearer for actor context and sends no-store API requests', async () => {
    let currentAccessToken: string | undefined = 'synthetic-clinician-session-one';
    const fetcher = vi.fn<typeof fetch>(async () => jsonResponse({ encounter: {} }, 201));
    const client = new Feature010Client({
      baseUrl: 'https://synthetic.invalid',
      accessToken: () => currentAccessToken,
      acceptLanguage: 'en-EG',
      defaultHeaders: { Authorization: 'Bearer untrusted-default-token' },
      fetch: fetcher,
    });

    await client.createEncounter(
      { appointmentId, patientId, encounterType: 'consultation' },
      { idempotencyKey: 'synthetic-feature-010-encounter-create', requestId },
    );
    currentAccessToken = 'synthetic-clinician-session-two';
    await client.getEncounter(encounterId);

    const createInit = fetcher.mock.calls[0]?.[1];
    const createHeaders = new Headers(createInit?.headers);
    const readHeaders = new Headers(fetcher.mock.calls[1]?.[1]?.headers);
    expect(fetcher.mock.calls[0]?.[0]).toBe('https://synthetic.invalid/v1/encounters');
    expect(createHeaders.get('authorization')).toBe('Bearer synthetic-clinician-session-one');
    expect(readHeaders.get('authorization')).toBe('Bearer synthetic-clinician-session-two');
    expect(readHeaders.get('idempotency-key')).toBeNull();
    expect(readHeaders.get('if-match')).toBeNull();
    expect(createHeaders.get('accept')).toBe('application/json, application/problem+json');
    expect(createHeaders.get('accept-language')).toBe('en-EG');
    expect(createHeaders.get('content-type')).toBe('application/json');
    expect(createHeaders.get('idempotency-key')).toBe('synthetic-feature-010-encounter-create');
    expect(createHeaders.get('x-request-id')).toBe(requestId);
    expect(createInit?.cache).toBe('no-store');
    expect(JSON.parse(String(createInit?.body))).toEqual({
      appointmentId,
      patientId,
      encounterType: 'consultation',
    });
    expect(createHeaders.get('x-actor-id')).toBeNull();
    expect(createHeaders.get('x-shifaa-actor-id')).toBeNull();
  });

  it('sends quoted versions and idempotency keys for versioned mutations', async () => {
    const fetcher = vi.fn<typeof fetch>(async () => jsonResponse({ id: encounterId }));
    const client = new Feature010Client({
      baseUrl: 'https://synthetic.invalid',
      accessToken: () => 'synthetic-clinician-session',
      fetch: fetcher,
    });

    await client.updateEncounter(
      encounterId,
      { conditionIds: [] },
      { version: 3, idempotencyKey: 'synthetic-feature-010-encounter-update' },
    );

    const headers = new Headers(fetcher.mock.calls[0]?.[1]?.headers);
    expect(headers.get('if-match')).toBe('"3"');
    expect(headers.get('idempotency-key')).toBe('synthetic-feature-010-encounter-update');
  });

  it('rejects a clinical response without the contracted private no-store policy', async () => {
    const client = new Feature010Client({
      baseUrl: 'https://synthetic.invalid',
      accessToken: () => 'synthetic-clinician-session',
      fetch: async () => new Response(JSON.stringify({ id: encounterId }), { status: 200 }),
    });

    await expect(client.getEncounter(encounterId)).rejects.toMatchObject({
      status: 502,
      problem: { code: 'unsafe-cache-policy' },
    });
  });

  it.each([
    [401, 'authentication-required'],
    [403, 'forbidden'],
    [409, 'version-conflict'],
    [422, 'validation-failed'],
  ])('preserves RFC 9457 %s problem details', async (status, code) => {
    const problem = {
      type: 'about:blank',
      title: 'Synthetic request rejected',
      status,
      detail: 'Synthetic redacted detail.',
      instance: `/v1/encounters/${encounterId}`,
      code,
      request_id: requestId,
    };
    const client = new Feature010Client({
      baseUrl: 'https://synthetic.invalid',
      accessToken: () => 'synthetic-clinician-session',
      fetch: async () => problemResponse(status, code),
    });

    await expect(client.getEncounter(encounterId)).rejects.toMatchObject({ status, problem });
    await expect(client.getEncounter(encounterId)).rejects.toBeInstanceOf(Feature010ApiError);
  });

  it('fails closed when the session boundary has no access token', async () => {
    const fetcher = vi.fn<typeof fetch>();
    const client = new Feature010Client({
      baseUrl: 'https://synthetic.invalid',
      accessToken: () => undefined,
      fetch: fetcher,
    });

    await expect(client.getEncounter(encounterId)).rejects.toMatchObject({
      status: 401,
      problem: { code: 'authentication-required' },
    });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('contains no direct PostgREST or Supabase clinical write path', () => {
    const generatedClient = readFileSync(new URL('./feature-010.ts', import.meta.url), 'utf8');

    expect(generatedClient).not.toMatch(/\/rest\/v1|supabase|\.from\s*\(|\.rpc\s*\(/i);
    expect(generatedClient).toContain('/v1');
  });
});
