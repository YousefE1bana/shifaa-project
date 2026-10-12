import { Feature011ApiError, type Feature011Client } from '@shifaa/api-client/feature-011';
import type {
  Feature011ClinicalContentList,
  Feature011CreateReleaseRequest,
  Feature011GovernanceRelease,
  Feature011AssignedReviewRelease,
  Feature011SignReleaseRequest,
  Feature011SignReleaseResponse,
} from '@shifaa/contracts';
export type ReviewRow = Feature011GovernanceRelease | Feature011AssignedReviewRelease;
export type Phase =
  | 'loading'
  | 'empty'
  | 'ready'
  | 'review'
  | 'submitting'
  | 'permission'
  | 'stepup'
  | 'error'
  | 'unavailable'
  | 'offline'
  | 'stale'
  | 'reconciling'
  | 'success';
export type DraftIntent = 'initial' | 'successor' | 'rollback';
type Pending = {
  key: string;
  requestId: string;
  type: string;
  projection: 'governance' | 'assigned_review';
} & (
  | { operation: 'create'; intent: DraftIntent; body: Feature011CreateReleaseRequest }
  | {
      operation: 'sign';
      intent: 'approved' | 'rejected';
      id: string;
      version: number;
      body: Feature011SignReleaseRequest;
    }
  | {
      operation: 'publish';
      intent: 'publish';
      id: string;
      version: number;
      body: { artifactVersion: number; artifactDigest: string; confirmPublication: true };
    }
);
export class ContentController {
  phase: Phase = 'empty';
  page: Feature011ClinicalContentList | null = null;
  pending: Pending | null = null;
  receipt: Feature011GovernanceRelease | Feature011SignReleaseResponse | null = null;
  private type = '';
  private projection: 'governance' | 'assigned_review' = 'governance';
  private epoch = 0;
  private attempted = false;
  private confirmed = false;
  isSending = false;
  get needsSettlement() {
    return !!this.pending && this.confirmed;
  }
  constructor(
    private client: Feature011Client,
    private context: { online(): boolean; aal(): number; purpose(): string },
  ) {}
  private available() {
    if (!this.context.online()) {
      this.phase = 'offline';
      return false;
    }
    if (this.context.aal() !== 2) {
      this.phase = 'stepup';
      this.page = null;
      return false;
    }
    if (!this.context.purpose().trim()) {
      this.phase = 'permission';
      this.page = null;
      return false;
    }
    return true;
  }
  async load(
    type: string,
    projection: 'governance' | 'assigned_review',
    releaseId?: string,
    cursor?: string,
  ) {
    if (this.pending) throw Error('Reconcile or cancel the existing request first');
    if (!type.trim() || (projection === 'assigned_review' && !releaseId))
      throw Error('Exact assigned release required');
    this.type = type;
    this.projection = projection;
    this.receipt = null;
    this.page = null;
    const epoch = ++this.epoch;
    if (!this.available()) return;
    this.phase = 'loading';
    try {
      const page = await this.client.listClinicalContent(type, {
        projection,
        ...(releaseId ? { releaseId } : {}),
        ...(cursor ? { cursor } : {}),
        limit: 25,
      });
      if (epoch !== this.epoch) return;
      if (page.projection !== projection) throw Error('Unexpected protected projection');
      this.page = page;
      this.phase = page.meta.stale ? 'stale' : page.data.length ? 'ready' : 'empty';
    } catch (e) {
      if (epoch === this.epoch) {
        this.page = null;
        this.failure(e, false);
      }
    }
  }
  private begin() {
    if (this.pending || !['ready', 'empty', 'success'].includes(this.phase) || !this.available())
      throw Error('Current authorized review required');
    this.receipt = null;
    this.attempted = false;
    this.confirmed = false;
    return {
      key: crypto.randomUUID(),
      requestId: crypto.randomUUID(),
      type: this.type,
      projection: this.projection,
    };
  }
  private exact(row: ReviewRow) {
    const current = this.page?.data.find((r) => r.releaseId === row.releaseId);
    if (
      !current ||
      !('workflowVersion' in current) ||
      current.workflowVersion !== row.workflowVersion ||
      !('artifactDigest' in current) ||
      current.artifactDigest !== row.artifactDigest ||
      current.artifactVersion !== row.artifactVersion ||
      row.publicationState !== 'draft'
    )
      throw Error('Refresh and review the current exact draft');
  }
  prepareCreate(type: string, body: Feature011CreateReleaseRequest, intent: DraftIntent) {
    if (
      this.projection !== 'governance' ||
      type !== this.type ||
      (intent === 'initial') !== body.predecessor.initial
    )
      throw Error('Exact governance lineage required');
    const base = this.begin();
    this.pending = { ...base, operation: 'create', intent, body: structuredClone(body) };
    this.phase = 'review';
  }
  prepareSign(
    row: ReviewRow,
    selection: Pick<
      Feature011SignReleaseRequest,
      'capacity' | 'decision' | 'signingEvidenceRef' | 'reason'
    >,
  ) {
    if (this.projection !== 'assigned_review')
      throw Error('Separate exact assigned review required');
    this.exact(row);
    if (
      !selection.signingEvidenceRef.trim() ||
      (selection.decision === 'rejected' && !selection.reason?.trim())
    )
      throw Error('Review evidence and rejection reason required');
    this.pending = {
      ...this.begin(),
      operation: 'sign',
      intent: selection.decision,
      id: row.releaseId,
      version: row.workflowVersion,
      body: {
        ...selection,
        artifactVersion: row.artifactVersion,
        artifactDigest: row.artifactDigest,
      },
    };
    this.phase = 'review';
  }
  preparePublish(row: ReviewRow) {
    if (this.projection !== 'governance') throw Error('Separate publication authority required');
    this.exact(row);
    this.pending = {
      ...this.begin(),
      operation: 'publish',
      intent: 'publish',
      id: row.releaseId,
      version: row.workflowVersion,
      body: {
        artifactVersion: row.artifactVersion,
        artifactDigest: row.artifactDigest,
        confirmPublication: true,
      },
    };
    this.phase = 'review';
  }
  cancel() {
    if (this.attempted || this.isSending) throw Error('Original outcome must settle first');
    this.pending = null;
    this.phase = !this.context.online() ? 'offline' : this.page?.data.length ? 'ready' : 'empty';
  }
  connectionChanged(online: boolean) {
    this.epoch++;
    this.page = null;
    this.receipt = null;
    this.phase = !online
      ? 'offline'
      : this.pending
        ? this.confirmed
          ? 'reconciling'
          : 'review'
        : 'stale';
  }
  private failure(error: unknown, mutation: boolean) {
    const status = error instanceof Feature011ApiError ? error.status : 0;
    this.phase =
      status === 401 || status === 403
        ? 'permission'
        : status === 409
          ? 'stale'
          : status === 422
            ? 'unavailable'
            : mutation && (status === 0 || status >= 500)
              ? 'reconciling'
              : 'error';
    if (mutation && this.phase !== 'reconciling') this.pending = null;
  }
  async submit() {
    if (this.phase !== 'review') throw Error('Explicit reviewed confirmation required');
    this.confirmed = true;
    await this.send();
  }
  async reconcile() {
    if (
      !this.confirmed ||
      (this.phase !== 'reconciling' && !(this.phase === 'offline' && this.pending))
    )
      throw Error('No original request to reconcile');
    await this.send();
  }
  private async send() {
    if (this.isSending) throw Error('Original request is still in progress');
    const p = this.pending;
    if (!p) throw Error('No prepared request');
    if (!this.available()) return;
    this.phase = 'submitting';
    this.attempted = true;
    this.isSending = true;
    this.page = null;
    try {
      const options = { idempotencyKey: p.key, requestId: p.requestId };
      this.receipt =
        p.operation === 'create'
          ? await this.client.createClinicalContentRelease(p.type, p.body, options)
          : p.operation === 'sign'
            ? await this.client.signClinicalContentRelease(p.id, p.body, {
                ...options,
                version: p.version,
              })
            : await this.client.publishClinicalContentRelease(p.id, p.body, {
                ...options,
                version: p.version,
              });
      this.pending = null;
      this.phase = 'success';
    } catch (e) {
      this.failure(e, true);
    } finally {
      this.isSending = false;
    }
  }
}
