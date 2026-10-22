import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
// Prepare the contract graph during collection; this test asserts metadata, not import latency.
import * as contracts from '@shifaa/contracts/feature-011';
import { describe, expect, it, vi } from 'vitest';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const uuid = 'f1100000-0000-4000-8000-000000000001';
async function generated() {
  expect(
    fs.existsSync(path.join(root, 'packages/api-client/src/feature-011.ts')),
    'Feature 011 generated client is not yet implemented',
  ).toBe(true);
  return import('./feature-011.js');
}
const response = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': status < 400 ? 'application/json' : 'application/problem+json',
      'Cache-Control': 'private, no-store',
    },
  });

describe('generated Feature 011 client transport', () => {
  it('sends only seven approved operation paths, required headers and unchanged opaque payloads', async () => {
    const { Feature011Client, generatedFeature011OperationIds } = await generated();
    const fetcher = vi.fn<typeof fetch>(async () => response({ synthetic: true }));
    const client = new Feature011Client({
      baseUrl: 'https://synthetic.invalid',
      accessToken: () => 'synthetic-session',
      purpose: 'clinical.synthetic',
      acceptLanguage: 'en-EG',
      fetch: fetcher,
    });
    const allergy = {
      substance: { identity: 'SYNTHETIC-A', display: 'Synthetic assertion' },
      source: { display: 'SYNTHETIC' },
      reaction: { knowledge: 'unknown' as const },
    };
    const mutation = { idempotencyKey: 'synthetic-key', requestId: uuid };
    const versioned = { ...mutation, version: 2 };
    await client.listAllergies(uuid, { view: 'history', cursor: 'opaque/+==', limit: 25 });
    await client.createAllergy(uuid, allergy, mutation);
    await client.verifyAllergy(
      uuid,
      { targetStatus: 'entered_in_error', reason: 'SYNTHETIC', verificationEvidenceRef: uuid },
      versioned,
    );
    await client.listClinicalContent('SYNTHETIC/A', { projection: 'status', status: 'published' });
    await client.createClinicalContentRelease(
      'SYNTHETIC/A',
      {
        governedContentKey: 'SYNTHETIC-A',
        effectiveScopeKey: 'SYNTHETIC',
        source: { display: 'SYNTHETIC' },
        effectiveAt: '2026-10-06T10:00:00Z',
        artifact: { contentEvidenceRef: uuid, codeEvidenceRef: uuid, testVectorEvidenceRef: uuid },
        predecessor: { initial: true, supersedesReleaseId: null },
      },
      mutation,
    );
    await client.signClinicalContentRelease(
      uuid,
      {
        capacity: 'pharmacist',
        decision: 'approved',
        artifactVersion: 1,
        artifactDigest: 'a'.repeat(64),
        signingEvidenceRef: uuid,
      },
      versioned,
    );
    await client.publishClinicalContentRelease(
      uuid,
      { artifactVersion: 1, artifactDigest: 'a'.repeat(64), confirmPublication: true },
      versioned,
    );
    expect(generatedFeature011OperationIds).toHaveLength(7);
    expect(fetcher.mock.calls.map(([url]) => new URL(String(url)).pathname)).toEqual([
      `/v1/patients/${uuid}/allergies`,
      `/v1/patients/${uuid}/allergies`,
      `/v1/allergies/${uuid}/verification`,
      '/v1/admin/clinical-content/SYNTHETIC%2FA',
      '/v1/admin/clinical-content/SYNTHETIC%2FA/releases',
      `/v1/admin/clinical-content/releases/${uuid}/signatures`,
      `/v1/admin/clinical-content/releases/${uuid}/publish`,
    ]);
    const readUrl = new URL(String(fetcher.mock.calls[0]![0]));
    expect(readUrl.searchParams.get('cursor')).toBe('opaque/+==');
    const headers = fetcher.mock.calls.map(([, init]) => new Headers(init?.headers));
    expect(headers.filter((h) => h.has('Idempotency-Key'))).toHaveLength(5);
    expect(headers.filter((h) => h.get('If-Match') === '"2"')).toHaveLength(3);
    for (const header of headers) {
      expect(header.get('X-Purpose')).toBe('clinical.synthetic');
      expect(header.get('Accept-Language')).toBe('en-EG');
      expect(header.get('X-AAL')).toBeNull();
    }
    expect(JSON.parse(String(fetcher.mock.calls[1]![1]?.body))).toEqual(allergy);
    expect(JSON.parse(String(fetcher.mock.calls[5]![1]?.body)).artifactVersion).toBe(1);
    expect(fetcher.mock.calls.every(([, init]) => init?.cache === 'no-store')).toBe(true);
  });

  it('reads current token and prevents default headers from substituting protected transport bindings', async () => {
    const { Feature011Client } = await generated();
    let token = 'synthetic-session-one';
    const fetcher = vi.fn<typeof fetch>(async () => response({}));
    const client = new Feature011Client({
      baseUrl: 'https://synthetic.invalid',
      accessToken: () => token,
      fetch: fetcher,
      defaultHeaders: {
        Authorization: 'untrusted',
        'Idempotency-Key': 'untrusted',
        'If-Match': '"99"',
        'X-AAL': '2',
        'X-Actor-Id': uuid,
      },
    });
    await client.listAllergies(uuid);
    token = 'synthetic-session-two';
    await client.listAllergies(uuid);
    const headers = fetcher.mock.calls.map(([, init]) => new Headers(init?.headers));
    expect(headers.map((h) => h.get('Authorization'))).toEqual([
      'Bearer synthetic-session-one',
      'Bearer synthetic-session-two',
    ]);
    for (const header of headers)
      for (const forbidden of ['Idempotency-Key', 'If-Match', 'X-AAL', 'X-Actor-Id'])
        expect(header.get(forbidden)).toBeNull();
  });

  it('returns canonical problem evidence and refuses unsafe clinical caching', async () => {
    const { Feature011Client, Feature011ApiError } = await generated();
    const problem = {
      type: 'urn:shifaa:forbidden',
      title: 'Denied',
      status: 403,
      detail: 'Synthetic denial',
      instance: '/synthetic',
      code: 'forbidden',
      request_id: uuid,
    };
    const client = new Feature011Client({
      baseUrl: 'https://synthetic.invalid',
      accessToken: () => 'synthetic',
      fetch: async () => response(problem, 403),
    });
    await expect(client.listAllergies(uuid)).rejects.toMatchObject({ status: 403, problem });
    const unsafe = new Feature011Client({
      baseUrl: 'https://synthetic.invalid',
      accessToken: () => 'synthetic',
      fetch: async () => new Response('{}'),
    });
    await expect(unsafe.listAllergies(uuid)).rejects.toBeInstanceOf(Feature011ApiError);
  });
});

describe('C02A client canonicalization metadata', () => {
  it('exports only metadata and agrees with contract bindings without exposing an encoder', async () => {
    const module = await generated();
    expect(module).toHaveProperty('feature011ArtifactCanonicalizationMetadata');
    expect(module).toHaveProperty(
      'feature011ArtifactCanonicalizationMetadata',
      contracts.feature011ArtifactCanonicalizationMetadata,
    );
    expect(Object.keys(module).filter((name) => /encod|canonicaliz/i.test(name))).toEqual([
      'feature011ArtifactCanonicalizationMetadata',
    ]);
  });
});
