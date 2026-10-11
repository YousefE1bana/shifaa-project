import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { resolveMaterials } from '../services/api/src/modules/feature-011/material-evidence.ts';
import { prepareSigning } from '../services/api/src/modules/feature-011/signing-evidence.ts';
import {
  prepareSupport,
  validateKnownCoding,
} from '../services/api/src/modules/feature-011/allergy-evidence.ts';
// Each runtime supplies a durable SQL snapshot; producer denial must occur
// before any mutation connection is entered, and leave that snapshot exact.
export async function sourceNegatives(config, external, snapshot) {
  const vectors = JSON.parse(
    readFileSync(
      'specs/011-allergies-clinical-content-governance/contracts/verified-evidence-binding-v1-vectors.json',
    ),
  );
  const results = [],
    deny = async (id, work) => {
      const before = snapshot();
      await assert.rejects(work, (e) =>
        ['Feature 011 protection denied', 'K09_SOURCE_UNAVAILABLE'].includes(e.message),
      );
      assert.deepEqual(snapshot(), before);
      results.push({ id, result: 'DENIED_BEFORE_MUTATION_SQL' });
    };
  const artifact = JSON.parse(
    readFileSync(
      'specs/011-allergies-clinical-content-governance/contracts/artifact-canonicalization-v1-vectors.json',
    ),
  ).positive[0];
  const refs = Object.fromEntries(
    Object.entries(artifact.facts.evidence).map(([k, v]) => [
      k,
      { reference: v.ref, verifiedSha256: v.sha256 },
    ]),
  );
  for (const defect of [
    'hash',
    'reference',
    'type',
    'correlation',
    'unavailable',
    'unapproved',
    'malformed',
  ]) {
    const port = {
      resolve: async (kind, reference) => {
        external();
        if (defect === 'unavailable') throw Error('K09_SOURCE_UNAVAILABLE');
        return {
          kind: defect === 'type' ? 'code' : kind,
          reference: defect === 'reference' ? randomUUID() : reference,
          sourceIdentity: 'synthetic.material',
          sourceEvidenceIdentity: defect === 'correlation' ? randomUUID() : reference,
          bytes:
            defect === 'malformed'
              ? 'raw'
              : Buffer.from(defect === 'hash' ? '00' : artifact.materialBytesHex[kind], 'hex'),
        };
      },
    };
    await deny('MATERIAL_' + defect, () =>
      resolveMaterials(
        defect === 'unapproved' ? undefined : config('synthetic.material'),
        port,
        { releaseId: randomUUID(), artifactVersion: 1 },
        refs,
      ),
    );
  }
  const s = vectors.positive.find((v) => v.result.profile === 'signing').result;
  const request = Object.fromEntries(
    [
      'releaseId',
      'artifactVersion',
      'artifactDigest',
      'signerPersonId',
      'capacity',
      'decision',
      'evidenceRef',
    ].map((k) => [k, s[k]]),
  );
  const basis = {
    credentialBasis: s.credentialBasis,
    designationBasis: s.designationBasis,
    authorityBasis: s.authorityBasis,
  };
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
    'unavailable',
    'unapproved',
    'malformed',
  ]) {
    const result = structuredClone(s);
    if (Object.hasOwn(result, field))
      result[field] = typeof result[field] === 'number' ? 2 : 'wrong';
    const port = {
      verify: async () => {
        external();
        if (field === 'unavailable') throw Error('K09_SOURCE_UNAVAILABLE');
        return {
          selector: s.evidenceRef,
          sourceEvidenceIdentity: s.sourceEvidenceIdentity,
          result: field === 'malformed' ? { ...result, rawMaterial: 'prohibited' } : result,
        };
      },
    };
    await deny('SIGNING_' + field, () =>
      prepareSigning(
        field === 'unapproved' ? undefined : config(s.sourceIdentity),
        port,
        request,
        basis,
      ),
    );
  }
  const a = vectors.positive.find((v) => v.result.profile === 'allergy_verification').result;
  const ar = Object.fromEntries(
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
    ].map((k) => [k, a[k]]),
  );
  for (const field of [
    'patientId',
    'allergyId',
    'previousRevisionId',
    'previousVersion',
    'targetStatus',
    'attestorPersonId',
    'consumed',
    'unavailable',
  ]) {
    const row = { ...a, consumed: false };
    if (field === 'consumed') row.consumed = true;
    else if (Object.hasOwn(row, field)) row[field] = typeof row[field] === 'number' ? 9 : 'wrong';
    await deny('SUPPORT_' + field, () =>
      prepareSupport(
        config(a.sourceIdentity),
        {
          lookup: async () => {
            external();
            if (field === 'unavailable') throw Error('K09_SOURCE_UNAVAILABLE');
            return row;
          },
        },
        ar,
        async () => external(),
      ),
    );
  }
  await validateKnownCoding(undefined, undefined, { knowledge: 'unknown' }, ar.revisionId);
  await deny('CODING_UNAPPROVED_KNOWN', () =>
    validateKnownCoding(
      undefined,
      undefined,
      { knowledge: 'known', value: { system: 'synthetic', code: 'x', display: 'neutral' } },
      ar.revisionId,
    ),
  );
  return results;
}
