import { randomBytes, randomUUID } from 'node:crypto';
import { describe, it, expect, vi } from 'vitest';
import { Feature011Allergies, type AllergyActor } from './allergies.js';
import { creationFacts, protectAllergy } from './allergy-protection.js';
import { ApiPolicyError } from '../identity-onboarding/errors.js';

const patientId = randomUUID(),
  allergyId = randomUUID(),
  revisionId = randomUUID(),
  personId = randomUUID();
const actor: AllergyActor = {
  kind: 'PAT',
  subjectId: randomUUID(),
  personId,
  principal: personId,
  aal: 2,
  requestId: randomUUID(),
  locale: 'ar-EG',
  purposes: ['care'],
};
const report = {
  substance: { identity: 'neutral', display: 'مادة تجريبية' },
  source: { display: 'Original synthetic source' },
};
const ref = randomUUID();
const request = {
  targetStatus: 'clinician_confirmed' as const,
  reason: 'سبب تجريبي',
  verificationEvidenceRef: ref,
};
async function fixture(role = 'CLN', status = 'self_reported', version = 1) {
  const secret = randomBytes(32);
  const provider = {
    prepare: vi.fn(async () => ({
      key: Buffer.from(secret),
      keyRef: 'synthetic/k13/versions/1',
      immutable: true,
      release() {},
    })),
  };
  const facts = await creationFacts(report, async () => {
    throw Error('unexpected coding');
  });
  const encrypted = await protectAllergy(
    provider,
    { allergyId, revisionId, revisionVersion: version },
    facts,
    version === 1
      ? null
      : { contractId: 'SHIFAA-F011-ALLERGY-REASON/1', reason: 'Previous reason' },
  );
  provider.prepare.mockClear();
  const previous = {
    allergyId,
    revisionId,
    patientId,
    version,
    previousRevisionId: version === 1 ? null : randomUUID(),
    status,
    facts: encrypted.protectedFacts,
    reason: encrypted.protectedReason,
    recorderPersonId: randomUUID(),
    recordedAt: '2026-10-07T10:00:00Z',
    actionActorPersonId: personId,
    actionAt: '2026-10-07T10:00:00Z',
    verificationEvidenceRef: version === 1 ? null : randomUUID(),
    correctsAllergyId: null,
  };
  const binding = {
    contractId: 'SHIFAA-F011-VERIFIED-EVIDENCE-BINDING/1',
    profile: 'allergy_verification',
    bindingId: randomUUID(),
    producerId: 'f011.allergy_evidence_boundary',
    verifiedAt: '2026-10-07T10:00:00.000000Z',
    evidenceRef: ref,
    patientId,
    allergyId,
    previousRevisionId: revisionId,
    previousVersion: version,
    revisionId: randomUUID(),
    revisionVersion: version + 1,
    targetStatus: request.targetStatus,
    attestorPersonId: personId,
    sourceIdentity: 'synthetic.internal_clinician_provenance',
    sourceEvidenceIdentity: ref,
    synthetic: true,
    consumed: false,
  };
  const support = { lookup: vi.fn(async () => binding) };
  const repository = {
    resolve: vi.fn(async () => ({
      actor,
      role,
      facilityId: randomUUID(),
      encounterId: randomUUID(),
    })),
    read: vi.fn(async () => ({
      view: 'current',
      data: [previous],
      meta: { nextCursor: null, stale: false },
    })),
    receipts: {
      probe: vi.fn(async () => undefined),
      replay: vi.fn(),
      mutate: vi.fn(async (scope, input, work) => {
        const p = input.preparation.protectedRevision;
        const row = {
          ...previous,
          revisionId: p.revisionId,
          previousRevisionId: p.previousRevisionId,
          version: p.revisionVersion,
          status: input.preparation.verifiedEvidence.targetStatus,
          facts: p.protectedFacts,
          reason: p.protectedReason,
          verificationEvidenceRef: ref,
        };
        const meta = {
          receiptId: randomUUID(),
          idempotencyRecordId: randomUUID(),
          operationId: 'verifyAllergy',
          targetResourceType: 'clinical.allergy_revision',
          targetResourceId: allergyId,
          responseResourceVersion: p.revisionVersion,
          responseStatus: 200,
          responseETag: `"${p.revisionVersion}"`,
          responseLanguage: actor.locale,
          responseRequestId: actor.requestId,
        };
        return { value: work(meta, row).http };
      }),
    },
  };
  const service = new Feature011Allergies({
    repository,
    provider,
    support,
    evidence: {
      mode: 'isolated-synthetic',
      sourceIdentity: binding.sourceIdentity,
      now: () => '2026-10-08T10:00:00.000000Z',
    },
  } as any);
  const verify = (...args: any[]) => {
    if (typeof (service as any).verifyAllergy !== 'function')
      throw Error('MISSING_VERIFY_ALLERGY_COMPOSITION');
    return (service as any).verifyAllergy(...args);
  };
  return { verify, repository, provider, support, binding, previous };
}
describe('K13 governed verification composition', () => {
  it('authority loss during exact preflight retains the forbidden problem', async () => {
    const f = await fixture();
    const page = await f.repository.read();
    f.repository.read.mockClear();
    f.repository.read
      .mockResolvedValueOnce(page)
      .mockResolvedValueOnce(page)
      .mockRejectedValueOnce(new ApiPolicyError('forbidden', 403, 'Current scope revoked'));
    await expect(
      f.verify(actor, allergyId, request, 1, 'k13-current-key-001'),
    ).rejects.toMatchObject({ status: 403, code: 'forbidden' });
  });
  for (const [from, to, v] of [
    ['self_reported', 'clinician_confirmed', 1],
    ['self_reported', 'refuted', 1],
    ['clinician_confirmed', 'refuted', 2],
    ['refuted', 'clinician_confirmed', 2],
    ['self_reported', 'entered_in_error', 1],
  ] as const)
    it(`fresh attributable ${from} -> ${to}`, async () => {
      const f = await fixture('CLN', from, v);
      f.binding.targetStatus = to as any;
      const before = structuredClone(f.previous);
      const r = await f.verify(
        actor,
        allergyId,
        { ...request, targetStatus: to },
        v,
        'k13-valid-key-00001',
      );
      const body = JSON.parse(r.body.toString());
      expect(body.status).toBe(to);
      expect(body.version).toBe(v + 1);
      expect(body.revisionId).not.toBe(revisionId);
      expect(body.previousRevisionId).toBe(revisionId);
      expect(body.source).toEqual(report.source);
      expect(body.coding).toEqual({ knowledge: 'unknown' });
      expect(body.verification.reason).toBe(request.reason);
      expect(body.recorderPersonId).toBe(before.recorderPersonId);
      expect(f.previous).toEqual(before);
      expect(f.repository.receipts.mutate).toHaveBeenCalledOnce();
      const input = f.repository.receipts.mutate.mock.calls[0]![1];
      expect(JSON.stringify(input)).not.toContain(request.reason);
      expect(JSON.stringify(input)).not.toContain(report.substance.display);
      expect(input.preparation.protectedRevision.protectedFacts.nonce).not.toBe(before.facts.nonce);
    });
  for (const role of ['PAT', 'GUA', 'DEL'])
    it(`${role} cannot verify`, async () => {
      const f = await fixture(role);
      await expect(f.verify(actor, allergyId, request, 1, 'k13-denied-key-0001')).rejects.toThrow();
      expect(f.repository.receipts.mutate).not.toHaveBeenCalled();
      expect(f.provider.prepare).not.toHaveBeenCalled();
    });
  for (const status of ['entered_in_error', 'clinician_confirmed'])
    it(`denies terminal/same status ${status}`, async () => {
      const f = await fixture('CLN', status, 2);
      await expect(f.verify(actor, allergyId, request, 2, 'k13-state-key-00001')).rejects.toThrow();
      expect(f.repository.receipts.mutate).not.toHaveBeenCalled();
    });
  for (const field of [
    'patientId',
    'allergyId',
    'previousRevisionId',
    'previousVersion',
    'attestorPersonId',
    'targetStatus',
    'sourceEvidenceIdentity',
    'consumed',
  ])
    it(`support rejects ${field} substitution/reuse`, async () => {
      const f = await fixture();
      (f.binding as any)[field] =
        field === 'consumed' ? true : field === 'previousVersion' ? 9 : randomUUID();
      await expect(f.verify(actor, allergyId, request, 1, 'k13-support-key-001')).rejects.toThrow();
      expect(f.repository.receipts.mutate).not.toHaveBeenCalled();
    });
  it('stale head denies before candidate encryption', async () => {
    const f = await fixture();
    await expect(f.verify(actor, allergyId, request, 2, 'k13-stale-key-00001')).rejects.toThrow();
    expect(f.provider.prepare).not.toHaveBeenCalled();
  });
  it('unavailable source denies before mutation', async () => {
    const f = await fixture();
    f.support.lookup.mockRejectedValue(Error('unavailable'));
    await expect(f.verify(actor, allergyId, request, 1, 'k13-source-key-0001')).rejects.toThrow();
    expect(f.repository.receipts.mutate).not.toHaveBeenCalled();
  });
  for (const patch of [
    { reason: '' },
    { targetStatus: 'self_reported' },
    { corrections: { source: { display: 'replacement' } } },
    { corrections: { coding: { knowledge: 'known', value: { system: 'synthetic', code: 'X' } } } },
  ])
    it(`closed request/source/coding ${JSON.stringify(patch)}`, async () => {
      const f = await fixture();
      await expect(
        f.verify(actor, allergyId, { ...request, ...patch }, 1, 'k13-invalid-key-001'),
      ).rejects.toThrow();
      expect(f.repository.receipts.mutate).not.toHaveBeenCalled();
    });
  it('transaction fault cannot produce a success; retry prepares fresh envelopes', async () => {
    const f = await fixture();
    const normal = f.repository.receipts.mutate.getMockImplementation()!;
    f.repository.receipts.mutate.mockRejectedValueOnce(Error('rollback'));
    await expect(f.verify(actor, allergyId, request, 1, 'k13-fault-key-00001')).rejects.toThrow(
      'rollback',
    );
    f.repository.receipts.mutate.mockImplementation(normal);
    await f.verify(actor, allergyId, request, 1, 'k13-fault-key-00001');
    const calls = f.repository.receipts.mutate.mock.calls;
    expect(calls[0]![1].preparation.protectedRevision.revisionId).not.toBe(
      calls[1]![1].preparation.protectedRevision.revisionId,
    );
    expect(calls[0]![1].preparation.protectedRevision.protectedFacts.nonce).not.toBe(
      calls[1]![1].preparation.protectedRevision.protectedFacts.nonce,
    );
  });
});
