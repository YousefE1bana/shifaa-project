import type { Feature011ArtifactReview } from '@shifaa/contracts/feature-011';
import { canonicalBytes, deny, type Envelope } from './protection.js';
import type { Facts, Reason } from './allergy-protection.js';
import type { ReceiptRecord } from './mutation-receipts.js';
const same = (left: unknown, right: unknown) => canonicalBytes(left).equals(canonicalBytes(right));
export interface AllergyPreflight {
  patientId: string;
  allergyId: string;
  revisionId: string;
  revisionVersion: number;
  previousRevisionId: string | null;
  facts: Facts;
  reason: Reason | null;
  protectedFacts: Envelope;
  protectedReason: Envelope | null;
}
export function composeAllergy(
  prepared: AllergyPreflight,
  record: ReceiptRecord,
  projection: unknown,
): unknown {
  const row = projection as Record<string, unknown>;
  if (
    row['patientId'] !== prepared.patientId ||
    row['allergyId'] !== prepared.allergyId ||
    row['revisionId'] !== prepared.revisionId ||
    row['version'] !== prepared.revisionVersion ||
    row['previousRevisionId'] !== prepared.previousRevisionId ||
    record.targetResourceId !== prepared.allergyId ||
    Number(record.responseResourceVersion) !== prepared.revisionVersion ||
    !same(row['facts'], prepared.protectedFacts) ||
    !same(row['reason'], prepared.protectedReason)
  )
    deny();
  const { contractId: _, ...facts } = prepared.facts;
  return {
    revisionId: row['revisionId'],
    allergyId: row['allergyId'],
    patientId: row['patientId'],
    version: row['version'],
    previousRevisionId: row['previousRevisionId'],
    status: row['status'],
    ...facts,
    recorderPersonId: row['recorderPersonId'],
    recordedAt: row['recordedAt'],
    actionActorPersonId: row['actionActorPersonId'],
    actionAt: row['actionAt'],
    verification:
      prepared.reason === null
        ? null
        : {
            reason: prepared.reason.reason,
            evidenceRef: row['verificationEvidenceRef'],
            verifierPersonId: row['actionActorPersonId'],
          },
    correctsAllergyId: row['correctsAllergyId'],
  };
}
/** Prepared by the separate authorized Evidence/Disclosure Port before locks. */
export interface ReviewPreflight {
  releaseId: string;
  artifactVersion: number;
  artifactDigest: string;
  protectedBody: Envelope;
  artifactReview: Feature011ArtifactReview;
  bindings: Readonly<
    Record<'content' | 'code' | 'testVectors', { reference: string; verifiedSha256: string }>
  >;
}
export function composeGovernance(
  prepared: ReviewPreflight,
  record: ReceiptRecord,
  projection: unknown,
): unknown {
  const row = projection as Record<string, unknown>,
    sources = row['privateReviewSources'] as Record<
      string,
      { reference: string; verifiedSha256: string }
    >;
  if (
    row['releaseId'] !== prepared.releaseId ||
    row['artifactVersion'] !== prepared.artifactVersion ||
    row['artifactDigest'] !== prepared.artifactDigest ||
    row['workflowVersion'] !== Number(record.responseResourceVersion) ||
    record.targetResourceId !== prepared.releaseId ||
    !same(row['protectedBody'], prepared.protectedBody)
  )
    deny();
  for (const kind of ['content', 'code', 'testVectors'] as const) {
    const source = sources?.[kind === 'testVectors' ? 'test_vectors' : kind];
    if (
      !source ||
      source.reference !== prepared.bindings[kind].reference ||
      source.verifiedSha256 !== prepared.bindings[kind].verifiedSha256
    )
      deny();
  }
  const { privateReviewSources: _, protectedBody: __, ...publicFields } = row;
  return { ...publicFields, artifactReview: prepared.artifactReview };
}
