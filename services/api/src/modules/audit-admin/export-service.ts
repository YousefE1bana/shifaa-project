import { createHash } from 'node:crypto';

import {
  buildAuditExportObject,
  verifyAuditExportManifest,
} from '@shifaa/core/audit-admin/audit-integrity';

import type { IdempotencyStore } from '../../platform/idempotency.js';
import { ApiPolicyError } from '../identity-onboarding/errors.js';
import type {
  AuditExportOrchestrationPort,
  AuditExportProof,
  AuditExportServiceActor,
  AuditExportWork,
  ClockPort,
  ObjectProofPort,
  ProvenAuditExportWork,
  RetentionProof,
} from './types.js';

const INTERNAL_EXPORT_ROUTE = '/v1/internal/audit/exports';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const WORKER_ID = /^[a-z0-9][a-z0-9._-]{7,63}$/;
const SHA256 = /^[a-f0-9]{64}$/;
const MONTH_BOUNDARY = /^\d{4}-\d{2}-01$/;
const UTC_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?Z$/;
const MIN_IDEMPOTENCY_KEY_LENGTH = 16;
const MAX_IDEMPOTENCY_KEY_LENGTH = 128;

export type ExportAuditPartitionInput = { export_batch_id: string };

export type AuditExportServiceDependencies = {
  repository: AuditExportOrchestrationPort;
  objects: ObjectProofPort;
  idempotency: IdempotencyStore;
  clock: ClockPort;
};

export class AuditExportService {
  public constructor(private readonly dependencies: AuditExportServiceDependencies) {}

  public async exportAuditPartition(
    actor: AuditExportServiceActor,
    input: ExportAuditPartitionInput,
    idempotencyKey: string,
  ): Promise<AuditExportProof> {
    this.requireServiceActor(actor);
    this.validateInput(input);
    if (
      typeof idempotencyKey !== 'string' ||
      idempotencyKey.length < MIN_IDEMPOTENCY_KEY_LENGTH ||
      idempotencyKey.length > MAX_IDEMPOTENCY_KEY_LENGTH
    ) {
      this.deny('validation-failed', 400);
    }
    const storedResponse = await this.dependencies.idempotency.execute<AuditExportProof>({
      principal: actor.principal,
      method: 'POST',
      route: INTERNAL_EXPORT_ROUTE,
      key: idempotencyKey,
      body: input,
      work: async () => ({
        status: 200,
        headers: { 'cache-control': 'private, no-store' },
        body: await this.materialize(actor, input.export_batch_id),
      }),
    });
    return storedResponse.body;
  }

  private async materialize(
    actor: AuditExportServiceActor,
    exportBatchId: string,
  ): Promise<AuditExportProof> {
    const exportWork = await this.dependencies.repository.getAuditExportWork(actor, exportBatchId);
    if (!exportWork || exportWork.exportBatchId !== exportBatchId) {
      this.deny('export-state-conflict', 409);
    }
    this.validateWorkRange(exportWork);
    const expectedObjectKey = deterministicObjectKey(exportBatchId);
    if (exportWork.objectKey !== expectedObjectKey) this.deny('export-state-conflict', 409);

    if (exportWork.status === 'proven') return this.verifyProven(exportWork);
    if (exportWork.status !== 'claimed') this.deny('export-state-conflict', 409);
    return this.materializeClaimed(actor, exportWork);
  }

  private async materializeClaimed(
    actor: AuditExportServiceActor,
    exportWork: Extract<AuditExportWork, { status: 'claimed' }>,
  ): Promise<AuditExportProof> {
    let auditExportObject: ReturnType<typeof buildAuditExportObject>;
    try {
      auditExportObject = buildAuditExportObject({
        exportBatchId: exportWork.exportBatchId,
        partitionStart: exportWork.partitionStart,
        partitionEndExclusive: exportWork.partitionEndExclusive,
        events: exportWork.events,
      });
    } catch {
      this.deny('audit-integrity-failed', 409);
    }

    const receipt = await this.writeObject(exportWork.objectKey, auditExportObject.bytes);
    if (receipt.objectKey !== exportWork.objectKey) this.deny('export-state-conflict', 409);
    if (
      !SHA256.test(receipt.digestSha256) ||
      receipt.digestSha256 !== auditExportObject.objectDigest
    ) {
      this.deny('audit-integrity-failed', 409);
    }
    this.validateRetentionProof(receipt.retentionProof);
    await this.verifyStoredObject(exportWork, receipt.digestSha256);

    const provenExport = await this.dependencies.repository.recordProvenAuditExport(actor, {
      exportBatchId: exportWork.exportBatchId,
      objectDigest: receipt.digestSha256,
      retentionProof: receipt.retentionProof,
    });
    if (provenExport) this.validateRetentionProof(provenExport.retentionProof);
    if (
      !provenExport ||
      !this.completionMatches(
        exportWork,
        provenExport,
        receipt.digestSha256,
        receipt.retentionProof,
      )
    ) {
      this.deny('export-state-conflict', 409);
    }
    return this.proofResponse(provenExport);
  }

  private async verifyProven(work: ProvenAuditExportWork): Promise<AuditExportProof> {
    if (!SHA256.test(work.objectDigest)) this.deny('audit-integrity-failed', 409);
    this.validateRetentionProof(work.retentionProof);
    if (!this.validPastTimestamp(work.exportedAt)) this.deny('export-state-conflict', 409);
    await this.verifyStoredObject(work, work.objectDigest);
    return this.proofResponse(work);
  }

  private async writeObject(objectKey: string, bytes: Uint8Array) {
    try {
      return await this.dependencies.objects.createIfAbsent(objectKey, bytes);
    } catch (error) {
      if (error instanceof ApiPolicyError) throw error;
      this.deny('service-unavailable', 503);
    }
  }

  private async verifyStoredObject(work: AuditExportWork, digest: string): Promise<void> {
    let bytes: Uint8Array;
    try {
      bytes = await this.dependencies.objects.readForVerification(work.objectKey);
    } catch (error) {
      if (error instanceof ApiPolicyError) throw error;
      this.deny('service-unavailable', 503);
    }
    const verification = verifyAuditExportManifest({
      objectBytes: bytes,
      recordedObjectDigest: digest,
      expectedExportBatchId: work.exportBatchId,
      expectedPartitionStart: work.partitionStart,
      expectedPartitionEndExclusive: work.partitionEndExclusive,
    });
    if (!verification.valid) this.deny('audit-integrity-failed', 409);
  }

  private completionMatches(
    claimed: Extract<AuditExportWork, { status: 'claimed' }>,
    completed: ProvenAuditExportWork,
    objectDigest: string,
    retentionProof: RetentionProof,
  ): boolean {
    return (
      completed.exportBatchId === claimed.exportBatchId &&
      completed.status === 'proven' &&
      completed.partitionStart === claimed.partitionStart &&
      completed.partitionEndExclusive === claimed.partitionEndExclusive &&
      completed.objectKey === claimed.objectKey &&
      completed.objectDigest === objectDigest &&
      completed.retentionProof.proof_version === retentionProof.proof_version &&
      completed.retentionProof.proof_class === retentionProof.proof_class &&
      completed.retentionProof.verified_at === retentionProof.verified_at &&
      this.validPastTimestamp(completed.exportedAt)
    );
  }

  private proofResponse(work: ProvenAuditExportWork): AuditExportProof {
    return {
      export_batch_id: work.exportBatchId,
      status: 'proven',
      object_digest: work.objectDigest,
      retention_proof_class: 'local_synthetic_write_once',
      exported_at: new Date(work.exportedAt).toISOString(),
    };
  }

  private requireServiceActor(
    actor: AuditExportServiceActor,
  ): asserts actor is AuditExportServiceActor & {
    principal: string;
    workerId: string;
  } {
    if (!actor.authenticated || !actor.principal || !actor.workerId) {
      this.deny('authentication-required', 401);
    }
    if (
      !WORKER_ID.test(actor.workerId) ||
      actor.principal.length > 255 ||
      !UUID.test(actor.requestId) ||
      actor.traceId.length < 1 ||
      actor.traceId.length > 128
    ) {
      this.deny('forbidden');
    }
  }

  private validateInput(input: ExportAuditPartitionInput): void {
    if (
      !input ||
      typeof input !== 'object' ||
      Object.keys(input).join(',') !== 'export_batch_id' ||
      typeof input.export_batch_id !== 'string' ||
      !UUID.test(input.export_batch_id)
    ) {
      this.deny('validation-failed', 400);
    }
  }

  private validateWorkRange(work: AuditExportWork): void {
    const start = parseMonth(work.partitionStart);
    const end = parseMonth(work.partitionEndExclusive);
    const now = this.dependencies.clock.now();
    const completedBoundary = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1);
    const months =
      (end.getUTCFullYear() - start.getUTCFullYear()) * 12 +
      end.getUTCMonth() -
      start.getUTCMonth();
    if (months < 1 || months > 3 || end.getTime() > completedBoundary) {
      this.deny('export-state-conflict', 409);
    }
  }

  private validateRetentionProof(retentionProof: RetentionProof): void {
    if (
      !retentionProof ||
      typeof retentionProof !== 'object' ||
      Object.keys(retentionProof).sort().join(',') !== 'proof_class,proof_version,verified_at' ||
      retentionProof.proof_version !== 1 ||
      retentionProof.proof_class !== 'synthetic_write_once' ||
      typeof retentionProof.verified_at !== 'string'
    ) {
      this.deny('retention-proof-failed', 409);
    }
    if (!this.validPastTimestamp(retentionProof.verified_at)) {
      this.deny('retention-proof-failed', 409);
    }
  }

  private validPastTimestamp(timestamp: string): boolean {
    const parsedTimestamp = Date.parse(timestamp);
    return (
      UTC_TIMESTAMP.test(timestamp) &&
      Number.isFinite(parsedTimestamp) &&
      parsedTimestamp <= this.dependencies.clock.now().getTime()
    );
  }

  private deny(code: string, status = 403): never {
    throw new ApiPolicyError(code, status, code);
  }
}

function deterministicObjectKey(exportBatchId: string): string {
  const digest = createHash('sha256').update(exportBatchId, 'utf8').digest('hex');
  return `audit-exports/${digest}.jsonl`;
}

function parseMonth(value: string): Date {
  if (!MONTH_BOUNDARY.test(value)) {
    throw new ApiPolicyError('export-state-conflict', 409, 'export-state-conflict');
  }
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) {
    throw new ApiPolicyError('export-state-conflict', 409, 'export-state-conflict');
  }
  return parsed;
}
