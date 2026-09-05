export const AUDIT_ADMIN_POLICY_VERSION = '1.0.0-approved' as const;

export const auditAdminTelemetrySurfaces = [
  'api',
  'worker',
  'adapter',
  'aggregate',
  'health',
] as const;

export const auditAdminTelemetryOperations = [
  'getAdminSummary',
  'listAuditEvents',
  'getAuditEvent',
  'createAuditExport',
  'exportAuditPartition',
  'healthLive',
  'healthReady',
] as const;

export const auditAdminTelemetryOutcomes = [
  'succeeded',
  'denied',
  'failed',
  'disabled',
  'suppressed',
  'retrying',
  'dead_letter',
  'ready',
  'degraded',
  'not_ready',
] as const;

export const auditAdminTelemetryReasons = [
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
  'database_unavailable',
  'outbox_backlog',
  'outbox_integrity_failed',
  'audit_integrity_failed',
  'export_proof_failed',
  'no_active_metrics',
  'unknown_configuration',
  'inactive_configuration',
  'invalid_linked_release_group',
  'prohibited_dimension',
  'status_mapping_missing',
  'small_cell',
  'complementary_suppression',
] as const;

type AuditAdminTelemetrySurface = (typeof auditAdminTelemetrySurfaces)[number];
type AuditAdminTelemetryOperation = (typeof auditAdminTelemetryOperations)[number];
type AuditAdminTelemetryOutcome = (typeof auditAdminTelemetryOutcomes)[number];
type AuditAdminTelemetryReason = (typeof auditAdminTelemetryReasons)[number];
type AuditAdminDurationBucket = 'lt_100ms' | 'lt_400ms' | 'lt_800ms' | 'lt_2s' | 'gte_2s';

export type AuditAdminTelemetryInput = Readonly<{
  requestId: string;
  traceId: string;
  surface: AuditAdminTelemetrySurface;
  operation: AuditAdminTelemetryOperation;
  outcome: AuditAdminTelemetryOutcome;
  reason?: AuditAdminTelemetryReason;
  policyVersion?: typeof AUDIT_ADMIN_POLICY_VERSION;
  durationMs?: number;
}>;

export type AuditAdminTelemetry = Readonly<{
  event: 'audit_admin.operation';
  requestId: string;
  traceId: string;
  surface: AuditAdminTelemetrySurface;
  operation: AuditAdminTelemetryOperation;
  outcome: AuditAdminTelemetryOutcome;
  reason?: AuditAdminTelemetryReason;
  policyVersion?: typeof AUDIT_ADMIN_POLICY_VERSION;
  durationBucket?: AuditAdminDurationBucket;
}>;

export type AuditAdminMetricLabels = Readonly<{
  surface: AuditAdminTelemetrySurface;
  operation: AuditAdminTelemetryOperation;
  outcome: AuditAdminTelemetryOutcome;
  reason?: AuditAdminTelemetryReason;
  policy_version?: typeof AUDIT_ADMIN_POLICY_VERSION;
  duration_bucket?: AuditAdminDurationBucket;
}>;

const requestIdPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const traceIdPattern = /^(?!0{32}$)[0-9a-f]{32}$/;
const allowedTelemetryKeys = new Set([
  'event',
  'requestId',
  'traceId',
  'surface',
  'operation',
  'outcome',
  'reason',
  'policyVersion',
  'durationBucket',
]);
const surfaces = new Set<string>(auditAdminTelemetrySurfaces);
const outcomes = new Set<string>(auditAdminTelemetryOutcomes);
const reasons = new Set<string>(auditAdminTelemetryReasons);
const durationBuckets = new Set<string>(['lt_100ms', 'lt_400ms', 'lt_800ms', 'lt_2s', 'gte_2s']);

const operationsBySurface: Readonly<Record<AuditAdminTelemetrySurface, ReadonlySet<string>>> = {
  api: new Set([
    'getAdminSummary',
    'listAuditEvents',
    'getAuditEvent',
    'createAuditExport',
    'exportAuditPartition',
    'healthLive',
    'healthReady',
  ]),
  worker: new Set(['exportAuditPartition']),
  adapter: new Set(['exportAuditPartition']),
  aggregate: new Set(['getAdminSummary']),
  health: new Set(['healthLive', 'healthReady']),
};

function requireAllowedString(value: unknown, allowed: ReadonlySet<string>, field: string): string {
  if (typeof value !== 'string' || !allowed.has(value)) {
    throw new TypeError(`Invalid audit-admin telemetry ${field}.`);
  }
  return value;
}

function durationBucket(durationMs: number | undefined): AuditAdminDurationBucket | undefined {
  if (durationMs === undefined) return undefined;
  if (!Number.isFinite(durationMs) || durationMs < 0 || durationMs > 86_400_000) {
    throw new TypeError('Invalid audit-admin telemetry duration.');
  }
  if (durationMs < 100) return 'lt_100ms';
  if (durationMs < 400) return 'lt_400ms';
  if (durationMs < 800) return 'lt_800ms';
  if (durationMs < 2_000) return 'lt_2s';
  return 'gte_2s';
}

function validateCorrelationId(value: unknown, pattern: RegExp, field: string): string {
  if (typeof value !== 'string' || !pattern.test(value)) {
    throw new TypeError(`Invalid audit-admin telemetry ${field}.`);
  }
  return value;
}

export function auditAdminTelemetry<Input extends AuditAdminTelemetryInput>(
  input: Input,
): AuditAdminTelemetry {
  const surface = requireAllowedString(
    input.surface,
    surfaces,
    'surface',
  ) as AuditAdminTelemetrySurface;
  const operation = requireAllowedString(
    input.operation,
    operationsBySurface[surface],
    'operation',
  ) as AuditAdminTelemetryOperation;
  const outcome = requireAllowedString(
    input.outcome,
    outcomes,
    'outcome',
  ) as AuditAdminTelemetryOutcome;
  const reason =
    input.reason === undefined
      ? undefined
      : (requireAllowedString(input.reason, reasons, 'reason') as AuditAdminTelemetryReason);
  const policyVersion = input.policyVersion;
  if (policyVersion !== undefined && policyVersion !== AUDIT_ADMIN_POLICY_VERSION) {
    throw new TypeError('Invalid audit-admin telemetry policy version.');
  }

  return {
    event: 'audit_admin.operation',
    requestId: validateCorrelationId(input.requestId, requestIdPattern, 'request ID'),
    traceId: validateCorrelationId(input.traceId, traceIdPattern, 'trace ID'),
    surface,
    operation,
    outcome,
    ...(reason === undefined ? {} : { reason }),
    ...(policyVersion === undefined ? {} : { policyVersion }),
    ...(input.durationMs === undefined ? {} : { durationBucket: durationBucket(input.durationMs) }),
  };
}

export function auditAdminMetricLabels(telemetry: AuditAdminTelemetry): AuditAdminMetricLabels {
  if (
    Object.keys(telemetry).some((key) => !allowedTelemetryKeys.has(key)) ||
    telemetry.event !== 'audit_admin.operation'
  ) {
    throw new TypeError('Invalid audit-admin telemetry shape.');
  }

  const safe = auditAdminTelemetry({
    requestId: telemetry.requestId,
    traceId: telemetry.traceId,
    surface: telemetry.surface,
    operation: telemetry.operation,
    outcome: telemetry.outcome,
    ...(telemetry.reason === undefined ? {} : { reason: telemetry.reason }),
    ...(telemetry.policyVersion === undefined ? {} : { policyVersion: telemetry.policyVersion }),
  });

  if (telemetry.durationBucket !== undefined && !isDurationBucket(telemetry.durationBucket)) {
    throw new TypeError('Invalid audit-admin telemetry duration bucket.');
  }

  return {
    surface: safe.surface,
    operation: safe.operation,
    outcome: safe.outcome,
    ...(safe.reason === undefined ? {} : { reason: safe.reason }),
    ...(safe.policyVersion === undefined ? {} : { policy_version: safe.policyVersion }),
    ...(telemetry.durationBucket === undefined
      ? {}
      : { duration_bucket: telemetry.durationBucket }),
  };
}

function isDurationBucket(value: string): value is AuditAdminDurationBucket {
  return durationBuckets.has(value);
}
