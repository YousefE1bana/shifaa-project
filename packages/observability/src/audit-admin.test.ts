import assert from 'node:assert/strict';
import test from 'node:test';

import { auditAdminSyntheticSentinels } from '../../test-kit/src/audit-admin-fixtures.ts';
import {
  AUDIT_ADMIN_POLICY_VERSION,
  auditAdminMetricLabels,
  auditAdminTelemetry,
  type AuditAdminTelemetryInput,
} from './audit-admin.ts';
import { findSentinels } from './index.ts';

const requestId = '84000000-0000-4000-8000-000000000001';
const traceId = '84000000000040008000000000000001';
const sentinels = Object.values(auditAdminSyntheticSentinels);

const surfaceCases = [
  { surface: 'api', operation: 'listAuditEvents', outcome: 'succeeded' },
  { surface: 'worker', operation: 'exportAuditPartition', outcome: 'retrying' },
  { surface: 'adapter', operation: 'exportAuditPartition', outcome: 'failed' },
  { surface: 'aggregate', operation: 'getAdminSummary', outcome: 'suppressed' },
  { surface: 'health', operation: 'healthReady', outcome: 'degraded' },
] as const satisfies readonly Pick<AuditAdminTelemetryInput, 'surface' | 'operation' | 'outcome'>[];

test('every Feature 008 surface emits only fixed structured fields and correlation IDs', () => {
  for (const scenario of surfaceCases) {
    const telemetry = auditAdminTelemetry({
      requestId,
      traceId,
      ...scenario,
      reason: scenario.surface === 'health' ? 'outbox_backlog' : undefined,
      policyVersion: scenario.surface === 'aggregate' ? AUDIT_ADMIN_POLICY_VERSION : undefined,
      durationMs: 401,
      actorId: sentinels[0],
      patientId: sentinels[1],
      payload: sentinels[2],
      count: 10,
    });

    assert.deepEqual(Object.keys(telemetry).toSorted(), [
      'durationBucket',
      'event',
      'operation',
      'outcome',
      ...(scenario.surface === 'aggregate' ? ['policyVersion'] : []),
      ...(scenario.surface === 'health' ? ['reason'] : []),
      'requestId',
      'surface',
      'traceId',
    ]);
    assert.deepEqual(findSentinels(telemetry, sentinels), []);
  }
});

test('metric labels are bounded and exclude correlation and high-cardinality identifiers', () => {
  const telemetry = auditAdminTelemetry({
    requestId,
    traceId,
    surface: 'aggregate',
    operation: 'getAdminSummary',
    outcome: 'suppressed',
    reason: 'complementary_suppression',
    policyVersion: AUDIT_ADMIN_POLICY_VERSION,
    durationMs: 2_000,
  });

  assert.deepEqual(auditAdminMetricLabels(telemetry), {
    surface: 'aggregate',
    operation: 'getAdminSummary',
    outcome: 'suppressed',
    reason: 'complementary_suppression',
    policy_version: AUDIT_ADMIN_POLICY_VERSION,
    duration_bucket: 'gte_2s',
  });
  assert.equal('requestId' in auditAdminMetricLabels(telemetry), false);
  assert.equal('traceId' in auditAdminMetricLabels(telemetry), false);
});

test('all prohibited sentinels are absent from every telemetry surface and metric projection', () => {
  for (const sentinel of sentinels) {
    for (const scenario of surfaceCases) {
      const telemetry = auditAdminTelemetry({
        requestId,
        traceId,
        ...scenario,
        actorId: sentinel,
        personId: sentinel,
        patientId: sentinel,
        facilityId: sentinel,
        resourceId: sentinel,
        auditHash: sentinel,
        cursor: sentinel,
        signedUrl: sentinel,
        payload: sentinel,
        suppressedCount: sentinel,
        freeText: sentinel,
      });

      assert.deepEqual(findSentinels(telemetry, sentinels), []);
      assert.deepEqual(findSentinels(auditAdminMetricLabels(telemetry), sentinels), []);
    }
  }
});

test('identifier and arbitrary high-cardinality metric labels are rejected', () => {
  const telemetry = auditAdminTelemetry({
    requestId,
    traceId,
    surface: 'api',
    operation: 'getAuditEvent',
    outcome: 'denied',
    reason: 'forbidden',
  });

  for (const key of ['actor_id', 'person_id', 'facility_id', 'resource_id', 'cursor', 'hash']) {
    assert.throws(
      () => auditAdminMetricLabels({ ...telemetry, [key]: sentinels[0] } as never),
      /Invalid audit-admin telemetry shape/,
    );
  }
  assert.throws(
    () => auditAdminTelemetry({ ...telemetry, requestId: sentinels[0] } as never),
    /request ID/,
  );
  assert.throws(
    () => auditAdminTelemetry({ ...telemetry, traceId: sentinels[1] } as never),
    /trace ID/,
  );
  assert.throws(
    () => auditAdminTelemetry({ ...telemetry, operation: sentinels[2] } as never),
    /operation/,
  );
  assert.throws(
    () => auditAdminTelemetry({ ...telemetry, reason: sentinels[3] } as never),
    /reason/,
  );
  assert.throws(
    () =>
      auditAdminTelemetry({
        ...telemetry,
        surface: 'health',
        operation: 'listAuditEvents',
      } as never),
    /operation/,
  );
  assert.throws(
    () => auditAdminTelemetry({ ...telemetry, durationMs: Number.POSITIVE_INFINITY } as never),
    /duration/,
  );
});

test('suppressed aggregate telemetry exposes neither exact counts nor count-derived labels', () => {
  const telemetry = auditAdminTelemetry({
    requestId,
    traceId,
    surface: 'aggregate',
    operation: 'getAdminSummary',
    outcome: 'suppressed',
    reason: 'small_cell',
    policyVersion: AUDIT_ADMIN_POLICY_VERSION,
    suppressedCount: 10,
    releasedCount: 11,
    countRange: '0-10',
  });
  const labels = auditAdminMetricLabels(telemetry);

  assert.equal('suppressedCount' in telemetry, false);
  assert.equal('releasedCount' in telemetry, false);
  assert.equal('countRange' in telemetry, false);
  assert.equal(JSON.stringify(telemetry).includes('0-10'), false);
  assert.equal(
    Object.keys(labels).some((key) => key.includes('count')),
    false,
  );
});
