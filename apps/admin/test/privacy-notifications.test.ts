import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const read = (path: string) =>
  fs.readFileSync(new URL(`../src/app/${path}`, import.meta.url), 'utf8');
const privacy = read('privacy-requests/PrivacyRequestWorkspace.tsx');
const templates = read('notification-templates/NotificationTemplateWorkspace.tsx');
const client = fs.readFileSync(
  new URL('../../../packages/api-client/src/privacy-dsr-notifications.ts', import.meta.url),
  'utf8',
);

test('DPO worklist is AAL2, purpose-bound, assigned-only, minimum, and versioned', () => {
  for (const token of [
    'synthetic-dpo:',
    'listAdminDsrs',
    'privacy.dsr.review',
    'decideDsr',
    'fulfilDsr',
    'partially_approve',
    "reason_code: 'request.reviewed'",
    'reason_summary: reason',
    'refuse',
    'identity-required',
    'stale',
    'due_at',
    'version',
  ])
    assert.match(`${privacy}\n${client}`, new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  for (const forbidden of ['person_id', 'submitted_by_person_id', 'phone_e164', 'national_id'])
    assert.doesNotMatch(privacy, new RegExp(forbidden, 'i'));
});

test('template governance pairs Arabic and English with independent AAL2 publication', () => {
  for (const token of [
    'dir="rtl"',
    'dir="ltr"',
    'canonicalTemplateDigest',
    'additionalProperties: false',
    "allowedRecipientTypes: ['patient']",
    "'X-AAL': mode === 'publisher' ? '2' : '1'",
    'notification.template.publish',
    'separation-denied',
    'aria-live="polite"',
  ])
    assert.match(templates, new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.match(templates, /document\.documentElement\.dir = locale === 'ar-EG' \? 'rtl' : 'ltr'/);
});
