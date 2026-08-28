import assert from 'node:assert/strict';
import test from 'node:test';

import {
  findSentinels,
  identityContinuityMetricLabels,
  identityContinuityTelemetry,
  metricLabels,
  redact,
} from './index.ts';

test('identity continuity telemetry is redacted and deliberately low-cardinality', () => {
  const telemetry = identityContinuityTelemetry({
    requestId: 'synthetic-request-007',
    traceId: 'synthetic-trace-007',
    surface: 'transition',
    state: 'denied',
    outcome: 'blocked',
  });
  assert.deepEqual(Object.keys(telemetry).toSorted(), [
    'event',
    'outcome',
    'requestId',
    'state',
    'surface',
    'traceId',
  ]);
  assert.deepEqual(
    identityContinuityMetricLabels({
      requestId: 'synthetic-request-007',
      traceId: 'synthetic-trace-007',
      surface: 'mfa',
      state: 'reconciling',
      outcome: 'blocked',
    }),
    { surface: 'mfa', state: 'reconciling', outcome: 'blocked' },
  );
});

test('identity continuity logs and metrics reject sensitive or high-cardinality identifiers', () => {
  const sentinels = [
    'session-identifier-007',
    'factor-identifier-007',
    'proof-identifier-007',
    'patient-identifier-007',
    'synthetic@example.invalid',
  ];
  const safe = redact({
    session_token: sentinels[0],
    factor_secret: sentinels[1],
    proof_document: sentinels[2],
    patient_email: sentinels[4],
  });
  assert.deepEqual(findSentinels(safe, sentinels), []);
  const telemetry = identityContinuityTelemetry({
    requestId: 'synthetic-request-007',
    traceId: 'synthetic-trace-007',
    surface: 'worker',
    state: 'failed',
    outcome: 'dead_letter',
    session_id: sentinels[0],
    factor_id: sentinels[1],
    proof_id: sentinels[2],
    patient_id: sentinels[3],
  } as never);
  assert.deepEqual(findSentinels(telemetry, sentinels), []);
  assert.deepEqual(
    metricLabels({
      surface: 'recovery',
      outcome: 'blocked',
      session_id: sentinels[0],
      factor_id: sentinels[1],
      patient_id: sentinels[3],
    }),
    { surface: 'recovery', outcome: 'blocked' },
  );
});
