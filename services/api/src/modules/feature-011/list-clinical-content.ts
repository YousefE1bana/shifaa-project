import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { Value } from '@sinclair/typebox/value';
import {
  feature011Schemas,
  type Feature011ListClinicalContentQuery,
} from '@shifaa/contracts/feature-011';
import { normalizeInstant } from '@shifaa/core';
import { ApiPolicyError } from '../identity-onboarding/errors.js';
import {
  validateContentActor,
  type ContentActor,
  type ContentDependencies,
} from './create-release.js';
import { canonicalBytes } from './protection.js';
import { composeArtifactReview, resolveArtifactReview } from './artifact-review.js';
import { composeClinicalStatus, requireClinicStatusContext } from './clinical-status.js';

export interface ContentReadContext {
  role: 'ADM-MEDICAL' | 'CLN' | 'PHA';
  facilityId?: string;
}
export interface GovernanceDependencies extends Pick<ContentDependencies, 'material' | 'evidence'> {
  repository: {
    readContext(
      actor: ContentActor,
      type: string,
      query: Readonly<Record<string, unknown>>,
      context: ContentReadContext,
    ): Promise<Record<string, unknown>[]>;
  };
  /** Trusted server context selector; SQL independently checks the current native principal. */
  context: {
    resolve(
      actor: ContentActor,
      type: string,
      query: Feature011ListClinicalContentQuery,
    ): Promise<ContentReadContext>;
  };
  cursorKey: Buffer;
}
const denied = () =>
  new ApiPolicyError('forbidden', 403, 'Current exact review authority is unavailable.');
const invalid = () =>
  new ApiPolicyError('validation-failed', 422, 'Invalid content filters or cursor.');
export class Feature011Governance {
  constructor(private readonly deps: GovernanceDependencies) {
    if (deps.cursorKey.length < 32) throw Error('F011_CURSOR_KEY_REQUIRED');
  }
  private continuation(raw: string, binding: string): string {
    if (raw.length > 4096) throw invalid();
    const [payload, signature, extra] = raw.split('.');
    if (
      !payload ||
      !signature ||
      extra !== undefined ||
      !/^[A-Za-z0-9_-]+$/.test(payload) ||
      !/^[A-Za-z0-9_-]+$/.test(signature)
    )
      throw invalid();
    const actual = Buffer.from(signature, 'base64url'),
      expected = createHmac('sha256', this.deps.cursorKey).update(payload).digest();
    if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) throw invalid();
    try {
      const value = JSON.parse(Buffer.from(payload, 'base64url').toString());
      if (value.binding !== binding || typeof value.after !== 'string') throw invalid();
      return value.after;
    } catch {
      throw invalid();
    }
  }
  private cursor(after: string, binding: string): string {
    const payload = canonicalBytes({ after, binding }).toString('base64url');
    return (
      payload + '.' + createHmac('sha256', this.deps.cursorKey).update(payload).digest('base64url')
    );
  }
  async listClinicalContent(
    actor: ContentActor,
    type: string,
    query: Feature011ListClinicalContentQuery,
  ) {
    validateContentActor(actor);
    if (!type.length || !Value.Check(feature011Schemas.listClinicalContentQuery, query))
      throw invalid();
    const projection = query.projection;
    if (projection === 'assigned_review' && !query.releaseId) throw denied();
    const context = await this.deps.context.resolve(actor, type, query);
    if (projection === 'status') requireClinicStatusContext(context);
    if (
      (projection === 'governance' && context.role !== 'ADM-MEDICAL') ||
      (projection === 'assigned_review' && !['CLN', 'PHA'].includes(context.role))
    )
      throw denied();
    const { cursor, limit = 25, ...filters } = query;
    const binding = createHash('sha256')
      .update(
        canonicalBytes({
          person: actor.personId,
          aal: actor.aal,
          purposes: actor.purposes,
          locale: actor.locale,
          type,
          context,
          filters,
          limit,
        }),
      )
      .digest('hex');
    const after = cursor ? this.continuation(cursor, binding) : undefined;
    const rows = await this.deps.repository.readContext(actor, type, filters, context);
    const prior = after === undefined ? -1 : rows.findIndex((r) => r['releaseId'] === after);
    if (after !== undefined && prior < 0) throw invalid();
    const selected = rows.slice(prior + 1, prior + 1 + limit),
      data: Record<string, unknown>[] = [];
    for (const row of selected) {
      if (projection === 'governance' && row['contentType'] !== type) throw denied();
      if (query.releaseId && row['releaseId'] !== query.releaseId) throw denied();
      data.push(
        projection === 'status'
          ? composeClinicalStatus(row)
          : composeArtifactReview(row, await resolveArtifactReview(this.deps, row), projection),
      );
    }
    // Short final authorization, after every external lookup and before any response disclosure.
    const finalContext = await this.deps.context.resolve(actor, type, query);
    if (!canonicalBytes(context).equals(canonicalBytes(finalContext))) throw denied();
    const current = await this.deps.repository.readContext(actor, type, filters, finalContext);
    for (const row of selected) {
      const final = current.find((r) => r['releaseId'] === row['releaseId']);
      if (!final || !canonicalBytes(row).equals(canonicalBytes(final))) throw denied();
    }
    const last = selected.at(-1),
      result = {
        projection,
        data,
        meta: {
          nextCursor:
            last && prior + 1 + selected.length < rows.length
              ? this.cursor(String(last['releaseId']), binding)
              : null,
          lastUpdatedAt: normalizeInstant(new Date().toISOString()),
          stale: false,
        },
      };
    if (!Value.Check(feature011Schemas.ClinicalContentList, result))
      throw Error('F011_INVALID_EXACT_REVIEW_PAGE');
    return result;
  }
}
