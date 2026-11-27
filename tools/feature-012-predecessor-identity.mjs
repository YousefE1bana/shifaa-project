import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

const person = (n) => 'f0110000-0000-4000-8000-' + String(n).padStart(12, '0');
const grantId = 'f0120400-0000-4000-8100-000000000001';
const withdrawalId = 'f0120400-0000-4000-8100-000000000002';

export async function consentHistory(app, subject, unrelated) {
  const read = async (fixture) => {
    const requestId = randomUUID();
    const response = await app.inject({
      method: 'GET',
      url: '/v1/privacy/consents',
      headers: { authorization: 'Bearer ' + fixture.token, 'x-request-id': requestId },
    });
    assert.equal(response.statusCode, 200, response.json().code);
    return { records: response.json(), requestId, status: response.statusCode };
  };
  const mine = await read(subject);
  const other = await read(unrelated);
  assert.deepEqual(
    mine.records
      .filter((row) => row.id === grantId || row.id === withdrawalId)
      .map((row) => ({
        id: row.id,
        decision: row.decision,
        supersedesId: row.supersedes_id,
        purpose: row.purpose_code,
        version: row.version,
      })),
    [
      { id: grantId, decision: 'granted', supersedesId: null, purpose: 'care_updates', version: 1 },
      {
        id: withdrawalId,
        decision: 'withdrawn',
        supersedesId: grantId,
        purpose: 'care_updates',
        version: 2,
      },
    ],
  );
  assert.ok(other.records.every((row) => row.id !== grantId && row.id !== withdrawalId));
  return {
    subjectRequest: mine.requestId,
    unrelatedRequest: other.requestId,
    subjectStatus: mine.status,
    unrelatedStatus: other.status,
    history: ['granted', 'withdrawn'],
    unrelatedVisible: 0,
  };
}

export async function guardianshipReview(app, { phase, patient, relationship }) {
  const reviewer = '40000000-0000-4000-8000-000000000006';
  const approve = phase === 'approve';
  const requestId = randomUUID();
  const response = await app.inject({
    method: 'POST',
    url: approve
      ? '/v1/admin/guardianships/' + relationship + '/decision'
      : '/v1/relationships/' + relationship + '/revoke',
    payload: approve
      ? {
          decision: 'approved',
          reason_code: 'synthetic_approved',
          valid_until: new Date(Date.now() + 86_400_000).toISOString(),
          approved_permissions: ['profile.view', 'appointment.manage', 'record.view'],
        }
      : { reason_code: 'synthetic_evidence_rejected' },
    headers: {
      authorization: 'Bearer synthetic-admin:support_admin:' + reviewer,
      'x-shifaa-patient-context': patient,
      'x-request-id': requestId,
      'x-aal': '2',
      'x-purpose': 'guardianship_review',
      'if-match': approve ? '"1"' : '"2"',
      'idempotency-key': randomUUID(),
    },
  });
  const body = response.json();
  assert.equal(response.statusCode, 200, phase + ' (' + body.code + ')');
  assert.equal(body.id, relationship);
  assert.equal(body.managed_patient_id, patient);
  assert.equal(body.status, approve ? 'active' : 'revoked');
  assert.equal(body.version, approve ? 2 : 3);
  return { requestId, status: response.statusCode, state: body.status, version: body.version };
}

export async function professionalReview(app, fixture, reportStep) {
  const owner = 'synthetic-person:' + person(5);
  const approver = 'synthetic-admin:facility_approver:' + person(8);
  const post = async (url, token, payload, expected, headers = {}) => {
    reportStep(url);
    const requestId = randomUUID();
    const response = await app.inject({
      method: 'POST',
      url,
      payload,
      headers: {
        authorization: 'Bearer ' + token,
        'x-request-id': requestId,
        'x-aal': '2',
        'idempotency-key': randomUUID(),
        ...headers,
      },
    });
    const body = response.json();
    assert.equal(response.statusCode, expected, url + ' (' + body.code + ')');
    return { body, requestId, status: response.statusCode };
  };
  if (!fixture) {
    const cases = [];
    for (const decision of ['verify', 'reject']) {
      const created = await post(
        '/v1/people/me/professional-licenses',
        owner,
        {
          profession: 'doctor',
          specialty_code: null,
          license_number: 'SYN-' + randomUUID(),
          issuer: 'Synthetic professional authority',
          expires_on: '2099-01-01',
        },
        201,
      );
      const licence = created.body;
      assert.equal(licence.status, 'pending');
      assert.equal(licence.version, 1);
      const uploaded = await post(
        '/v1/professional-licenses/' + licence.id + '/upload-intent',
        owner,
        { mime_type: 'application/pdf', size_bytes: 100, sha256: '1'.repeat(64) },
        201,
      );
      assert.equal(uploaded.body.scan_status, 'quarantined');
      cases.push({ decision, licenceId: licence.id, objectId: uploaded.body.object_id });
    }
    return { cases };
  }
  const reviewed = await post(
    '/v1/admin/professional-licenses/' + fixture.licenceId + '/decision',
    approver,
    { decision: fixture.decision, reason: 'Independent synthetic professional review' },
    200,
    { 'x-purpose': 'professional_license_review', 'if-match': '"2"' },
  );
  assert.equal(reviewed.body.id, fixture.licenceId);
  assert.equal(reviewed.body.status, fixture.decision === 'verify' ? 'verified' : 'rejected');
  assert.equal(reviewed.body.version, 3);
  return { requestId: reviewed.requestId, status: reviewed.status, state: reviewed.body.status };
}

// Facility onboarding accepts its documented seeded-synthetic adapter only.
// The runner supplies a separate owner-controlled fixture evidence transition.
export async function facilityReview(app, pending) {
  const owner = 'synthetic-person:' + person(5);
  const approver = 'synthetic-admin:facility_approver:' + person(8);
  const calls = [];
  const post = async (url, token, payload, expected, version, purpose) => {
    const requestId = randomUUID();
    const response = await app.inject({
      method: 'POST',
      url,
      payload,
      headers: {
        authorization: 'Bearer ' + token,
        'x-request-id': requestId,
        'x-aal': '2',
        'idempotency-key': randomUUID(),
        ...(version ? { 'if-match': '"' + version + '"' } : {}),
        ...(purpose ? { 'x-purpose': purpose } : {}),
      },
    });
    const body = response.json();
    calls.push({ url, status: response.statusCode, requestId, code: body.code });
    assert.equal(response.statusCode, expected, url + ' (' + body.code + ')');
    return body;
  };
  if (!pending) {
    const facility = await post(
      '/v1/facilities',
      owner,
      {
        facility_type: 'clinic',
        name_ar: 'عيادة اصطناعية',
        name_en: 'Synthetic facility evidence fixture',
        governorate_code: 'CA',
        city: 'Cairo',
        district: 'Synthetic',
        address_line: 'Synthetic fixture address',
      },
      201,
    );
    const evidence = await post(
      '/v1/facilities/' + facility.id + '/licenses/upload-intent',
      owner,
      {
        mime_type: 'application/pdf',
        size_bytes: 100,
        sha256: '1'.repeat(64),
        license_type: 'synthetic',
        license_number: 'SYN-' + randomUUID(),
        issuer: 'Synthetic',
        expires_on: '2099-01-01',
        licensed_activities: ['synthetic'],
      },
      201,
    );
    assert.equal(evidence.scan_status, 'quarantined');
    return { facilityId: facility.id, objectId: evidence.object_id, calls };
  }
  const { facilityId, phase } = pending;
  if (phase !== 'review-after-evidence-loss') {
    await post('/v1/facilities/' + facilityId + '/submit', owner, {}, 200, 2);
    if (phase === 'submit-only') return { calls };
  }
  const evidenceLost = phase === 'review-after-evidence-loss';
  const reviewed = await post(
    '/v1/admin/facilities/' + facilityId + '/decision',
    approver,
    {
      decision: 'approve',
      reason: 'Independent synthetic predecessor review',
    },
    evidenceLost ? 409 : 200,
    3,
    'facility_approval',
  );
  if (evidenceLost) assert.equal(reviewed.code, 'evidence-quarantined');
  else assert.equal(reviewed.facility_status, 'active');
  return { calls };
}
