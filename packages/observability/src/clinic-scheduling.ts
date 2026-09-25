/**
 * Feature 009 telemetry contract.
 *
 * This module deliberately accepts an allow-list rather than redacting an
 * arbitrary payload.  A caller can attach any domain object to an error, so
 * recursive best-effort redaction would be an unsafe telemetry boundary.
 */

export const CLINIC_SCHEDULING_POLICY_VERSION = '1.0.0-approved' as const;

export const clinicSchedulingTelemetrySurfaces = [
  'api',
  'worker',
  'schedule',
  'appointment',
  'queue',
  'delay',
  'absence',
  'outbox',
] as const;

export const clinicSchedulingTelemetryOperations = [
  'searchDoctors',
  'listDoctorAvailability',
  'createSchedule',
  'updateSchedule',
  'createScheduleException',
  'createAppointment',
  'getAppointment',
  'listAppointments',
  'cancelAppointment',
  'rescheduleAppointment',
  'checkInAppointment',
  'getQueue',
  'getMyQueuePosition',
  'callQueueEntry',
  'reorderQueueEntry',
  'completeQueueEntry',
  'sendDoctorDelay',
  'declareDoctorAbsence',
  'workerDeliveryClaim',
] as const;

/** The public Feature 009 API operation inventory is exactly eighteen entries. */
export const clinicSchedulingApiOperations = [
  'searchDoctors',
  'listDoctorAvailability',
  'createSchedule',
  'updateSchedule',
  'createScheduleException',
  'createAppointment',
  'getAppointment',
  'listAppointments',
  'cancelAppointment',
  'rescheduleAppointment',
  'checkInAppointment',
  'getQueue',
  'getMyQueuePosition',
  'callQueueEntry',
  'reorderQueueEntry',
  'completeQueueEntry',
  'sendDoctorDelay',
  'declareDoctorAbsence',
] as const satisfies readonly ClinicSchedulingTelemetryOperation[];

/** Result classes are intentionally generic, bounded, and safe for metrics. */
export const clinicSchedulingTelemetryResultClasses = [
  'success',
  'conflict',
  'replay',
  'denied',
  'failed',
  'retrying',
  'dead_letter',
  'suppressed',
  'degraded',
] as const;

/**
 * Outcomes cover the operational dimensions that Feature 009 dashboards
 * need. They are codes, not caller-provided explanations or free text.
 */
export const clinicSchedulingTelemetryOutcomes = [
  'confirmed',
  'cancelled',
  'checkedIn',
  'scheduleConflict',
  'idempotentReplay',
  'idempotencyConflict',
  'outboxPending',
  'outboxRetrying',
  'outboxDeadLetter',
  'queueCalled',
  'queueReordered',
  'queueCompleted',
  'queueVersionConflict',
  'delayDeclared',
  'delaySuperseded',
  'delayReplay',
  'absenceApplied',
  'absenceReplay',
  'deliveryRetrying',
  'deliveryDeadLetter',
  'stale',
  'disabled',
  'unknown',
] as const;

export const clinicSchedulingTelemetryScopes = ['public', 'scoped', 'unknown'] as const;

export type ClinicSchedulingTelemetrySurface = (typeof clinicSchedulingTelemetrySurfaces)[number];
export type ClinicSchedulingTelemetryOperation =
  (typeof clinicSchedulingTelemetryOperations)[number];
export type ClinicSchedulingTelemetryResultClass =
  (typeof clinicSchedulingTelemetryResultClasses)[number];
export type ClinicSchedulingTelemetryOutcome = (typeof clinicSchedulingTelemetryOutcomes)[number];
export type ClinicSchedulingTelemetryScope = (typeof clinicSchedulingTelemetryScopes)[number];
export type ClinicSchedulingLatencyBucket =
  | 'lt_100ms'
  | 'lt_400ms'
  | 'lt_800ms'
  | 'lt_2s'
  | 'gte_2s';

export type ClinicSchedulingTelemetryInput = Readonly<{
  requestId: string;
  eventId: string;
  aggregateId: string;
  traceId?: string;
  surface: ClinicSchedulingTelemetrySurface;
  operation: ClinicSchedulingTelemetryOperation;
  resultClass: ClinicSchedulingTelemetryResultClass;
  outcome: ClinicSchedulingTelemetryOutcome;
  scope: ClinicSchedulingTelemetryScope;
  latencyMs?: number;
  policyVersion?: typeof CLINIC_SCHEDULING_POLICY_VERSION;
}>;

export type ClinicSchedulingTelemetry = Readonly<{
  event: 'clinic_scheduling.operation';
  requestId: string;
  eventId: string;
  aggregateId: string;
  traceId?: string;
  surface: ClinicSchedulingTelemetrySurface;
  operation: ClinicSchedulingTelemetryOperation;
  resultClass: ClinicSchedulingTelemetryResultClass;
  outcome: ClinicSchedulingTelemetryOutcome;
  scope: ClinicSchedulingTelemetryScope;
  latencyBucket?: ClinicSchedulingLatencyBucket;
  policyVersion?: typeof CLINIC_SCHEDULING_POLICY_VERSION;
}>;

export type ClinicSchedulingMetricLabels = Readonly<{
  surface: ClinicSchedulingTelemetrySurface;
  operation: ClinicSchedulingTelemetryOperation;
  result_class: ClinicSchedulingTelemetryResultClass;
  outcome: ClinicSchedulingTelemetryOutcome;
  scope: ClinicSchedulingTelemetryScope;
  latency_bucket?: ClinicSchedulingLatencyBucket;
}>;

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const tracePattern = /^(?!0{32}$)[0-9a-f]{32}$/i;
const surfaces = new Set<string>(clinicSchedulingTelemetrySurfaces);
const resultClasses = new Set<string>(clinicSchedulingTelemetryResultClasses);
const outcomes = new Set<string>(clinicSchedulingTelemetryOutcomes);
const scopes = new Set<string>(clinicSchedulingTelemetryScopes);
const operationsBySurface: Readonly<Record<ClinicSchedulingTelemetrySurface, ReadonlySet<string>>> =
  {
    api: new Set(clinicSchedulingApiOperations),
    worker: new Set(['workerDeliveryClaim']),
    schedule: new Set([
      'createSchedule',
      'updateSchedule',
      'createScheduleException',
      'sendDoctorDelay',
      'declareDoctorAbsence',
    ]),
    appointment: new Set([
      'createAppointment',
      'getAppointment',
      'listAppointments',
      'cancelAppointment',
      'rescheduleAppointment',
      'checkInAppointment',
    ]),
    queue: new Set([
      'getQueue',
      'getMyQueuePosition',
      'callQueueEntry',
      'reorderQueueEntry',
      'completeQueueEntry',
    ]),
    delay: new Set(['sendDoctorDelay']),
    absence: new Set(['declareDoctorAbsence']),
    outbox: new Set(['workerDeliveryClaim']),
  };
const latencyBuckets = new Set<string>(['lt_100ms', 'lt_400ms', 'lt_800ms', 'lt_2s', 'gte_2s']);
const allowedTelemetryKeys = new Set([
  'event',
  'requestId',
  'eventId',
  'aggregateId',
  'traceId',
  'surface',
  'operation',
  'resultClass',
  'outcome',
  'scope',
  'latencyBucket',
  'policyVersion',
]);

function requireSetMember(value: unknown, allowed: ReadonlySet<string>, field: string): string {
  if (typeof value !== 'string' || !allowed.has(value)) {
    throw new TypeError(`Invalid clinic-scheduling telemetry ${field}.`);
  }
  return value;
}

function requireUuid(value: unknown, field: string): string {
  if (typeof value !== 'string' || !uuidPattern.test(value)) {
    throw new TypeError(`Invalid clinic-scheduling telemetry ${field}.`);
  }
  return value;
}

function requireTraceId(value: unknown): string {
  if (typeof value !== 'string' || !tracePattern.test(value)) {
    throw new TypeError('Invalid clinic-scheduling telemetry trace ID.');
  }
  return value;
}

function latencyBucket(latencyMs: number | undefined): ClinicSchedulingLatencyBucket | undefined {
  if (latencyMs === undefined) return undefined;
  if (!Number.isFinite(latencyMs) || latencyMs < 0 || latencyMs > 86_400_000) {
    throw new TypeError('Invalid clinic-scheduling telemetry latency.');
  }
  if (latencyMs < 100) return 'lt_100ms';
  if (latencyMs < 400) return 'lt_400ms';
  if (latencyMs < 800) return 'lt_800ms';
  if (latencyMs < 2_000) return 'lt_2s';
  return 'gte_2s';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/**
 * Build a Feature 009 telemetry event from an exact, fixed vocabulary.
 * Unknown input keys are intentionally ignored; no arbitrary payload can cross
 * this boundary. Malformed required context is rejected before emission.
 */
export function clinicSchedulingTelemetry(
  input: ClinicSchedulingTelemetryInput,
): ClinicSchedulingTelemetry {
  if (!isRecord(input)) {
    throw new TypeError('Invalid clinic-scheduling telemetry context.');
  }

  const policyVersion = input.policyVersion;
  if (policyVersion !== undefined && policyVersion !== CLINIC_SCHEDULING_POLICY_VERSION) {
    throw new TypeError('Invalid clinic-scheduling telemetry policy version.');
  }

  const safeLatencyBucket = latencyBucket(input.latencyMs);
  const surface = requireSetMember(
    input.surface,
    surfaces,
    'surface',
  ) as ClinicSchedulingTelemetrySurface;
  const operation = requireSetMember(
    input.operation,
    operationsBySurface[surface],
    'operation',
  ) as ClinicSchedulingTelemetryOperation;

  const result: ClinicSchedulingTelemetry = {
    event: 'clinic_scheduling.operation',
    requestId: requireUuid(input.requestId, 'request ID'),
    eventId: requireUuid(input.eventId, 'event ID'),
    aggregateId: requireUuid(input.aggregateId, 'aggregate ID'),
    ...(input.traceId === undefined ? {} : { traceId: requireTraceId(input.traceId) }),
    surface,
    operation,
    resultClass: requireSetMember(
      input.resultClass,
      resultClasses,
      'result class',
    ) as ClinicSchedulingTelemetryResultClass,
    outcome: requireSetMember(
      input.outcome,
      outcomes,
      'outcome',
    ) as ClinicSchedulingTelemetryOutcome,
    scope: requireSetMember(input.scope, scopes, 'scope') as ClinicSchedulingTelemetryScope,
    ...(safeLatencyBucket === undefined ? {} : { latencyBucket: safeLatencyBucket }),
    ...(policyVersion === undefined ? {} : { policyVersion }),
  };

  return result;
}

/** Explicit redaction seam for callers that do not want to name the builder. */
export const redactClinicSchedulingTelemetry = clinicSchedulingTelemetry;
export const clinicSchedulingRedact = clinicSchedulingTelemetry;

/**
 * Convert a validated structured event into metric labels. Correlation IDs,
 * scope identifiers, raw values, and all caller-supplied fields are excluded.
 */
export function clinicSchedulingMetricLabels(
  telemetry: ClinicSchedulingTelemetry,
): ClinicSchedulingMetricLabels {
  if (
    !isRecord(telemetry) ||
    Object.keys(telemetry).some((key) => !allowedTelemetryKeys.has(key)) ||
    telemetry.event !== 'clinic_scheduling.operation'
  ) {
    throw new TypeError('Invalid clinic-scheduling telemetry shape.');
  }

  const safe = clinicSchedulingTelemetry({
    requestId: telemetry.requestId,
    eventId: telemetry.eventId,
    aggregateId: telemetry.aggregateId,
    ...(telemetry.traceId === undefined ? {} : { traceId: telemetry.traceId }),
    surface: telemetry.surface,
    operation: telemetry.operation,
    resultClass: telemetry.resultClass,
    outcome: telemetry.outcome,
    scope: telemetry.scope,
    ...(telemetry.policyVersion === undefined ? {} : { policyVersion: telemetry.policyVersion }),
  });

  if (telemetry.latencyBucket !== undefined && !latencyBuckets.has(telemetry.latencyBucket)) {
    throw new TypeError('Invalid clinic-scheduling telemetry latency bucket.');
  }

  return {
    surface: safe.surface,
    operation: safe.operation,
    result_class: safe.resultClass,
    outcome: safe.outcome,
    scope: safe.scope,
    ...(telemetry.latencyBucket === undefined
      ? {}
      : { latency_bucket: telemetry.latencyBucket as ClinicSchedulingLatencyBucket }),
  };
}

export const clinicSchedulingMetricLabelsFor = clinicSchedulingMetricLabels;
