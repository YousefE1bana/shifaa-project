import { createHash, randomBytes, randomUUID } from 'node:crypto';

import { auditAdminTelemetry, type AuditAdminTelemetry } from '@shifaa/observability';

const WORKER_ID = /^[a-z0-9][a-z0-9._-]{7,63}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SHA256 = /^[a-f0-9]{64}$/;
const RETRY_DELAYS_SECONDS = [60, 300, 1_800, 7_200, 43_200] as const;
const INTERNAL_REQUEST_TIMEOUT_MS = 20_000;

export type AuditExportClaim = Readonly<{
  eventId: string;
  receiptId: string;
  exportBatchId: string;
  aggregateVersion: number;
  attemptCount: number;
  leaseOwner: string;
  leaseExpiresAt: string;
}>;

type AuditExportCompletionContext = Readonly<{
  claim: AuditExportClaim;
  workerId: string;
}>;

export type AuditExportCompletion = AuditExportCompletionContext &
  (
    | Readonly<{
        outcome: 'proven';
        objectDigest: string;
        proofClass: 'local_synthetic_write_once' | 'provider_object_lock';
      }>
    | Readonly<{
        outcome: 'retryable';
        failureCode: AuditExportFailureCode;
        retryAt: string;
      }>
    | Readonly<{
        outcome: 'dead_letter';
        failureCode: AuditExportFailureCode;
      }>
  );

export type AuditExportFailureCode =
  | 'service-unavailable'
  | 'validation-failed'
  | 'authentication-required'
  | 'forbidden'
  | 'export-state-conflict'
  | 'audit-integrity-failed'
  | 'retention-proof-failed';

export interface AuditExportWorkPort {
  claimNext(workerId: string, leaseSeconds: number, now: Date): Promise<AuditExportClaim | null>;
  complete(completion: AuditExportCompletion): Promise<boolean>;
}

export interface AuditExportOperationPort {
  materialize(
    exportBatchId: string,
    idempotencyKey: string,
    context: Readonly<{ requestId: string; traceId: string }>,
  ): Promise<
    Readonly<{
      exportBatchId: string;
      status: 'proven';
      objectDigest: string;
      proofClass: 'local_synthetic_write_once' | 'provider_object_lock';
    }>
  >;
}

export interface AuditExportClockPort {
  now(): Date;
}

export interface AuditExportTelemetryPort {
  emit(event: AuditAdminTelemetry): void;
}

export interface ImmutableAuditObjectPort {
  createIfAbsent(
    objectKey: string,
    canonicalBytes: Uint8Array,
    expectedDigest?: string,
  ): Promise<
    Readonly<{
      objectKey: string;
      digestSha256: string;
      retentionProof: Readonly<{
        proof_version: 1;
        proof_class: 'synthetic_write_once';
        verified_at: string;
      }>;
    }>
  >;
  readForVerification(objectKey: string): Promise<Uint8Array>;
}

export class AuditExportOperationError extends Error {
  public readonly failureCode: AuditExportFailureCode;
  public readonly category: 'transient' | 'permanent';

  public constructor(failureCode: AuditExportFailureCode, category: 'transient' | 'permanent') {
    super(failureCode);
    this.name = 'AuditExportOperationError';
    this.failureCode = failureCode;
    this.category = category;
  }
}

export class AuditExportWorker {
  private readonly workerId: string;
  private readonly work: AuditExportWorkPort;
  private readonly operation: AuditExportOperationPort;
  private readonly clock: AuditExportClockPort;
  private readonly telemetry: AuditExportTelemetryPort;
  private readonly leaseSeconds: number;

  public constructor(
    workerId: string,
    dependencies: Readonly<{
      work: AuditExportWorkPort;
      operation: AuditExportOperationPort;
      clock: AuditExportClockPort;
      telemetry: AuditExportTelemetryPort;
    }>,
    leaseSeconds = 300,
  ) {
    if (!WORKER_ID.test(workerId)) throw new TypeError('Invalid audit export worker identifier.');
    if (!Number.isInteger(leaseSeconds) || leaseSeconds < 30 || leaseSeconds > 900)
      throw new TypeError('Invalid audit export lease duration.');
    this.workerId = workerId;
    this.work = dependencies.work;
    this.operation = dependencies.operation;
    this.clock = dependencies.clock;
    this.telemetry = dependencies.telemetry;
    this.leaseSeconds = leaseSeconds;
  }

  public async processNext(): Promise<'idle' | 'proven' | 'retryable' | 'dead_letter'> {
    const claim = await this.work.claimNext(this.workerId, this.leaseSeconds, this.clock.now());
    if (!claim) return 'idle';
    this.validateClaim(claim, this.clock.now());
    const requestId = randomUUID();
    const traceId = randomBytes(16).toString('hex');
    let proof: Awaited<ReturnType<AuditExportOperationPort['materialize']>>;
    try {
      proof = await this.materialize(claim, requestId, traceId);
    } catch (error) {
      return this.completeFailure(claim, classifyFailure(error), requestId, traceId);
    }
    await this.completeProven(claim, proof);
    this.emit(requestId, traceId, 'succeeded');
    return 'proven';
  }

  private async materialize(claim: AuditExportClaim, requestId: string, traceId: string) {
    const proof = await this.operation.materialize(
      claim.exportBatchId,
      idempotencyKey(claim.exportBatchId),
      { requestId, traceId },
    );
    if (
      proof.exportBatchId !== claim.exportBatchId ||
      proof.status !== 'proven' ||
      !SHA256.test(proof.objectDigest) ||
      !['local_synthetic_write_once', 'provider_object_lock'].includes(proof.proofClass)
    )
      throw new AuditExportOperationError('audit-integrity-failed', 'permanent');
    return proof;
  }

  private completeProven(
    claim: AuditExportClaim,
    proof: Awaited<ReturnType<AuditExportOperationPort['materialize']>>,
  ) {
    return this.completeOrThrow({
      claim,
      workerId: this.workerId,
      outcome: 'proven',
      objectDigest: proof.objectDigest,
      proofClass: proof.proofClass,
    });
  }

  private async completeFailure(
    claim: AuditExportClaim,
    failure: AuditExportOperationError,
    requestId: string,
    traceId: string,
  ): Promise<'retryable' | 'dead_letter'> {
    if (failure.category === 'transient' && claim.attemptCount <= RETRY_DELAYS_SECONDS.length) {
      await this.completeOrThrow({
        claim,
        workerId: this.workerId,
        outcome: 'retryable',
        failureCode: failure.failureCode,
        retryAt: retryAt(claim.exportBatchId, claim.attemptCount, this.clock.now()),
      });
      this.emit(requestId, traceId, 'retrying', failure.failureCode);
      return 'retryable';
    }
    await this.completeOrThrow({
      claim,
      workerId: this.workerId,
      outcome: 'dead_letter',
      failureCode: failure.failureCode,
    });
    this.emit(requestId, traceId, 'dead_letter', failure.failureCode);
    return 'dead_letter';
  }

  private validateClaim(claim: AuditExportClaim, now: Date): void {
    if (
      !UUID.test(claim.eventId) ||
      !UUID.test(claim.receiptId) ||
      !UUID.test(claim.exportBatchId) ||
      claim.leaseOwner !== this.workerId ||
      claim.aggregateVersion < 1 ||
      claim.attemptCount < 1 ||
      !Number.isInteger(claim.aggregateVersion) ||
      !Number.isInteger(claim.attemptCount) ||
      !Number.isFinite(Date.parse(claim.leaseExpiresAt)) ||
      Date.parse(claim.leaseExpiresAt) <= now.getTime()
    )
      throw new Error('Invalid claimed audit export work.');
  }

  private async completeOrThrow(completion: AuditExportCompletion): Promise<void> {
    if (!(await this.work.complete(completion))) throw new Error('Audit export lease was lost.');
  }

  private emit(
    requestId: string,
    traceId: string,
    outcome: 'succeeded' | 'retrying' | 'dead_letter',
    reason?: AuditExportFailureCode,
  ): void {
    this.telemetry.emit(
      auditAdminTelemetry({
        requestId,
        traceId,
        surface: 'worker',
        operation: 'exportAuditPartition',
        outcome,
        ...(reason === undefined ? {} : { reason }),
      }),
    );
  }
}

export class PrivateAuditExportHttpAdapter implements AuditExportOperationPort {
  private readonly endpoint: URL;
  private readonly serviceCredential: string;
  private readonly fetcher: typeof globalThis.fetch;

  public constructor(
    baseUrl: string,
    serviceCredential: string,
    fetcher: typeof globalThis.fetch = globalThis.fetch,
  ) {
    const endpoint = new URL('/v1/internal/audit/exports', baseUrl);
    if (
      !isPrivateServiceUrl(endpoint) ||
      serviceCredential.length < 24 ||
      serviceCredential.length > 512
    )
      throw new TypeError('Invalid private audit export service configuration.');
    this.endpoint = endpoint;
    this.serviceCredential = serviceCredential;
    this.fetcher = fetcher.bind(globalThis);
  }

  public async materialize(
    exportBatchId: string,
    key: string,
    context: Readonly<{ requestId: string; traceId: string }>,
  ) {
    if (
      !UUID.test(exportBatchId) ||
      !SHA256.test(key) ||
      !UUID.test(context.requestId) ||
      !/^[a-f0-9]{32}$/.test(context.traceId)
    )
      throw new AuditExportOperationError('validation-failed', 'permanent');
    let response: Response;
    try {
      response = await this.fetcher(this.endpoint, {
        method: 'POST',
        headers: {
          Accept: 'application/json, application/problem+json',
          Authorization: `Bearer ${this.serviceCredential}`,
          'Content-Type': 'application/json',
          'Idempotency-Key': key,
          'X-Request-Id': context.requestId,
          traceparent: `00-${context.traceId}-${randomBytes(8).toString('hex')}-01`,
        },
        body: JSON.stringify({ export_batch_id: exportBatchId }),
        signal: AbortSignal.timeout(INTERNAL_REQUEST_TIMEOUT_MS),
      });
    } catch {
      throw new AuditExportOperationError('service-unavailable', 'transient');
    }
    const body = await response.json().catch(() => undefined);
    if (!response.ok) throw responseFailure(response.status, body);
    if (!isProofResponse(body))
      throw new AuditExportOperationError('validation-failed', 'permanent');
    return {
      exportBatchId: body.export_batch_id,
      status: 'proven' as const,
      objectDigest: body.object_digest,
      proofClass: body.retention_proof_class,
    };
  }
}

function idempotencyKey(exportBatchId: string): string {
  return createHash('sha256').update(`audit-export-v1:${exportBatchId}`, 'utf8').digest('hex');
}

function retryAt(exportBatchId: string, attemptCount: number, now: Date): string {
  const delay = RETRY_DELAYS_SECONDS[Math.min(attemptCount - 1, RETRY_DELAYS_SECONDS.length - 1)]!;
  const jitterSeed = createHash('sha256')
    .update(`${exportBatchId}:${attemptCount}`, 'utf8')
    .digest()
    .readUInt16BE(0);
  const jitter = Math.floor((delay * 0.15 * jitterSeed) / 65_535);
  return new Date(now.getTime() + (delay + jitter) * 1_000).toISOString();
}

function classifyFailure(error: unknown): AuditExportOperationError {
  if (error instanceof AuditExportOperationError) return error;
  return new AuditExportOperationError('service-unavailable', 'transient');
}

function isPrivateServiceUrl(url: URL): boolean {
  const hostname = url.hostname.toLowerCase();
  const privateHost =
    hostname === 'localhost' ||
    hostname.endsWith('.internal') ||
    /^10\./.test(hostname) ||
    /^192\.168\./.test(hostname) ||
    /^172\.(?:1[6-9]|2\d|3[01])\./.test(hostname);
  return (
    privateHost &&
    (url.protocol === 'https:' || (url.protocol === 'http:' && hostname === 'localhost'))
  );
}

function responseFailure(status: number, body: unknown): AuditExportOperationError {
  const code =
    body && typeof body === 'object' && 'code' in body && typeof body.code === 'string'
      ? body.code
      : 'service-unavailable';
  const allowedPermanent = new Set<AuditExportFailureCode>([
    'validation-failed',
    'authentication-required',
    'forbidden',
    'export-state-conflict',
    'audit-integrity-failed',
    'retention-proof-failed',
  ]);
  if (allowedPermanent.has(code as AuditExportFailureCode))
    return new AuditExportOperationError(code as AuditExportFailureCode, 'permanent');
  return new AuditExportOperationError(
    'service-unavailable',
    status === 429 || status >= 500 ? 'transient' : 'permanent',
  );
}

function isProofResponse(responseBody: unknown): responseBody is {
  export_batch_id: string;
  status: 'proven';
  object_digest: string;
  retention_proof_class: 'local_synthetic_write_once' | 'provider_object_lock';
  exported_at: string;
} {
  if (!responseBody || typeof responseBody !== 'object' || Array.isArray(responseBody))
    return false;
  const body = responseBody as Record<string, unknown>;
  return (
    Object.keys(body).sort().join(',') ===
      'export_batch_id,exported_at,object_digest,retention_proof_class,status' &&
    UUID.test(String(body['export_batch_id'])) &&
    body['status'] === 'proven' &&
    SHA256.test(String(body['object_digest'])) &&
    ['local_synthetic_write_once', 'provider_object_lock'].includes(
      String(body['retention_proof_class']),
    ) &&
    typeof body['exported_at'] === 'string' &&
    Number.isFinite(Date.parse(body['exported_at']))
  );
}
