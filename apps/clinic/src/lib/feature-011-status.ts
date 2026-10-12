import { Feature011ApiError, type Feature011Client } from '@shifaa/api-client/feature-011';
export type StatusPage = Extract<
  Awaited<ReturnType<Feature011Client['listClinicalContent']>>,
  { projection: 'status' }
>;
export type StatusState = {
  kind:
    | 'loading'
    | 'empty'
    | 'ready'
    | 'denied'
    | 'offline'
    | 'stale'
    | 'error'
    | 'terminal'
    | 'gated';
  page: StatusPage | null;
};
const record = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === 'object' && !Array.isArray(v);
const closed = (v: Record<string, unknown>, keys: string[]) =>
  Object.keys(v).every((k) => keys.includes(k));
const uuid = (v: unknown) =>
  typeof v === 'string' &&
  /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(v);
const instant = (v: unknown) =>
  typeof v === 'string' &&
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/.test(v) &&
  Number.isFinite(Date.parse(v));
/** Reject an entire transport page on surplus/private data; rendering consumes
 * only the closed generated metadata shape, never an arbitrary object. */
function isStatusPage(value: unknown): value is StatusPage {
  if (
    !record(value) ||
    !closed(value, ['projection', 'data', 'meta']) ||
    value.projection !== 'status' ||
    !Array.isArray(value.data) ||
    !record(value.meta)
  )
    return false;
  const m = value.meta;
  if (
    !closed(m, ['nextCursor', 'lastUpdatedAt', 'stale']) ||
    !(m.nextCursor === null || typeof m.nextCursor === 'string') ||
    !instant(m.lastUpdatedAt) ||
    typeof m.stale !== 'boolean'
  )
    return false;
  return value.data.every(
    (r) =>
      record(r) &&
      closed(r, [
        'releaseId',
        'source',
        'artifactVersion',
        'effectiveAt',
        'publicationState',
        'eligibility',
        'supersedesReleaseId',
        'initial',
        'signatureStatus',
      ]) &&
      uuid(r.releaseId) &&
      record(r.source) &&
      closed(r.source, ['display', 'reference']) &&
      typeof r.source.display === 'string' &&
      r.source.display.length > 0 &&
      (r.source.reference === undefined ||
        (typeof r.source.reference === 'string' && r.source.reference.length > 0)) &&
      typeof r.artifactVersion === 'number' &&
      Number.isInteger(r.artifactVersion) &&
      r.artifactVersion >= 1 &&
      instant(r.effectiveAt) &&
      r.publicationState === 'published' &&
      ['effective', 'future', 'superseded', 'unavailable'].includes(String(r.eligibility)) &&
      typeof r.initial === 'boolean' &&
      (r.initial ? r.supersedesReleaseId === null : uuid(r.supersedesReleaseId)) &&
      record(r.signatureStatus) &&
      closed(r.signatureStatus, ['physicianApproved', 'pharmacistApproved']) &&
      r.signatureStatus.physicianApproved === true &&
      r.signatureStatus.pharmacistApproved === true,
  );
}
export class ClinicalStatusController {
  state: StatusState = { kind: 'loading', page: null };
  private epoch = 0;
  private abort: AbortController | undefined;
  constructor(
    private readonly client: Feature011Client,
    private readonly changed: (state: StatusState) => void = () => {},
  ) {}
  async load(contentType: string, online = true, cursor?: string): Promise<void> {
    this.clear(online ? 'loading' : 'offline');
    if (!online) return;
    const epoch = this.epoch;
    this.abort = new AbortController();
    try {
      const page = await this.client.listClinicalContent(
        contentType,
        { projection: 'status', ...(cursor ? { cursor } : {}) },
        { signal: this.abort.signal },
      );
      if (epoch !== this.epoch) return;
      if (!isStatusPage(page)) this.set({ kind: 'terminal', page: null });
      else if (page.meta.stale) this.set({ kind: 'stale', page: null });
      else this.set({ kind: page.data.length ? 'ready' : 'empty', page });
    } catch (error) {
      if (epoch !== this.epoch) return;
      const code = error instanceof Feature011ApiError ? error.status : 0;
      this.set({
        kind: [401, 403].includes(code)
          ? 'denied'
          : [404, 503].includes(code)
            ? 'gated'
            : [409, 412].includes(code)
              ? 'stale'
              : 'error',
        page: null,
      });
    }
  }
  clear(kind: StatusState['kind'] = 'denied') {
    this.epoch++;
    this.abort?.abort();
    this.set({ kind, page: null });
  }
  dispose() {
    this.clear();
  }
  private set(state: StatusState) {
    this.state = state;
    this.changed(state);
  }
}
