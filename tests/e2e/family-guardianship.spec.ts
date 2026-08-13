import assert from 'node:assert/strict';
import test from 'node:test';
import { admin, createFamilyStack, key, person } from './family-stack-harness';

test('real guardianship create, independent review, explicit use, revoke, and negatives', async () => {
  const stack = await createFamilyStack();
  try {
    const missing = await stack.app.inject({
      method: 'POST',
      url: `/v1/patients/${stack.ids.dependentPatient}/guardianships`,
      headers: { authorization: person(stack.ids.guardian), 'idempotency-key': key() },
      payload: {
        evidence_object_id: stack.ids.evidence,
        purpose_code: 'dependent_care',
        requested_permissions: ['record.view'],
      },
    });
    assert.equal(missing.statusCode, 400);
    const created = await stack.app.inject({
      method: 'POST',
      url: `/v1/patients/${stack.ids.dependentPatient}/guardianships`,
      headers: {
        authorization: person(stack.ids.guardian),
        'x-shifaa-patient-context': stack.ids.dependentPatient,
        'idempotency-key': key(),
      },
      payload: {
        evidence_object_id: stack.ids.evidence,
        purpose_code: 'dependent_care',
        requested_permissions: ['record.view', 'appointment.manage'],
      },
    });
    assert.equal(created.statusCode, 201, created.body);
    const relation = created.json();
    const aal1 = await stack.app.inject({
      method: 'POST',
      url: `/v1/admin/guardianships/${relation.id}/decision`,
      headers: {
        authorization: admin(stack.ids.reviewer),
        'x-aal': '1',
        'x-purpose': 'guardianship_review',
        'if-match': '"1"',
        'idempotency-key': key(),
      },
      payload: {
        decision: 'approved',
        reason_code: 'synthetic_approved',
        approved_permissions: ['record.view'],
        valid_until: '2100-08-11T09:00:00.000Z',
      },
    });
    assert.equal(aal1.statusCode, 403);
    const reviewed = await stack.app.inject({
      method: 'POST',
      url: `/v1/admin/guardianships/${relation.id}/decision`,
      headers: {
        authorization: admin(stack.ids.reviewer),
        'x-aal': '2',
        'x-purpose': 'guardianship_review',
        'if-match': '"1"',
        'idempotency-key': key(),
      },
      payload: {
        decision: 'approved',
        reason_code: 'synthetic_approved',
        approved_permissions: ['record.view'],
        valid_until: '2100-08-11T09:00:00.000Z',
      },
    });
    assert.equal(reviewed.statusCode, 200, reviewed.body);
    const visible = await stack.app.inject({
      method: 'GET',
      url: `/v1/patients/${stack.ids.dependentPatient}/relationships`,
      headers: { authorization: person(stack.ids.guardian), 'x-purpose': 'dependent_care' },
    });
    assert.equal(visible.statusCode, 200, visible.body);
    const [useEvidence] = await stack.owner<
      any[]
    >`select u.permission_code,u.purpose_code,u.relationship_version,a.action,a.metadata from identity.relationship_authorization_uses u join audit.events a on a.request_id=u.request_id::uuid where u.relationship_id=${relation.id}::uuid order by u.occurred_at desc limit 1`;
    assert.deepEqual(
      {
        permission: useEvidence.permission_code,
        purpose: useEvidence.purpose_code,
        version: useEvidence.relationship_version,
        action: useEvidence.action,
      },
      {
        permission: 'record.view',
        purpose: 'dependent_care',
        version: 2,
        action: 'relationship.guardianship.used',
      },
    );
    assert.doesNotMatch(
      JSON.stringify(useEvidence),
      /token|phone|evidence_object|diagnos|medicat/i,
    );
    const cross = await stack.app.inject({
      method: 'GET',
      url: `/v1/patients/${stack.ids.dependentPatient}/relationships`,
      headers: { authorization: person(stack.ids.unrelated) },
    });
    assert.equal(cross.statusCode, 403);
    const revoked = await stack.app.inject({
      method: 'POST',
      url: `/v1/relationships/${relation.id}/revoke`,
      headers: {
        authorization: admin(stack.ids.reviewer),
        'x-aal': '2',
        'x-purpose': 'guardianship_review',
        'x-shifaa-patient-context': stack.ids.dependentPatient,
        'if-match': '"2"',
        'idempotency-key': key(),
      },
      payload: { reason_code: 'synthetic_revoked' },
    });
    assert.equal(revoked.statusCode, 200, revoked.body);
    const denied = await stack.app.inject({
      method: 'GET',
      url: `/v1/patients/${stack.ids.dependentPatient}/relationships`,
      headers: { authorization: person(stack.ids.guardian) },
    });
    assert.equal(denied.statusCode, 403);
  } finally {
    await stack.close();
  }
});
