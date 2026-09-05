export * from './audit-admin.ts';

const sensitiveKeyPattern =
  /(?:^|_)(?:authorization|cookie|password|passcode|token|secret|otp|identity_value|national_id|passport|document|file|body|handle|email|phone)(?:_|$)/i;
const sensitiveString =
  /(?:bearer\s+[a-z0-9._~+/=-]+|\b\d{14}\b|\b\d{6}\b|\b[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9.-]+\.[a-z]{2,}\b|\+?20(?:10|11|12|15)\d{8})/gi;
export const REDACTED = '[REDACTED]';

const isSensitiveKey = (key: string) =>
  sensitiveKeyPattern.test(key.replaceAll(/([a-z0-9])([A-Z])/g, '$1_$2'));

export function redact(value: unknown, seen = new WeakSet<object>()): unknown {
  if (typeof value === 'string') return value.replace(sensitiveString, REDACTED);
  if (value === null || typeof value !== 'object') return value;
  if (seen.has(value)) return '[CIRCULAR]';
  seen.add(value);
  if (Array.isArray(value)) return value.map((entry) => redact(entry, seen));
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, entry]) => [
      key,
      isSensitiveKey(key) ? REDACTED : redact(entry, seen),
    ]),
  );
}

export type RequestTelemetry = {
  requestId: string;
  routeId: string;
  method: string;
  statusCode: number;
  durationMs: number;
  actorType?: 'public' | 'patient' | 'reviewer';
};
export const requestTelemetry = (input: RequestTelemetry) => ({
  event: 'http.request.completed',
  ...input,
});

const allowedMetricLabels = new Set([
  'route_id',
  'method',
  'status_class',
  'outcome',
  'actor_type',
  'surface',
  'state',
]);
export const metricLabels = (labels: Record<string, string>) =>
  Object.fromEntries(
    Object.entries(labels)
      .filter(([key]) => allowedMetricLabels.has(key))
      .map(([key, value]) => [key, value.slice(0, 64)]),
  );

export const findSentinels = (value: unknown, sentinels: readonly string[]) => {
  const encoded = JSON.stringify(value);
  return sentinels.filter((sentinel) => encoded.includes(sentinel));
};

export type IdentityContinuityTelemetry = Readonly<{
  requestId: string;
  traceId: string;
  surface: 'session' | 'mfa' | 'recovery' | 'transition' | 'step_up' | 'worker';
  state: 'current' | 'offline' | 'reconciling' | 'denied' | 'completed' | 'failed';
  outcome: 'allowed' | 'blocked' | 'retry' | 'dead_letter' | 'delivered';
}>;

export function identityContinuityTelemetry(input: IdentityContinuityTelemetry) {
  return {
    event: 'identity.continuity.state',
    requestId: input.requestId,
    traceId: input.traceId,
    surface: input.surface,
    state: input.state,
    outcome: input.outcome,
  };
}

export function identityContinuityMetricLabels(input: IdentityContinuityTelemetry) {
  return metricLabels({ surface: input.surface, state: input.state, outcome: input.outcome });
}
