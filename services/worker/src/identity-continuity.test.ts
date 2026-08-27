import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  FACTOR_CHANGED_TEMPLATE_CODE,
  projectIdentityNotification,
  RECOVERY_COMPLETED_TEMPLATE_CODE,
} from './identity-continuity.ts';

const personId = '00000000-0000-4000-8000-000000000001';
const destinationAlias = `SYNTHETIC-${'a'.repeat(64)}`;
const template = (template_code: string) => ({
  id: '74000000-0000-4000-8000-000000000002',
  template_code,
  channel: 'sms' as const,
  arabic_body: '{{action_time}} {{support_action}}',
  english_body: '{{action_time}} {{support_action}}',
  allowed_recipient_types: ['patient'] as const,
  allowed_field_schema: {
    properties: { action_time: { type: 'string' }, support_action: { type: 'string' } },
    required: ['action_time', 'support_action'],
  },
});

describe('identity factor and recovery notification projection', () => {
  it('projects the factor owner while omitting the recipient and aggregate factor ID from fields', () => {
    const projected = projectIdentityNotification({
      event: {
        event_type: 'identity.factor.changed',
        recipient_person_id: personId,
        locale: 'en-EG',
        destination_alias: destinationAlias,
        payload: {
          action_time: '2026-08-27T10:00:00.000Z',
          recipientPersonId: personId,
          support_action: 'verified',
        },
      },
      template: template(FACTOR_CHANGED_TEMPLATE_CODE),
    });
    assert.deepEqual(projected.fields, {
      action_time: '2026-08-27T10:00:00.000Z',
      support_action: 'verified',
    });
    assert.equal(projected.destinationAlias, destinationAlias);
    assert.doesNotMatch(
      JSON.stringify(projected),
      /otp|token|password|credential|proof|factor|handle|email|phone|diagnos/i,
    );
  });

  it('projects recovery with the same closed notification fields', () => {
    const projected = projectIdentityNotification({
      event: {
        event_type: 'identity.recovery.completed',
        recipient_person_id: personId,
        locale: 'ar-EG',
        destination_alias: destinationAlias,
        payload: { action_time: '2026-08-27T10:00:00.000Z', support_action: 'completed' },
      },
      template: template(RECOVERY_COMPLETED_TEMPLATE_CODE),
    });
    assert.deepEqual(Object.keys(projected.fields).toSorted(), ['action_time', 'support_action']);
  });

  it('rejects mismatched, unverified, secret-bearing, and template-drift inputs', () => {
    const factorEvent = {
      event_type: 'identity.factor.changed' as const,
      recipient_person_id: personId,
      locale: 'en-EG' as const,
      destination_alias: destinationAlias,
      payload: {
        action_time: '2026-08-27T10:00:00.000Z',
        recipientPersonId: personId,
        support_action: 'removed',
      },
    };
    assert.throws(
      () =>
        projectIdentityNotification({
          event: { ...factorEvent, recipient_person_id: '00000000-0000-4000-8000-000000000002' },
          template: template(FACTOR_CHANGED_TEMPLATE_CODE),
        }),
      /recipient-denied/,
    );
    assert.throws(
      () =>
        projectIdentityNotification({
          event: { ...factorEvent, destination_alias: null },
          template: template(FACTOR_CHANGED_TEMPLATE_CODE),
        }),
      /recipient-denied/,
    );
    assert.throws(
      () =>
        projectIdentityNotification({
          event: { ...factorEvent, payload: { ...factorEvent.payload, recoveryOtp: '123456' } },
          template: template(FACTOR_CHANGED_TEMPLATE_CODE),
        }),
      /payload-denied/,
    );
    assert.throws(
      () =>
        projectIdentityNotification({
          event: factorEvent,
          template: {
            ...template(FACTOR_CHANGED_TEMPLATE_CODE),
            english_body: '{{action_time}} {{support_action}} email',
          },
        }),
      /template-governance-invalid/,
    );
  });
});
