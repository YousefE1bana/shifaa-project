import { existsSync } from 'node:fs';
import { createHash, randomUUID } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Feature011ListClinicalContentQuery } from '@shifaa/contracts/feature-011';
import type { ContentActor } from './create-release.js';
const personId = randomUUID();
const actor: ContentActor = {
  kind: 'PAT',
  personId,
  subjectId: randomUUID(),
  principal: personId,
  aal: 2,
  requestId: randomUUID(),
  locale: 'ar-EG',
  purposes: ['synthetic.feature011'],
};
const materials = {
  content: Buffer.from('\ufeffعربي e\u0301;,\n'),
  code: Buffer.from('neutral\r\ncode'),
  testVectors: Buffer.from('vector ;,:'),
};
function fixture() {
  const refs = Object.fromEntries(
    Object.entries(materials).map(([k, b]) => [
      k === 'testVectors' ? 'test_vectors' : k,
      { reference: randomUUID(), verifiedSha256: createHash('sha256').update(b).digest('hex') },
    ]),
  );
  const row = {
    releaseId: randomUUID(),
    contentType: 'synthetic',
    governedContentKey: 'neutral',
    effectiveScopeKey: 'isolated',
    source: { display: 'Synthetic' },
    effectiveAt: '2026-10-08T00:00:00.000000Z',
    artifactVersion: 1,
    artifactDigest: 'a'.repeat(64),
    workflowVersion: 1,
    publicationState: 'draft',
    eligibility: 'unavailable',
    initial: true,
    supersedesReleaseId: null,
    creatorPersonId: randomUUID(),
    createdAt: '2026-10-08T00:00:00Z',
    publisherPersonId: null,
    publishedAt: null,
    artifact: {
      contentEvidenceRef: refs['content']!.reference,
      codeEvidenceRef: refs['code']!.reference,
      testVectorEvidenceRef: refs['test_vectors']!.reference,
      declaredDigest: 'a'.repeat(64),
    },
    signatures: [],
    signatureStatus: { physicianApproved: false, pharmacistApproved: false },
    syntheticOnly: true,
    privateReviewSources: refs,
    protectedBody: { keyRef: 'private-body-reference' },
  };
  const source = {
    resolve: vi.fn(async (kind: keyof typeof materials, reference: string) => ({
      kind,
      reference,
      sourceIdentity: 'synthetic.k18',
      sourceEvidenceIdentity: reference,
      bytes: Buffer.from(materials[kind]),
    })),
  };
  const repository = { readContext: vi.fn(async () => [row]) },
    context = { resolve: vi.fn(async () => ({ role: 'ADM-MEDICAL' as const })) };
  return {
    row,
    source,
    repository,
    context,
    deps: {
      repository,
      context,
      material: source,
      evidence: {
        mode: 'isolated-synthetic' as const,
        sourceIdentity: 'synthetic.k18',
        now: () => '2026-10-08T10:00:00.000000Z',
      },
      cursorKey: Buffer.alloc(32, 7),
    },
  };
}
async function invoke(
  f: ReturnType<typeof fixture>,
  query: Feature011ListClinicalContentQuery = { projection: 'governance' },
  currentActor = actor,
) {
  const { Feature011Governance } = await import('./list-clinical-content.js');
  return new Feature011Governance(f.deps).listClinicalContent(currentActor, 'synthetic', query);
}
describe('K18 exact authorized artifact review', () => {
  beforeEach(() =>
    expect(
      existsSync(new URL('./artifact-review.ts', import.meta.url)) &&
        existsSync(new URL('./list-clinical-content.ts', import.meta.url)),
      'MISSING_EXACT_REVIEW_COMPOSITION',
    ).toBe(true),
  );
  it('preserves exact lossless UTF-8 bytes and generated closed projection', async () => {
    const f = fixture(),
      r = await invoke(f);
    if (r.projection !== 'governance') throw Error('Expected governance projection');
    expect(r.data[0]?.artifactReview).toEqual(
      Object.fromEntries(Object.entries(materials).map(([k, b]) => [k, b.toString()])),
    );
    expect(r.data[0]).not.toHaveProperty('keyRef');
    expect(r.data[0]).not.toHaveProperty('protectedBody');
    expect(r.data[0]).not.toHaveProperty('privateReviewSources');
    expect(r.projection).toBe('governance');
  });
  it.each(['missing', 'reference', 'hash', 'type', 'source', 'correlation', 'binary'] as const)(
    'rejects %s source atomically',
    async (mode) => {
      const f = fixture();
      const original = f.source.resolve.getMockImplementation()!;
      f.source.resolve.mockImplementation(async (k, r) => {
        if (mode === 'missing') throw Error('Unavailable source');
        const value = await original(k, r);
        if (mode === 'reference') value.reference = randomUUID();
        if (mode === 'hash') value.bytes = Buffer.from('substituted');
        if (mode === 'type') value.kind = k === 'content' ? 'code' : 'content';
        if (mode === 'source') value.sourceIdentity = 'unapproved';
        if (mode === 'correlation') value.sourceEvidenceIdentity = randomUUID();
        if (mode === 'binary') value.bytes = Buffer.from([0xff]);
        return value;
      });
      await expect(invoke(f)).rejects.toThrow();
    },
  );
  it('rechecks current authority after external resolution', async () => {
    const f = fixture();
    f.repository.readContext
      .mockResolvedValueOnce([f.row])
      .mockRejectedValueOnce(Error('Current authority lost'));
    await expect(invoke(f)).rejects.toThrow('Current authority lost');
  });
  it('rechecks the immutable tuple and rejects resource substitution', async () => {
    const f = fixture();
    f.repository.readContext
      .mockResolvedValueOnce([f.row])
      .mockResolvedValueOnce([{ ...f.row, releaseId: randomUUID() }]);
    await expect(invoke(f)).rejects.toThrow();
  });
  it('denies signing-only access before resolving material', async () => {
    const f = fixture();
    f.repository.readContext.mockRejectedValue(Error('No independently granted read authority'));
    await expect(invoke(f)).rejects.toThrow();
    expect(f.source.resolve).not.toHaveBeenCalled();
  });
  it.each([{ aal: 1 }, { purposes: [] }] as const)(
    'denies invalid native context %j without material resolution',
    async (patch) => {
      const f = fixture();
      await expect(
        invoke(f, { projection: 'governance' }, { ...actor, ...patch }),
      ).rejects.toThrow();
      expect(f.source.resolve).not.toHaveBeenCalled();
    },
  );
  it('fails the entire page if a later row has wrong bound material', async () => {
    const f = fixture();
    f.repository.readContext.mockResolvedValue([
      f.row,
      {
        ...f.row,
        releaseId: randomUUID(),
        privateReviewSources: {
          ...f.row.privateReviewSources,
          content: { reference: randomUUID(), verifiedSha256: '0'.repeat(64) },
        },
      },
    ]);
    await expect(invoke(f)).rejects.toThrow();
  });
  it('rejects clinic status under an admin context without invoking the resolver', async () => {
    const f = fixture();
    await expect(invoke(f, { projection: 'status' })).rejects.toThrow();
    expect(f.source.resolve).not.toHaveBeenCalled();
  });
  it('rejects caller-claimed role/context outside the generated query', async () => {
    const f = fixture();
    await expect(
      invoke(f, { projection: 'governance', role: 'ADM-MEDICAL' } as never),
    ).rejects.toThrow();
    expect(f.source.resolve).not.toHaveBeenCalled();
  });
  it('requires exact-release assigned review and preserves its narrower DTO', async () => {
    const f = fixture();
    f.context.resolve.mockResolvedValue({ role: 'CLN' } as never);
    const r = await invoke(f, {
      projection: 'assigned_review',
      releaseId: f.row.releaseId,
    } as never);
    expect(r.data[0]).not.toHaveProperty('signatures');
    expect(r.data[0]).not.toHaveProperty('creatorPersonId');
  });
  it('preserves permitted empty code/test-vector strings', async () => {
    const f = fixture();
    const original = f.source.resolve.getMockImplementation()!;
    f.source.resolve.mockImplementation(async (k, r) => ({
      ...(await original(k, r)),
      bytes: k === 'content' ? Buffer.from(materials.content) : Buffer.alloc(0),
    }));
    for (const k of ['code', 'test_vectors'] as const)
      f.row.privateReviewSources[k]!.verifiedSha256 = createHash('sha256')
        .update(Buffer.alloc(0))
        .digest('hex');
    const r = await invoke(f);
    if (r.projection !== 'governance') throw Error('Expected governance projection');
    expect(r.data[0]?.['artifactReview']).toEqual({
      content: materials.content.toString(),
      code: '',
      testVectors: '',
    });
  });
  it('denies a public/private immutable reference mismatch', async () => {
    const f = fixture();
    f.row.artifact.contentEvidenceRef = randomUUID();
    await expect(invoke(f)).rejects.toThrow();
    expect(f.source.resolve).not.toHaveBeenCalled();
  });
  it('binds an opaque continuation to native actor, query, locale and limit', async () => {
    const f = fixture(),
      second = { ...f.row, releaseId: randomUUID() };
    f.repository.readContext.mockResolvedValue([f.row, second]);
    const page = await invoke(f, { projection: 'governance', limit: 1 });
    expect(page.meta.nextCursor).toBeTypeOf('string');
    const next = await invoke(f, {
      projection: 'governance',
      limit: 1,
      cursor: page.meta.nextCursor!,
    });
    expect(next.data[0]?.['releaseId']).toBe(second.releaseId);
    for (const query of [
      { projection: 'governance' as const, limit: 2, cursor: page.meta.nextCursor! },
      { projection: 'governance' as const, limit: 1, cursor: page.meta.nextCursor! + 'x' },
    ])
      await expect(invoke(f, query)).rejects.toThrow();
    await expect(
      invoke(
        f,
        { projection: 'governance', limit: 1, cursor: page.meta.nextCursor! },
        { ...actor, personId: randomUUID() },
      ),
    ).rejects.toThrow();
  });
});
