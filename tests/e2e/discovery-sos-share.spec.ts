import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import test from 'node:test';

import { createDiscoverySosStack, key, person } from './discovery-sos-stack-harness.ts';

test('real-stack one-use emergency share scope, token secrecy, 410 expiry/replay, and revocation (AC-15..20)', async () => {
  const stack = await createDiscoverySosStack();
  try {
    const patientId = stack.ids.patients.subject;
    const patientPersonId = stack.ids.people.patient;
    const guardianPersonId = stack.ids.people.guardian;
    const shareDelegateId = stack.ids.people.shareDelegate;
    const activateDelegateId = stack.ids.people.activateDelegate;
    const recordOnlyDelegateId = stack.ids.people.recordOnlyDelegate;
    const unrelatedPersonId = stack.ids.people.unrelated;

    // 1. Create an active SOS incident
    const activateRes = await stack.app.inject({
      method: 'POST',
      url: '/v1/sos/incidents',
      headers: {
        authorization: person(patientPersonId),
        'x-shifaa-patient-context': patientId,
        'x-purpose': 'emergency_care',
        'idempotency-key': key('share-sos-init'),
      },
      payload: {
        managed_patient_id: patientId,
        coordinates: stack.ids.locations.activation,
        qualifying_reason_code: 'medical_emergency',
        contact_preference: 'none',
        callback_source: 'patient_verified_contact',
        explicit_activation: true,
      },
    });
    assert.equal(activateRes.statusCode, 201, activateRes.body);
    const incidentId = activateRes.json().incident.incident_id;

    // Helper for share creation
    const createShare = async (
      actorId: string,
      fields = ['blood_group', 'confirmed_allergies', 'active_dispensed_medicines'],
      idempotencyLabel = 'create-share',
    ) =>
      stack.app.inject({
        method: 'POST',
        url: `/v1/sos/incidents/${incidentId}/share-links`,
        headers: {
          authorization: person(actorId),
          'x-shifaa-patient-context': patientId,
          'x-purpose': 'emergency_care',
          'idempotency-key': key(idempotencyLabel),
        },
        payload: { allowed_fields: fields },
      });

    // 2. Authorization checks for share creation:
    // Patient self creates share
    const selfShare = await createShare(patientPersonId, undefined, 'self-share-001');
    assert.equal(selfShare.statusCode, 201, selfShare.body);
    const selfShareData = selfShare.json();
    assert.equal(selfShareData.share.status, 'active');
    assert.equal(selfShareData.share.access_limit, 1);
    assert.equal(selfShareData.share.access_count, 0);
    assert.ok(selfShareData.share_url.includes('#token='));

    // Extract token from URL fragment
    const shareUrl = new URL(selfShareData.share_url);
    const token = new URLSearchParams(shareUrl.hash.slice(1)).get('token');
    assert.ok(token);
    assert.ok(token.length >= 43);

    const wrongContextShare = await stack.app.inject({
      method: 'POST',
      url: `/v1/sos/incidents/${incidentId}/share-links`,
      headers: {
        authorization: person(patientPersonId),
        'x-shifaa-patient-context': stack.ids.patients.unrelated,
        'x-purpose': 'emergency_care',
        'idempotency-key': key('wrong-context-share'),
      },
      payload: { allowed_fields: ['blood_group'] },
    });
    assert.equal(wrongContextShare.statusCode, 403);

    const missingContextShare = await stack.app.inject({
      method: 'POST',
      url: `/v1/sos/incidents/${incidentId}/share-links`,
      headers: {
        authorization: person(patientPersonId),
        'x-purpose': 'emergency_care',
        'idempotency-key': key('missing-context-share'),
      },
      payload: { allowed_fields: ['blood_group'] },
    });
    assert.equal(missingContextShare.statusCode, 400);

    // Guardian creates share
    const guardianShare = await createShare(guardianPersonId, undefined, 'guardian-share-001');
    assert.equal(guardianShare.statusCode, 201, guardianShare.body);

    // The independent share-only permission can create and revoke without
    // receiving the separate incident-read or activation permission.
    const shareDelegateShare = await createShare(
      shareDelegateId,
      ['blood_group'],
      'share-delegate-001',
    );
    assert.equal(shareDelegateShare.statusCode, 201, shareDelegateShare.body);
    const shareDelegateRevoke = await stack.app.inject({
      method: 'POST',
      url: `/v1/sos/share-links/${shareDelegateShare.json().share.share_id}/revoke`,
      headers: {
        authorization: person(shareDelegateId),
        'x-shifaa-patient-context': patientId,
        'x-purpose': 'emergency_care',
        'idempotency-key': key('share-delegate-revoke-001'),
        'if-match': '"1"',
      },
    });
    assert.equal(shareDelegateRevoke.statusCode, 200, shareDelegateRevoke.body);

    // Activate-only delegate is DENIED share creation (lacks sos.share)
    const activateDenied = await createShare(
      activateDelegateId,
      undefined,
      'activate-denied-share',
    );
    assert.equal(activateDenied.statusCode, 403);

    // Record-only delegate is DENIED share creation (lacks sos.share)
    const recordDenied = await createShare(recordOnlyDelegateId, undefined, 'record-denied-share');
    assert.equal(recordDenied.statusCode, 403);

    // Unrelated person is DENIED share creation
    const unrelatedDenied = await createShare(
      unrelatedPersonId,
      undefined,
      'unrelated-denied-share',
    );
    assert.equal(unrelatedDenied.statusCode, 403);

    // 3. Database secrecy check: Plaintext token MUST NOT be stored in DB
    const [dbShare] = await stack.owner<any[]>`
      select token_digest, octet_length(token_digest)::int as digest_length
      from platform.emergency_share_links
      where id = ${selfShareData.share.share_id}::uuid
    `;
    assert.ok(dbShare);
    assert.equal(dbShare.digest_length, 32);

    // 4. First valid view via public bearer token
    const firstView = await stack.app.inject({
      method: 'GET',
      url: `/v1/sos/share/${token}`,
    });
    assert.equal(firstView.statusCode, 200, firstView.body);
    assert.equal(firstView.headers['cache-control'], 'private, no-store');
    assert.equal(firstView.headers['pragma'], 'no-cache');
    assert.equal(firstView.headers['referrer-policy'], 'no-referrer');

    const viewData = firstView.json();
    assert.deepEqual(viewData.available_fields, { blood_group: 'O+' });
    assert.deepEqual(viewData.unavailable_fields.sort(), [
      'active_dispensed_medicines',
      'confirmed_allergies',
    ]);
    assert.ok(viewData.expires_at);

    // 5. Replay of same token returns 410 Gone (One-time use invariant)
    const replayView = await stack.app.inject({
      method: 'GET',
      url: `/v1/sos/share/${token}`,
    });
    assert.equal(replayView.statusCode, 410);

    // 6. Unknown token returns 410 Gone (no oracle)
    const randomToken = randomBytes(32).toString('base64url');
    const unknownView = await stack.app.inject({
      method: 'GET',
      url: `/v1/sos/share/${randomToken}`,
    });
    assert.equal(unknownView.statusCode, 410);

    // 7. Revocation of active share
    const shareToRevoke = await createShare(patientPersonId, ['blood_group'], 'revoke-target-001');
    assert.equal(shareToRevoke.statusCode, 201);
    const revokeToken = new URLSearchParams(
      new URL(shareToRevoke.json().share_url).hash.slice(1),
    ).get('token')!;
    const shareIdToRevoke = shareToRevoke.json().share.share_id;

    // Clear prior create outbox event to allow recording the revoke outbox event
    await stack.owner`delete from platform.outbox_events where aggregate_id = ${shareIdToRevoke}::uuid`;

    const wrongContextRevoke = await stack.app.inject({
      method: 'POST',
      url: `/v1/sos/share-links/${shareIdToRevoke}/revoke`,
      headers: {
        authorization: person(patientPersonId),
        'x-shifaa-patient-context': stack.ids.patients.unrelated,
        'x-purpose': 'emergency_care',
        'idempotency-key': key('wrong-context-revoke'),
        'if-match': '"1"',
      },
    });
    assert.equal(wrongContextRevoke.statusCode, 409);

    const revokeRes = await stack.app.inject({
      method: 'POST',
      url: `/v1/sos/share-links/${shareIdToRevoke}/revoke`,
      headers: {
        authorization: person(patientPersonId),
        'x-shifaa-patient-context': patientId,
        'x-purpose': 'emergency_care',
        'idempotency-key': key('revoke-action-001'),
        'if-match': '"1"',
      },
    });
    assert.equal(revokeRes.statusCode, 200, revokeRes.body);
    assert.equal(revokeRes.json().status, 'revoked');

    // Viewing revoked token returns 410 Gone
    const revokedView = await stack.app.inject({
      method: 'GET',
      url: `/v1/sos/share/${revokeToken}`,
    });
    assert.equal(revokedView.statusCode, 410);

    // 8. Scope limitation: When blood_group is not requested, available_fields is empty
    const noBloodShare = await createShare(
      patientPersonId,
      ['confirmed_allergies'],
      'no-blood-scope',
    );
    assert.equal(noBloodShare.statusCode, 201);
    const noBloodToken = new URLSearchParams(
      new URL(noBloodShare.json().share_url).hash.slice(1),
    ).get('token')!;

    const noBloodView = await stack.app.inject({
      method: 'GET',
      url: `/v1/sos/share/${noBloodToken}`,
    });
    assert.equal(noBloodView.statusCode, 200);
    assert.deepEqual(noBloodView.json().available_fields, {});
    assert.deepEqual(noBloodView.json().unavailable_fields, ['confirmed_allergies']);

    // 9. Audits & outbox contain zero plaintext tokens
    const [leaks] = await stack.owner<any[]>`
      select
        (select count(*)::int from audit.events where metadata::text ~* ${token}) audit_leaks,
        (select count(*)::int from platform.outbox_events where payload::text ~* ${token}) outbox_leaks,
        (select count(*)::int from platform.idempotency_records where response_body::text ~* ${token}) idempotency_raw_leaks
    `;
    assert.deepEqual(leaks, { audit_leaks: 0, outbox_leaks: 0, idempotency_raw_leaks: 0 });
  } finally {
    await stack.close();
  }
});
