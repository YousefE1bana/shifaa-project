import { randomUUID } from 'node:crypto';

export const feature010ApiOperations = [
  'createEncounter',
  'getEncounter',
  'updateEncounter',
  'signEncounterNote',
  'completeEncounter',
  'createReferral',
  'listReferrals',
  'acceptReferral',
  'listContextMessages',
  'sendContextMessage',
] as const;

export const feature010ResultClasses = [
  'success',
  'denied',
  'conflict',
  'rate_limited',
  'failed',
] as const;

export type Feature010ApiOperation = (typeof feature010ApiOperations)[number];
export type Feature010ResultClass = (typeof feature010ResultClasses)[number];
export type Feature010StatusClass = '2xx' | '3xx' | '4xx' | '5xx';
export type Feature010LatencyBucket = 'lt_100ms' | 'lt_400ms' | 'lt_800ms' | 'lt_2s' | 'gte_2s';

export type Feature010TelemetryInput = Readonly<{
  requestId: string;
  traceId?: string;
  operation: Feature010ApiOperation;
  resultClass: Feature010ResultClass;
  statusCode: number;
  durationMs?: number;
}>;

export type Feature010Telemetry = Readonly<{
  event: 'feature_010.api.request';
  requestId: string;
  traceId?: string;
  operation: Feature010ApiOperation;
  resultClass: Feature010ResultClass;
  statusClass: Feature010StatusClass;
  latencyBucket?: Feature010LatencyBucket;
}>;

export type Feature010MetricLabels = Readonly<{
  operation: Feature010ApiOperation;
  result_class: Feature010ResultClass;
  status_class: Feature010StatusClass;
  latency_bucket?: Feature010LatencyBucket;
}>;

const feature010RouteOperations = new Map<string, Feature010ApiOperation>([
  ['POST /v1/encounters', 'createEncounter'],
  ['GET /v1/encounters/:encounterId', 'getEncounter'],
  ['PATCH /v1/encounters/:encounterId', 'updateEncounter'],
  ['POST /v1/encounters/:encounterId/notes', 'signEncounterNote'],
  ['POST /v1/encounters/:encounterId/complete', 'completeEncounter'],
  ['POST /v1/encounters/:encounterId/referrals', 'createReferral'],
  ['GET /v1/referrals', 'listReferrals'],
  ['POST /v1/referrals/:referralId/accept', 'acceptReferral'],
  ['GET /v1/contexts/:contextType/:contextId/messages', 'listContextMessages'],
  ['POST /v1/contexts/:contextType/:contextId/messages', 'sendContextMessage'],
]);

const feature010ProblemStatuses = new Map<string, number>([
  ['authentication-required:401', 401],
  ['mfa-required:403', 403],
  ['purpose-required:403', 403],
  ['forbidden:403', 403],
  ['not-found:404', 404],
  ['validation-failed:400', 400],
  ['validation-failed:422', 422],
  ['state-transition-invalid:409', 409],
  ['version-conflict:409', 409],
  ['idempotency-key-reused:409', 409],
  ['idempotency-in-progress:409', 409],
  ['slot-no-longer-available:409', 409],
  ['rate-limited:429', 429],
  ['open-sec-001:503', 503],
  ['vendor-unavailable:503', 503],
  ['internal-error:500', 500],
]);

export type Feature010SafeProblem = Readonly<{
  code: string;
  status: number;
  title: string;
  detail: string;
  retryAfter?: string;
}>;

export function feature010OperationForRoute(
  method: string,
  routeTemplate: string | undefined,
): Feature010ApiOperation | undefined {
  if (routeTemplate === undefined) return undefined;
  return feature010RouteOperations.get(`${method.toUpperCase()} ${routeTemplate}`);
}

export function feature010SafeProblem(
  rawCode: unknown,
  rawStatus: unknown,
  locale: string,
  rawRetryAfter?: unknown,
): Feature010SafeProblem {
  const candidateStatus = validStatus(rawStatus) && rawStatus >= 400 ? rawStatus : 500;
  const candidateCode = typeof rawCode === 'string' ? rawCode : '';
  let code = feature010ProblemStatuses.has(`${candidateCode}:${candidateStatus}`)
    ? candidateCode
    : safeCodeForStatus(candidateStatus);
  let status = candidateStatus;
  if (!feature010ProblemStatuses.has(`${code}:${status}`)) {
    code = 'internal-error';
    status = 500;
  }
  const arabic = locale.toLowerCase().startsWith('ar');
  const title = problemTitleFor(code, arabic);
  const retryAfter = code === 'rate-limited' ? validRetryAfter(rawRetryAfter) : undefined;
  return {
    code,
    status,
    title,
    detail: arabic ? 'تعذر إكمال الطلب.' : 'The request could not be completed.',
    ...(retryAfter === undefined ? {} : { retryAfter }),
  };
}

export interface Feature010ApiRequestLog {
  readonly id: string;
  readonly log: { info(fields: Feature010Telemetry): void };
}

export interface Feature010ApiReply {
  readonly statusCode: number;
}

const operationSet = new Set<string>(feature010ApiOperations);
const resultClassSet = new Set<string>(feature010ResultClasses);
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const traceIdPattern = /^(?!0{32}$)[0-9a-f]{32}$/i;

export function feature010Telemetry(input: Feature010TelemetryInput): Feature010Telemetry {
  if (!isRecord(input)) throw new TypeError('Invalid Feature 010 telemetry context.');
  if (typeof input.requestId !== 'string' || !uuidPattern.test(input.requestId))
    throw new TypeError('Invalid Feature 010 telemetry request ID.');
  if (
    input.traceId !== undefined &&
    (typeof input.traceId !== 'string' || !traceIdPattern.test(input.traceId))
  )
    throw new TypeError('Invalid Feature 010 telemetry trace ID.');
  if (typeof input.operation !== 'string' || !operationSet.has(input.operation))
    throw new TypeError('Invalid Feature 010 telemetry operation.');
  if (typeof input.resultClass !== 'string' || !resultClassSet.has(input.resultClass))
    throw new TypeError('Invalid Feature 010 telemetry result class.');
  if (!Number.isInteger(input.statusCode) || input.statusCode < 200 || input.statusCode > 599)
    throw new TypeError('Invalid Feature 010 telemetry status.');
  const latencyBucket = feature010LatencyBucket(input.durationMs);
  return {
    event: 'feature_010.api.request',
    requestId: input.requestId,
    ...(input.traceId === undefined ? {} : { traceId: input.traceId }),
    operation: input.operation,
    resultClass: input.resultClass,
    statusClass: `${Math.floor(input.statusCode / 100)}xx` as Feature010StatusClass,
    ...(latencyBucket === undefined ? {} : { latencyBucket }),
  };
}

export function feature010MetricLabels(event: Feature010Telemetry): Feature010MetricLabels {
  if (!isRecord(event)) throw new TypeError('Invalid Feature 010 telemetry event.');
  if (event.event !== 'feature_010.api.request')
    throw new TypeError('Invalid Feature 010 telemetry event.');
  if (!isStatusClass(event.statusClass))
    throw new TypeError('Invalid Feature 010 telemetry status class.');
  if (event.latencyBucket !== undefined && !isLatencyBucket(event.latencyBucket))
    throw new TypeError('Invalid Feature 010 telemetry latency bucket.');
  const safe = feature010Telemetry({
    requestId: event.requestId,
    ...(event.traceId === undefined ? {} : { traceId: event.traceId }),
    operation: event.operation,
    resultClass: event.resultClass,
    statusCode: statusCodeForClass(event.statusClass),
    ...(event.latencyBucket === undefined
      ? {}
      : { durationMs: durationForBucket(event.latencyBucket) }),
  });
  return {
    operation: safe.operation,
    result_class: safe.resultClass,
    status_class: safe.statusClass,
    ...(safe.latencyBucket === undefined ? {} : { latency_bucket: safe.latencyBucket }),
  };
}

export async function withFeature010Telemetry<T>(
  request: Feature010ApiRequestLog,
  reply: Feature010ApiReply,
  operation: Feature010ApiOperation,
  work: () => Promise<T>,
): Promise<T> {
  const startedAt = performance.now();
  let statusCode = 500;
  try {
    const result = await work();
    statusCode = validStatus(reply.statusCode) ? reply.statusCode : 500;
    return result;
  } catch (error) {
    const errorStatus = isRecord(error) ? (error['status'] ?? error['statusCode']) : undefined;
    const errorCode = isRecord(error) ? error['code'] : undefined;
    statusCode = feature010SafeProblem(errorCode, errorStatus, 'en-EG').status;
    throw error;
  } finally {
    try {
      request.log.info(
        feature010Telemetry({
          requestId: uuidPattern.test(request.id) ? request.id : randomUUID(),
          operation,
          resultClass: resultClassForStatus(statusCode),
          statusCode,
          durationMs: performance.now() - startedAt,
        }),
      );
    } catch {
      // Observability must not alter an authoritative response.
    }
  }
}

function safeCodeForStatus(status: number): string {
  if (status === 400 || status === 422) return 'validation-failed';
  if (status === 401) return 'authentication-required';
  if (status === 403) return 'forbidden';
  if (status === 404) return 'not-found';
  if (status === 409) return 'state-transition-invalid';
  if (status === 429) return 'rate-limited';
  if (status === 503) return 'vendor-unavailable';
  return 'internal-error';
}

function problemTitleFor(code: string, arabic: boolean): string {
  if (arabic) {
    if (code === 'forbidden' || code === 'mfa-required' || code === 'purpose-required')
      return 'غير مسموح بهذا الإجراء';
    if (code === 'validation-failed') return 'راجع البيانات المدخلة';
    if (code === 'version-conflict' || code === 'state-transition-invalid')
      return 'تعذر إكمال الطلب';
    return 'تعذر إكمال الطلب';
  }
  if (code === 'forbidden' || code === 'mfa-required' || code === 'purpose-required')
    return 'This action is not allowed';
  if (code === 'validation-failed') return 'Check the information you entered';
  return 'The request could not be completed';
}

function validRetryAfter(value: unknown): string | undefined {
  if (typeof value !== 'string' || !/^(0|[1-9][0-9]{0,4})$/.test(value)) return undefined;
  const seconds = Number(value);
  return seconds <= 86_400 ? String(seconds) : undefined;
}

function isStatusClass(value: unknown): value is Feature010StatusClass {
  return value === '2xx' || value === '3xx' || value === '4xx' || value === '5xx';
}

function isLatencyBucket(value: unknown): value is Feature010LatencyBucket {
  return (
    value === 'lt_100ms' ||
    value === 'lt_400ms' ||
    value === 'lt_800ms' ||
    value === 'lt_2s' ||
    value === 'gte_2s'
  );
}

function resultClassForStatus(statusCode: number): Feature010ResultClass {
  if (statusCode >= 200 && statusCode < 300) return 'success';
  if (statusCode === 409) return 'conflict';
  if (statusCode === 429) return 'rate_limited';
  if (statusCode >= 400 && statusCode < 500) return 'denied';
  return 'failed';
}

function feature010LatencyBucket(
  durationMs: number | undefined,
): Feature010LatencyBucket | undefined {
  if (durationMs === undefined) return undefined;
  if (!Number.isFinite(durationMs) || durationMs < 0 || durationMs > 86_400_000)
    throw new TypeError('Invalid Feature 010 telemetry duration.');
  if (durationMs < 100) return 'lt_100ms';
  if (durationMs < 400) return 'lt_400ms';
  if (durationMs < 800) return 'lt_800ms';
  if (durationMs < 2_000) return 'lt_2s';
  return 'gte_2s';
}

function statusCodeForClass(statusClass: Feature010StatusClass): number {
  switch (statusClass) {
    case '2xx':
      return 200;
    case '3xx':
      return 300;
    case '4xx':
      return 400;
    case '5xx':
      return 500;
  }
  throw new TypeError('Invalid Feature 010 telemetry status class.');
}

function durationForBucket(bucket: Feature010LatencyBucket): number {
  switch (bucket) {
    case 'lt_100ms':
      return 50;
    case 'lt_400ms':
      return 200;
    case 'lt_800ms':
      return 600;
    case 'lt_2s':
      return 1_000;
    case 'gte_2s':
      return 2_000;
  }
  throw new TypeError('Invalid Feature 010 telemetry latency bucket.');
}

function validStatus(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 200 && value <= 599;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
