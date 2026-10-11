import { createHash, randomUUID } from 'node:crypto';
import { Value } from '@sinclair/typebox/value';
import {
  encodeArtifact,
  normalizeInstant,
  normalizeSource,
  type ArtifactFacts,
} from '@shifaa/core';
import {
  feature011Schemas,
  type Feature011CreateReleaseRequest,
  type Feature011ArtifactReview,
} from '@shifaa/contracts/feature-011';
import { ApiPolicyError } from '../identity-onboarding/errors.js';
import { hashRequest } from '../../platform/idempotency.js';
import { canonicalBytes, uuid, type KeyProvider } from './protection.js';
import { resolveMaterials, type MaterialSource } from './material-evidence.js';
import { protectRelease } from './release-protection.js';
import { composeGovernance } from './response-composition.js';
import {
  executeReceipt,
  type ReceiptStore,
  type MutationScope,
  type ReceiptRecord,
  type HttpReceipt,
} from './mutation-receipts.js';
import type { AllergyActor } from './allergies.js';
import type { EvidenceConfiguration, MaterialKind, MaterialRef } from './evidence-types.js';
export type ContentActor = AllergyActor;
export interface ContentRepository {
  receipts: ReceiptStore;
  /** Narrow authorized governance projection; never a direct table lookup. */
  read(
    actor: ContentActor,
    contentType: string,
    query: Readonly<Record<string, unknown>>,
  ): Promise<Record<string, unknown>[]>;
}
export interface ContentDependencies {
  repository: ContentRepository;
  provider: KeyProvider | undefined;
  evidence?: EvidenceConfiguration;
  material?: MaterialSource;
}
export function validateContentActor(actor: ContentActor): void {
  uuid(actor.personId);
  uuid(actor.requestId);
  if (actor.aal !== 2 || !actor.purposes.length || !['ar-EG', 'en-EG'].includes(actor.locale))
    throw new ApiPolicyError('forbidden', 403, 'Current authenticated authority is required.');
}
export function contentKey(key: string): void {
  if (key.length < 16 || key.length > 128)
    throw new ApiPolicyError('idempotency-key-invalid', 400, 'Invalid Idempotency-Key.');
}
const denied = () =>
  new ApiPolicyError('forbidden', 403, 'Current content authority is unavailable.');
const invalid = () =>
  new ApiPolicyError('validation-failed', 422, 'The artifact is unavailable or invalid.');
const stale = () => new ApiPolicyError('version-conflict', 409, 'The release lineage has changed.');
export function contentScope(
  actor: ContentActor,
  mutation: Pick<
    MutationScope,
    'operationId' | 'targetId' | 'contentType' | 'expectedVersion' | 'input'
  >,
  authority: { binding: unknown; role: string; facilityId?: string },
): MutationScope {
  return {
    ...mutation,
    context: {
      environment: 'local',
      person_id: actor.personId,
      actor_role: authority.role,
      aal: String(actor.aal),
      purposes: actor.purposes.join(','),
      facility_id: authority.facilityId ?? '',
      encounter_id: '',
      request_id: actor.requestId,
      idempotency_key: '',
      request_hash: hashRequest(authority.binding),
    },
  };
}
/** Independently verified immutable material; transient bytes never reach SQL. */
export async function releaseMaterials(
  deps: Pick<ContentDependencies, 'material' | 'evidence'>,
  target: { releaseId: string; artifactVersion: number },
  references: Record<MaterialKind, string>,
  expected?: Record<MaterialKind, MaterialRef>,
) {
  if (!deps.material || !deps.evidence) throw invalid();
  const refs = {} as Record<MaterialKind, MaterialRef>;
  try {
    for (const kind of ['content', 'code', 'testVectors'] as const) {
      const r = await deps.material.resolve(kind, references[kind]);
      try {
        if (
          r.kind !== kind ||
          r.reference !== references[kind] ||
          r.sourceEvidenceIdentity !== references[kind] ||
          r.sourceIdentity !== deps.evidence.sourceIdentity ||
          !Buffer.isBuffer(r.bytes)
        )
          throw invalid();
        refs[kind] = {
          reference: r.reference,
          verifiedSha256: createHash('sha256').update(r.bytes).digest('hex'),
        };
        if (
          expected &&
          (refs[kind].reference !== expected[kind].reference ||
            refs[kind].verifiedSha256 !== expected[kind].verifiedSha256)
        )
          throw invalid();
      } finally {
        r.bytes?.fill(0);
      }
    }
    const resolved = await resolveMaterials(deps.evidence, deps.material, target, refs);
    try {
      const review = {} as Feature011ArtifactReview;
      for (const kind of ['content', 'code', 'testVectors'] as const) {
        const bytes = resolved.materials[kind];
        const text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes);
        if (!Buffer.from(text).equals(bytes)) throw invalid();
        review[kind] = text;
      }
      return { ...resolved, refs, review };
    } catch (error) {
      resolved.dispose();
      throw error;
    }
  } catch {
    throw invalid();
  }
}
export function rowReferences(row: Record<string, unknown>): Record<MaterialKind, MaterialRef> {
  const sources = row['privateReviewSources'] as Record<string, MaterialRef>;
  if (!sources?.['content'] || !sources['code'] || !sources['test_vectors']) throw denied();
  return {
    content: sources['content'],
    code: sources['code'],
    testVectors: sources['test_vectors'],
  };
}
export class Feature011Content {
  constructor(private readonly deps: ContentDependencies) {}
  async createClinicalContentRelease(
    actor: ContentActor,
    contentType: string,
    request: Feature011CreateReleaseRequest,
    key: string,
  ): Promise<HttpReceipt> {
    validateContentActor(actor);
    contentKey(key);
    if (!contentType.length || !Value.Check(feature011Schemas.CreateReleaseRequest, request))
      throw invalid();
    const query = {
      projection: 'governance',
      governedContentKey: request.governedContentKey,
      effectiveScopeKey: request.effectiveScopeKey,
    };
    const authorize = async () => {
      await this.deps.repository.read(actor, contentType, query);
    };
    const scope = contentScope(
      actor,
      {
        operationId: 'createClinicalContentRelease',
        targetId: actor.personId,
        contentType,
        expectedVersion: 0,
        input: {
          responseLanguage: actor.locale,
          responseRequestId: actor.requestId,
          handoff: null,
          materialBindings: null,
        },
      },
      {
        binding: { contentType, request, locale: actor.locale, purposes: actor.purposes },
        role: 'ADM-MEDICAL',
      },
    );
    scope.context = { ...scope.context, idempotency_key: key };
    let originalReview: Feature011ArtifactReview | undefined;
    const authorizeDisclosure = async (_s: MutationScope, record: ReceiptRecord) => {
      const rows = await this.deps.repository.read(actor, contentType, {
        projection: 'governance',
        releaseId: record.targetResourceId,
      });
      const row = rows.find((r) => r['releaseId'] === record.targetResourceId);
      if (!row) throw denied();
      const expected = rowReferences(row),
        resolved = await releaseMaterials(
          this.deps,
          { releaseId: record.targetResourceId, artifactVersion: Number(row['artifactVersion']) },
          Object.fromEntries(Object.entries(expected).map(([k, v]) => [k, v.reference])) as Record<
            MaterialKind,
            string
          >,
          expected,
        );
      try {
        originalReview = resolved.review;
        const current = await this.deps.repository.read(actor, contentType, {
          projection: 'governance',
          releaseId: record.targetResourceId,
        });
        const rechecked = current.find((r) => r['releaseId'] === row['releaseId']);
        if (
          !rechecked ||
          !canonicalBytes(rowReferences(rechecked)).equals(canonicalBytes(expected))
        )
          throw denied();
      } finally {
        resolved.dispose();
      }
    };
    const response = await executeReceipt(scope, {
      store: this.deps.repository.receipts,
      provider: this.deps.provider,
      authorize,
      authorizeDisclosure,
      prepare: async () => {
        const rows = await this.deps.repository.read(actor, contentType, query);
        let artifactVersion = 1;
        if (request.predecessor.initial) {
          if (rows.some((r) => r['initial'] === true && r['publicationState'] === 'published'))
            throw stale();
        } else {
          const prior = rows.find(
            (r) => r['releaseId'] === request.predecessor.supersedesReleaseId,
          );
          if (
            !prior ||
            prior['publicationState'] !== 'published' ||
            prior['contentType'] !== contentType ||
            prior['governedContentKey'] !== request.governedContentKey ||
            prior['effectiveScopeKey'] !== request.effectiveScopeKey
          )
            throw stale();
          artifactVersion = Number(prior['artifactVersion']) + 1;
          if (!Number.isSafeInteger(artifactVersion) || artifactVersion < 2) throw stale();
        }
        const releaseId = randomUUID();
        const resolved = await releaseMaterials(
          this.deps,
          { releaseId, artifactVersion },
          {
            content: request.artifact.contentEvidenceRef,
            code: request.artifact.codeEvidenceRef,
            testVectors: request.artifact.testVectorEvidenceRef,
          },
        );
        try {
          const facts: ArtifactFacts = {
            contractId: 'SHIFAA-F011-ARTIFACT/1',
            series: {
              contentType,
              governedContentKey: request.governedContentKey,
              effectiveScopeKey: request.effectiveScopeKey,
            },
            source: normalizeSource(request.source),
            effectiveAt: normalizeInstant(request.effectiveAt),
            predecessor: request.predecessor,
            evidence: Object.fromEntries(
              Object.entries(resolved.refs).map(([k, v]) => [
                k,
                { ref: v.reference, sha256: v.verifiedSha256 },
              ]),
            ) as ArtifactFacts['evidence'],
          };
          const artifactDigest = createHash('sha256').update(encodeArtifact(facts)).digest('hex');
          if (
            request.artifact.declaredDigest !== undefined &&
            request.artifact.declaredDigest !== artifactDigest
          )
            throw invalid();
          const protectedBody = await protectRelease(
            this.deps.provider,
            { resourceId: releaseId, artifactVersion },
            resolved.materials.content,
            resolved.materials.content,
          );
          const prepared = {
            releaseId,
            artifactVersion,
            artifactDigest,
            protectedBody,
            artifactReview: resolved.review,
            bindings: resolved.refs,
          };
          return {
            input: {
              ...scope.input,
              handoff: {
                contractId: 'SHIFAA-F011-CREATE-RELEASE-HANDOFF/1',
                artifactFacts: facts,
                trustedEvidence: resolved.refs,
                allocation: { releaseId, artifactVersion },
                protectedBody,
                declaredDigest: request.artifact.declaredDigest ?? null,
              },
              materialBindings: resolved.bindings,
            },
            compose: (meta: ReceiptRecord, projection: unknown) =>
              composeGovernance(prepared, meta, projection),
            dispose: resolved.dispose,
          };
        } catch (error) {
          resolved.dispose();
          throw error;
        }
      },
    });
    if (
      originalReview &&
      !canonicalBytes(JSON.parse(response.body.toString()).artifactReview).equals(
        canonicalBytes(originalReview),
      )
    ) {
      response.body.fill(0);
      throw denied();
    }
    return response;
  }
}
