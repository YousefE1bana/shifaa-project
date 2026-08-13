import assert from 'node:assert/strict';
import test from 'node:test';

import {
  FamilyEventWorker,
  projectEmergencyContactDelivery,
  projectFamilyEvent,
  type FamilyEvent,
} from './family-care.ts';

const event: FamilyEvent = {
  id: 'evt-family-004',
  type: 'relationship.delegation.accepted',
  occurredAt: '2026-08-11T00:00:00Z',
  payload: {
    relationship_id: 'relationship-004',
    subject_patient_id: 'patient-004',
    relationship_type: 'delegation',
    status: 'active',
    permission_codes: ['appointment.manage'],
    request_id: 'request-004',
    token: 'TOKEN-SENTINEL',
    diagnosis: 'DIAGNOSIS-SENTINEL',
    nested: { phone: 'PHONE-SENTINEL' },
  },
};

test('uses closed projections and never emits invitation or clinical fields', () => {
  assert.deepEqual(projectFamilyEvent(event).payload, {
    relationship_id: 'relationship-004',
    subject_patient_id: 'patient-004',
    relationship_type: 'delegation',
    status: 'active',
    permission_codes: ['appointment.manage'],
    request_id: 'request-004',
  });
  assert.doesNotMatch(JSON.stringify(projectFamilyEvent(event)), /SENTINEL/);
  assert.throws(
    () =>
      projectFamilyEvent({ ...event, payload: { ...event.payload, status: 'DIAGNOSIS-SENTINEL' } }),
    /family-event-status-invalid/,
  );
  assert.throws(
    () =>
      projectFamilyEvent({
        ...event,
        payload: { ...event.payload, permission_codes: ['TOKEN-SENTINEL'] },
      }),
    /family-event-permissions-invalid/,
  );
});

test('delivers only a confirmed qualifying active SOS minimum projection', () => {
  const base = {
    sourceEventType: 'sos.emergency_contact.requested',
    incidentActive: true,
    incidentQualifying: true,
    contactStatus: 'confirmed' as const,
    patientDisplayName: 'Synthetic Patient',
    incidentTime: '2026-08-11T00:00:00Z',
    callbackNumber: '+201000000000',
    locationPrecision: 'coarse' as const,
    location: { coarse: 'Synthetic Cairo zone' },
  };
  assert.deepEqual(projectEmergencyContactDelivery(base), {
    allowed: true,
    payload: {
      patient_display_name: 'Synthetic Patient',
      message_code: 'needs_urgent_help',
      incident_time: '2026-08-11T00:00:00Z',
      callback_number: '+201000000000',
      location: 'Synthetic Cairo zone',
      location_precision: 'coarse',
    },
  });
  assert.equal(
    projectEmergencyContactDelivery({ ...base, sourceEventType: 'appointment.changed' }).allowed,
    false,
  );
  assert.equal(
    projectEmergencyContactDelivery({ ...base, extraFields: { diagnosis: 'SENTINEL' } }).allowed,
    false,
  );
});

test('deduplicates successful receipts and bounds retry into dead letter', async () => {
  const worker = new FamilyEventWorker(2);
  let delivered = 0;
  await worker.consume(event, async () => {
    delivered += 1;
  });
  await worker.consume(event, async () => {
    delivered += 1;
  });
  assert.equal(delivered, 1);
  await assert.rejects(
    worker.consume({ ...event, payload: { ...event.payload, status: 'revoked' } }, async () => {}),
    /family-event-replay-payload-mismatch/,
  );

  const failing = { ...event, id: 'evt-failing-004' };
  const firstFailure = await worker.consume(failing, async () =>
    Promise.reject(new Error('synthetic')),
  );
  assert.equal(firstFailure.attempts, 1);
  assert.equal(firstFailure.state, 'retry');
  assert.match(firstFailure.payloadHash, /^[0-9a-f]{64}$/);
  const secondFailure = await worker.consume(failing, async () =>
    Promise.reject(new Error('synthetic')),
  );
  assert.equal(secondFailure.attempts, 2);
  assert.equal(secondFailure.state, 'dead_letter');
  assert.equal(secondFailure.payloadHash, firstFailure.payloadHash);
});
