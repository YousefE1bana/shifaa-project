import assert from 'node:assert/strict';
import test from 'node:test';
import { projectEmergencyContactDelivery } from '@shifaa/worker/family-care';
import { createFamilyStack, key, person } from './family-stack-harness';

test('real separate contact consent, terminal response, fresh invite, and SOS allow-list', async () => {
  const stack = await createFamilyStack();
  try {
    const create = async (phone: string) =>
      stack.app.inject({
        method: 'POST',
        url: `/v1/patients/${stack.ids.selfPatient}/emergency-contacts`,
        headers: {
          authorization: person(stack.ids.self),
          'x-shifaa-patient-context': stack.ids.selfPatient,
          'idempotency-key': key(),
        },
        payload: {
          display_name: 'Synthetic contact',
          phone_e164: phone,
          preferred_locale: 'en-EG',
          location_precision: 'coarse',
        },
      });
    const created = await create(`+999${String(Date.now()).slice(-9)}`);
    assert.equal(created.statusCode, 201, created.body);
    const invitation = created.json();
    assert.notEqual(invitation.contact.masked_phone, '+999000000000');
    const confirmed = await stack.app.inject({
      method: 'POST',
      url: '/v1/emergency-contact-invites/response',
      headers: { 'idempotency-key': key() },
      payload: { token: invitation.invitation_token, decision: 'confirmed' },
    });
    assert.equal(confirmed.statusCode, 200, confirmed.body);
    const terminal = await stack.app.inject({
      method: 'POST',
      url: '/v1/emergency-contact-invites/response',
      headers: { 'idempotency-key': key() },
      payload: { token: invitation.invitation_token, decision: 'declined' },
    });
    assert.equal(terminal.statusCode, 403);
    const fresh = await create(`+998${String(Date.now() + 1).slice(-9)}`);
    assert.equal(fresh.statusCode, 201, fresh.body);
    assert.notEqual(fresh.json().contact.id, invitation.contact.id);
    const base = {
      sourceEventType: 'sos.emergency_contact.requested',
      incidentActive: true,
      incidentQualifying: true,
      contactStatus: 'confirmed' as const,
      patientDisplayName: 'Synthetic patient',
      incidentTime: '2026-08-11T09:00:00.000Z',
      callbackNumber: '+999000000000',
      locationPrecision: 'coarse' as const,
      location: { coarse: 'Synthetic Cairo zone' },
    };
    assert.equal(
      projectEmergencyContactDelivery({ ...base, sourceEventType: 'lab.result.ready' }).allowed,
      false,
    );
    assert.equal(
      projectEmergencyContactDelivery({ ...base, extraFields: { diagnosis: 'SENTINEL' } }).allowed,
      false,
    );
    const alert = projectEmergencyContactDelivery(base);
    assert.equal(alert.allowed, true);
    if (alert.allowed)
      assert.deepEqual(Object.keys(alert.payload).sort(), [
        'callback_number',
        'incident_time',
        'location',
        'location_precision',
        'message_code',
        'patient_display_name',
      ]);
  } finally {
    await stack.close();
  }
});
