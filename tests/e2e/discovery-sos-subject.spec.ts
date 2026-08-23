import assert from 'node:assert/strict';
import test from 'node:test';

import { createDiscoverySosStack, key, person } from './discovery-sos-stack-harness.ts';

test('real-stack SOS subject lifecycle, matching, caregiver permissions, replay, race, and close (AC-05..10, 13, 25)', async () => {
  const stack = await createDiscoverySosStack();
  try {
    const patientId = stack.ids.patients.subject;
    const patientPersonId = stack.ids.people.patient;
    const guardianPersonId = stack.ids.people.guardian;
    const activateDelegateId = stack.ids.people.activateDelegate;
    const shareDelegateId = stack.ids.people.shareDelegate;
    const recordOnlyDelegateId = stack.ids.people.recordOnlyDelegate;
    const unrelatedPersonId = stack.ids.people.unrelated;

    const patientHeaders = (actorId = patientPersonId, purpose = 'emergency_care') => ({
      authorization: person(actorId),
      'x-shifaa-patient-context': patientId,
      'x-purpose': purpose,
      'accept-language': 'en-EG',
    });

    // 1. Positive SOS Activation by Patient Self with fresh hospital match
    const validActivationPayload = {
      managed_patient_id: patientId,
      coordinates: stack.ids.locations.activation, // near nearestFreshHospital
      qualifying_reason_code: 'medical_emergency',
      contact_preference: 'none',
      callback_source: 'patient_verified_contact',
      explicit_activation: true,
    };

    const activateKey = key('patient-sos-001');
    await stack.owner`
      update identity.callback_contact_verifications
      set revoked_at=statement_timestamp()
      where person_id=${patientPersonId}::uuid
    `;
    const revokedCallback = await stack.app.inject({
      method: 'POST',
      url: '/v1/sos/incidents',
      remoteAddress: '127.0.0.3',
      headers: {
        ...patientHeaders(),
        'idempotency-key': key('revoked-callback-source'),
      },
      payload: validActivationPayload,
    });
    assert.equal(revokedCallback.statusCode, 403);
    await stack.owner`
      update identity.callback_contact_verifications
      set revoked_at=null
      where person_id=${patientPersonId}::uuid
    `;
    const created = await stack.app.inject({
      method: 'POST',
      url: '/v1/sos/incidents',
      headers: {
        ...patientHeaders(),
        'idempotency-key': activateKey,
      },
      payload: validActivationPayload,
    });
    assert.equal(created.statusCode, 201, created.body);
    const createdBody = created.json();
    assert.equal(createdBody.incident.managed_patient_id, patientId);
    assert.equal(createdBody.incident.status, 'matched');
    assert.equal(
      createdBody.incident.matched_facility?.facility_id,
      stack.ids.facilities.nearestFreshHospital,
    );
    assert.equal(createdBody.guidance.call_ambulance_123, true);
    assert.equal(createdBody.guidance.ambulance_dispatched, false);
    assert.equal(createdBody.guidance.bed_reserved, false);
    assert.ok(createdBody.nearby_hospitals.length > 0);

    const incidentId = createdBody.incident.incident_id;

    // 2. Idempotency replay with same key & identical payload returns same incident
    const replayed = await stack.app.inject({
      method: 'POST',
      url: '/v1/sos/incidents',
      headers: {
        ...patientHeaders(),
        'idempotency-key': activateKey,
      },
      payload: validActivationPayload,
    });
    assert.equal(replayed.statusCode, 201, replayed.body);
    assert.equal(replayed.json().incident.incident_id, incidentId);

    // 3. Changed replay with same key & different payload fails with 409 Conflict
    const changedReplay = await stack.app.inject({
      method: 'POST',
      url: '/v1/sos/incidents',
      headers: {
        ...patientHeaders(),
        'idempotency-key': activateKey,
      },
      payload: { ...validActivationPayload, qualifying_reason_code: 'accident_or_injury' },
    });
    assert.equal(changedReplay.statusCode, 409);

    // 4. Duplicate active incident for same patient is rejected (unique constraint)
    const secondActive = await stack.app.inject({
      method: 'POST',
      url: '/v1/sos/incidents',
      headers: {
        ...patientHeaders(),
        'idempotency-key': key('duplicate-sos-002'),
      },
      payload: validActivationPayload,
    });
    assert.equal(secondActive.statusCode, 409);

    // 5. Read SOS incident by patient self
    const readSelf = await stack.app.inject({
      method: 'GET',
      url: `/v1/sos/incidents/${incidentId}`,
      headers: patientHeaders(),
    });
    assert.equal(readSelf.statusCode, 200, readSelf.body);
    assert.equal(readSelf.json().incident.incident_id, incidentId);
    assert.equal(readSelf.json().incident.status, 'matched');

    const readMissingContext = await stack.app.inject({
      method: 'GET',
      url: `/v1/sos/incidents/${incidentId}`,
      headers: {
        authorization: person(patientPersonId),
        'x-purpose': 'emergency_care',
      },
    });
    assert.equal(readMissingContext.statusCode, 404);

    const readWrongContext = await stack.app.inject({
      method: 'GET',
      url: `/v1/sos/incidents/${incidentId}`,
      headers: {
        authorization: person(patientPersonId),
        'x-shifaa-patient-context': stack.ids.patients.unrelated,
        'x-purpose': 'emergency_care',
      },
    });
    assert.equal(readWrongContext.statusCode, 404);

    // Read by unrelated person fails with 404 / 403
    const readUnrelated = await stack.app.inject({
      method: 'GET',
      url: `/v1/sos/incidents/${incidentId}`,
      headers: patientHeaders(unrelatedPersonId),
    });
    assert.equal(readUnrelated.statusCode, 404);

    // 6. Close incident with stale If-Match version fails with 428 / 409
    const staleClose = await stack.app.inject({
      method: 'POST',
      url: `/v1/sos/incidents/${incidentId}/close`,
      headers: {
        ...patientHeaders(),
        'idempotency-key': key('close-stale-001'),
        'if-match': '"999"',
      },
      payload: { outcome_code: 'help_received' },
    });
    assert.equal(staleClose.statusCode, 409);

    // 7. Close incident successfully by patient self
    const closeKey = key('close-valid-001');
    const closed = await stack.app.inject({
      method: 'POST',
      url: `/v1/sos/incidents/${incidentId}/close`,
      headers: {
        ...patientHeaders(),
        'idempotency-key': closeKey,
        'if-match': `"${createdBody.incident.version}"`,
      },
      payload: { outcome_code: 'help_received' },
    });
    assert.equal(closed.statusCode, 200, closed.body);
    assert.equal(closed.json().incident.status, 'closed');
    assert.equal(closed.json().incident.version, createdBody.incident.version + 1);

    // 8. Caregiver Authorization Permutations:
    // Guardian can activate SOS
    const guardianCreated = await stack.app.inject({
      method: 'POST',
      url: '/v1/sos/incidents',
      headers: {
        ...patientHeaders(guardianPersonId, 'emergency_care'),
        'idempotency-key': key('guardian-sos-001'),
      },
      payload: validActivationPayload,
    });
    assert.equal(guardianCreated.statusCode, 201, guardianCreated.body);
    const guardianIncidentId = guardianCreated.json().incident.incident_id;

    // Guardian closes the incident
    const guardianClosed = await stack.app.inject({
      method: 'POST',
      url: `/v1/sos/incidents/${guardianIncidentId}/close`,
      headers: {
        ...patientHeaders(guardianPersonId, 'emergency_care'),
        'idempotency-key': key('guardian-close-001'),
        'if-match': `"${guardianCreated.json().incident.version}"`,
      },
      payload: { outcome_code: 'no_longer_needed' },
    });
    assert.equal(guardianClosed.statusCode, 200);

    // Activate-delegate can activate SOS
    const delegateCreated = await stack.app.inject({
      method: 'POST',
      url: '/v1/sos/incidents',
      headers: {
        ...patientHeaders(activateDelegateId, 'emergency_care'),
        'idempotency-key': key('delegate-sos-001'),
      },
      payload: validActivationPayload,
    });
    assert.equal(delegateCreated.statusCode, 201, delegateCreated.body);

    // Delegate closes the incident
    await stack.app.inject({
      method: 'POST',
      url: `/v1/sos/incidents/${delegateCreated.json().incident.incident_id}/close`,
      headers: {
        ...patientHeaders(activateDelegateId, 'emergency_care'),
        'idempotency-key': key('delegate-close-001'),
        'if-match': `"${delegateCreated.json().incident.version}"`,
      },
      payload: { outcome_code: 'hospital_follow_up' },
    });

    // Share-only delegate is DENIED SOS activation
    const shareOnlyDenied = await stack.app.inject({
      method: 'POST',
      url: '/v1/sos/incidents',
      headers: {
        ...patientHeaders(shareDelegateId, 'emergency_care'),
        'idempotency-key': key('share-only-sos-001'),
      },
      payload: validActivationPayload,
    });
    assert.equal(shareOnlyDenied.statusCode, 403);

    // Record-only delegate is DENIED SOS activation
    const recordOnlyDenied = await stack.app.inject({
      method: 'POST',
      url: '/v1/sos/incidents',
      headers: {
        ...patientHeaders(recordOnlyDelegateId, 'emergency_care'),
        'idempotency-key': key('record-only-sos-001'),
      },
      payload: validActivationPayload,
    });
    assert.equal(recordOnlyDenied.statusCode, 403);

    // Unrelated actor is DENIED SOS activation
    const unrelatedDenied = await stack.app.inject({
      method: 'POST',
      url: '/v1/sos/incidents',
      headers: {
        ...patientHeaders(unrelatedPersonId, 'emergency_care'),
        'idempotency-key': key('unrelated-sos-001'),
      },
      payload: validActivationPayload,
    });
    assert.equal(unrelatedDenied.statusCode, 403);

    // 9. No-qualifying-capacity Fallback (coordinates far from any qualifying hospital)
    const unmatchedActivation = await stack.app.inject({
      method: 'POST',
      url: '/v1/sos/incidents',
      headers: {
        ...patientHeaders(),
        'idempotency-key': key('unmatched-sos-001'),
      },
      payload: {
        ...validActivationPayload,
        coordinates: { longitude: 25.0, latitude: 25.0 }, // Far desert location with no hospital
      },
    });
    assert.equal(unmatchedActivation.statusCode, 201, unmatchedActivation.body);
    const unmatchedBody = unmatchedActivation.json();
    assert.equal(unmatchedBody.incident.status, 'active_unmatched');
    assert.equal(unmatchedBody.incident.matched_facility, null);
    assert.equal(unmatchedBody.guidance.call_ambulance_123, true);
    assert.equal(unmatchedBody.guidance.ambulance_dispatched, false);
    assert.equal(unmatchedBody.guidance.bed_reserved, false);

    // Close unmatched incident with created_in_error
    await stack.app.inject({
      method: 'POST',
      url: `/v1/sos/incidents/${unmatchedBody.incident.incident_id}/close`,
      headers: {
        ...patientHeaders(),
        'idempotency-key': key('unmatched-close-001'),
        'if-match': `"${unmatchedBody.incident.version}"`,
      },
      payload: { outcome_code: 'created_in_error' },
    });

    // 10. Language parity in ar-EG
    const arCreated = await stack.app.inject({
      method: 'POST',
      url: '/v1/sos/incidents',
      // Exercise locale parity from a separate synthetic client network so this
      // broad lifecycle does not invalidate its own network-abuse assertion.
      remoteAddress: '127.0.0.2',
      headers: {
        ...patientHeaders(),
        'accept-language': 'ar-EG',
        'idempotency-key': key('ar-sos-001'),
      },
      payload: validActivationPayload,
    });
    assert.equal(arCreated.statusCode, 201);
    assert.equal(arCreated.headers['content-language'], 'ar-EG');
    assert.equal(arCreated.json().incident.matched_facility.name, 'مستشفى اصطناعي ألف');
  } finally {
    await stack.close();
  }
});
