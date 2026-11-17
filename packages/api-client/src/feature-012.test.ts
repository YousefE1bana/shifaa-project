import { describe, expect, it, vi } from 'vitest';
import { feature012Operations } from '@shifaa/contracts/feature-012';
import { createFeature012Client, generatedFeature012OperationIds } from './feature-012.js';

const uuid = '00000000-0000-4000-8000-000000000001';
const revision = '00000000-0000-4000-8000-000000000002';
const digest = 'a'.repeat(64);
const options = { idempotencyKey: 'synthetic-operation-key' };
const token = `"ppc:${uuid}:${revision}:3"`;
const release = {
  action: 'release_patient_projection',
  policyVersion: 'F012-VP-2/0.2.0',
  audience: 'subject',
  expectedSignedRevisionRef: revision,
  expectedPrescriptionVersion: 2,
  expectedProjectionControlVersion: 3,
  confirmation: true,
  targets: { prescription: true },
} as const;
const discover = { view: 'discover', lane: 'pharmacist', scope: 'eligible' } as const;

function clientWith(
  fetcher: typeof fetch,
  accessToken: () => string | undefined = () => 'synthetic-current-session',
) {
  return createFeature012Client({
    baseUrl: 'https://f012.example.invalid/',
    purpose: 'synthetic-contract-test',
    accessToken,
    fetch: fetcher,
  });
}

function reply(status = 200, etag = '"2"', cache = 'private, no-store') {
  return new Response(JSON.stringify({ code: 'version-conflict' }), {
    status,
    headers: { etag, 'cache-control': cache },
  });
}

describe('F012 generated API client', () => {
  it('exposes exactly the twelve assigned methods', () => {
    expect(generatedFeature012OperationIds).toEqual(
      feature012Operations.map((operation) => operation.operationId),
    );
    const client = clientWith(vi.fn());
    expect(
      generatedFeature012OperationIds.every((operation) => typeof client[operation] === 'function'),
    ).toBe(true);
  });

  it('uses an opaque encoded R1 cursor and only contracted headers', async () => {
    const fetcher = vi.fn<typeof fetch>(async () => reply());
    const client = clientWith(fetcher);
    await client.getOverrideReviewCases(
      { ...discover, cursor: 'opaque+/=&lane=second_physician', limit: 1 },
      { requestId: uuid },
    );
    const [url, init] = fetcher.mock.calls[0]!;
    const target = new URL(String(url));
    expect(target.pathname).toBe('/v1/override-review-cases');
    expect(Object.fromEntries(target.searchParams)).toEqual({
      ...discover,
      cursor: 'opaque+/=&lane=second_physician',
      limit: '1',
    });
    expect(init?.method).toBe('GET');
    expect(init?.cache).toBe('no-store');
    const headers = new Headers(init?.headers);
    expect(headers.get('authorization')).toBe('Bearer synthetic-current-session');
    expect(headers.get('accept-language')).toBe('ar-EG');
    expect(headers.get('x-purpose')).toBe('synthetic-contract-test');
    expect(headers.get('x-request-id')).toBe(uuid);
    expect(headers.has('idempotency-key')).toBe(false);
    expect(headers.has('if-match')).toBe(false);
  });

  it('sends a scoped projection token for update and a numeric token for ordinary preconditions', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockImplementationOnce(async () => reply(200, token))
      .mockImplementationOnce(async () => reply());
    const client = clientWith(fetcher);
    await client.updatePrescription(uuid, release, { ...options, ifMatch: token });
    await client.transitionOverrideReviewAssignment(
      uuid,
      {
        action: 'claim',
        lane: 'pharmacist',
        requestVersion: 2,
        assignmentVersion: 1,
        rosterRevision: 1,
        evidenceRevision: digest,
      },
      { ...options, version: 2 },
    );
    expect(
      fetcher.mock.calls.map(([url, init]) => [
        new URL(String(url)).pathname,
        init?.method,
        new Headers(init?.headers).get('if-match'),
        new Headers(init?.headers).get('idempotency-key'),
      ]),
    ).toEqual([
      [`/v1/prescriptions/${uuid}`, 'PATCH', token, options.idempotencyKey],
      [
        `/v1/override-requests/${uuid}/assignment-transitions`,
        'POST',
        '"2"',
        options.idempotencyKey,
      ],
    ]);
    expect(JSON.parse(String(fetcher.mock.calls[0]![1]?.body))).toEqual(release);
  });

  it('rejects injection, mixed R1 fields, weak or cross-branch tokens before transport', async () => {
    const fetcher = vi.fn<typeof fetch>();
    const client = clientWith(fetcher);
    const mixed = { ...discover, overrideId: uuid };
    const injected = { ...release, targets: { ...release.targets, patientId: uuid } };
    const invalid = { status: 400, problem: { code: 'validation-failed' } };
    await expect(client.getOverrideReviewCases(mixed)).rejects.toMatchObject(invalid);
    await expect(
      client.updatePrescription(uuid, injected, { ...options, ifMatch: token }),
    ).rejects.toMatchObject(invalid);
    for (const ifMatch of ['"2"', `W/${token}`, token.replace(revision, uuid)])
      await expect(
        client.updatePrescription(uuid, release, { ...options, ifMatch }),
      ).rejects.toMatchObject(invalid);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('propagates a private problem and fails closed on missing session, cache policy or wrong response ETag', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockImplementationOnce(async () => reply(409))
      .mockImplementationOnce(async () => reply(200, token, 'public'))
      .mockImplementationOnce(async () => reply());
    const client = clientWith(fetcher);
    await expect(clientWith(fetcher, () => undefined).getPrescription(uuid)).rejects.toMatchObject({
      status: 401,
    });
    expect(fetcher).not.toHaveBeenCalled();
    await expect(
      client.updatePrescription(uuid, release, { ...options, ifMatch: token }),
    ).rejects.toMatchObject({ status: 409, problem: { code: 'version-conflict' } });
    await expect(
      client.updatePrescription(uuid, release, { ...options, ifMatch: token }),
    ).rejects.toMatchObject({ status: 502, problem: { code: 'unsafe-cache-policy' } });
    await expect(
      client.updatePrescription(uuid, release, { ...options, ifMatch: token }),
    ).rejects.toMatchObject({ status: 502, problem: { code: 'invalid-response-etag' } });
  });
});
