import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { describe, it, expect } from 'vitest';
import { resolveMaterials } from './material-evidence.js';
import { evidenceProfiles } from './evidence-profiles.js';
import { validateProfile, prepareSigning, currentBasis } from './signing-evidence.js';
import { prepareSupport, validateKnownCoding } from './allergy-evidence.js';
import type {
  EvidenceConfiguration,
  SigningRequest,
  SupportRequest,
  MaterialKind,
} from './evidence-types.js';
import { creationFacts, correctedFacts, type Facts } from './allergy-protection.js';
const f = resolve(
  import.meta.dirname,
  '../../../../..',
  'specs/011-allergies-clinical-content-governance/contracts',
);
const vectors = JSON.parse(
  readFileSync(resolve(f, 'verified-evidence-binding-v1-vectors.json'), 'utf8'),
);
const signing = vectors.positive[0].result;
const now = '2026-10-07T10:00:00.000000Z';
const config: EvidenceConfiguration = {
  mode: 'isolated-synthetic',
  sourceIdentity: 'synthetic.governed-source',
  now: () => now,
};
const request = Object.fromEntries(
  [
    'releaseId',
    'artifactVersion',
    'artifactDigest',
    'signerPersonId',
    'capacity',
    'decision',
    'evidenceRef',
  ].map((k) => [k, signing[k]]),
) as unknown as SigningRequest;
const basis = {
  credentialBasis: signing.credentialBasis,
  designationBasis: signing.designationBasis,
  authorityBasis: signing.authorityBasis,
};
const snapshot = () => structuredClone({ ...signing });
describe('K09 closed profiles and actual producer boundaries', () => {
  it('unchanged historical known coding survives without a new source assertion', async () => {
    const coding: Facts['coding'] = {
      knowledge: 'known',
      value: { system: 'synthetic', code: 'old', display: 'neutral' },
    };
    const previous = await creationFacts(
      {
        substance: { identity: 'synthetic', display: 'neutral' },
        source: { display: 'original' },
        coding,
      },
      async () => {},
    );
    const noFreshSource = async () => {
      throw Error('NEW_VALIDATION_UNAVAILABLE');
    };
    expect((await correctedFacts(previous, {}, noFreshSource)).coding).toEqual(coding);
    expect((await correctedFacts(previous, { coding }, noFreshSource)).coding).toEqual(coding);
    await expect(
      correctedFacts(
        previous,
        {
          coding: {
            knowledge: 'known',
            value: { system: 'synthetic', code: 'new', display: 'neutral' },
          },
        },
        noFreshSource,
      ),
    ).rejects.toThrow('NEW_VALIDATION_UNAVAILABLE');
  });
  it('profile metadata remains the exact approved nine schemas', () => {
    const approved = JSON.parse(
      readFileSync(resolve(f, 'verified-evidence-binding-v1.json'), 'utf8'),
    );
    expect(evidenceProfiles).toEqual(approved.profiles);
  });
  it.each(['0000-01-01T00:00:00.000000Z', '2026-02-30T00:00:00.000000Z'])(
    'malformed source time %s denies before SQL',
    (time) => expect(() => validateProfile('signing', { ...signing, verifiedAt: time })).toThrow(),
  );
  for (const v of vectors.positive)
    it(v.id + ' ' + v.result.profile, () =>
      expect(validateProfile(v.result.profile, v.result)).toEqual(v.result),
    );
  for (const v of vectors.negative)
    it(v.id + ' ' + v.reason, () =>
      expect(() =>
        validateProfile(v.result?.profile ?? 'signing', v.rawJson ?? v.result),
      ).toThrow(),
    );
  it('profile substitution denies', () =>
    expect(() => validateProfile('credential', signing)).toThrow());
  it('source exact signing approved and rejected', async () => {
    for (const decision of ['approved', 'rejected'] as const) {
      const result = await prepareSigning(
        config,
        {
          verify: async () => ({
            selector: request.evidenceRef,
            sourceEvidenceIdentity: signing.sourceEvidenceIdentity,
            result: { ...snapshot(), decision },
          }),
        },
        { ...request, decision },
        basis,
      );
      expect(result.signerPersonId).toBe(request.signerPersonId);
      expect(result.decision).toBe(decision);
      expect(result.bindingId).not.toBe(signing.bindingId);
    }
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
  ])
    it('signing source substitution ' + field, async () => {
      const source = snapshot();
      source[field] = typeof source[field] === 'number' ? 2 : 'wrong';
      await expect(
        prepareSigning(
          config,
          {
            verify: async () => ({
              selector: request.evidenceRef,
              sourceEvidenceIdentity: signing.sourceEvidenceIdentity,
              result: source,
            }),
          },
          request,
          basis,
        ),
      ).rejects.toThrow();
    });
  it('unavailable and unconfigured verifier deny', async () => {
    await expect(prepareSigning(config, undefined, request, basis)).rejects.toThrow();
    await expect(
      prepareSigning(
        config,
        {
          verify: async () => {
            throw Error('unavailable');
          },
        },
        request,
        basis,
      ),
    ).rejects.toThrow();
  });
  for (const k of ['credentialBasis', 'designationBasis', 'authorityBasis'])
    it('exact historical row/version not unrelated replacement ' + k, () => {
      expect(currentBasis(signing[k], signing[k], now)).toBe(true);
      expect(currentBasis(signing[k], { ...signing[k], version: 2 }, now)).toBe(false);
      expect(
        currentBasis(
          signing[k],
          { ...signing[k], id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' },
          now,
        ),
      ).toBe(false);
    });
  it('expiry and changed same-version basis deny', () => {
    expect(
      currentBasis(
        signing.credentialBasis,
        { ...signing.credentialBasis, expiresOn: '2026-01-01' },
        now,
      ),
    ).toBe(false);
    expect(
      currentBasis(
        signing.authorityBasis,
        { ...signing.authorityBasis, validUntil: '2026-10-07T09:00:00.000000Z' },
        now,
      ),
    ).toBe(false);
  });
  const bytes = Buffer.from('K09 immutable neutral material اختبار'),
    sha = createHash('sha256').update(bytes).digest('hex');
  const refs = {
    content: { reference: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', verifiedSha256: sha },
    code: { reference: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2', verifiedSha256: sha },
    testVectors: { reference: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3', verifiedSha256: sha },
  };
  const materialPort = {
    resolve: async (kind: MaterialKind, reference: string) => ({
      kind,
      reference,
      sourceIdentity: config.sourceIdentity,
      sourceEvidenceIdentity: reference,
      bytes: Buffer.from(bytes),
    }),
  };
  it('all three exact material bindings exclude raw bytes', async () => {
    const result = await resolveMaterials(
      config,
      materialPort,
      { releaseId: signing.releaseId, artifactVersion: 1 },
      refs,
    );
    expect(result.materials.content.equals(bytes)).toBe(true);
    expect(Object.keys(result.bindings)).toEqual(['content', 'code', 'testVectors']);
    expect(JSON.stringify(result.bindings)).not.toContain('bytes');
    expect(result.bindings.content.verifiedSha256).toBe(sha);
    result.dispose();
    expect(result.materials.content.every((b: number) => b === 0)).toBe(true);
  });
  for (const error of [
    'hash',
    'reference',
    'kind',
    'identity',
    'unavailable',
    'unapproved',
    'correlation',
  ])
    it('material denies ' + error + ' before SQL', async () => {
      const port = {
        resolve: async (kind: MaterialKind, reference: string) => {
          if (error === 'unavailable') throw Error('unavailable');
          return {
            kind: error === 'kind' ? 'code' : kind,
            reference: error === 'reference' ? refs.code.reference : reference,
            sourceIdentity: error === 'identity' ? 'untrusted' : config.sourceIdentity,
            sourceEvidenceIdentity: error === 'correlation' ? 'unrelated' : reference,
            bytes: Buffer.from(error === 'hash' ? 'changed' : bytes),
          };
        },
      };
      await expect(
        resolveMaterials(
          error === 'unapproved' ? undefined : config,
          port,
          { releaseId: signing.releaseId, artifactVersion: 1 },
          refs,
        ),
      ).rejects.toThrow();
    });
  const support = vectors.positive.find(
    (v: any) => v.result.profile === 'allergy_verification',
  ).result;
  const supportRequest = Object.fromEntries(
    [
      'evidenceRef',
      'patientId',
      'allergyId',
      'previousRevisionId',
      'previousVersion',
      'revisionId',
      'revisionVersion',
      'targetStatus',
      'attestorPersonId',
    ].map((k) => [k, support[k]]),
  ) as unknown as SupportRequest;
  it('support exact private source produces one-use tuple', async () => {
    const result = await prepareSupport(
      { ...config, sourceIdentity: support.sourceIdentity },
      { lookup: async () => ({ ...support, consumed: false }) },
      supportRequest,
      async () => {},
    );
    expect(result.patientId).toBe(support.patientId);
    expect(result.revisionId).toBe(support.revisionId);
  });
  for (const field of [
    'patientId',
    'allergyId',
    'previousRevisionId',
    'previousVersion',
    'targetStatus',
    'attestorPersonId',
    'consumed',
  ])
    it('support denies reuse/substitution ' + field, async () => {
      const row = {
        ...support,
        consumed: false,
        [field]: field === 'consumed' ? true : typeof support[field] === 'number' ? 9 : 'wrong',
      };
      await expect(
        prepareSupport(
          { ...config, sourceIdentity: support.sourceIdentity },
          { lookup: async () => row },
          supportRequest,
          async () => {},
        ),
      ).rejects.toThrow();
    });
  it('coding omitted/unknown accepted, new known requires approved exact source', async () => {
    await validateKnownCoding(undefined, undefined, { knowledge: 'unknown' }, support.revisionId);
    await expect(
      validateKnownCoding(
        undefined,
        undefined,
        { knowledge: 'known', value: { system: 'neutral', code: 'x', display: 'X' } },
        support.revisionId,
      ),
    ).rejects.toThrow();
    const coding: Facts['coding'] = {
      knowledge: 'known',
      value: { system: 'neutral', code: 'x', display: 'X' },
    };
    await validateKnownCoding(
      config,
      {
        validate: async () => ({
          coding,
          revisionId: support.revisionId,
          sourceIdentity: config.sourceIdentity,
          sourceVersion: 'neutral-v1',
        }),
      },
      coding,
      support.revisionId,
    );
    await expect(
      validateKnownCoding(
        config,
        {
          validate: async () => ({
            coding: { knowledge: 'known', value: { system: 'neutral', code: 'y', display: 'X' } },
            revisionId: support.revisionId,
            sourceIdentity: config.sourceIdentity,
            sourceVersion: 'neutral-v1',
          }),
        },
        coding,
        support.revisionId,
      ),
    ).rejects.toThrow();
  });
});
