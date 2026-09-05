import type {
  AggregateCellInput,
  AggregatePolicyConfiguration,
} from '@shifaa/core/audit-admin/aggregate-policy';
import type { ChainedAuditEvent } from '@shifaa/core/audit-admin/audit-integrity';

export type AuditAdminActor = {
  personId: string | null;
  principal: string | null;
  sessionCurrent: boolean;
  aal: 1 | 2 | null;
  factorAgeSeconds: number | null;
  purpose: string | null;
  requestId: string;
  traceId: string;
};

export type AdminSummaryCell = {
  metric_id: string;
  period: string;
  dimensions: Readonly<Record<string, string>>;
  disclosure: 'released' | 'suppressed';
  distinct_subject_count?: number;
  suppression_reason?: 'small_cell' | 'complementary' | 'linked_release';
  policy_version: string;
  snapshot_at: string;
};

export type AdminSummary = {
  policy_id: 'OPEN-PRIV-001';
  policy_version: '1.0.0-approved';
  data: readonly AdminSummaryCell[];
  generated_at: string;
};

export type AuditChainEvidence = {
  version: 1;
  partition: string;
  sequence: number;
  previous_hash: string;
  event_hash: string;
  verification: 'verified' | 'failed';
};

export type RedactedAuditEvent = {
  event_id: string;
  occurred_at: string;
  request_id: string;
  trace_id: string;
  actor_person_id: string | null;
  authentication_aal: 1 | 2 | null;
  facility_id: string | null;
  patient_id: string | null;
  purpose_code: string | null;
  action_code: string;
  resource_type: string;
  resource_id: string | null;
  resource_version: number | null;
  outcome: 'success' | 'denied' | 'failed';
  reason_code: string | null;
  source_ip_prefix: string | null;
  user_agent_class: 'web' | 'mobile' | 'service' | 'worker' | 'system' | 'unknown' | null;
  chain: AuditChainEvidence;
};

export type AuditEventFilters = {
  actor?: string;
  action?: string;
  resourceType?: string;
  resourceId?: string;
  occurredFrom?: string;
  occurredBefore?: string;
  outcome?: 'success' | 'denied' | 'failed';
};

export type AuditEventListQuery = AuditEventFilters & {
  cursor?: string;
  limit?: number;
};

export type AuditEventPage = {
  data: readonly RedactedAuditEvent[];
  meta: { next_cursor: string | null };
};

export type AuditEventDetail = { event: RedactedAuditEvent };

export type AuditEventCursor = {
  occurredAt: string;
  eventId: string;
};

export type AuditEventRepositoryQuery = AuditEventFilters & {
  after?: AuditEventCursor;
  limit: number;
};

export type ChainVerification = {
  valid: boolean;
  checked_count: number;
  first_invalid_sequence: number | null;
  failure_code: string | null;
};

export type AuditExportBatch = {
  export_batch_id: string;
  status: 'queued' | 'claimed' | 'retryable' | 'dead_letter' | 'proven';
  partition_start: string;
  partition_end_exclusive: string;
  object_digest: string | null;
  exported_at: string | null;
  failure_code: string | null;
  version: number;
};

export type CreateAuditExportInput = {
  partition_start: string;
  partition_end_exclusive: string;
};

export type AuditExportAccepted = {
  export_batch_id: string;
  status: 'queued';
  partition_start: string;
  partition_end_exclusive: string;
  accepted_at: string;
};

export type AuditExportRequestCommand = {
  input: CreateAuditExportInput;
  idempotencyKey: string;
  requestHash: string;
};

export type AuditExportProof = {
  export_batch_id: string;
  status: 'proven';
  object_digest: string;
  retention_proof_class: 'local_synthetic_write_once' | 'provider_object_lock';
  exported_at: string;
};

export type RetentionProof = {
  proof_version: 1;
  proof_class: 'synthetic_write_once';
  verified_at: string;
};

export type ObjectWriteReceipt = {
  objectKey: string;
  digestSha256: string;
  retentionProof: RetentionProof;
};

export type AuditExportServiceActor = {
  authenticated: boolean;
  principal: string | null;
  workerId: string | null;
  requestId: string;
  traceId: string;
};

export type ClaimedAuditExportWork = {
  exportBatchId: string;
  status: 'claimed';
  partitionStart: string;
  partitionEndExclusive: string;
  objectKey: string;
  events: readonly ChainedAuditEvent[];
};

export type ProvenAuditExportWork = {
  exportBatchId: string;
  status: 'proven';
  partitionStart: string;
  partitionEndExclusive: string;
  objectKey: string;
  objectDigest: string;
  retentionProof: RetentionProof;
  exportedAt: string;
};

export type AuditExportWork = ClaimedAuditExportWork | ProvenAuditExportWork;

export type ReadinessSnapshot = {
  status: 'ready' | 'degraded' | 'not_ready';
  database: 'ready' | 'unavailable';
  outbox: 'ready' | 'backlogged' | 'integrity_failed';
};

export type LivenessResponse = { status: 'live'; observed_at: string };

export type ReadinessResponse = {
  status: 'ready' | 'degraded' | 'not_ready';
  reasons: readonly (
    | 'database_unavailable'
    | 'outbox_backlog'
    | 'outbox_integrity_failed'
    | 'audit_integrity_failed'
    | 'export_proof_failed'
  )[];
  observed_at: string;
};

export interface ClockPort {
  now(): Date;
}

export interface AggregatePolicyPort {
  getApprovedPolicy(): Promise<unknown>;
  getApprovedRuntimeConfigurationSha256(): Promise<string | undefined>;
}

export interface AggregateDataPort {
  getCells(configuration: AggregatePolicyConfiguration): Promise<readonly AggregateCellInput[]>;
}

export interface AuditAdminAuthorizationPort {
  canReadAdminSummary(actor: AuditAdminActor): Promise<boolean>;
  canReadAudit(actor: AuditAdminActor): Promise<boolean>;
}

export interface AuditEventReadPort {
  listRedactedAuditEvents(
    actor: AuditAdminActor,
    query: AuditEventRepositoryQuery,
  ): Promise<readonly RedactedAuditEvent[]>;
  getRedactedAuditEvent(
    actor: AuditAdminActor,
    eventId: string,
  ): Promise<RedactedAuditEvent | null>;
}

export interface AuditChainPort {
  verifyAuditChain(actor: AuditAdminActor, partition: string): Promise<ChainVerification>;
}

export interface AuditExportBatchPort {
  getAuditExportBatch(
    actor: AuditAdminActor,
    exportBatchId: string,
  ): Promise<AuditExportBatch | null>;
}

export interface AuditExportRequestPort {
  requestAuditExport(
    actor: AuditAdminActor,
    command: AuditExportRequestCommand,
  ): Promise<AuditExportAccepted>;
}

export interface AuditExportOrchestrationPort {
  getAuditExportWork(
    actor: AuditExportServiceActor,
    exportBatchId: string,
  ): Promise<AuditExportWork | null>;
  recordProvenAuditExport(
    actor: AuditExportServiceActor,
    input: {
      exportBatchId: string;
      objectDigest: string;
      retentionProof: RetentionProof;
    },
  ): Promise<ProvenAuditExportWork | null>;
}

export interface ObjectProofPort {
  createIfAbsent(objectKey: string, content: Uint8Array): Promise<ObjectWriteReceipt>;
  readForVerification(objectKey: string): Promise<Uint8Array>;
}

export interface ReadinessPort {
  readiness(): Promise<ReadinessSnapshot>;
}

export type AuditAdminRepository = AuditAdminAuthorizationPort &
  AuditEventReadPort &
  AuditChainPort &
  AuditExportBatchPort &
  AuditExportRequestPort &
  ReadinessPort;
