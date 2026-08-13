import assert from 'node:assert/strict';
import test from 'node:test';
import { createFamilyStack, key, person } from './family-stack-harness';

test('real exact delegation acceptance, update, replay, excess denial, and revoke', async () => {
  const stack = await createFamilyStack();
  try {
    const invalid = await stack.app.inject({
      method: 'POST',
      url: `/v1/patients/${stack.ids.selfPatient}/delegations`,
      headers: {
        authorization: person(stack.ids.self),
        'x-shifaa-patient-context': stack.ids.selfPatient,
        'idempotency-key': key(),
      },
      payload: {
        delegate_person_id: stack.ids.delegate,
        purpose_code: 'family_support',
        permissions: ['consent.manage'],
        valid_until: '2100-08-11T09:00:00.000Z',
      },
    });
    assert.equal(invalid.statusCode, 400);
    const created = await stack.app.inject({
      method: 'POST',
      url: `/v1/patients/${stack.ids.selfPatient}/delegations`,
      headers: {
        authorization: person(stack.ids.self),
        'x-shifaa-patient-context': stack.ids.selfPatient,
        'idempotency-key': key(),
      },
      payload: {
        delegate_person_id: stack.ids.delegate,
        purpose_code: 'family_support',
        permissions: ['record.view'],
        valid_until: '2100-08-11T09:00:00.000Z',
      },
    });
    assert.equal(created.statusCode, 201, created.body);
    const invitation = created.json();
    const wrong = await stack.app.inject({
      method: 'POST',
      url: `/v1/delegations/${invitation.relationship.id}/accept`,
      headers: { authorization: person(stack.ids.unrelated), 'idempotency-key': key() },
      payload: { token: invitation.invitation_token, confirmed: true },
    });
    assert.equal(wrong.statusCode, 403);
    const accepted = await stack.app.inject({
      method: 'POST',
      url: `/v1/delegations/${invitation.relationship.id}/accept`,
      headers: { authorization: person(stack.ids.delegate), 'idempotency-key': key() },
      payload: { token: invitation.invitation_token, confirmed: true },
    });
    assert.equal(accepted.statusCode, 200, accepted.body);
    const replay = await stack.app.inject({
      method: 'POST',
      url: `/v1/delegations/${invitation.relationship.id}/accept`,
      headers: { authorization: person(stack.ids.delegate), 'idempotency-key': key() },
      payload: { token: invitation.invitation_token, confirmed: true },
    });
    assert.equal(replay.statusCode, 403);
    const updated = await stack.app.inject({
      method: 'PATCH',
      url: `/v1/delegations/${invitation.relationship.id}`,
      headers: {
        authorization: person(stack.ids.self),
        'x-shifaa-patient-context': stack.ids.selfPatient,
        'if-match': '"2"',
        'idempotency-key': key(),
      },
      payload: { permissions: ['record.view', 'appointment.manage'] },
    });
    assert.equal(updated.statusCode, 200, updated.body);
    const stale = await stack.app.inject({
      method: 'PATCH',
      url: `/v1/delegations/${invitation.relationship.id}`,
      headers: {
        authorization: person(stack.ids.self),
        'x-shifaa-patient-context': stack.ids.selfPatient,
        'if-match': '"2"',
        'idempotency-key': key(),
      },
      payload: { permissions: ['record.view'] },
    });
    assert.equal(stale.statusCode, 409);
    const revoked = await stack.app.inject({
      method: 'POST',
      url: `/v1/relationships/${invitation.relationship.id}/revoke`,
      headers: {
        authorization: person(stack.ids.self),
        'x-shifaa-patient-context': stack.ids.selfPatient,
        'if-match': '"3"',
        'idempotency-key': key(),
      },
      payload: { reason_code: 'synthetic_revoked' },
    });
    assert.equal(revoked.statusCode, 200, revoked.body);
  } finally {
    await stack.close();
  }
});
