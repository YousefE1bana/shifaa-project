import { configured, common, validateProfile, same } from './evidence-validation.js';
import { deny, uuid } from './protection.js';
import type { EvidenceConfiguration, SupportBinding, SupportRequest } from './evidence-types.js';
import type { Facts } from './allergy-protection.js';
import { Value } from '@sinclair/typebox/value';
import { feature011Schemas } from '@shifaa/contracts/feature-011';
import { canonicalBytes } from './protection.js';
export interface SupportSource {
  lookup(reference: string): Promise<SupportBinding & { consumed: boolean }>;
}
export async function prepareSupport(
  config: EvidenceConfiguration | undefined,
  source: SupportSource | undefined,
  request: SupportRequest,
  authorizeExact: () => Promise<void>,
): Promise<SupportBinding> {
  const approved = configured(config);
  if (!source) deny();
  await authorizeExact();
  const expected = structuredClone(request),
    row = await source.lookup(expected.evidenceRef);
  if (!row || row.consumed !== false) deny();
  const { consumed: _, ...binding } = row;
  validateProfile('allergy_verification', binding);
  for (const key of [
    'evidenceRef',
    'patientId',
    'allergyId',
    'previousRevisionId',
    'previousVersion',
    'targetStatus',
    'attestorPersonId',
  ] as const)
    if (row[key] !== expected[key]) deny();
  if (
    row.sourceEvidenceIdentity !== expected.evidenceRef ||
    row.sourceIdentity !== approved.sourceIdentity ||
    row.synthetic !== (approved.mode === 'isolated-synthetic') ||
    expected.revisionVersion !== expected.previousVersion + 1 ||
    expected.revisionId === expected.previousRevisionId ||
    row.verifiedAt > approved.now()
  )
    deny();
  const result = {
    ...binding,
    ...expected,
    ...common('f011.allergy_evidence_boundary', approved.now()),
    producerId: 'f011.allergy_evidence_boundary',
  } as SupportBinding;
  validateProfile('allergy_verification', result);
  return Object.freeze(result);
}
export interface CodingSource {
  validate(
    coding: Facts['coding'],
    revisionId: string,
  ): Promise<{
    coding: Facts['coding'];
    revisionId: string;
    sourceIdentity: string;
    sourceVersion: string;
  }>;
}
export async function validateKnownCoding(
  config: EvidenceConfiguration | undefined,
  source: CodingSource | undefined,
  coding: Facts['coding'] | undefined,
  revisionId: string,
): Promise<void> {
  if (coding === undefined) return;
  if (!Value.Check(feature011Schemas.KnownUnknownCoding, coding)) deny();
  const bytes = canonicalBytes(coding);
  bytes.fill(0);
  if (coding.knowledge === 'unknown') return;
  const approved = configured(config);
  if (!source) deny();
  uuid(revisionId);
  const result = await source.validate(structuredClone(coding), revisionId);
  if (
    !result ||
    !same(result.coding, coding) ||
    result.revisionId !== revisionId ||
    result.sourceIdentity !== approved.sourceIdentity ||
    !result.sourceVersion ||
    result.sourceVersion.includes('\0')
  )
    deny();
}
