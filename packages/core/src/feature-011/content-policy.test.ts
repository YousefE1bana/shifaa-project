import { it, expect } from 'vitest';
import {
  nextArtifactVersion,
  canSignContent,
  canPublishContent,
  selectEligibleContent,
  exactCurrentBasis,
} from './content-policy.js';
it('lineage versions permit competing initial and successor drafts', () => {
  expect(nextArtifactVersion(null)).toBe(1);
  expect(nextArtifactVersion(null)).toBe(1);
  expect(nextArtifactVersion({ sameSeries: true, published: true, version: 4 })).toBe(5);
  expect(nextArtifactVersion({ sameSeries: true, published: true, version: 4 })).toBe(5);
});
it.each([
  { sameSeries: false, published: true, version: 4 },
  { sameSeries: true, published: false, version: 4 },
])('invalid predecessor denies', (pred) => expect(() => nextArtifactVersion(pred)).toThrow());
const signing = {
  contextAuthorized: true,
  creatorId: 'creator',
  signerId: 'doctor',
  issuerIds: ['admin'],
  capacity: 'physician',
  decision: 'approved',
  artifactExact: true,
  basisCurrent: true,
  previousDecisions: [],
};
it('independent designated clinician signs without an admin role; rejection valid', () => {
  expect(canSignContent(signing)).toBe(true);
  expect(canSignContent({ ...signing, decision: 'rejected' })).toBe(true);
});
it.each([
  { signerId: 'creator' },
  { issuerIds: ['doctor'] },
  { contextAuthorized: false },
  { artifactExact: false },
  { basisCurrent: false },
  { previousDecisions: [{ personId: 'doctor', capacity: 'pharmacist' }] },
  { previousDecisions: [{ personId: 'other', capacity: 'physician' }] },
])('signing independence/exact basis denies %j', (change) =>
  expect(canSignContent({ ...signing, ...change })).toBe(false),
);
const publication = {
  contextAuthorized: true,
  publisherId: 'publisher',
  creatorId: 'creator',
  artifactExact: true,
  admissionExactAndCurrent: true,
  lineageCurrent: true,
  approvals: [
    { personId: 'doctor', capacity: 'physician', decision: 'approved', exactAndCurrent: true },
    { personId: 'pharmacist', capacity: 'pharmacist', decision: 'approved', exactAndCurrent: true },
  ] as const,
};
it('two distinct exact current approvals and independent publisher admit publication', () =>
  expect(canPublishContent(publication)).toBe(true));
it.each([
  { publisherId: 'creator' },
  { admissionExactAndCurrent: false },
  { lineageCurrent: false },
  { contextAuthorized: false },
  { artifactExact: false },
  { approvals: [publication.approvals[0]] },
  { approvals: [publication.approvals[0], { ...publication.approvals[1], personId: 'doctor' }] },
  { approvals: [publication.approvals[0], { ...publication.approvals[1], decision: 'rejected' }] },
  {
    approvals: [publication.approvals[0], { ...publication.approvals[1], exactAndCurrent: false }],
  },
])('publication exact current independence denies %j', (change) =>
  expect(canPublishContent({ ...publication, ...change })).toBe(false),
);
const parent = {
  releaseId: 'root',
  supersedesReleaseId: null,
  published: true,
  effectiveAt: '2026-10-01T00:00:00.000000Z',
  currentEligible: true,
};
const child = {
  ...parent,
  releaseId: 'child',
  supersedesReleaseId: 'root',
  effectiveAt: '2026-10-10T00:00:00.000001Z',
};
it('future successor never promotes early; precise boundary activates', () => {
  expect(selectEligibleContent([parent, child], '2026-10-07T00:00:00.000000Z')).toBe('root');
  expect(selectEligibleContent([parent, child], child.effectiveAt)).toBe('child');
});
it('ineligible latest artifact never rehabilitates ancestor', () =>
  expect(
    selectEligibleContent([parent, { ...child, currentEligible: false }], child.effectiveAt),
  ).toBeNull());
it('unpublished drafts and future roots are not eligible', () => {
  expect(selectEligibleContent([{ ...parent, published: false }], parent.effectiveAt)).toBeNull();
  expect(selectEligibleContent([parent], '2026-09-01T00:00:00.000000Z')).toBeNull();
});
it('historical basis must equal the exact complete current row; unrelated replacement never rehabilitates', () => {
  const historical = {
    id: 'old',
    version: 1,
    status: 'active',
    source: { id: 'verified', version: '1' },
  };
  expect(exactCurrentBasis(historical, structuredClone(historical))).toBe(true);
  expect(exactCurrentBasis(historical, { ...historical, id: 'replacement' })).toBe(false);
  expect(exactCurrentBasis(historical, { ...historical, version: 2 })).toBe(false);
  expect(
    exactCurrentBasis(historical, { ...historical, source: { id: 'different', version: '1' } }),
  ).toBe(false);
});
