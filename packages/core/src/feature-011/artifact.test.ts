import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { it, expect } from 'vitest';
import {
  encodeArtifact,
  decodeArtifact,
  normalizeInstant,
  assertDeclaredDigest,
  normalizeSource,
} from './artifact.js';
const path = resolve(
  import.meta.dirname,
  '../../../../specs/011-allergies-clinical-content-governance/contracts/artifact-canonicalization-v1-vectors.json',
);
const vectors = JSON.parse(readFileSync(path, 'utf8'));
for (const v of vectors.positive)
  it(v.id + ' independent frozen bytes and SHA', () => {
    const bytes = encodeArtifact(v.facts);
    expect(Buffer.from(bytes).toString('hex')).toBe(v.canonicalHex);
    expect(createHash('sha256').update(bytes).digest('hex')).toBe(v.sha256);
    expect(bytes.length).toBe(v.octetLength);
    expect(decodeArtifact(bytes)).toEqual(v.facts);
    assertDeclaredDigest(v.sha256, v.sha256);
  });
for (const v of vectors.negative)
  it(v.id + ' ' + v.scenario, () => {
    if (v.facts) expect(() => encodeArtifact(v.facts)).toThrow();
    else if (v.canonicalHex)
      expect(() => decodeArtifact(Buffer.from(v.canonicalHex, 'hex'))).toThrow();
    else if (v.declaredDigest)
      expect(() => assertDeclaredDigest(vectors.positive[0].sha256, v.declaredDigest)).toThrow();
    else if (v.wireEffectiveAt) expect(() => normalizeInstant(v.wireEffectiveAt)).toThrow();
    else throw Error('Uncovered frozen negative');
  });
// B01/B03's frozen boundary notation is RFC3339; §4 independently requires
// six digits in normalized facts. These literals are never implementation-derived.
const canonicalBoundary = {
  B01: '2026-10-01T00:00:00.000000Z',
  B02: '2026-10-01T00:00:00.123456Z',
  B03: '2026-10-01T00:00:00.100000Z',
} as const;
for (const v of vectors.normalization)
  it(v.id + ' exact boundary normalization', () => {
    if (v.wireSource) expect(normalizeSource(v.wireSource)).toEqual(v.canonicalSource);
    else
      expect(normalizeInstant(v.wireEffectiveAt)).toBe(
        canonicalBoundary[v.id as keyof typeof canonicalBoundary],
      );
  });
it('object-key permutation never changes frozen encoding', () => {
  const v = vectors.positive[0];
  const facts = Object.fromEntries(Object.entries(v.facts).reverse());
  expect(Buffer.from(encodeArtifact(facts)).toString('hex')).toBe(v.canonicalHex);
});
it('Unicode normalization changes bytes and digest', () => {
  const a = encodeArtifact(vectors.positive[5].facts),
    b = encodeArtifact(vectors.positive[6].facts);
  expect(Buffer.from(a).equals(Buffer.from(b))).toBe(false);
});
it.each([
  '2026-02-30T00:00:00Z',
  '0000-01-01T00:00:00Z',
  '2026-10-01T24:00:00Z',
  '2026-10-01T00:00:60Z',
  '2026-10-01T00:00:00.1234560Z',
  '0001-01-01T00:00:00+00:01',
  '9999-12-31T23:59:59-00:01',
])('invalid wire instant %s denies', (v) => expect(() => normalizeInstant(v)).toThrow());
it('nil and non-v4 predecessor UUIDs are canonical legal facts', () => {
  const facts = structuredClone(vectors.positive[1].facts);
  facts.predecessor.supersedesReleaseId = '00000000-0000-0000-0000-000000000000';
  expect(decodeArtifact(encodeArtifact(facts))).toEqual(facts);
});
it('wire Source permits omitted reference, but never an explicit null reference', () =>
  expect(() => normalizeSource({ display: 'neutral', reference: null })).toThrow());
