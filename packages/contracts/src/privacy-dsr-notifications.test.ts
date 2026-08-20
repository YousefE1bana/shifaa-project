import { FormatRegistry } from '@sinclair/typebox';
import { Value } from '@sinclair/typebox/value';
import { describe, expect, it } from 'vitest';
import {
  CreateDsrSchema,
  CreateNotificationTemplateReleaseSchema,
  DsrDecisionSchema,
  PRIVACY_DSR_NOTIFICATIONS_FEATURE_ID,
  SmsProviderCallbackSchema,
  privacyDsrNotificationOperationIds,
  privacyDsrNotificationOperations,
  privacyDsrNotificationRequirementIds,
} from './privacy-dsr-notifications.js';

FormatRegistry.Set('uuid', (value) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value),
);
FormatRegistry.Set('date-time', (value) => Number.isFinite(Date.parse(value)));

describe('privacy DSR and notifications contracts', () => {
  it('exports exactly the six requirements and twelve canonical operations', () => {
    expect(PRIVACY_DSR_NOTIFICATIONS_FEATURE_ID).toBe('005-privacy-dsr-notifications');
    expect(privacyDsrNotificationRequirementIds).toHaveLength(6);
    expect(privacyDsrNotificationOperationIds).toHaveLength(12);
    expect(new Set(privacyDsrNotificationOperationIds).size).toBe(12);
    expect(Object.keys(privacyDsrNotificationOperations)).toEqual([
      ...privacyDsrNotificationOperationIds,
    ]);
    expect(privacyDsrNotificationOperations.downloadDsrExport).toEqual([
      'POST',
      '/privacy/requests/{requestId}/download-link',
    ]);
  });

  it('keeps create DSR closed and guardian context explicit', () => {
    const valid = {
      managed_patient_id: '51000000-0000-4000-8000-000000000001',
      request_type: 'correction',
      scope: { data_category_codes: ['profile.demographics'], correction_codes: ['name.fix'] },
      contact_preference: 'in_app',
    };
    expect(Value.Check(CreateDsrSchema, valid)).toBe(true);
    expect(Value.Check(CreateDsrSchema, { ...valid, request_type: 'delete_everything' })).toBe(
      false,
    );
    expect(Value.Check(CreateDsrSchema, { ...valid, retention_days: 30 })).toBe(false);
  });

  it('requires decision evidence and rejects uncontracted fields', () => {
    const valid = {
      decision: 'approve',
      reason_code: 'request.valid',
      evidence_object_id: '53000000-0000-4000-8000-000000000001',
    };
    expect(Value.Check(DsrDecisionSchema, valid)).toBe(true);
    expect(Value.Check(DsrDecisionSchema, { ...valid, evidence_object_id: undefined })).toBe(false);
    expect(Value.Check(DsrDecisionSchema, { ...valid, erase_now: true })).toBe(false);
  });

  it('requires paired template bodies, exact recipients, and a reviewed digest', () => {
    const valid = {
      channel: 'sms',
      arabic_body: '{{request_reference}}',
      english_body: '{{request_reference}}',
      allowed_recipient_types: ['patient'],
      allowed_field_schema: {
        type: 'object',
        additionalProperties: false,
        properties: { request_reference: { type: 'string' } },
        required: ['request_reference'],
      },
      content_digest: 'a'.repeat(64),
    };
    expect(Value.Check(CreateNotificationTemplateReleaseSchema, valid)).toBe(true);
    expect(
      Value.Check(CreateNotificationTemplateReleaseSchema, {
        ...valid,
        allowed_recipient_types: ['facility_staff'],
      }),
    ).toBe(false);
  });

  it('keeps provider callbacks minimum and replay-resistant in shape', () => {
    const valid = {
      event_reference: 'synthetic-event',
      receipt_reference: 'synthetic-receipt',
      delivery_status: 'delivered',
      occurred_at: '2026-08-13T09:00:00.000Z',
      nonce: 'synthetic-nonce-0001',
    };
    expect(Value.Check(SmsProviderCallbackSchema, valid)).toBe(true);
    expect(Value.Check(SmsProviderCallbackSchema, { ...valid, raw_contact: '+999' })).toBe(false);
  });
});
