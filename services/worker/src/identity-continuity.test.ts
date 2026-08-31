import assert from 'node:assert/strict';
import fs from 'node:fs';
import { describe, it } from 'node:test';

import {
  aggregateIdentityNotificationOutcomes,
  FACTOR_CHANGED_TEMPLATE_CODE,
  PostgresIdentityNotificationProcessor,
  projectIdentityNotification,
  RECOVERY_COMPLETED_TEMPLATE_CODE,
  TRANSITION_DECIDED_TEMPLATE_CODE,
  TRANSITION_SUBMITTED_TEMPLATE_CODE,
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

describe('identity notification runtime wiring', () => {
  it('has a long-running local-only runner with graceful processor and adapter shutdown', () => {
    const runner = fs.readFileSync(
      new URL('./identity-continuity-runner.ts', import.meta.url),
      'utf8',
    );
    const workerPackage = fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8');
    assert.match(runner, /PostgresIdentityNotificationProcessor/);
    assert.match(runner, /SHIFAA_SYNTHETIC_RUNTIME_ATTESTATION/);
    assert.match(runner, /SIGINT/);
    assert.match(runner, /SIGTERM/);
    assert.match(runner, /processor\.processNext\(\)/);
    assert.match(runner, /processor\.close\(\)/);
    assert.match(runner, /adapter\.close\(\)/);
    assert.match(workerPackage, /dev:identity-continuity/);
  });
});

describe('transition notification fan-out completion', () => {
  it('waits for both recipients and preserves retry or DLQ outcomes', () => {
    assert.equal(aggregateIdentityNotificationOutcomes(['delivered', 'delivered']), 'delivered');
    assert.equal(aggregateIdentityNotificationOutcomes(['delivered', 'retry']), 'retry');
    assert.equal(
      aggregateIdentityNotificationOutcomes(['delivered', 'dead_letter']),
      'dead_letter',
    );
    assert.equal(aggregateIdentityNotificationOutcomes(['dead_letter', 'retry']), 'retry');
  });
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

describe('identity transition notification projection', () => {
  const transitionTemplate = (template_code: string) => ({
    ...template(template_code),
    arabic_body: '{{action_time}} {{case_status}}',
    english_body: '{{action_time}} {{case_status}}',
    allowed_field_schema: {
      properties: { action_time: { type: 'string' }, case_status: { type: 'string' } },
      required: ['action_time', 'case_status'],
    },
  });

  for (const [event_type, templateCode] of [
    ['identity.transition.submitted', TRANSITION_SUBMITTED_TEMPLATE_CODE],
    ['identity.transition.decided', TRANSITION_DECIDED_TEMPLATE_CODE],
  ] as const) {
    it(`projects ${event_type} with the closed patient field set`, () => {
      const projected = projectIdentityNotification({
        event: {
          event_type,
          recipient_person_id: personId,
          locale: 'ar-EG',
          destination_alias: destinationAlias,
          payload: {
            action_time: '2026-08-27T10:00:00.000Z',
            case_status: event_type.endsWith('submitted') ? 'review_required' : 'approved',
          },
        },
        template: transitionTemplate(templateCode),
      });
      assert.deepEqual(Object.keys(projected.fields).toSorted(), ['action_time', 'case_status']);
      assert.doesNotMatch(JSON.stringify(projected), /token|proof|identity|patient|relationship/i);
    });
  }

  it('rejects transition template and payload field drift', () => {
    assert.throws(
      () =>
        projectIdentityNotification({
          event: {
            event_type: 'identity.transition.decided',
            recipient_person_id: personId,
            locale: 'en-EG',
            destination_alias: destinationAlias,
            payload: {
              action_time: '2026-08-27T10:00:00.000Z',
              case_status: 'approved',
              verificationCaseId: personId,
            },
          },
          template: transitionTemplate(TRANSITION_DECIDED_TEMPLATE_CODE),
        }),
      /payload-denied/,
    );
  });

  it('keeps non-synthetic providers disabled at the worker boundary', () => {
    assert.throws(
      () =>
        new PostgresIdentityNotificationProcessor('postgresql://unused', {
          code: 'production-sms',
        } as never),
      /production-messaging-disabled/,
    );
  });
});
