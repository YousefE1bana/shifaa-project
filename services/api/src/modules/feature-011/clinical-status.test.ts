import { randomUUID } from 'node:crypto';
import Fastify from 'fastify';
import { describe, expect, it, vi } from 'vitest';
import type { Feature011ListClinicalContentQuery } from '@shifaa/contracts/feature-011';
import { loadConfig } from '../../config.js';
import { registerFeature011ContentRoutes } from '../../routes/feature-011-content.js';
import { installIdentityErrorHandler } from '../../routes/identity-onboarding.js';
import type { ContentActor } from './create-release.js';
import { Feature011Governance, type ContentReadContext } from './list-clinical-content.js';

const personId = randomUUID();
const actor: ContentActor = {
  kind: 'PAT',
  personId,
  principal: personId,
  subjectId: randomUUID(),
  aal: 2,
  requestId: randomUUID(),
  locale: 'ar-EG',
  purposes: ['synthetic.feature011'],
};
function fixture() {
  const row = {
    releaseId: randomUUID(),
    source: { display: 'Neutral synthetic source' },
    artifactVersion: 1,
    effectiveAt: '2026-10-09T00:00:00.123456Z',
    publicationState: 'published',
    eligibility: 'effective',
    initial: true,
    supersedesReleaseId: null,
    signatureStatus: { physicianApproved: true, pharmacistApproved: true },
  };
  const repository = { readContext: vi.fn(async () => [row] as Record<string, unknown>[]) };
  const context = {
    resolve: vi.fn(
      async (): Promise<ContentReadContext> => ({
        role: 'CLN',
        facilityId: 'f0110000-0000-4000-8200-000000000001',
      }),
    ),
  };
  const material = {
    resolve: vi.fn(async () => {
      throw Error('STATUS_MUST_NOT_RESOLVE');
    }),
  };
  const service = new Feature011Governance({
    repository,
    context,
    material,
    cursorKey: Buffer.alloc(32, 9),
  });
  const read = (
    query: Feature011ListClinicalContentQuery = { projection: 'status' },
    currentActor = actor,
  ) => service.listClinicalContent(currentActor, 'synthetic', query);
  return { row, repository, context, material, service, read };
}
describe('K20 current clinic metadata-only status', () => {
  it('returns exact metadata from SQL without resolving, decrypting or inferring clinical meaning', async () => {
    const f = fixture(),
      page = await f.read();
    expect(page.projection).toBe('status');
    expect(page.data).toEqual([f.row]);
    expect(page.meta.stale).toBe(false);
    expect(f.material.resolve).not.toHaveBeenCalled();
  });
  it('empty eligibility stays empty and never becomes a safe/approved fallback', async () => {
    const f = fixture();
    f.repository.readContext.mockResolvedValue([]);
    expect((await f.read()).data).toEqual([]);
    expect(f.material.resolve).not.toHaveBeenCalled();
  });
  it.each(['future', 'superseded', 'unavailable'])(
    'preserves authoritative %s without inventing effectiveness',
    async (eligibility) => {
      const f = fixture();
      f.row.eligibility = eligibility;
      expect((await f.read()).data[0]).toMatchObject({ eligibility });
    },
  );
  it.each([
    'body',
    'artifactReview',
    'artifactDigest',
    'signatures',
    'signerPersonId',
    'evidenceRef',
    'keyRef',
    'protectedBody',
    'privateReviewSources',
  ])('fails the entire projection if SQL supplies prohibited %s', async (field) => {
    const f = fixture();
    f.repository.readContext.mockResolvedValue([{ ...f.row, [field]: 'PRIVATE_SENTINEL' }]);
    await expect(f.read()).rejects.toThrow();
    expect(f.material.resolve).not.toHaveBeenCalled();
  });
  it('rejects nested private source and signature identities', async () => {
    const f = fixture();
    f.repository.readContext.mockResolvedValue([
      { ...f.row, source: { display: 'neutral', privateSource: 'PRIVATE_SENTINEL' } },
    ]);
    await expect(f.read()).rejects.toThrow();
  });
  it.each([
    { publicationState: 'draft' },
    { signatureStatus: { physicianApproved: false, pharmacistApproved: true } },
    { eligibility: 'safe' },
  ])('rejects unsigned/draft/unknown status %j', async (patch) => {
    const f = fixture();
    f.repository.readContext.mockResolvedValue([{ ...f.row, ...patch }]);
    await expect(f.read()).rejects.toThrow();
  });
  it.each([{ aal: 1 }, { purposes: [] }] as const)(
    'denies insufficient native actor context %j before SQL',
    async (patch) => {
      const f = fixture();
      await expect(f.read({ projection: 'status' }, { ...actor, ...patch })).rejects.toMatchObject({
        status: 403,
      });
      expect(f.repository.readContext).not.toHaveBeenCalled();
    },
  );
  it.each([{ role: 'ADM-MEDICAL' }, { role: 'CLN' }, { role: 'PHA', facilityId: 'not-a-uuid' }])(
    'requested status grants no clinic context %j',
    async (context) => {
      const f = fixture();
      f.context.resolve.mockResolvedValue(context as ContentReadContext);
      await expect(f.read()).rejects.toMatchObject({ status: 403 });
      expect(f.repository.readContext).not.toHaveBeenCalled();
    },
  );
  it('requires separately current SQL read authority and never consults material', async () => {
    const f = fixture();
    f.repository.readContext.mockRejectedValue(
      Object.assign(Error('current status grant absent'), { code: '42501' }),
    );
    await expect(f.read()).rejects.toMatchObject({ code: '42501' });
    expect(f.material.resolve).not.toHaveBeenCalled();
  });
  it('reauthorizes current context and rejects loss before disclosure', async () => {
    const f = fixture();
    f.context.resolve
      .mockResolvedValueOnce({ role: 'CLN', facilityId: randomUUID() })
      .mockResolvedValueOnce({ role: 'CLN', facilityId: randomUUID() });
    await expect(f.read()).rejects.toMatchObject({ status: 403 });
  });
  it('does not disclose an eligibility row that disappeared during the final SQL check', async () => {
    const f = fixture();
    f.repository.readContext.mockResolvedValueOnce([f.row]).mockResolvedValueOnce([]);
    await expect(f.read()).rejects.toMatchObject({ status: 403 });
  });
  it('returns cursor continuation only for the same actor/facility/type/filters/projection', async () => {
    const f = fixture(),
      second = { ...f.row, releaseId: randomUUID() };
    f.repository.readContext.mockResolvedValue([f.row, second]);
    const first = await f.read({ projection: 'status', limit: 1 });
    expect(first.data).toEqual([f.row]);
    expect(first.meta.nextCursor).toBeTruthy();
    const cursor = first.meta.nextCursor!;
    expect((await f.read({ projection: 'status', limit: 1, cursor })).data).toEqual([second]);
    await expect(f.read({ projection: 'status', limit: 2, cursor })).rejects.toMatchObject({
      status: 422,
    });
    await expect(
      f.read({ projection: 'status', limit: 1, cursor }, { ...actor, personId: randomUUID() }),
    ).rejects.toMatchObject({ status: 422 });
    f.context.resolve.mockResolvedValue({ role: 'CLN', facilityId: randomUUID() });
    await expect(f.read({ projection: 'status', limit: 1, cursor })).rejects.toMatchObject({
      status: 422,
    });
  });
  it('rejects an exact-release substitution and malformed cursor without resolver access', async () => {
    const f = fixture();
    await expect(f.read({ projection: 'status', releaseId: randomUUID() })).rejects.toMatchObject({
      status: 403,
    });
    await expect(f.read({ projection: 'status', cursor: 'tampered.token' })).rejects.toMatchObject({
      status: 422,
    });
  });
  it('existing HTTP route exposes closed no-store metadata', async () => {
    const f = fixture(),
      app = Fastify({ genReqId: () => randomUUID() });
    installIdentityErrorHandler(app);
    await registerFeature011ContentRoutes(app, {
      config: loadConfig({
        NODE_ENV: 'test',
        SHIFAA_SYNTHETIC_MODE: 'true',
        FEATURE_011_ENABLED: 'true',
        FEATURE_011_ISOLATED_TEST: 'true',
        FEATURE_011_KILL_SWITCH: 'false',
      }),
      service: {
        createClinicalContentRelease: async () => {
          throw Error('NO_STATUS_MUTATION');
        },
      },
      reading: f.service,
      resolveNativePatient: async (token) => (token === 'native-test' ? actor : undefined),
    });
    try {
      const response = await app.inject({
        method: 'GET',
        url: '/v1/admin/clinical-content/synthetic?projection=status',
        headers: { authorization: 'Bearer native-test', 'x-purpose': 'synthetic.feature011' },
      });
      expect(response.statusCode).toBe(200);
      expect(response.json().data).toEqual([f.row]);
      expect(response.headers['cache-control']).toBe('private, no-store');
      const bad = await app.inject({
        method: 'GET',
        url: '/v1/admin/clinical-content/synthetic?projection=status&facilityId=' + randomUUID(),
        headers: { authorization: 'Bearer native-test', 'x-purpose': 'synthetic.feature011' },
      });
      expect(bad.statusCode).toBe(422);
      expect(bad.body).not.toContain('PRIVATE_SENTINEL');
      expect(f.material.resolve).not.toHaveBeenCalled();
    } finally {
      await app.close();
    }
  });
});
