import Fastify from 'fastify';
import { randomUUID } from 'node:crypto';
import { it, expect, vi, describe } from 'vitest';
import { loadConfig } from '../config.js';
import { installFeature011ExposureGuard } from '../feature-011-exposure.js';
import { installIdentityErrorHandler } from './identity-onboarding.js';
import { registerFeature011AllergyRoutes } from './feature-011-allergies.js';
const patient = randomUUID(),
  person = randomUUID(),
  path = `/v1/patients/${patient}/allergies`;
const input = {
  substance: { identity: 'synthetic-neutral', display: 'Neutral' },
  source: { display: 'Self report' },
};
const body = {
  revisionId: randomUUID(),
  allergyId: randomUUID(),
  patientId: patient,
  version: 1,
  previousRevisionId: null,
  status: 'self_reported',
  ...input,
  coding: { knowledge: 'unknown' },
  reaction: { knowledge: 'unknown' },
  severity: { knowledge: 'unknown' },
  onset: { knowledge: 'unknown' },
  recorderPersonId: person,
  recordedAt: '2026-10-07T10:00:00Z',
  actionActorPersonId: person,
  actionAt: '2026-10-07T10:00:00Z',
  verification: null,
  correctsAllergyId: null,
};
async function app(enabled = true) {
  const config = loadConfig({
    NODE_ENV: 'test',
    SHIFAA_SYNTHETIC_MODE: 'true',
    FEATURE_011_ENABLED: String(enabled),
    FEATURE_011_ISOLATED_TEST: 'true',
    FEATURE_011_KILL_SWITCH: 'false',
    HOST: '127.0.0.1',
  });
  const a = Fastify({ logger: false, genReqId: () => randomUUID() });
  installIdentityErrorHandler(a);
  installFeature011ExposureGuard(a, config);
  const service = {
    listAllergies: vi.fn(async () => ({
      view: 'current',
      data: [],
      meta: { nextCursor: null, lastUpdatedAt: '2026-10-07T10:00:00Z', stale: false },
    })),
    createAllergy: vi.fn(async () => ({
      status: 201,
      headers: {
        'Cache-Control': 'private, no-store',
        'X-Request-Id': randomUUID(),
        'Content-Language': 'ar-EG',
        ETag: '"1"',
      },
      body: Buffer.from(JSON.stringify(body)),
    })),
    verifyAllergy: vi.fn(async () => ({
      status: 200,
      headers: { ETag: '"2"' },
      body: Buffer.from(JSON.stringify({ ...body, status: 'refuted', version: 2 })),
    })),
  };
  const resolve = vi.fn(async (t: string) =>
    t === 'native-fixture'
      ? {
          kind: 'PAT' as const,
          personId: person,
          subjectId: randomUUID(),
          principal: person,
          aal: 2 as const,
        }
      : undefined,
  );
  await registerFeature011AllergyRoutes(a, { config, service, resolveNativePatient: resolve });
  return { a, service, resolve, config };
}
const headers = {
  authorization: 'Bearer native-fixture',
  'x-purpose': 'care',
  'idempotency-key': 'k11-route-key-0001',
  'accept-language': 'ar-EG',
};
describe('Feature011 generated/native/default-off route boundary', () => {
  it('native authorized read exact page/no-store', async () => {
    const f = await app();
    try {
      const r = await f.a.inject({ url: path, headers });
      expect(r.statusCode).toBe(200);
      expect(r.headers['cache-control']).toBe('private, no-store');
      expect(r.json().data).toEqual([]);
    } finally {
      await f.a.close();
    }
  });
  it('native authorized report returns exact original HTTP receipt', async () => {
    const f = await app();
    try {
      const r = await f.a.inject({ method: 'POST', url: path, headers, payload: input });
      expect(r.statusCode).toBe(201);
      expect(r.json()).toEqual(body);
      expect(r.headers.etag).toBe('"1"');
    } finally {
      await f.a.close();
    }
  });
  it('accepts the PostgreSQL integer maximum as a quoted verification version', async () => {
    const f = await app(),
      allergyId = randomUUID();
    try {
      const response = await f.a.inject({
        method: 'POST',
        url: `/v1/allergies/${allergyId}/verification`,
        headers: { ...headers, 'if-match': '"2147483647"' },
        payload: {
          targetStatus: 'refuted',
          reason: 'synthetic verification',
          verificationEvidenceRef: randomUUID(),
        },
      });
      expect(response.statusCode).toBe(200);
      expect(f.service.verifyAllergy).toHaveBeenCalledWith(
        expect.objectContaining({ personId: person, aal: 2 }),
        allergyId,
        expect.any(Object),
        2147483647,
        headers['idempotency-key'],
      );
    } finally {
      await f.a.close();
    }
  });
  it('rejects a safe JavaScript integer above the PostgreSQL verification version limit', async () => {
    const f = await app();
    try {
      const response = await f.a.inject({
        method: 'POST',
        url: `/v1/allergies/${randomUUID()}/verification`,
        headers: { ...headers, 'if-match': '"2147483648"' },
        payload: {
          targetStatus: 'refuted',
          reason: 'synthetic verification',
          verificationEvidenceRef: randomUUID(),
        },
      });
      expect(response.statusCode).toBe(422);
      expect(f.service.verifyAllergy).not.toHaveBeenCalled();
    } finally {
      await f.a.close();
    }
  });
  for (const token of ['', 'synthetic-person:' + person, 'invalid-native'])
    it(`denies non-native authentication ${token}`, async () => {
      const f = await app();
      try {
        const r = await f.a.inject({
          url: path,
          headers: { ...headers, authorization: token ? 'Bearer ' + token : '' },
        });
        expect(r.statusCode).toBe(401);
        expect(f.service.listAllergies).not.toHaveBeenCalled();
        expect(r.headers['content-type']).toContain('application/problem+json');
      } finally {
        await f.a.close();
      }
    });
  for (const change of [
    { status: 'clinician_confirmed' },
    { extra: true },
    { substance: { display: '' } },
  ])
    it(`closed request rejects ${JSON.stringify(change)}`, async () => {
      const f = await app();
      try {
        const r = await f.a.inject({
          method: 'POST',
          url: path,
          headers,
          payload: { ...input, ...change },
        });
        expect(r.statusCode).toBe(422);
        expect(f.service.createAllergy).not.toHaveBeenCalled();
      } finally {
        await f.a.close();
      }
    });
  for (const query of [
    'limit=0',
    'limit=101',
    'limit=x',
    'view=invalid',
    'status=invalid',
    'extra=1',
  ])
    it(`closed query rejects ${query}`, async () => {
      const f = await app();
      try {
        const r = await f.a.inject({ url: path + '?' + query, headers });
        expect(r.statusCode).toBe(422);
        expect(f.service.listAllergies).not.toHaveBeenCalled();
      } finally {
        await f.a.close();
      }
    });
  it('missing key denies before mutation', async () => {
    const f = await app();
    try {
      const { 'idempotency-key': _, ...h } = headers;
      const r = await f.a.inject({ method: 'POST', url: path, headers: h, payload: input });
      expect(r.statusCode).toBe(400);
      expect(f.service.createAllergy).not.toHaveBeenCalled();
    } finally {
      await f.a.close();
    }
  });
  it('missing purpose denies', async () => {
    const f = await app();
    try {
      const r = await f.a.inject({ url: path, headers: { ...headers, 'x-purpose': '' } });
      expect(r.statusCode).toBe(403);
      expect(r.json().code).toBe('purpose-required');
    } finally {
      await f.a.close();
    }
  });
  it('default-off exposes no allergy route', async () => {
    const f = await app(false);
    try {
      expect((await f.a.inject({ url: path, headers })).statusCode).toBe(404);
    } finally {
      await f.a.close();
    }
  });
  it('dynamic kill denies without queue or service call', async () => {
    const f = await app();
    try {
      f.config.feature011KillSwitch = true;
      const r = await f.a.inject({ method: 'POST', url: path, headers, payload: input });
      expect(r.statusCode).toBe(503);
      expect(f.service.createAllergy).not.toHaveBeenCalled();
    } finally {
      await f.a.close();
    }
  });
});
