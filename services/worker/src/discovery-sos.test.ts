import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { LocalSyntheticMessagingAdapter } from './adapters/local-synthetic-messaging.ts';
import {
  aggregateSosContactOutcomes,
  assertSafeSosEventPayload,
  projectSosContactDelivery,
  sosProviderIdempotencyKey,
  type SosContactCandidate,
  type SosContactTemplateRelease,
} from './discovery-sos.ts';

function release(): SosContactTemplateRelease {
  return {
    id: '64000000-0000-4000-8000-000000000001',
    template_code: 'SOS_LIFE_SAFETY',
    release_version: 1,
    channel: 'sms',
    arabic_body:
      '{{patient_display_name}} يحتاج إلى مساعدة عاجلة. {{incident_time}} {{callback_number}} {{location}} {{location_precision}}',
    english_body:
      '{{patient_display_name}} needs urgent help. {{incident_time}} {{callback_number}} {{location}} {{location_precision}}',
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
}

function candidate(
  precision: SosContactCandidate['location_precision'],
  location: string | null,
): SosContactCandidate {
  return {
    contact_id: '44000000-0000-4000-8000-000000000001',
    patient_id: '41000000-0000-4000-8000-000000000001',
    patient_display_name: 'Synthetic SOS Patient',
    preferred_locale: 'en-EG',
    location_precision: precision,
    location_value: location,
    incident_time: new Date('2026-08-20T09:00:00.000Z'),
    callback_number: '+999600000001',
  };
}

describe('SOS Emergency Contact delivery projection', () => {
  it('renders none, coarse, and exact precision without optional placeholder leakage', () => {
    const cases = [
      ['none', null, '', ''] as const,
      ['coarse', '30.04,31.24', '30.04,31.24', 'coarse'] as const,
      ['exact', '30.044400,31.235700', '30.044400,31.235700', 'exact'] as const,
    ];
    for (const [precision, location, expectedLocation, expectedPrecision] of cases) {
      const projection = projectSosContactDelivery(candidate(precision, location), release());
      assert.equal(projection.fields.location, expectedLocation);
      assert.equal(projection.fields.location_precision, expectedPrecision);
      assert.doesNotMatch(projection.renderedBody, /undefined|null|\{\{/);
      assert.match(projection.destinationAlias, /^SYNTHETIC-CONTACT-/);
      assert.match(projection.renderedDigest, /^[0-9a-f]{64}$/);
    }
  });

  it('rejects prohibited source fields at any nesting depth', () => {
    for (const field of ['diagnosis', 'medications', 'lab_result', 'admission', 'record_link']) {
      assert.throws(
        () => assertSafeSosEventPayload({ correlation: { nested: { [field]: 'SENTINEL' } } }),
        /source-field-denied/,
      );
    }
    assert.doesNotThrow(() =>
      assertSafeSosEventPayload({ incident_id: 'synthetic', correlation: { request_id: 'safe' } }),
    );
  });

  it('fails closed on template, recipient, and location over-disclosure drift', () => {
    assert.throws(
      () =>
        projectSosContactDelivery(candidate('none', null), {
          ...release(),
          allowed_recipient_types: ['patient'],
        }),
      /template-governance-invalid/,
    );
    const unsafeRelease = release();
    unsafeRelease.allowed_field_schema.properties['diagnosis'] = { type: 'string' };
    assert.throws(
      () => projectSosContactDelivery(candidate('none', null), unsafeRelease),
      /template-schema-invalid/,
    );
    assert.throws(
      () =>
        projectSosContactDelivery(candidate('none', null), {
          ...release(),
          english_body: `${release().english_body} diagnosis`,
        }),
      /template-content-denied/,
    );
    assert.throws(
      () => projectSosContactDelivery(candidate('none', '30.04,31.24'), release()),
      /location-overdisclosure/,
    );
  });

  it('uses one provider key across timeout and crash retries', async () => {
    const identity = {
      releaseId: release().id,
      sourceEventId: '65000000-0000-4000-8000-000000000001',
      contactId: candidate('none', null).contact_id,
    };
    const providerKey = sosProviderIdempotencyKey(identity);
    assert.equal(providerKey, sosProviderIdempotencyKey(identity));

    const adapter = new LocalSyntheticMessagingAdapter();
    const projection = projectSosContactDelivery(candidate('none', null), release());
    await adapter.send({
      idempotencyKey: providerKey,
      destinationAlias: projection.destinationAlias,
      renderedBody: projection.renderedBody,
    });
    await adapter.send({
      idempotencyKey: providerKey,
      destinationAlias: projection.destinationAlias,
      renderedBody: projection.renderedBody,
    });
    assert.equal(adapter.visibleMessages.size, 1);
  });

  it('keeps retryable contacts pending before terminal event completion', () => {
    assert.equal(aggregateSosContactOutcomes([]), 'delivered');
    assert.equal(aggregateSosContactOutcomes(['delivered', 'dead_letter']), 'dead_letter');
    assert.equal(aggregateSosContactOutcomes(['delivered', 'dead_letter', 'retry']), 'retry');
  });
});
