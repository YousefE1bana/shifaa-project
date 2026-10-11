import { randomUUID } from 'node:crypto';
import Fastify, { type FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadConfig } from '../config.js';
import { installFeature011ExposureGuard } from '../feature-011-exposure.js';
import type { PatientActor } from '../modules/identity-onboarding/service.js';
import type { Feature011Content } from '../modules/feature-011/create-release.js';
import type { Feature011Publication } from '../modules/feature-011/publish-release.js';
import type { Feature011Signing } from '../modules/feature-011/sign-release.js';
import type { Feature011Governance } from '../modules/feature-011/list-clinical-content.js';
import { registerFeature011ContentRoutes } from './feature-011-content.js';
import { installIdentityErrorHandler } from './identity-onboarding.js';

const isolated = {
  NODE_ENV: 'test',
  SHIFAA_SYNTHETIC_MODE: 'true',
  FEATURE_011_ENABLED: 'true',
  FEATURE_011_ISOLATED_TEST: 'true',
  FEATURE_011_KILL_SWITCH: 'false',
};
const personId = randomUUID();
const native: PatientActor = {
  kind: 'PAT',
  personId,
  subjectId: randomUUID(),
  principal: personId,
  aal: 2,
};
const releaseId = randomUUID();
const createRequest = {
  governedContentKey: 'neutral-series',
  effectiveScopeKey: 'synthetic-only',
  source: { display: 'Synthetic neutral source' },
  effectiveAt: '2026-10-08T00:00:00.123456Z',
  predecessor: { initial: true, supersedesReleaseId: null },
  artifact: {
    contentEvidenceRef: randomUUID(),
    codeEvidenceRef: randomUUID(),
    testVectorEvidenceRef: randomUUID(),
  },
};
const signRequest = {
  artifactVersion: 1,
  artifactDigest: 'a'.repeat(64),
  capacity: 'physician',
  decision: 'approved',
  signingEvidenceRef: randomUUID(),
};
// This suite verifies the HTTP boundary only. Real protection, authority and
// transactions are exercised by the separate both-runtime proofs.
const endpoints = [
  {
    operation: 'create',
    url: '/v1/admin/clinical-content/synthetic/releases',
    payload: createRequest,
  },
  {
    operation: 'publish',
    url: `/v1/admin/clinical-content/releases/${releaseId}/publish`,
    payload: { artifactVersion: 1, artifactDigest: 'a'.repeat(64), confirmPublication: true },
  },
  {
    operation: 'sign',
    url: `/v1/admin/clinical-content/releases/${releaseId}/signatures`,
    payload: signRequest,
  },
] as const;
const apps: FastifyInstance[] = [];
afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
});

describe('K18 generated current governance read boundary', () => {
  const url = '/v1/admin/clinical-content/synthetic?projection=governance';
  it('uses native person and generated numeric filters, returning no-store', async () => {
    const h = await fixture(true, true),
      r = await h.app.inject({ method: 'GET', url: url + '&limit=1&version=2', headers });
    expect(r.statusCode).toBe(200);
    expect(r.headers['cache-control']).toBe('private, no-store');
    expect(h.read).toHaveBeenCalledWith(
      expect.objectContaining({ personId, locale: 'en-EG', purposes: ['synthetic.feature011'] }),
      'synthetic',
      { projection: 'governance', limit: 1, version: 2 },
    );
  });
  it('remains absent by default', async () => {
    const h = await fixture(false, true);
    expect((await h.app.inject({ method: 'GET', url, headers })).statusCode).toBe(404);
    expect(h.read).not.toHaveBeenCalled();
  });
  it.each([
    '&role=ADM-MEDICAL',
    '&facilityId=' + randomUUID(),
    '&limit=0',
    '&limit=1.1',
    '&version=abc',
    '&personId=' + randomUUID(),
  ])('rejects undocumented/invalid filters %s', async (suffix) => {
    const h = await fixture(true, true);
    expect((await h.app.inject({ method: 'GET', url: url + suffix, headers })).statusCode).toBe(
      422,
    );
    expect(h.read).not.toHaveBeenCalled();
  });
  it('denies missing native identity', async () => {
    const h = await fixture(true, true);
    expect(
      (
        await h.app.inject({
          method: 'GET',
          url,
          headers: { ...headers, authorization: 'Bearer invalid' },
        })
      ).statusCode,
    ).toBe(401);
    expect(h.read).not.toHaveBeenCalled();
  });
  it('kill switch denies before read composition', async () => {
    const h = await fixture(true, true);
    h.config.feature011KillSwitch = true;
    expect((await h.app.inject({ method: 'GET', url, headers })).statusCode).toBe(503);
    expect(h.read).not.toHaveBeenCalled();
  });
});
async function fixture(enabled = true, withReading = false) {
  const config = loadConfig(enabled ? isolated : { NODE_ENV: 'test' });
  const app = Fastify();
  apps.push(app);
  installIdentityErrorHandler(app);
  installFeature011ExposureGuard(app, config);
  const receipt = {
    status: 201,
    headers: { etag: '"2"', 'cache-control': 'no-store' },
    body: Buffer.from('{"syntheticBoundaryProbe":true}'),
  };
  const create = vi
    .fn<Feature011Content['createClinicalContentRelease']>()
    .mockResolvedValue(receipt);
  const sign = vi.fn<Feature011Signing['signClinicalContentRelease']>().mockResolvedValue(receipt);
  const publish = vi
    .fn<Feature011Publication['publishClinicalContentRelease']>()
    .mockResolvedValue(receipt);
  const resolve = vi.fn(async (token: string) => (token === 'native-fixture' ? native : undefined));
  const read = vi.fn<Feature011Governance['listClinicalContent']>().mockResolvedValue({
    projection: 'governance',
    data: [],
    meta: { nextCursor: null, lastUpdatedAt: '2026-10-08T10:00:00.000000Z', stale: false },
  });
  await registerFeature011ContentRoutes(app, {
    config,
    service: { createClinicalContentRelease: create },
    signing: { signClinicalContentRelease: sign },
    publication: { publishClinicalContentRelease: publish },
    ...(withReading ? { reading: { listClinicalContent: read } } : {}),
    resolveNativePatient: resolve,
  });
  await app.ready();
  return { app, config, create, sign, publish, resolve, read };
}
const headers = {
  authorization: 'Bearer native-fixture',
  'x-purpose': 'synthetic.feature011',
  'accept-language': 'en-EG',
  'idempotency-key': 'synthetic-boundary-key-001',
  'if-match': '"1"',
};

describe('K15/K16/K17 generated content route boundary', () => {
  for (const endpoint of endpoints) {
    it(`${endpoint.operation} remains absent with default-off configuration`, async () => {
      const h = await fixture(false);
      const response = await h.app.inject({
        method: 'POST',
        url: endpoint.url,
        payload: endpoint.payload,
        headers,
      });
      expect(response.statusCode).toBe(404);
      expect(h.create).not.toHaveBeenCalled();
      expect(h.sign).not.toHaveBeenCalled();
      expect(h.publish).not.toHaveBeenCalled();
    });
    it(`${endpoint.operation} uses the native identity and preserves receipt bytes/headers`, async () => {
      const h = await fixture();
      const response = await h.app.inject({
        method: 'POST',
        url: endpoint.url,
        payload: endpoint.payload,
        headers,
      });
      expect(response.statusCode).toBe(201);
      expect(response.body).toBe('{"syntheticBoundaryProbe":true}');
      expect(response.headers.etag).toBe('"2"');
      expect(response.headers['cache-control']).toBe('no-store');
      const call =
        endpoint.operation === 'create'
          ? h.create.mock.calls[0]
          : endpoint.operation === 'sign'
            ? h.sign.mock.calls[0]
            : h.publish.mock.calls[0];
      expect(call?.[0]).toMatchObject({
        personId,
        subjectId: native.subjectId,
        aal: 2,
        locale: 'en-EG',
        purposes: ['synthetic.feature011'],
      });
      if (endpoint.operation === 'sign')
        expect(h.sign.mock.calls[0]?.[3]).toEqual({
          key: headers['idempotency-key'],
          expectedVersion: 1,
        });
    });
    for (const scenario of [
      { name: 'missing authentication', patch: { authorization: '' }, status: 401 },
      {
        name: 'unrecognized native token',
        patch: { authorization: 'Bearer unknown-native' },
        status: 401,
      },
      { name: 'missing purpose', patch: { 'x-purpose': '' }, status: 403 },
      { name: 'unsupported locale', patch: { 'accept-language': 'fr-FR' }, status: 422 },
      { name: 'invalid key', patch: { 'idempotency-key': 'short' }, status: 400 },
    ]) {
      it(`${endpoint.operation} denies ${scenario.name} before composition`, async () => {
        const h = await fixture();
        const response = await h.app.inject({
          method: 'POST',
          url: endpoint.url,
          payload: endpoint.payload,
          headers: { ...headers, ...scenario.patch },
        });
        expect(response.statusCode).toBe(scenario.status);
        expect(h.create).not.toHaveBeenCalled();
        expect(h.sign).not.toHaveBeenCalled();
        expect(h.publish).not.toHaveBeenCalled();
      });
    }
    it(`${endpoint.operation} rejects client-claimed identity and extra query parameters`, async () => {
      const h = await fixture();
      for (const request of [
        { url: endpoint.url, payload: { ...endpoint.payload, signerPersonId: randomUUID() } },
        { url: endpoint.url + '?personId=' + randomUUID(), payload: endpoint.payload },
      ]) {
        expect((await h.app.inject({ method: 'POST', ...request, headers })).statusCode).toBe(422);
      }
      expect(h.create).not.toHaveBeenCalled();
      expect(h.sign).not.toHaveBeenCalled();
      expect(h.publish).not.toHaveBeenCalled();
    });
    it(`${endpoint.operation} rechecks the kill switch without executing or queueing composition`, async () => {
      const h = await fixture();
      h.config.feature011KillSwitch = true;
      const response = await h.app.inject({
        method: 'POST',
        url: endpoint.url,
        payload: endpoint.payload,
        headers,
      });
      expect(response.statusCode).toBe(503);
      expect(h.create).not.toHaveBeenCalled();
      expect(h.sign).not.toHaveBeenCalled();
      expect(h.publish).not.toHaveBeenCalled();
    });
  }
  for (const endpoint of [endpoints[1], endpoints[2]]) {
    for (const match of ['', '1', '"0"', '"1.5"', '"2147483648"', '"9007199254740992"']) {
      it(`${endpoint.operation} denies invalid workflow If-Match ${JSON.stringify(match)}`, async () => {
        const h = await fixture();
        const response = await h.app.inject({
          method: 'POST',
          url: endpoint.url,
          payload: endpoint.payload,
          headers: { ...headers, 'if-match': match },
        });
        expect(response.statusCode).toBe(422);
        if (endpoint.operation === 'sign') expect(h.sign).not.toHaveBeenCalled();
        else expect(h.publish).not.toHaveBeenCalled();
      });
    }
    it(`${endpoint.operation} accepts the PostgreSQL integer maximum as a quoted version`, async () => {
      const h = await fixture();
      const response = await h.app.inject({
        method: 'POST',
        url: endpoint.url,
        payload: endpoint.payload,
        headers: { ...headers, 'if-match': '"2147483647"' },
      });
      expect(response.statusCode).toBe(201);
      const expected =
        endpoint.operation === 'sign' ? h.sign.mock.calls[0]?.[3] : h.publish.mock.calls[0]?.[3];
      expect(expected).toEqual({ key: headers['idempotency-key'], expectedVersion: 2147483647 });
    });
  }
  it('registers only the approved content mutations in this window', async () => {
    const h = await fixture();
    for (const url of [
      '/v1/prescriptions',
      '/v1/prescriptions/safety',
      '/v1/clinical-content/provision',
    ])
      expect((await h.app.inject({ method: 'POST', url, headers })).statusCode).toBe(404);
    expect(
      (await h.app.inject({ method: 'GET', url: '/v1/admin/clinical-content/synthetic', headers }))
        .statusCode,
    ).toBe(404);
  });
});
