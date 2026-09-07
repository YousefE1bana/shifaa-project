// @generated from specs/008-audit-admin-aggregates-observability/contracts/openapi.yaml — DO NOT EDIT.

import { Type } from '@sinclair/typebox';

export const auditAdminOperations = [
  {
    operationId: 'getAdminSummary',
    method: 'GET',
    path: '/admin/dashboard-summary',
  },
  {
    operationId: 'listAuditEvents',
    method: 'GET',
    path: '/admin/audit/events',
  },
  {
    operationId: 'getAuditEvent',
    method: 'GET',
    path: '/admin/audit/events/{eventId}',
  },
  {
    operationId: 'createAuditExport',
    method: 'POST',
    path: '/admin/audit/exports',
  },
  {
    operationId: 'exportAuditPartition',
    method: 'POST',
    path: '/internal/audit/exports',
  },
  {
    operationId: 'healthLive',
    method: 'GET',
    path: '/internal/health/live',
  },
  {
    operationId: 'healthReady',
    method: 'GET',
    path: '/internal/health/ready',
  },
] as const;
export type AuditAdminOperationId = (typeof auditAdminOperations)[number]['operationId'];

export const auditAdminSchemas = {
  Problem: Type.Unsafe({
    type: 'object',
    additionalProperties: false,
    required: ['type', 'title', 'status', 'detail', 'instance', 'code', 'request_id', 'errors'],
    properties: {
      type: {
        type: 'string',
        format: 'uri',
      },
      title: {
        type: 'string',
        minLength: 1,
      },
      status: {
        type: 'integer',
        minimum: 400,
        maximum: 599,
      },
      detail: {
        type: 'string',
        minLength: 1,
      },
      instance: {
        type: 'string',
      },
      code: {
        type: 'string',
        enum: [
          'authentication-required',
          'mfa-required',
          'forbidden',
          'purpose-required',
          'validation-failed',
          'not-found',
          'legal-gate-disabled',
          'idempotency-key-reused',
          'idempotency-in-progress',
          'export-range-invalid',
          'export-state-conflict',
          'audit-integrity-failed',
          'retention-proof-failed',
          'rate-limited',
          'service-unavailable',
        ],
      },
      request_id: {
        type: 'string',
        format: 'uuid',
      },
      retry_after_seconds: {
        type: 'integer',
        minimum: 1,
      },
      errors: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['code'],
          properties: {
            code: {
              type: 'string',
              minLength: 1,
              maxLength: 96,
            },
            field: {
              type: 'string',
              maxLength: 96,
            },
            message: {
              type: 'string',
              maxLength: 300,
            },
          },
        },
      },
    },
  }),
  AdminSummaryCell: Type.Unsafe({
    type: 'object',
    additionalProperties: false,
    required: ['metric_id', 'period', 'dimensions', 'disclosure', 'policy_version', 'snapshot_at'],
    properties: {
      metric_id: {
        type: 'string',
        minLength: 1,
        maxLength: 64,
        pattern: '^[a-z][a-z0-9._-]*$',
      },
      period: {
        type: 'string',
        pattern: '^[0-9]{4}-(0[1-9]|1[0-2])$',
      },
      dimensions: {
        type: 'object',
        maxProperties: 2,
        additionalProperties: {
          type: 'string',
          minLength: 1,
          maxLength: 64,
        },
      },
      disclosure: {
        type: 'string',
        enum: ['released', 'suppressed'],
      },
      distinct_subject_count: {
        type: 'integer',
        minimum: 11,
        description: 'Present only when disclosure is released',
      },
      suppression_reason: {
        type: 'string',
        enum: ['small_cell', 'complementary', 'linked_release'],
        description: 'Present only when disclosure is suppressed',
      },
      policy_version: {
        type: 'string',
        const: '1.0.0-approved',
      },
      snapshot_at: {
        type: 'string',
        format: 'date-time',
      },
    },
  }),
  AdminSummaryResponse: Type.Unsafe({
    type: 'object',
    additionalProperties: false,
    required: ['policy_id', 'policy_version', 'data', 'generated_at'],
    properties: {
      policy_id: {
        type: 'string',
        const: 'OPEN-PRIV-001',
      },
      policy_version: {
        type: 'string',
        const: '1.0.0-approved',
      },
      data: {
        type: 'array',
        maxItems: 100,
        items: {
          $ref: '#/components/schemas/AdminSummaryCell',
        },
      },
      generated_at: {
        type: 'string',
        format: 'date-time',
      },
    },
  }),
  AuditEventProjection: Type.Unsafe({
    type: 'object',
    additionalProperties: false,
    required: [
      'event_id',
      'occurred_at',
      'request_id',
      'trace_id',
      'authentication_aal',
      'action_code',
      'resource_type',
      'outcome',
      'chain',
    ],
    properties: {
      event_id: {
        type: 'string',
        format: 'uuid',
      },
      occurred_at: {
        type: 'string',
        format: 'date-time',
      },
      request_id: {
        type: 'string',
        format: 'uuid',
      },
      trace_id: {
        type: 'string',
        minLength: 16,
        maxLength: 64,
      },
      actor_person_id: {
        type: ['string', 'null'],
        format: 'uuid',
      },
      authentication_aal: {
        type: ['integer', 'null'],
        minimum: 1,
        maximum: 2,
      },
      facility_id: {
        type: ['string', 'null'],
        format: 'uuid',
      },
      patient_id: {
        type: ['string', 'null'],
        format: 'uuid',
      },
      purpose_code: {
        type: ['string', 'null'],
        maxLength: 64,
      },
      action_code: {
        type: 'string',
        minLength: 1,
        maxLength: 96,
      },
      resource_type: {
        type: 'string',
        minLength: 1,
        maxLength: 64,
      },
      resource_id: {
        type: ['string', 'null'],
        format: 'uuid',
      },
      resource_version: {
        type: ['integer', 'null'],
        minimum: 1,
      },
      outcome: {
        type: 'string',
        enum: ['success', 'denied', 'failed'],
      },
      reason_code: {
        type: ['string', 'null'],
        maxLength: 96,
      },
      source_ip_prefix: {
        type: ['string', 'null'],
        maxLength: 64,
      },
      user_agent_class: {
        type: ['string', 'null'],
        maxLength: 32,
      },
      chain: {
        $ref: '#/components/schemas/AuditChainEvidence',
      },
    },
  }),
  AuditChainEvidence: Type.Unsafe({
    type: 'object',
    additionalProperties: false,
    required: ['version', 'partition', 'sequence', 'previous_hash', 'event_hash', 'verification'],
    properties: {
      version: {
        type: 'integer',
        const: 1,
      },
      partition: {
        type: 'string',
        format: 'date',
      },
      sequence: {
        type: 'integer',
        minimum: 1,
      },
      previous_hash: {
        type: 'string',
        pattern: '^[a-f0-9]{64}$',
      },
      event_hash: {
        type: 'string',
        pattern: '^[a-f0-9]{64}$',
      },
      verification: {
        type: 'string',
        enum: ['verified', 'failed'],
      },
    },
  }),
  PageMeta: Type.Unsafe({
    type: 'object',
    additionalProperties: false,
    required: ['next_cursor'],
    properties: {
      next_cursor: {
        type: ['string', 'null'],
        maxLength: 512,
      },
    },
  }),
  AuditEventListResponse: Type.Unsafe({
    type: 'object',
    additionalProperties: false,
    required: ['data', 'meta'],
    properties: {
      data: {
        type: 'array',
        maxItems: 100,
        items: {
          $ref: '#/components/schemas/AuditEventProjection',
        },
      },
      meta: {
        $ref: '#/components/schemas/PageMeta',
      },
    },
  }),
  AuditEventDetailResponse: Type.Unsafe({
    type: 'object',
    additionalProperties: false,
    required: ['event'],
    properties: {
      event: {
        $ref: '#/components/schemas/AuditEventProjection',
      },
    },
  }),
  CreateAuditExportRequest: Type.Unsafe({
    type: 'object',
    additionalProperties: false,
    required: ['partition_start', 'partition_end_exclusive'],
    properties: {
      partition_start: {
        type: 'string',
        format: 'date',
      },
      partition_end_exclusive: {
        type: 'string',
        format: 'date',
      },
    },
  }),
  AuditExportAcceptedResponse: Type.Unsafe({
    type: 'object',
    additionalProperties: false,
    required: [
      'export_batch_id',
      'status',
      'partition_start',
      'partition_end_exclusive',
      'accepted_at',
    ],
    properties: {
      export_batch_id: {
        type: 'string',
        format: 'uuid',
      },
      status: {
        type: 'string',
        const: 'queued',
      },
      partition_start: {
        type: 'string',
        format: 'date',
      },
      partition_end_exclusive: {
        type: 'string',
        format: 'date',
      },
      accepted_at: {
        type: 'string',
        format: 'date-time',
      },
    },
  }),
  ExportAuditPartitionRequest: Type.Unsafe({
    type: 'object',
    additionalProperties: false,
    required: ['export_batch_id'],
    properties: {
      export_batch_id: {
        type: 'string',
        format: 'uuid',
      },
    },
  }),
  AuditExportProofResponse: Type.Unsafe({
    type: 'object',
    additionalProperties: false,
    required: [
      'export_batch_id',
      'status',
      'object_digest',
      'retention_proof_class',
      'exported_at',
    ],
    properties: {
      export_batch_id: {
        type: 'string',
        format: 'uuid',
      },
      status: {
        type: 'string',
        const: 'proven',
      },
      object_digest: {
        type: 'string',
        pattern: '^[a-f0-9]{64}$',
      },
      retention_proof_class: {
        type: 'string',
        enum: ['local_synthetic_write_once', 'provider_object_lock'],
      },
      exported_at: {
        type: 'string',
        format: 'date-time',
      },
    },
  }),
  LivenessResponse: Type.Unsafe({
    type: 'object',
    additionalProperties: false,
    required: ['status', 'observed_at'],
    properties: {
      status: {
        type: 'string',
        const: 'live',
      },
      observed_at: {
        type: 'string',
        format: 'date-time',
      },
    },
  }),
  ReadinessResponse: Type.Unsafe({
    type: 'object',
    additionalProperties: false,
    required: ['status', 'reasons', 'observed_at'],
    properties: {
      status: {
        type: 'string',
        enum: ['ready', 'degraded', 'not_ready'],
      },
      reasons: {
        type: 'array',
        uniqueItems: true,
        maxItems: 8,
        items: {
          type: 'string',
          enum: [
            'database_unavailable',
            'outbox_backlog',
            'outbox_integrity_failed',
            'audit_integrity_failed',
            'export_proof_failed',
          ],
        },
      },
      observed_at: {
        type: 'string',
        format: 'date-time',
      },
    },
  }),
} as const;

export type AuditOutcome = 'success' | 'denied' | 'failed';
export type CreateAuditExportInput = {
  partition_start: string;
  partition_end_exclusive: string;
};
export type ExportAuditPartitionInput = { export_batch_id: string };
export type AuditEventListInput = {
  actor?: string;
  action?: string;
  resource_type?: string;
  resource_id?: string;
  occurred_from?: string;
  occurred_before?: string;
  outcome?: AuditOutcome;
  limit?: number;
  cursor?: string;
};
