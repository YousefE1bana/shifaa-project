import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  clinicalEvidenceDigest,
  encodeFeature012Canonical,
  relianceDigest,
  type Feature012ClinicalEvidence,
  type Feature012ReviewReliance,
} from '@shifaa/core/feature-012';

const text = 'Cafe\u0301 \u062f\u0641\u062a\u0631';
const expiresAt = '2030-01-01T00:00:00.000Z';
const quantity = '9007199254740993.0100';
const draftVectors = [
  {
    name: 'omitted monitoring, UTC and precise decimal',
    input: { text, quantity, expiresAt },
    canonical: `{"expiresAt":"${expiresAt}","quantity":"${quantity}","text":"${text}"}`,
    sha256: '3a3469305cbe50e2e1f9082543db7fbc1a8e00ae98af6d5ab9ce76b6d7f44db9',
  },
  {
    name: 'explicit null monitoring',
    input: { text, monitoring: null, quantity, expiresAt },
    canonical: `{"expiresAt":"${expiresAt}","monitoring":null,"quantity":"${quantity}","text":"${text}"}`,
    sha256: 'e064e3785c02dfabe7656ea8b9be98386f131318b0250572c5dcd6a9d24e5474',
  },
  {
    name: 'visually equivalent composed text has different bytes',
    input: { text: text.normalize('NFC'), quantity, expiresAt },
    canonical: `{"expiresAt":"${expiresAt}","quantity":"${quantity}","text":"${text.normalize('NFC')}"}`,
    sha256: '72ed27bbba729f8286a652030ae8450d892c7f52f129fd19151fb30bb8de5355',
  },
] as const;

type DraftVectorInput = (typeof draftVectors)[number]['input'];

describe('F012 synthetic digest fixtures', () => {
  it.each(draftVectors)('matches the reference SHA-256 for $name', ({ canonical, sha256 }) => {
    expect(createHash('sha256').update(canonical, 'utf8').digest('hex')).toBe(sha256);
  });
});

export function defineFeature012DigestCases(encode?: (value: DraftVectorInput) => Uint8Array) {
  describe.skipIf(!encode)('F012 canonical encoding against proposed synthetic vectors', () => {
    it.each(draftVectors)('$name', ({ input, canonical, sha256 }) => {
      const actual = Buffer.from(encode!(input));
      expect(actual.equals(Buffer.from(canonical, 'utf8'))).toBe(true);
      expect(createHash('sha256').update(actual).digest('hex')).toBe(sha256);
    });
  });
}

defineFeature012DigestCases(encodeFeature012Canonical);

const allergy = {
  sourceKind: 'allergy',
  sourceId: null,
  projectionScope: 'synthetic-patient',
  sourceRevisionId: null,
  sourceVersion: '1',
  sourceState: 'verified_empty',
  completeness: 'complete',
  freshness: 'current',
} as const;
const medication = { ...allergy, sourceKind: 'medication' } as const;
const evidence = {
  prescriptionRevision: { items: [{ text, quantity }], substitutionAllowed: false, expiresAt },
  requiredSources: [medication, allergy],
  mechanism: {
    context: 'synthetic-context',
    manifestDigest: '1'.repeat(64),
    inputDigests: ['2'.repeat(64), '3'.repeat(64)],
  },
} satisfies Feature012ClinicalEvidence;

// Produced independently with Python JSON encoding and hashlib SHA-256.
const expectedEvidence = '36b8ed71336be5f3d5bcf4b7f9a12ed442fd8976da2fff1811c72ad1d6b0a302';
const expectedReliance = 'b6ec2eb973bdefb2fb9e38472a29b21a28d650b6e89c3382f8719178f45d1676';

it('matches the clinical evidence vector with request CAS and source ordering separate', () => {
  const before = { ...evidence, requestVersion: 1 };
  const oppositeLaneChanged = {
    ...evidence,
    prescriptionRevision: { ...evidence.prescriptionRevision, requestVersion: 2 },
    requiredSources: [allergy, medication],
    requestVersion: 2,
  };
  expect(clinicalEvidenceDigest(before)).toBe(expectedEvidence);
  expect(clinicalEvidenceDigest(oppositeLaneChanged)).toBe(expectedEvidence);
  expect(clinicalEvidenceDigest({ ...evidence, requiredSources: [medication] })).not.toBe(
    expectedEvidence,
  );
  expect(clinicalEvidenceDigest({ ...evidence, mechanism: null })).not.toBe(expectedEvidence);
});

it('binds review reliance to the selected lane, assignment and designation', () => {
  const reliance = {
    clinicalEvidenceDigest: expectedEvidence,
    requestId: '00000000-0000-4000-8000-000000000012',
    requestPayloadDigest: '4'.repeat(64),
    lane: 'pharmacist',
    assignmentId: '00000000-0000-4000-8000-000000000013',
    assignmentVersion: 1,
    designationId: '00000000-0000-4000-8000-000000000014',
    designationVersion: 1,
    rosterRevision: 1,
  } satisfies Feature012ReviewReliance;
  expect(relianceDigest(reliance)).toBe(expectedReliance);
  expect(relianceDigest({ ...reliance, lane: 'second_physician' })).not.toBe(expectedReliance);
  expect(relianceDigest({ ...reliance, assignmentVersion: 2 })).not.toBe(expectedReliance);
  expect(relianceDigest({ ...reliance, designationVersion: 2 })).not.toBe(expectedReliance);
  expect(relianceDigest({ ...reliance, rosterRevision: 2 })).not.toBe(expectedReliance);
});
