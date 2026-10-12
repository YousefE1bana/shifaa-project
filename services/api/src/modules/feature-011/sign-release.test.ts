import { existsSync, readFileSync } from 'node:fs';
import { randomBytes, randomUUID } from 'node:crypto';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ContentActor } from './create-release.js';
import type { SigningBinding, SigningBasis } from './evidence-types.js';
import type { MutationScope, ReceiptRecord, ReceiptStore } from './mutation-receipts.js';
import type { SigningSelection } from './sign-release.js';
const frozen = JSON.parse(
  readFileSync(
    new URL(
      '../../../../../specs/011-allergies-clinical-content-governance/contracts/verified-evidence-binding-v1-vectors.json',
      import.meta.url,
    ),
    'utf8',
  ),
).positive[0].result as SigningBinding;
const actor: ContentActor = {
  kind: 'PAT',
  subjectId: randomUUID(),
  personId: frozen.signerPersonId,
  principal: frozen.signerPersonId,
  aal: 2,
  requestId: randomUUID(),
  locale: 'en-EG',
  purposes: ['synthetic.feature011'],
};
const request = {
  capacity: frozen.capacity,
  decision: frozen.decision,
  artifactVersion: frozen.artifactVersion,
  artifactDigest: frozen.artifactDigest,
  signingEvidenceRef: frozen.evidenceRef,
  reason: 'Private synthetic explanation',
};
function fixture() {
  const basis: SigningBasis = structuredClone({
    credentialBasis: frozen.credentialBasis,
    designationBasis: frozen.designationBasis,
    authorityBasis: frozen.authorityBasis,
  });
  const selected: SigningSelection = {
    basis,
    contentType: 'synthetic',
    creatorPersonId: randomUUID(),
    signerPersonIds: [],
    administrative: false,
    artifactVersion: frozen.artifactVersion,
    artifactDigest: frozen.artifactDigest,
  };
  const source = {
    verify: vi.fn(async () => ({
      selector: frozen.evidenceRef,
      sourceEvidenceIdentity: frozen.sourceEvidenceIdentity,
      result: structuredClone(frozen),
    })),
  };
  const context = { select: vi.fn(async () => selected) };
  const provider = {
    prepare: vi.fn(async () => ({
      key: randomBytes(32),
      keyRef: 'synthetic/k16/versions/1',
      immutable: true,
      release() {},
    })),
  };
  let captured: Readonly<Record<string, unknown>> | undefined;
  const store = {
    probe: vi.fn(async () => undefined),
    replay: vi.fn(),
    mutate: vi.fn<ReceiptStore['mutate']>(async (scope, input, work) => {
      captured = input;
      const signed = input['signing'] as SigningBinding;
      const meta: ReceiptRecord = {
        receiptId: randomUUID(),
        idempotencyRecordId: randomUUID(),
        operationId: 'signClinicalContentRelease',
        targetResourceType: 'clinical.content_release',
        targetResourceId: scope.targetId,
        responseResourceVersion: scope.expectedVersion + 1,
        responseStatus: 200,
        responseETag: `"${scope.expectedVersion + 1}"`,
        responseLanguage: actor.locale,
        responseRequestId: actor.requestId,
      };
      const projection = {
        releaseId: scope.targetId,
        workflowVersion: scope.expectedVersion + 1,
        signature: {
          signatureId: randomUUID(),
          capacity: signed.capacity,
          decision: signed.decision,
          artifactVersion: signed.artifactVersion,
          artifactDigest: signed.artifactDigest,
          signerPersonId: signed.signerPersonId,
          signedAt: '2026-10-07T11:00:00.000000Z',
          evidenceRef: signed.evidenceRef,
        },
      };
      return { value: work(meta, projection).http };
    }),
  };
  return {
    deps: {
      store,
      provider,
      context,
      source,
      evidence: {
        mode: 'isolated-synthetic' as const,
        sourceIdentity: frozen.sourceIdentity,
        now: () => '2026-10-07T10:00:00.000000Z',
      },
    },
    store,
    source,
    context,
    provider,
    selected,
    basis,
    captured: () => captured,
  };
}
async function service(f: ReturnType<typeof fixture>) {
  if (!existsSync(new URL('./sign-release.ts', import.meta.url)))
    throw Error('MISSING_SIGN_RELEASE_COMPOSITION');
  return new (await import('./sign-release.js')).Feature011Signing(f.deps);
}
const invoke = async (f: ReturnType<typeof fixture>, overrides = {}) =>
  (await service(f)).signClinicalContentRelease(
    actor,
    frozen.releaseId,
    { ...request, ...overrides },
    { key: randomUUID(), expectedVersion: 1 },
  );
describe('K16 independent exact-basis signing composition', () => {
  beforeEach(() =>
    expect(
      existsSync(new URL('./sign-release.ts', import.meta.url)),
      'MISSING_SIGN_RELEASE_COMPOSITION',
    ).toBe(true),
  );
  it('verified physician signature receipt uses persisted signature identity and closed public fields', async () => {
    const f = fixture(),
      r = await invoke(f),
      body = JSON.parse(r.body.toString());
    expect(r.status).toBe(200);
    expect(body.signature.evidenceRef).toBe(frozen.evidenceRef);
    expect(body.signature.signatureId).toMatch(/^[a-f0-9-]{36}$/);
    expect(body.signature.signerPersonId).toBe(actor.personId);
    expect(Object.keys(body)).toEqual(['releaseId', 'signature', 'workflowVersion']);
    expect(r.body.toString()).not.toContain(request.reason);
    expect(r.body.toString()).not.toContain('credentialBasis');
    expect(f.captured()).not.toHaveProperty('reason');
  });
  it('rejected decision binds the same exact verified artifact', async () => {
    const f = fixture();
    f.source.verify.mockImplementation(async () => ({
      selector: frozen.evidenceRef,
      sourceEvidenceIdentity: frozen.sourceEvidenceIdentity,
      result: { ...structuredClone(frozen), decision: 'rejected' },
    }));
    const r = await invoke(f, { decision: 'rejected' });
    expect(JSON.parse(r.body.toString()).signature).toMatchObject({
      decision: 'rejected',
      artifactVersion: frozen.artifactVersion,
      artifactDigest: frozen.artifactDigest,
    });
  });
  for (const field of [
    'releaseId',
    'artifactVersion',
    'artifactDigest',
    'signerPersonId',
    'capacity',
    'decision',
    'evidenceRef',
    'sourceIdentity',
    'sourceEvidenceIdentity',
  ] as const)
    it('trusted source ' + field + ' substitution denies before SQL', async () => {
      const f = fixture();
      f.source.verify.mockImplementation(async () => {
        const result = structuredClone(frozen);
        Object.assign(result, { [field]: field === 'artifactVersion' ? 2 : 'untrusted' });
        return {
          selector: frozen.evidenceRef,
          sourceEvidenceIdentity: frozen.sourceEvidenceIdentity,
          result,
        };
      });
      await expect(invoke(f)).rejects.toThrow();
      expect(f.store.mutate).not.toHaveBeenCalled();
    });
  it('UUID selector alone is insufficient', async () => {
    const f = fixture();
    await expect(invoke(f, { signingEvidenceRef: randomUUID() })).rejects.toThrow();
    expect(f.store.mutate).not.toHaveBeenCalled();
  });
  it('unavailable signing verifier denies', async () => {
    const f = fixture();
    f.source.verify.mockRejectedValue(Error('unavailable'));
    await expect(invoke(f)).rejects.toThrow();
    expect(f.provider.prepare).not.toHaveBeenCalled();
  });
  for (const key of ['credentialBasis', 'designationBasis', 'authorityBasis'] as const)
    it(key + ' exact version is mandatory', async () => {
      const f = fixture();
      f.basis[key].version++;
      await expect(invoke(f)).rejects.toThrow();
      expect(f.store.mutate).not.toHaveBeenCalled();
    });
  for (const scenario of ['creator', 'prior-person', 'admin'] as const)
    it(scenario + ' independence denial before verifier', async () => {
      const f = fixture();
      if (scenario === 'creator') f.selected.creatorPersonId = actor.personId;
      if (scenario === 'prior-person') f.selected.signerPersonIds = [actor.personId];
      if (scenario === 'admin') f.selected.administrative = true;
      await expect(invoke(f)).rejects.toThrow();
      expect(f.source.verify).not.toHaveBeenCalled();
    });
  it('wrong immutable artifact denies', async () => {
    const f = fixture();
    await expect(invoke(f, { artifactDigest: '0'.repeat(64) })).rejects.toThrow();
    expect(f.store.mutate).not.toHaveBeenCalled();
  });
  it('current source selection failure denies all mutation', async () => {
    const f = fixture();
    f.context.select.mockRejectedValue(Error('no current authority'));
    await expect(invoke(f)).rejects.toThrow();
    expect(f.source.verify).not.toHaveBeenCalled();
  });
  it('SQL response evidence substitution rolls back receipt composition', async () => {
    const f = fixture();
    f.store.mutate.mockImplementation(async (scope, _input, work) => {
      const meta: ReceiptRecord = {
        receiptId: randomUUID(),
        idempotencyRecordId: randomUUID(),
        operationId: 'signClinicalContentRelease',
        targetResourceType: 'clinical.content_release',
        targetResourceId: scope.targetId,
        responseResourceVersion: 2,
        responseStatus: 200,
        responseETag: '"2"',
        responseLanguage: actor.locale,
        responseRequestId: actor.requestId,
      };
      work(meta, {
        releaseId: scope.targetId,
        workflowVersion: 2,
        signature: {
          signatureId: randomUUID(),
          capacity: request.capacity,
          decision: request.decision,
          artifactVersion: request.artifactVersion,
          artifactDigest: request.artifactDigest,
          signerPersonId: actor.personId,
          signedAt: '2026-10-07T11:00:00Z',
          evidenceRef: randomUUID(),
        },
      });
      throw Error('must not reach');
    });
    await expect(invoke(f)).rejects.toThrow('Feature 011 protection denied');
  });
  it('closed request rejects client-supplied basis', async () => {
    const f = fixture();
    await expect(invoke(f, { credentialBasis: f.basis.credentialBasis })).rejects.toThrow();
  });
  for (const v of [0, -1, 1.5])
    it('invalid workflow version ' + v + ' denies', async () => {
      const f = fixture(),
        s = await service(f);
      await expect(
        s.signClinicalContentRelease(actor, frozen.releaseId, request, {
          key: randomUUID(),
          expectedVersion: v,
        }),
      ).rejects.toThrow();
    });
});
