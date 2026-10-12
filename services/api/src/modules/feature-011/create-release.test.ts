import { existsSync } from 'node:fs';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { describe, it, expect, vi } from 'vitest';
import type { ContentDependencies, ContentActor } from './create-release.js';
import { prepareCapability } from './protection.js';
import { releaseAad } from './release-protection.js';
import type { ArtifactFacts } from '@shifaa/core';
import type { Feature011CreateReleaseRequest } from '@shifaa/contracts/feature-011';
import type { Envelope } from './protection.js';
import type { MaterialRef } from './evidence-types.js';
import type { ReceiptRecord, ReceiptStore } from './mutation-receipts.js';
type PreparedInput = {
  handoff: {
    allocation: { releaseId: string; artifactVersion: number };
    protectedBody: Envelope;
    artifactFacts: ArtifactFacts;
    trustedEvidence: Record<keyof typeof materials, MaterialRef>;
  };
  materialBindings: Record<string, unknown>;
};
function prepared(input: Readonly<Record<string, unknown>> | undefined): PreparedInput {
  expect(input).toBeDefined();
  return input as PreparedInput;
}
const personId = randomUUID();
const contentActor: ContentActor = {
  kind: 'PAT',
  subjectId: randomUUID(),
  personId,
  principal: personId,
  aal: 2,
  requestId: randomUUID(),
  locale: 'ar-EG',
  purposes: ['synthetic.feature011'],
};
const materials = {
  content: Buffer.from('\ufeffمحتوى e\u0301;,:\n'),
  code: Buffer.from('neutral code — رمز'),
  testVectors: Buffer.from('neutral test vectors'),
};
const refs = { content: randomUUID(), code: randomUUID(), testVectors: randomUUID() };
const draftRequest = {
  governedContentKey: 'neutral',
  effectiveScopeKey: 'synthetic-only',
  source: { display: 'Synthetic neutral source' },
  effectiveAt: '2026-10-06T10:00:00.123456Z',
  predecessor: { initial: true as const, supersedesReleaseId: null },
  artifact: {
    contentEvidenceRef: refs.content,
    codeEvidenceRef: refs.code,
    testVectorEvidenceRef: refs.testVectors,
  },
};
function fixture() {
  const key = randomBytes(32);
  let captured: Readonly<Record<string, unknown>> | undefined;
  let locked = false;
  const provider = {
    prepare: vi.fn(async () => {
      expect(locked).toBe(false);
      return {
        key: Buffer.from(key),
        keyRef: 'synthetic/k15/versions/1',
        immutable: true,
        release() {},
      };
    }),
  };
  const source = {
    resolve: vi.fn(async (kind: keyof typeof materials, reference: string) => ({
      kind,
      reference,
      sourceIdentity: 'synthetic.k15',
      sourceEvidenceIdentity: reference,
      bytes: Buffer.from(materials[kind]),
    })),
  };
  const rows: Record<string, unknown>[] = [];
  const repository = {
    receipts: {
      probe: vi.fn(async () => undefined),
      replay: vi.fn(),
      mutate: vi.fn<ReceiptStore['mutate']>(async (_s, input, work) => {
        captured = input;
        locked = true;
        try {
          const h = prepared(input).handoff,
            f = h.artifactFacts;
          const artifactDigest = createHash('sha256')
            .update((await import('@shifaa/core')).encodeArtifact(f))
            .digest('hex');
          const row = {
            releaseId: h.allocation.releaseId,
            contentType: f.series.contentType,
            governedContentKey: f.series.governedContentKey,
            effectiveScopeKey: f.series.effectiveScopeKey,
            source: draftRequest.source,
            effectiveAt: f.effectiveAt,
            artifactVersion: h.allocation.artifactVersion,
            artifactDigest,
            workflowVersion: 1,
            publicationState: 'draft',
            eligibility: 'unavailable',
            initial: f.predecessor.initial,
            supersedesReleaseId: f.predecessor.supersedesReleaseId,
            creatorPersonId: personId,
            createdAt: '2026-10-06T11:00:00Z',
            publisherPersonId: null,
            publishedAt: null,
            artifact: { ...draftRequest.artifact, declaredDigest: artifactDigest },
            signatures: [],
            syntheticOnly: true,
            protectedBody: h.protectedBody,
            privateReviewSources: {
              content: h.trustedEvidence.content,
              code: h.trustedEvidence.code,
              test_vectors: h.trustedEvidence.testVectors,
            },
          };
          const meta: ReceiptRecord = {
            receiptId: randomUUID(),
            idempotencyRecordId: randomUUID(),
            operationId: 'createClinicalContentRelease',
            targetResourceType: 'clinical.content_release',
            targetResourceId: row.releaseId,
            responseResourceVersion: 1,
            responseStatus: 201,
            responseETag: '"1"',
            responseLanguage: 'ar-EG',
            responseRequestId: contentActor.requestId,
          };
          const result = work(meta, row);
          return { value: result.http };
        } finally {
          locked = false;
        }
      }),
    },
    read: vi.fn(async () => rows),
  };
  const deps: ContentDependencies = {
    repository,
    provider,
    evidence: {
      mode: 'isolated-synthetic',
      sourceIdentity: 'synthetic.k15',
      now: () => '2026-10-06T10:00:00.000000Z',
    },
    material: source,
  };
  return { deps, repository, provider, source, rows, captured: () => captured };
}
async function service(f: ReturnType<typeof fixture>) {
  if (!existsSync(new URL('./create-release.ts', import.meta.url)))
    throw Error('MISSING_CREATE_RELEASE_COMPOSITION');
  return new (await import('./create-release.js')).Feature011Content(f.deps);
}
describe('K15 approved create release composition', () => {
  it('initial exact tuple, three material bindings and lossless UTF-8 review', async () => {
    const f = fixture(),
      s = await service(f);
    const r = await s.createClinicalContentRelease(
      contentActor,
      'synthetic',
      draftRequest,
      randomUUID(),
    );
    const body = JSON.parse(r.body.toString());
    expect(r.status).toBe(201);
    expect(body.artifactVersion).toBe(1);
    expect(body.artifactReview.content).toBe(materials.content.toString());
    expect(Object.keys(prepared(f.captured()).materialBindings)).toHaveLength(3);
    expect(body).not.toHaveProperty('protectedBody');
    expect(body).not.toHaveProperty('privateReviewSources');
    expect(body.eligibility).toBe('unavailable');
  });
  it('BODY decrypts to the intended exact content using immutable ID/version AAD', async () => {
    const f = fixture(),
      s = await service(f);
    await s.createClinicalContentRelease(contentActor, 'synthetic', draftRequest, randomUUID());
    const h = prepared(f.captured()).handoff,
      c = await prepareCapability(f.provider, 'body', 'decrypt', h.protectedBody.keyRef);
    try {
      expect(
        c.decrypt(
          h.protectedBody,
          releaseAad({ resourceId: h.allocation.releaseId, artifactVersion: 1, keyRef: c.keyRef }),
        ),
      ).toEqual(materials.content);
    } finally {
      c.dispose();
    }
  });
  it('same-version competing drafts use distinct ID/nonces', async () => {
    const f = fixture(),
      s = await service(f);
    await s.createClinicalContentRelease(contentActor, 'synthetic', draftRequest, randomUUID());
    const a = prepared(f.captured()).handoff;
    await s.createClinicalContentRelease(contentActor, 'synthetic', draftRequest, randomUUID());
    const b = prepared(f.captured()).handoff;
    expect(a.allocation.artifactVersion).toBe(b.allocation.artifactVersion);
    expect(a.allocation.releaseId).not.toBe(b.allocation.releaseId);
    expect(a.protectedBody.nonce).not.toBe(b.protectedBody.nonce);
  });
  it('successor uses exact published same-series predecessor version plus one', async () => {
    const f = fixture(),
      s = await service(f),
      id = randomUUID();
    f.rows.push({
      releaseId: id,
      contentType: 'synthetic',
      governedContentKey: draftRequest.governedContentKey,
      effectiveScopeKey: draftRequest.effectiveScopeKey,
      publicationState: 'published',
      artifactVersion: 4,
    });
    await s.createClinicalContentRelease(
      contentActor,
      'synthetic',
      { ...draftRequest, predecessor: { initial: false, supersedesReleaseId: id } },
      randomUUID(),
    );
    expect(prepared(f.captured()).handoff.allocation.artifactVersion).toBe(5);
  });
  for (const kind of ['content', 'code', 'testVectors'] as const)
    it(kind + ' reference/hash substitution denies before mutation', async () => {
      const f = fixture(),
        s = await service(f);
      f.source.resolve.mockImplementation(async (k, r) => ({
        kind: k,
        reference: k === kind ? randomUUID() : r,
        sourceIdentity: 'synthetic.k15',
        sourceEvidenceIdentity: r,
        bytes: Buffer.from(materials[k]),
      }));
      await expect(
        s.createClinicalContentRelease(contentActor, 'synthetic', draftRequest, randomUUID()),
      ).rejects.toThrow();
      expect(f.repository.receipts.mutate).not.toHaveBeenCalled();
    });
  for (const scenario of ['unavailable', 'wrong-source', 'invalid-utf8', 'changed-bytes'] as const)
    it(scenario + ' denies without effect', async () => {
      const f = fixture(),
        s = await service(f);
      let n = 0;
      f.source.resolve.mockImplementation(async (k, r) => {
        if (scenario === 'unavailable') throw Error('offline');
        return {
          kind: k,
          reference: r,
          sourceIdentity: scenario === 'wrong-source' ? 'untrusted' : 'synthetic.k15',
          sourceEvidenceIdentity: r,
          bytes:
            scenario === 'invalid-utf8'
              ? Buffer.from([0xff])
              : scenario === 'changed-bytes' && n++ >= 3
                ? Buffer.from('substitution')
                : Buffer.from(materials[k]),
        };
      });
      await expect(
        s.createClinicalContentRelease(contentActor, 'synthetic', draftRequest, randomUUID()),
      ).rejects.toThrow();
      expect(f.repository.receipts.mutate).not.toHaveBeenCalled();
    });
  it('caller declaredDigest mismatch denies', async () => {
    const f = fixture(),
      s = await service(f);
    await expect(
      s.createClinicalContentRelease(
        contentActor,
        'synthetic',
        { ...draftRequest, artifact: { ...draftRequest.artifact, declaredDigest: '0'.repeat(64) } },
        randomUUID(),
      ),
    ).rejects.toThrow();
    expect(f.repository.receipts.mutate).not.toHaveBeenCalled();
  });
  it('stale initial lineage denies before preparation', async () => {
    const f = fixture(),
      s = await service(f);
    f.rows.push({ initial: true, publicationState: 'published' });
    await expect(
      s.createClinicalContentRelease(contentActor, 'synthetic', draftRequest, randomUUID()),
    ).rejects.toThrow();
    expect(f.provider.prepare).not.toHaveBeenCalled();
  });
  it('wrong-series predecessor denies', async () => {
    const f = fixture(),
      s = await service(f),
      id = randomUUID();
    f.rows.push({
      releaseId: id,
      publicationState: 'published',
      artifactVersion: 1,
      contentType: 'other',
    });
    await expect(
      s.createClinicalContentRelease(
        contentActor,
        'synthetic',
        { ...draftRequest, predecessor: { initial: false, supersedesReleaseId: id } },
        randomUUID(),
      ),
    ).rejects.toThrow();
  });
  it('lost create/review authority denies without resolver/key work', async () => {
    const f = fixture(),
      s = await service(f);
    f.repository.read.mockRejectedValue(Error('42501'));
    await expect(
      s.createClinicalContentRelease(contentActor, 'synthetic', draftRequest, randomUUID()),
    ).rejects.toThrow();
    expect(f.source.resolve).not.toHaveBeenCalled();
    expect(f.provider.prepare).not.toHaveBeenCalled();
  });
  for (const a of [
    { ...contentActor, aal: 1 as const },
    { ...contentActor, purposes: [] },
  ])
    it('native AAL/purpose is required', async () => {
      const f = fixture(),
        s = await service(f);
      await expect(
        s.createClinicalContentRelease(a, 'synthetic', draftRequest, randomUUID()),
      ).rejects.toThrow();
      expect(f.source.resolve).not.toHaveBeenCalled();
    });
  it('closed request rejects client-authored protected/allocation fields', async () => {
    const f = fixture(),
      s = await service(f);
    await expect(
      s.createClinicalContentRelease(
        contentActor,
        'synthetic',
        {
          ...draftRequest,
          allocation: { releaseId: randomUUID() },
        } as unknown as Feature011CreateReleaseRequest,
        randomUUID(),
      ),
    ).rejects.toThrow();
  });
  it('failed locked preflight retries with fresh ID/envelope and no hidden retry', async () => {
    const f = fixture(),
      s = await service(f);
    const key = randomUUID();
    const run = f.repository.receipts.mutate.getMockImplementation()!;
    let first: PreparedInput | undefined;
    f.repository.receipts.mutate.mockImplementationOnce(async (_s, i) => {
      first = prepared(i);
      throw Error('40001');
    });
    await expect(
      s.createClinicalContentRelease(contentActor, 'synthetic', draftRequest, key),
    ).rejects.toThrow();
    f.repository.receipts.mutate.mockImplementation(run);
    await s.createClinicalContentRelease(contentActor, 'synthetic', draftRequest, key);
    const second = prepared(f.captured());
    expect(prepared(first).handoff.allocation.releaseId).not.toBe(
      second.handoff.allocation.releaseId,
    );
    expect(prepared(first).handoff.protectedBody.nonce).not.toBe(
      second.handoff.protectedBody.nonce,
    );
  });
});
