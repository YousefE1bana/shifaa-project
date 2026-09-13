import assert from 'node:assert/strict';
import test from 'node:test';

import {
  clinicSchedulingMetricLabels,
  clinicSchedulingTelemetry,
  type ClinicSchedulingTelemetryInput,
} from './clinic-scheduling.ts';

const requestId = 'a4000000-0000-4000-8000-000000000001';
const eventId = 'a5000000-0000-4000-8000-000000000001';
const aggregateId = 'a6000000-0000-4000-8000-000000000001';
const sentinels = {
  patientName: 'Patient Name Sentinel',
  contact: 'patient009@example.invalid',
  reason: 'raw reason must never escape',
  coordinate: '30.0444,31.2357',
  token: 'Bearer clinic-token-sentinel',
  appointmentDetail: '09:30 appointment detail sentinel',
  identifier: '93000000-0000-4000-8000-000000000001',
};

const baseInput = {
  requestId,
  eventId,
  aggregateId,
  surface: 'api',
  operation: 'createAppointment',
  resultClass: 'success',
  outcome: 'confirmed',
  scope: 'scoped',
  latencyMs: 42,
} as const satisfies ClinicSchedulingTelemetryInput;

test('Feature 009 telemetry is exact-field, correlated, and redacted by default', () => {
  const telemetry = clinicSchedulingTelemetry({
    ...baseInput,
    patientName: sentinels.patientName,
    contact: sentinels.contact,
    reason: sentinels.reason,
    coordinate: sentinels.coordinate,
    token: sentinels.token,
    appointmentDetails: sentinels.appointmentDetail,
    patientId: sentinels.identifier,
  } as never);

  assert.deepEqual(Object.keys(telemetry).toSorted(), [
    'aggregateId',
    'event',
    'eventId',
    'latencyBucket',
    'operation',
    'outcome',
    'requestId',
    'resultClass',
    'scope',
    'surface',
  ]);
  assert.deepEqual(telemetry, {
    event: 'clinic_scheduling.operation',
    requestId,
    eventId,
    aggregateId,
    surface: 'api',
    operation: 'createAppointment',
    resultClass: 'success',
    outcome: 'confirmed',
    scope: 'scoped',
    latencyBucket: 'lt_100ms',
  });
  for (const sentinel of Object.values(sentinels)) {
    assert.equal(JSON.stringify(telemetry).includes(sentinel), false);
  }
});

test('fixed conflict, replay, outbox, queue, delay, and absence vocabulary is supported', () => {
  const scenarios = [
    ['schedule', 'conflict', 'scheduleConflict'],
    ['appointment', 'replay', 'idempotentReplay'],
    ['outbox', 'retrying', 'outboxPending'],
    ['queue', 'success', 'queueReordered'],
    ['delay', 'success', 'delaySuperseded'],
    ['absence', 'success', 'absenceApplied'],
  ] as const;

  for (const [surface, resultClass, outcome] of scenarios) {
    const operation =
      surface === 'schedule'
        ? 'createSchedule'
        : surface === 'appointment'
          ? 'createAppointment'
          : surface === 'queue'
            ? 'reorderQueueEntry'
            : surface === 'delay'
              ? 'sendDoctorDelay'
              : surface === 'absence'
                ? 'declareDoctorAbsence'
                : 'workerDeliveryClaim';
    const telemetry = clinicSchedulingTelemetry({
      ...baseInput,
      surface,
      operation,
      resultClass,
      outcome,
    });
    assert.equal(telemetry.surface, surface);
    assert.equal(telemetry.resultClass, resultClass);
    assert.equal(telemetry.outcome, outcome);
  }
});

test('metric labels contain only bounded values and never correlation or identifiers', () => {
  const telemetry = clinicSchedulingTelemetry({
    ...baseInput,
    surface: 'queue',
    operation: 'reorderQueueEntry',
    resultClass: 'conflict',
    outcome: 'queueVersionConflict',
    latencyMs: 2_000,
  });
  const labels = clinicSchedulingMetricLabels(telemetry);

  assert.deepEqual(labels, {
    surface: 'queue',
    operation: 'reorderQueueEntry',
    result_class: 'conflict',
    outcome: 'queueVersionConflict',
    scope: 'scoped',
    latency_bucket: 'gte_2s',
  });
  assert.equal('requestId' in labels, false);
  assert.equal('eventId' in labels, false);
  assert.equal('aggregateId' in labels, false);
  assert.equal('patient_id' in labels, false);
});

test('malformed correlation, vocabulary, latency, and telemetry shape fail closed', () => {
  assert.throws(
    () => clinicSchedulingTelemetry({ ...baseInput, requestId: 'request-1' } as never),
    /request ID/,
  );
  assert.throws(
    () => clinicSchedulingTelemetry({ ...baseInput, eventId: 'not-an-event-id' } as never),
    /event ID/,
  );
  assert.throws(
    () => clinicSchedulingTelemetry({ ...baseInput, resultClass: 'patient-id' } as never),
    /result class/,
  );
  assert.throws(
    () =>
      clinicSchedulingTelemetry({
        ...baseInput,
        surface: 'queue',
        operation: 'createAppointment',
      } as never),
    /operation/,
  );
  assert.throws(
    () =>
      clinicSchedulingTelemetry({
        ...baseInput,
        surface: 'api',
        operation: 'workerDeliveryClaim',
      } as never),
    /operation/,
  );
  assert.throws(
    () => clinicSchedulingTelemetry({ ...baseInput, latencyMs: Number.POSITIVE_INFINITY } as never),
    /latency/,
  );
  const telemetry = clinicSchedulingTelemetry(baseInput);
  assert.throws(
    () => clinicSchedulingMetricLabels({ ...telemetry, patientId: sentinels.identifier } as never),
    /shape/,
  );
});
