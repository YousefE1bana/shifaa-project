import { Value } from '@sinclair/typebox/value';
import {
  feature011Schemas,
  type Feature011ArtifactReview,
  type Feature011PublishReleaseRequest,
} from '@shifaa/contracts/feature-011';
import { ApiPolicyError } from '../identity-onboarding/errors.js';
import { canonicalBytes, uuid } from './protection.js';
import {
  contentKey,
  contentScope,
  releaseMaterials,
  rowReferences,
  validateContentActor,
  type ContentActor,
  type ContentDependencies,
} from './create-release.js';
import { executeReceipt, type HttpReceipt, type ReceiptRecord } from './mutation-receipts.js';
import { composeGovernance } from './response-composition.js';
import { currentContentEligibility } from './content-eligibility.js';
import type { MaterialKind } from './evidence-types.js';
const forbidden = () =>
  new ApiPolicyError(
    'forbidden',
    403,
    'Current publication or disclosure authority is unavailable.',
  );
export class Feature011Publication {
  constructor(
    private readonly deps: ContentDependencies & {
      /** Server-owned exact release context, as for signing preflight. This is
       * only a selector; the narrow SQL projection authorizes the actual read. */
      context: { select(actor: ContentActor, releaseId: string): Promise<{ contentType: string }> };
    },
  ) {}
  async publishClinicalContentRelease(
    actor: ContentActor,
    releaseId: string,
    request: Feature011PublishReleaseRequest,
    options: { key: string; expectedVersion: number },
  ): Promise<HttpReceipt> {
    validateContentActor(actor);
    uuid(releaseId);
    contentKey(options.key);
    if (
      !Value.Check(feature011Schemas.PublishReleaseRequest, request) ||
      !Number.isSafeInteger(options.expectedVersion) ||
      options.expectedVersion < 1
    )
      throw new ApiPolicyError('validation-failed', 422, 'Invalid publication request.');
    const query = { projection: 'governance', releaseId };
    // No caller-supplied content type or person/release mapping is trusted.
    const selected = await this.deps.context.select(actor, releaseId);
    if (!selected?.contentType) throw forbidden();
    const contentType = selected.contentType;
    const exact = async () => {
      const rows = await this.deps.repository.read(actor, contentType, query),
        row = rows.find((r) => r['releaseId'] === releaseId);
      if (!row) throw forbidden();
      return row;
    };
    const scope = contentScope(
      actor,
      {
        operationId: 'publishClinicalContentRelease',
        targetId: releaseId,
        contentType,
        expectedVersion: options.expectedVersion,
        input: {
          responseLanguage: actor.locale,
          responseRequestId: actor.requestId,
          artifactVersion: null,
          artifactDigest: null,
          confirmPublication: null,
        },
      },
      {
        role: 'ADM-MEDICAL',
        binding: {
          releaseId,
          request,
          expectedVersion: options.expectedVersion,
          locale: actor.locale,
          purposes: actor.purposes,
        },
      },
    );
    scope.context = { ...scope.context, idempotency_key: options.key };
    let replayReview: Feature011ArtifactReview | undefined;
    const resolve = async (row: Record<string, unknown>) => {
      const expected = rowReferences(row);
      return releaseMaterials(
        this.deps,
        { releaseId, artifactVersion: Number(row['artifactVersion']) },
        Object.fromEntries(Object.entries(expected).map(([k, v]) => [k, v.reference])) as Record<
          MaterialKind,
          string
        >,
        expected,
      );
    };
    const response = await executeReceipt(scope, {
      store: this.deps.repository.receipts,
      provider: this.deps.provider,
      authorize: async () => {
        await exact();
      },
      authorizeDisclosure: async () => {
        const row = await exact(),
          resolved = await resolve(row);
        try {
          const current = await exact();
          if (!canonicalBytes(rowReferences(current)).equals(canonicalBytes(rowReferences(row))))
            throw forbidden();
          replayReview = resolved.review;
        } finally {
          resolved.dispose();
        }
      },
      prepare: async () => {
        const row = await exact();
        if (row['workflowVersion'] !== options.expectedVersion)
          throw new ApiPolicyError('version-conflict', 409, 'The release version has changed.');
        if (
          row['artifactVersion'] !== request.artifactVersion ||
          row['artifactDigest'] !== request.artifactDigest ||
          row['publicationState'] !== 'draft' ||
          row['creatorPersonId'] === actor.personId
        )
          throw forbidden();
        const resolved = await resolve(row);
        const prepared = {
          releaseId,
          artifactVersion: request.artifactVersion,
          artifactDigest: request.artifactDigest,
          protectedBody: row['protectedBody'] as Parameters<
            typeof composeGovernance
          >[0]['protectedBody'],
          artifactReview: resolved.review,
          bindings: resolved.refs,
        };
        return {
          input: { ...scope.input, ...request },
          compose: (meta: ReceiptRecord, projection: unknown) => {
            const p = projection as Record<string, unknown>;
            currentContentEligibility(p);
            if (p['publicationState'] !== 'published' || p['publisherPersonId'] !== actor.personId)
              throw forbidden();
            return composeGovernance(prepared, meta, projection);
          },
          dispose: resolved.dispose,
        };
      },
    });
    if (
      replayReview &&
      !canonicalBytes(JSON.parse(response.body.toString()).artifactReview).equals(
        canonicalBytes(replayReview),
      )
    ) {
      response.body.fill(0);
      throw forbidden();
    }
    return response;
  }
}
