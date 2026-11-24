import { createHash } from 'node:crypto';

export type Feature012CanonicalValue =
  | string
  | number
  | boolean
  | null
  | readonly Feature012CanonicalValue[]
  | { readonly [key: string]: Feature012CanonicalValue };

function canonicalJson(value: Feature012CanonicalValue): string {
  if (Array.isArray(value)) return `[${Array.from(value, canonicalJson).join(',')}]`;
  if (value === null || typeof value === 'string' || typeof value === 'boolean')
    return JSON.stringify(value);
  if (typeof value === 'number' && Number.isSafeInteger(value)) return JSON.stringify(value);
  if (typeof value !== 'object') throw new TypeError('Expected a canonical F012 value.');
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null)
    throw new TypeError('Expected a plain F012 record.');
  const record = value as Readonly<Record<string, Feature012CanonicalValue>>;
  const members = Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key]!)}`);
  return `{${members.join(',')}}`;
}

export function encodeFeature012Canonical(value: Feature012CanonicalValue): Uint8Array {
  return Buffer.from(canonicalJson(value), 'utf8');
}

type SourceBinding = {
  readonly sourceKind: 'allergy' | 'medication' | 'mechanism';
  readonly sourceId: string | null;
  readonly projectionScope: string;
  readonly sourceRevisionId: string | null;
  readonly sourceVersion: string | null;
  readonly sourceState:
    | 'verified_empty'
    | 'present'
    | 'missing'
    | 'stale'
    | 'partial'
    | 'unavailable';
  readonly completeness: string;
  readonly freshness: 'current' | 'stale' | 'unknown';
};

type MechanismBinding = {
  readonly context: string;
  readonly manifestDigest: string;
  readonly inputDigests: readonly string[];
};

type PrescriptionRevision = {
  readonly items: readonly Feature012CanonicalValue[];
  readonly substitutionAllowed: boolean;
  readonly expiresAt: string;
};

export type Feature012ClinicalEvidence = {
  readonly prescriptionRevision: PrescriptionRevision;
  readonly requiredSources: readonly SourceBinding[];
  readonly mechanism: MechanismBinding | null;
};

export type Feature012ReviewReliance = {
  readonly clinicalEvidenceDigest: string;
  readonly requestId: string;
  readonly requestPayloadDigest: string;
  readonly lane: 'pharmacist' | 'second_physician';
  readonly assignmentId: string;
  readonly assignmentVersion: number;
  readonly designationId: string;
  readonly designationVersion: number;
  readonly rosterRevision: number;
};

function sourceBinding(member: SourceBinding): Feature012CanonicalValue {
  return {
    sourceKind: member.sourceKind,
    sourceId: member.sourceId,
    projectionScope: member.projectionScope,
    sourceRevisionId: member.sourceRevisionId,
    sourceVersion: member.sourceVersion,
    sourceState: member.sourceState,
    completeness: member.completeness,
    freshness: member.freshness,
  };
}

function digest(value: Feature012CanonicalValue): string {
  return createHash('sha256').update(encodeFeature012Canonical(value)).digest('hex');
}

export function clinicalEvidenceDigest(evidence: Feature012ClinicalEvidence): string {
  const members = evidence.requiredSources.map((source) => {
    const binding = sourceBinding(source);
    return { binding, bytes: encodeFeature012Canonical(binding) };
  });
  members.sort((left, right) => Buffer.compare(left.bytes, right.bytes));
  const { items, substitutionAllowed, expiresAt } = evidence.prescriptionRevision;
  const mechanism = evidence.mechanism;
  return digest({
    prescriptionRevision: { items, substitutionAllowed, expiresAt },
    requiredSources: members.map(({ binding }) => binding),
    mechanism: mechanism && {
      context: mechanism.context,
      manifestDigest: mechanism.manifestDigest,
      inputDigests: mechanism.inputDigests,
    },
  });
}

export function relianceDigest(reliance: Feature012ReviewReliance): string {
  return digest({
    clinicalEvidenceDigest: reliance.clinicalEvidenceDigest,
    requestId: reliance.requestId,
    requestPayloadDigest: reliance.requestPayloadDigest,
    lane: reliance.lane,
    assignmentId: reliance.assignmentId,
    assignmentVersion: reliance.assignmentVersion,
    designationId: reliance.designationId,
    designationVersion: reliance.designationVersion,
    rosterRevision: reliance.rosterRevision,
  });
}
