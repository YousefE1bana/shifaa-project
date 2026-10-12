import { existsSync } from 'node:fs';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ContentActor } from './create-release.js';
import type { ReceiptRecord, ReceiptStore } from './mutation-receipts.js';
const actor: ContentActor = {
  kind: 'PAT',
  subjectId: randomUUID(),
  personId: randomUUID(),
  principal: randomUUID(),
  aal: 2,
  requestId: randomUUID(),
  locale: 'en-EG',
  purposes: ['synthetic.feature011'],
};
function fixture() {
  let locked = false;
  const materials = {
    content: Buffer.from('\ufeffعربي e\u0301;,\n'),
    code: Buffer.from('neutral code'),
    testVectors: Buffer.from('neutral vectors'),
  };
  const sources = Object.fromEntries(
    Object.entries(materials).map(([k, b]) => [
      k === 'testVectors' ? 'test_vectors' : k,
      { reference: randomUUID(), verifiedSha256: createHash('sha256').update(b).digest('hex') },
    ]),
  );
  const row: Record<string, unknown> = {
    releaseId: randomUUID(),
    contentType: 'synthetic',
    governedContentKey: 'neutral',
    effectiveScopeKey: 'isolated',
    source: { display: 'Synthetic' },
    effectiveAt: '2026-10-08T00:00:00.000000Z',
    artifactVersion: 1,
    artifactDigest: 'a'.repeat(64),
    workflowVersion: 3,
    publicationState: 'draft',
    eligibility: 'unavailable',
    initial: true,
    supersedesReleaseId: null,
    creatorPersonId: randomUUID(),
    createdAt: '2026-10-07T00:00:00Z',
    publisherPersonId: null,
    publishedAt: null,
    artifact: {
      contentEvidenceRef: sources['content']!.reference,
      codeEvidenceRef: sources['code']!.reference,
      testVectorEvidenceRef: sources['test_vectors']!.reference,
      declaredDigest: 'a'.repeat(64),
    },
    signatures: [],
    syntheticOnly: true,
    privateReviewSources: sources,
    protectedBody: {
      contractId: 'SHIFAA-F011-BODY-PROTECTED/1',
      keyRef: 'synthetic/body/versions/1',
      nonce: '01'.repeat(12),
      ciphertext: 'aa',
      authTag: '01'.repeat(16),
    },
  };
  const provider = {
    prepare: vi.fn(async () => {
      expect(locked).toBe(false);
      return {
        key: randomBytes(32),
        keyRef: 'synthetic/k17/versions/1',
        immutable: true,
        release() {},
      };
    }),
  };
  const material = {
    resolve: vi.fn(async (kind: keyof typeof materials, reference: string) => {
      expect(locked).toBe(false);
      return {
        kind,
        reference,
        sourceIdentity: 'synthetic.k17',
        sourceEvidenceIdentity: reference,
        bytes: Buffer.from(materials[kind]),
      };
    }),
  };
  const store = {
    probe: vi.fn(async () => undefined),
    replay: vi.fn(),
    mutate: vi.fn<ReceiptStore['mutate']>(async (s, input, work) => {
      locked = true;
      try {
        const meta: ReceiptRecord = {
          receiptId: randomUUID(),
          idempotencyRecordId: randomUUID(),
          operationId: 'publishClinicalContentRelease',
          targetResourceType: 'clinical.content_release',
          targetResourceId: s.targetId,
          responseResourceVersion: 4,
          responseStatus: 200,
          responseETag: '"4"',
          responseLanguage: actor.locale,
          responseRequestId: actor.requestId,
        };
        const projection = {
          ...row,
          workflowVersion: 4,
          publicationState: 'published',
          eligibility: 'effective',
          publisherPersonId: actor.personId,
          publishedAt: '2026-10-08T10:00:00Z',
        };
        return { value: work(meta, projection).http };
      } finally {
        locked = false;
      }
    }),
  };
  const repository = { receipts: store, read: vi.fn(async () => [row]) };
  return {
    row,
    store,
    provider,
    material,
    repository,
    deps: {
      repository,
      provider,
      material,
      context: { select: vi.fn(async () => ({ contentType: 'synthetic' })) },
      evidence: {
        mode: 'isolated-synthetic' as const,
        sourceIdentity: 'synthetic.k17',
        now: () => '2026-10-08T10:00:00.000000Z',
      },
    },
  };
}
async function invoke(f: ReturnType<typeof fixture>, changes = {}) {
  const { Feature011Publication } = await import('./publish-release.js');
  return new Feature011Publication(f.deps).publishClinicalContentRelease(
    actor,
    String(f.row['releaseId']),
    { artifactVersion: 1, artifactDigest: 'a'.repeat(64), confirmPublication: true, ...changes },
    { key: randomUUID(), expectedVersion: 3 },
  );
}
describe('K17 publication composition', () => {
  beforeEach(() =>
    expect(
      existsSync(new URL('./publish-release.ts', import.meta.url)),
      'MISSING_PUBLISH_RELEASE_COMPOSITION',
    ).toBe(true),
  );
  it('returns exact protected original review after authoritative locked publication', async () => {
    const f = fixture();
    const result = await invoke(f);
    const b = JSON.parse(result.body.toString());
    expect(result.status).toBe(200);
    expect(b.workflowVersion).toBe(4);
    expect(b.artifactReview.content).toBe('\ufeffعربي e\u0301;,\n');
    expect(b).not.toHaveProperty('protectedBody');
    expect(b).not.toHaveProperty('privateReviewSources');
    expect(f.store.mutate).toHaveBeenCalledOnce();
    expect(f.provider.prepare).toHaveBeenCalledOnce();
  });
  it('never treats authoritative SQL denial as publication', async () => {
    const f = fixture();
    f.store.mutate.mockRejectedValueOnce(
      Object.assign(new Error('Locked authoritative denial'), { code: '42501' }),
    );
    await expect(invoke(f)).rejects.toThrow('Locked authoritative denial');
  });
  it.each([
    { artifactVersion: 2 },
    { artifactDigest: 'b'.repeat(64) },
    { confirmPublication: false },
    { extra: true },
  ])('rejects incorrect public tuple/body %j before mutation', async (body) => {
    const f = fixture();
    await expect(invoke(f, body)).rejects.toThrow();
    expect(f.store.mutate).not.toHaveBeenCalled();
  });
  it('denies missing current governance disclosure before resolution', async () => {
    const f = fixture();
    f.repository.read.mockResolvedValue([]);
    await expect(invoke(f)).rejects.toThrow();
    expect(f.material.resolve).not.toHaveBeenCalled();
    expect(f.store.mutate).not.toHaveBeenCalled();
  });
  it('denies immutable hash substitution before SQL', async () => {
    const f = fixture();
    (f.row['privateReviewSources'] as Record<string, { verifiedSha256: string }>)[
      'content'
    ]!.verifiedSha256 = '0'.repeat(64);
    await expect(invoke(f)).rejects.toThrow();
    expect(f.store.mutate).not.toHaveBeenCalled();
  });
  it('denies malformed UTF-8 before SQL', async () => {
    const f = fixture();
    f.material.resolve.mockImplementation(async (kind, reference) => ({
      kind,
      reference,
      sourceIdentity: 'synthetic.k17',
      sourceEvidenceIdentity: reference,
      bytes: Buffer.from([0xff]),
    }));
    await expect(invoke(f)).rejects.toThrow();
    expect(f.store.mutate).not.toHaveBeenCalled();
  });
  it('denies stale workflow before fresh preparation', async () => {
    const f = fixture();
    f.row['workflowVersion'] = 4;
    await expect(invoke(f)).rejects.toThrow();
    expect(f.store.mutate).not.toHaveBeenCalled();
  });
  it('denies locked immutable artifact substitution and rolls back response composition', async () => {
    const f = fixture();
    const original = f.store.mutate.getMockImplementation()!;
    f.store.mutate.mockImplementation((s, i, w) =>
      original(s, i, (m, p) => w(m, { ...(p as object), artifactDigest: 'b'.repeat(64) })),
    );
    await expect(invoke(f)).rejects.toThrow();
  });
});
