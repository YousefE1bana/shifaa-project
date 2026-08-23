import assert from 'node:assert/strict';
import test from 'node:test';

import { createDiscoverySosStack, key, person } from './discovery-sos-stack-harness.ts';

test('real-stack matched vs cross-facility hospital pre-arrival worklist and acceptance (AC-11..14)', async () => {
  const stack = await createDiscoverySosStack();
  try {
    const patientId = stack.ids.patients.subject;
    const patientPersonId = stack.ids.people.patient;
    const hospitalAId = stack.ids.facilities.nearestFreshHospital;
    const hospitalBId = stack.ids.facilities.fartherFreshHospital;
    const hospitalAOwner = stack.ids.people.hospitalAOwner;
    const hospitalBOwner = stack.ids.people.hospitalBOwner;

    // 1. Create an SOS incident that matches Hospital A
    const activateRes = await stack.app.inject({
      method: 'POST',
      url: '/v1/sos/incidents',
      headers: {
        authorization: person(patientPersonId),
        'x-shifaa-patient-context': patientId,
        'x-purpose': 'emergency_care',
        'idempotency-key': key('prearrival-sos-init'),
      },
      payload: {
        managed_patient_id: patientId,
        coordinates: stack.ids.locations.activation,
        qualifying_reason_code: 'accident_or_injury',
        contact_preference: 'none',
        callback_source: 'patient_verified_contact',
        explicit_activation: true,
      },
    });
    assert.equal(activateRes.statusCode, 201, activateRes.body);
    const incident = activateRes.json().incident;
    assert.equal(incident.status, 'matched');
    assert.equal(incident.matched_facility.facility_id, hospitalAId);

    const hospitalAHeaders = (
      personId = hospitalAOwner,
      purpose = 'sos_prearrival',
      aal = '2',
    ) => ({
      authorization: person(personId),
      'x-purpose': purpose,
      'x-aal': aal,
    });

    // 2. Hospital A workforce lists pre-arrivals -> returns matched incident
    const listA = await stack.app.inject({
      method: 'GET',
      url: `/v1/hospitals/${hospitalAId}/sos-prearrivals`,
      headers: hospitalAHeaders(),
    });
    assert.equal(listA.statusCode, 200, listA.body);
    const listABody = listA.json();
    assert.ok(Array.isArray(listABody.data));
    const matchedPrearrival = listABody.data.find(
      (p: { incident_id: string }) => p.incident_id === incident.incident_id,
    );
    assert.ok(matchedPrearrival);
    assert.equal(matchedPrearrival.status, 'matched');
    assert.equal(matchedPrearrival.qualifying_reason_code, 'accident_or_injury');
    assert.ok(['fresh', 'unknown'].includes(matchedPrearrival.capacity_freshness));
    assert.equal(matchedPrearrival.version, 1);

    // 3. Cross-facility access: Hospital B workforce querying Hospital A pre-arrivals fails with 403
    const crossList = await stack.app.inject({
      method: 'GET',
      url: `/v1/hospitals/${hospitalAId}/sos-prearrivals`,
      headers: hospitalAHeaders(hospitalBOwner),
    });
    assert.equal(crossList.statusCode, 403);

    // 4. Missing purpose header fails with 403
    const noPurposeList = await stack.app.inject({
      method: 'GET',
      url: `/v1/hospitals/${hospitalAId}/sos-prearrivals`,
      headers: {
        authorization: person(hospitalAOwner),
        'x-aal': '2',
      },
    });
    assert.equal(noPurposeList.statusCode, 403);

    // 5. Acceptance with AAL1 fails (AAL2 is required for acceptance mutation)
    const aal1Accept = await stack.app.inject({
      method: 'POST',
      url: `/v1/hospitals/${hospitalAId}/sos-incidents/${incident.incident_id}/accept`,
      headers: {
        ...hospitalAHeaders(hospitalAOwner, 'sos_prearrival', '1'),
        'idempotency-key': key('aal1-accept-001'),
        'if-match': `"${incident.version}"`,
      },
      payload: {
        acknowledgement: true,
        capacity_note_code: 'capacity_acknowledged',
      },
    });
    assert.equal(aal1Accept.statusCode, 403);

    // 6. Cross-facility acceptance: Hospital B workforce trying to accept Hospital A's incident fails
    const crossAccept = await stack.app.inject({
      method: 'POST',
      url: `/v1/hospitals/${hospitalBId}/sos-incidents/${incident.incident_id}/accept`,
      headers: {
        ...hospitalAHeaders(hospitalBOwner, 'sos_prearrival', '2'),
        'idempotency-key': key('cross-accept-001'),
        'if-match': `"${incident.version}"`,
      },
      payload: {
        acknowledgement: true,
        capacity_note_code: 'capacity_acknowledged',
      },
    });
    assert.equal(crossAccept.statusCode, 409);

    // 7. Successful Acceptance by Hospital A workforce at AAL2
    const acceptRes = await stack.app.inject({
      method: 'POST',
      url: `/v1/hospitals/${hospitalAId}/sos-incidents/${incident.incident_id}/accept`,
      headers: {
        ...hospitalAHeaders(hospitalAOwner, 'sos_prearrival', '2'),
        'idempotency-key': key('accept-valid-001'),
        'if-match': `"${incident.version}"`,
      },
      payload: {
        acknowledgement: true,
        capacity_note_code: 'capacity_acknowledged',
      },
    });
    assert.equal(acceptRes.statusCode, 200, acceptRes.body);
    const acceptedIncident = acceptRes.json().incident;
    assert.equal(acceptedIncident.status, 'accepted');
    assert.equal(acceptedIncident.version, 2);
    assert.equal(acceptRes.json().guidance.bed_reserved, false);
    assert.equal(acceptRes.json().guidance.ambulance_dispatched, false);

    // 8. Stale version retry fails with 409
    const staleAccept = await stack.app.inject({
      method: 'POST',
      url: `/v1/hospitals/${hospitalAId}/sos-incidents/${incident.incident_id}/accept`,
      headers: {
        ...hospitalAHeaders(hospitalAOwner, 'sos_prearrival', '2'),
        'idempotency-key': key('accept-stale-001'),
        'if-match': '"1"',
      },
      payload: {
        acknowledgement: true,
        capacity_note_code: 'capacity_acknowledged',
      },
    });
    assert.equal(staleAccept.statusCode, 409);

    // 9. Hospital closure of accepted incident
    const closeRes = await stack.app.inject({
      method: 'POST',
      url: `/v1/sos/incidents/${incident.incident_id}/close`,
      headers: {
        ...hospitalAHeaders(hospitalAOwner, 'sos_prearrival', '2'),
        'idempotency-key': key('hsp-close-001'),
        'if-match': `"${acceptedIncident.version}"`,
      },
      payload: { outcome_code: 'hospital_follow_up' },
    });
    assert.equal(closeRes.statusCode, 200, closeRes.body);
    assert.equal(closeRes.json().incident.status, 'closed');
  } finally {
    await stack.close();
  }
});
