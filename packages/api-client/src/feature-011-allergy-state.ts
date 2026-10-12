import type {
  Feature011AllergyRevision,
  Feature011CreateAllergyRequest,
  Feature011VerifyAllergyRequest,
} from '@shifaa/contracts/feature-011';
import { Feature011ApiError, type Feature011Client } from './feature-011.ts';
export type AllergyPhase =
  | 'loading'
  | 'empty'
  | 'ready'
  | 'denied'
  | 'offline'
  | 'stale'
  | 'error'
  | 'review'
  | 'submitting'
  | 'reconciling'
  | 'success';
export interface AllergyReportOptions {
  client: Pick<Feature011Client, 'listAllergies' | 'createAllergy'> &
    Partial<Pick<Feature011Client, 'verifyAllergy'>>;
  patientId: string;
  encounterId?: string;
  role: 'PAT' | 'GUA' | 'DEL' | 'CLN';
  online: () => boolean;
  idempotencyKey: () => string;
  reauthorize?: () => Promise<void>;
}
/** Transient generated-client state. No durable storage or automatic mutation retry. */
export class AllergyReportController {
  phase: AllergyPhase = 'loading';
  rows: Feature011AllergyRevision[] = [];
  receipt: Feature011AllergyRevision | null = null;
  mutationKind: 'report' | 'verify' = 'report';
  private verification: {
    allergyId: string;
    version: number;
    request: Feature011VerifyAllergyRequest;
  } | null = null;
  private view: 'current' | 'history' = 'current';
  private candidate: Feature011CreateAllergyRequest | null = null;
  private key: string | null = null;
  private generation = 0;
  private disposed = false;
  private inFlight = false;
  constructor(private readonly options: AllergyReportOptions) {}
  get canReport(): boolean {
    return (
      !this.disposed &&
      this.options.online() &&
      ['PAT', 'CLN'].includes(this.options.role) &&
      ['ready', 'empty', 'success'].includes(this.phase)
    );
  }
  async load(view: 'current' | 'history' = 'current'): Promise<void> {
    if (
      (this.candidate || this.verification) &&
      this.key &&
      ['review', 'submitting', 'reconciling'].includes(this.phase)
    ) {
      this.rows = [];
      if (this.phase !== 'review' || !this.options.online()) this.phase = 'reconciling';
      return;
    }
    const generation = ++this.generation;
    this.view = view;
    this.rows = [];
    this.receipt = null;
    if (this.disposed) return;
    if (!this.options.online()) {
      this.phase = 'offline';
      return;
    }
    this.phase = 'loading';
    try {
      await this.options.reauthorize?.();
      if (this.disposed || generation !== this.generation) return;
      const rows: Feature011AllergyRevision[] = [],
        seen = new Set<string>();
      let cursor: string | undefined;
      do {
        const page = await this.options.client.listAllergies(this.options.patientId, {
          view,
          ...(cursor ? { cursor } : {}),
        });
        if (this.disposed || generation !== this.generation) return;
        if (page.meta.stale) {
          this.phase = 'stale';
          return;
        }
        if (page.data.some((row) => row.patientId !== this.options.patientId))
          throw new Feature011ApiError(403, null);
        rows.push(...page.data);
        const next = page.meta.nextCursor ?? undefined;
        if (next && seen.has(next)) throw Error('Repeated cursor');
        if (next) seen.add(next);
        cursor = next;
      } while (cursor);
      if (!this.options.online()) {
        this.phase = 'offline';
        return;
      }
      this.rows = rows;
      this.phase = rows.length ? 'ready' : 'empty';
    } catch (error) {
      if (generation === this.generation && !this.disposed) this.failure(error);
    }
  }
  review(input: Feature011CreateAllergyRequest): void {
    if (!this.canReport || this.inFlight) throw Error('Report unavailable');
    if (input.encounterId && input.encounterId !== this.options.encounterId)
      throw Error('Encounter substitution');
    this.candidate = structuredClone({
      ...input,
      ...(this.options.encounterId ? { encounterId: this.options.encounterId } : {}),
    });
    this.verification = null;
    this.mutationKind = 'report';
    this.key = this.options.idempotencyKey();
    this.phase = 'review';
  }
  canVerify(row: Feature011AllergyRevision): boolean {
    return (
      !this.disposed &&
      !this.inFlight &&
      this.options.online() &&
      this.options.role === 'CLN' &&
      !!this.options.client.verifyAllergy &&
      this.view === 'current' &&
      ['ready', 'success'].includes(this.phase) &&
      row.patientId === this.options.patientId &&
      row.status !== 'entered_in_error' &&
      !(this.receipt?.allergyId === row.allergyId && this.receipt.version !== row.version) &&
      this.rows.some(
        (current) =>
          current.allergyId === row.allergyId &&
          current.revisionId === row.revisionId &&
          current.version === row.version &&
          current.status === row.status,
      )
    );
  }
  reviewVerification(row: Feature011AllergyRevision, input: Feature011VerifyAllergyRequest): void {
    if (!this.canVerify(row)) throw Error('Verification unavailable');
    if (
      Object.keys(input).some(
        (key) =>
          ![
            'targetStatus',
            'reason',
            'verificationEvidenceRef',
            'corrections',
            'encounterId',
          ].includes(key),
      ) ||
      !['clinician_confirmed', 'refuted', 'entered_in_error'].includes(input.targetStatus) ||
      input.targetStatus === row.status ||
      !input.reason.trim() ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        input.verificationEvidenceRef,
      ) ||
      (input.encounterId && input.encounterId !== this.options.encounterId)
    )
      throw Error('Invalid verification basis');
    this.verification = {
      allergyId: row.allergyId,
      version: row.version,
      request: structuredClone({
        ...input,
        ...(this.options.encounterId ? { encounterId: this.options.encounterId } : {}),
      }),
    };
    this.candidate = null;
    this.mutationKind = 'verify';
    this.key = this.options.idempotencyKey();
    this.phase = 'review';
  }
  cancel(): void {
    if (this.phase !== 'review') return;
    this.candidate = null;
    this.verification = null;
    this.key = null;
    this.phase = this.rows.length ? 'ready' : 'empty';
  }
  async submit(): Promise<void> {
    if (
      this.disposed ||
      this.inFlight ||
      (!this.candidate && !this.verification) ||
      !this.key ||
      !['review', 'reconciling'].includes(this.phase)
    )
      return;
    if (!this.options.online()) {
      this.rows = [];
      this.phase = 'reconciling';
      return;
    }
    const generation = this.generation;
    this.inFlight = true;
    this.phase = 'submitting';
    try {
      await this.options.reauthorize?.();
      if (this.disposed || generation !== this.generation) return;
      const verification = this.verification;
      const receipt = verification
        ? await this.options.client.verifyAllergy!(verification.allergyId, verification.request, {
            idempotencyKey: this.key,
            version: verification.version,
          })
        : await this.options.client.createAllergy(this.options.patientId, this.candidate!, {
            idempotencyKey: this.key,
          });
      if (this.disposed || generation !== this.generation) return;
      if (
        receipt.patientId !== this.options.patientId ||
        (verification
          ? receipt.allergyId !== verification.allergyId ||
            receipt.version !== verification.version + 1 ||
            receipt.status !== verification.request.targetStatus
          : receipt.status !== 'self_reported')
      )
        throw new Feature011ApiError(403, null);
      this.receipt = receipt;
      this.candidate = null;
      this.verification = null;
      this.key = null;
      this.phase = 'success';
    } catch (error) {
      if (this.disposed || generation !== this.generation) return;
      this.rows = [];
      this.receipt = null;
      if (
        error instanceof TypeError ||
        (error instanceof Feature011ApiError && error.status >= 500)
      )
        this.phase = 'reconciling';
      else {
        this.candidate = null;
        this.verification = null;
        this.key = null;
        this.failure(error);
      }
    } finally {
      this.inFlight = false;
    }
  }
  private failure(error: unknown): void {
    this.rows = [];
    this.receipt = null;
    const status =
      error && typeof error === 'object' && 'status' in error ? error.status : undefined;
    this.phase = !this.options.online()
      ? 'offline'
      : typeof status === 'number' && [401, 403, 404].includes(status)
        ? 'denied'
        : status === 409
          ? 'stale'
          : 'error';
  }
  dispose(): void {
    this.disposed = true;
    this.generation++;
    this.rows = [];
    this.receipt = null;
    this.candidate = null;
    this.verification = null;
    this.key = null;
  }
}

/** Already-authorized response metadata only; never resolves identity or evidence. */
export function allergyHistoryMetadata(row: Feature011AllergyRevision) {
  return {
    status: row.status,
    terminal: row.status === 'entered_in_error',
    previousRevisionId: row.previousRevisionId,
    originalRecorder: row.recorderPersonId,
    recordedAt: row.recordedAt,
    actor: row.actionActorPersonId,
    actionAt: row.actionAt,
    reason: row.verification?.reason ?? null,
    evidenceRef: row.verification?.evidenceRef ?? null,
    verifierPersonId: row.verification?.verifierPersonId ?? null,
    correctsAllergyId: row.correctsAllergyId,
  };
}
