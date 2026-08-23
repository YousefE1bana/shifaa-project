import assert from 'node:assert/strict';
import test from 'node:test';

import { LocalSyntheticMessagingAdapter } from '../../services/worker/src/adapters/local-synthetic-messaging.ts';
import {
  assertSafeSosEventPayload,
  PostgresDiscoverySosProcessor,
  projectSosContactDelivery,
  type SosContactCandidate,
  type SosContactTemplateRelease,
} from '../../services/worker/src/discovery-sos.ts';
import {
  createDiscoverySosStack,
  key,
  person,
  workerDatabaseUrl,
} from './discovery-sos-stack-harness.ts';

test('real-stack confirmed emergency contact delivery, location precision consent, dedup, and prohibited fields (AC-21..24)', async () => {
  const stack = await createDiscoverySosStack();
  const adapter = new LocalSyntheticMessagingAdapter();
  const processor = new PostgresDiscoverySosProcessor(workerDatabaseUrl, adapter);

  try {
    const patientId = stack.ids.patients.subject;
    const patientPersonId = stack.ids.people.patient;

    // 1. Create an SOS incident with contact_preference: 'all_confirmed'
    const activateRes = await stack.app.inject({
      method: 'POST',
      url: '/v1/sos/incidents',
      headers: {
        authorization: person(patientPersonId),
        'x-shifaa-patient-context': patientId,
        'x-purpose': 'emergency_care',
        'idempotency-key': key('contact-sos-init'),
      },
      payload: {
        managed_patient_id: patientId,
        coordinates: stack.ids.locations.activation, // lat: 30.1005, lon: 31.2005
        qualifying_reason_code: 'medical_emergency',
        contact_preference: 'all_confirmed',
        callback_source: 'patient_verified_contact',
        explicit_activation: true,
      },
    });
    assert.equal(activateRes.statusCode, 201, activateRes.body);
    const incidentId = activateRes.json().incident.incident_id;

    // Verify an outbox event was emitted for emergency contact requested
    const [outbox] = await stack.owner<any[]>`
      select id, event_type, payload
      from platform.outbox_events
      where aggregate_id = ${incidentId}::uuid
        and event_type = 'sos.emergency_contact.requested'
    `;
    assert.ok(outbox);
    assert.equal(outbox.event_type, 'sos.emergency_contact.requested');

    // 2. Worker processor claims and processes the SOS contact event
    const outcome = await processor.processNext();
    assert.equal(outcome, 'delivered');

    // Confirm that the local synthetic messaging adapter received exactly 1 message
    assert.equal(adapter.visibleMessages.size, 1);
    const [sentMessage] = Array.from(adapter.visibleMessages.values());
    assert.ok(sentMessage);
    assert.equal(sentMessage.destinationAlias, `SYNTHETIC-CONTACT-${stack.ids.contact.confirmed}`);
    assert.match(sentMessage.digest, /^[0-9a-f]{64}$/);

    // Verify notification state without persisting the transient delivery projection.
    const [notification] = await stack.owner<any[]>`
      select status, attempt_count, recipient_type, channel, field_values, rendered_digest
      from platform.notifications
      where recipient_emergency_contact_id = ${stack.ids.contact.confirmed}::uuid
    `;
    assert.ok(notification);
    assert.equal(notification.status, 'delivered');
    assert.equal(notification.attempt_count, 1);
    assert.equal(notification.recipient_type, 'emergency_contact');
    assert.equal(notification.channel, 'sms');
    assert.equal(notification.rendered_digest, sentMessage.digest);
    assert.deepEqual(notification.field_values, {
      contact_id: stack.ids.contact.confirmed,
      incident_id: incidentId,
      locale: 'ar-EG',
      location_precision: 'coarse',
    });
    assert.doesNotMatch(
      JSON.stringify(notification.field_values),
      /Synthetic SOS Patient|\+999|30\.10|31\.20|needs urgent|مساعدة عاجلة/,
    );

    // 3. Worker idempotency / dedup: Subsequent processNext finds no more pending events
    const nextOutcome = await processor.processNext();
    assert.equal(nextOutcome, 'idle');
    assert.equal(adapter.visibleMessages.size, 1);

    // 4. Test precision handling across none, coarse, and exact
    const template: SosContactTemplateRelease = {
      id: '64000000-0000-4000-8000-000000000001',
      template_code: 'SOS_LIFE_SAFETY',
      release_version: 1,
      channel: 'sms',
      arabic_body:
        '{{patient_display_name}} يحتاج إلى مساعدة عاجلة. الوقت {{incident_time}}. رقم التواصل {{callback_number}}. {{location}} {{location_precision}}',
      english_body:
        '{{patient_display_name}} needs urgent help. Time {{incident_time}}. Callback {{callback_number}}. {{location}} {{location_precision}}',
      allowed_recipient_types: ['emergency_contact'],
      allowed_field_schema: {
        properties: {
          patient_display_name: { type: 'string' },
          incident_time: { type: 'string' },
          callback_number: { type: 'string' },
          location: { type: 'string' },
          location_precision: { type: 'string' },
        },
        required: ['patient_display_name', 'incident_time', 'callback_number'],
      },
      status: 'published',
      effective_at: new Date('2026-08-20T08:00:00.000Z'),
    };

    const makeCandidate = (
      precision: 'none' | 'coarse' | 'exact',
      locValue: string | null,
    ): SosContactCandidate => ({
      contact_id: '66000000-0000-4000-8000-000000000099',
      patient_id: patientId,
      patient_display_name: 'Synthetic SOS Patient',
      preferred_locale: 'en-EG',
      location_precision: precision,
      location_value: locValue,
      incident_time: new Date('2026-08-20T09:00:00.000Z'),
      callback_number: '+999600000001',
    });

    // None precision: no location or precision in rendered output
    const noneProj = projectSosContactDelivery(makeCandidate('none', null), template);
    assert.equal(noneProj.fields.location, '');
    assert.equal(noneProj.fields.location_precision, '');
    assert.doesNotMatch(noneProj.renderedBody, /undefined|null|\{\{/);

    // Coarse precision: coarse location string present
    const coarseProj = projectSosContactDelivery(makeCandidate('coarse', '30.10,31.20'), template);
    assert.equal(coarseProj.fields.location, '30.10,31.20');
    assert.equal(coarseProj.fields.location_precision, 'coarse');
    assert.match(coarseProj.renderedBody, /30\.10,31\.20/);
    assert.match(coarseProj.renderedBody, /coarse/);

    // Exact precision: exact coordinates present
    const exactProj = projectSosContactDelivery(
      makeCandidate('exact', '30.100500,31.200500'),
      template,
    );
    assert.equal(exactProj.fields.location, '30.100500,31.200500');
    assert.equal(exactProj.fields.location_precision, 'exact');
    assert.match(exactProj.renderedBody, /30\.100500,31\.200500/);
    assert.match(exactProj.renderedBody, /exact/);

    // 5. Prohibited fields rejection at any depth
    for (const badField of ['diagnosis', 'medications', 'lab_result', 'admission', 'record_link']) {
      assert.throws(
        () => assertSafeSosEventPayload({ payload: { nested: { [badField]: 'SECRET' } } }),
        /source-field-denied/,
      );
    }

    // 6. SOS activation with contact_preference: 'none' emits NO emergency contact outbox events
    await stack.clean();
    const noContactRes = await stack.app.inject({
      method: 'POST',
      url: '/v1/sos/incidents',
      headers: {
        authorization: person(patientPersonId),
        'x-shifaa-patient-context': patientId,
        'x-purpose': 'emergency_care',
        'idempotency-key': key('no-contact-sos'),
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
    assert.equal(noContactRes.statusCode, 201);
    const [noContactOutbox] = await stack.owner<any[]>`
      select count(*)::int from platform.outbox_events
      where aggregate_id = ${noContactRes.json().incident.incident_id}::uuid
        and event_type = 'sos.emergency_contact.requested'
    `;
    assert.equal(noContactOutbox.count, 0);
  } finally {
    await processor.close();
    await stack.close();
  }
});
