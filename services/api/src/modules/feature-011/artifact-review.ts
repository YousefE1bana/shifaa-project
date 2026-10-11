import { Value } from '@sinclair/typebox/value';
import { feature011Schemas, type Feature011ArtifactReview } from '@shifaa/contracts/feature-011';
import { ApiPolicyError } from '../identity-onboarding/errors.js';
import { releaseMaterials, rowReferences, type ContentDependencies } from './create-release.js';
import type { MaterialKind } from './evidence-types.js';

/** Exact immutable references only. The resolver runs after the metadata transaction ends. */
export async function resolveArtifactReview(
  deps: Pick<ContentDependencies, 'material' | 'evidence'>,
  row: Record<string, unknown>,
): Promise<Feature011ArtifactReview> {
  const expected = rowReferences(row),
    artifact = row['artifact'] as Record<string, unknown>;
  if (
    !artifact ||
    artifact['contentEvidenceRef'] !== expected.content.reference ||
    artifact['codeEvidenceRef'] !== expected.code.reference ||
    artifact['testVectorEvidenceRef'] !== expected.testVectors.reference ||
    artifact['declaredDigest'] !== row['artifactDigest']
  )
    throw new ApiPolicyError('forbidden', 403, 'The exact artifact is unavailable.');
  const resolved = await releaseMaterials(
    deps,
    { releaseId: String(row['releaseId']), artifactVersion: Number(row['artifactVersion']) },
    Object.fromEntries(
      Object.entries(expected).map(([kind, value]) => [kind, value.reference]),
    ) as Record<MaterialKind, string>,
    expected,
  );
  try {
    return resolved.review;
  } finally {
    resolved.dispose();
  }
}

/** Generated allowlist, rather than stripping a changing set of private fields. */
export function composeArtifactReview(
  row: Record<string, unknown>,
  review: Feature011ArtifactReview,
  projection: 'governance' | 'assigned_review',
) {
  const schema =
    projection === 'governance'
      ? feature011Schemas.GovernanceRelease
      : feature011Schemas.AssignedReviewRelease;
  const result: Record<string, unknown> = {};
  for (const field of Object.keys(schema.properties)) {
    if (field === 'artifactReview') result[field] = review;
    else if (Object.hasOwn(row, field)) result[field] = row[field];
  }
  if (!Value.Check(schema, result)) throw new Error('F011_INVALID_EXACT_REVIEW_PROJECTION');
  return result;
}
