import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

import {
  auditProblemState,
  parseAuditDetail,
  parseAuditPage,
} from '../src/app/audit/audit-model.ts';

const source = fs.readFileSync(
  new URL('../src/app/audit/AuditWorkspace.tsx', import.meta.url),
  'utf8',
);
const event = safeEvent();

test('audit workspace denies non-super, DPO-only, AAL1, stale AAL2, and no-purpose states', () => {
  assert.equal(auditProblemState(403, 'forbidden', false), 'permission');
  assert.equal(auditProblemState(403, 'mfa-required', false), 'aal-required');
  assert.equal(auditProblemState(428, 'purpose-required', false), 'purpose-required');
  for (const token of [
    "role === 'super_admin'",
    "role !== 'super_admin' ? 'permission' : 'aal-required'",
    'factorAgeSeconds <= 300',
    "purpose !== 'security.audit.review'",
    "'permission'",
    "setState('purpose-required')",
  ])
    assert.match(source, new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
});

test('audit parser keeps only fixed redacted evidence and opaque bounded cursors', () => {
  const page = parseAuditPage({ data: [event], meta: { next_cursor: 'opaque_cursor_value_008' } });
  assert.ok(page);
  assert.equal(page.events[0]?.actionCode, 'audit.export.requested');
  assert.equal('actorPersonId' in page.events[0]!, false);
  assert.equal('patientId' in page.events[0]!, false);
  assert.equal(parseAuditDetail({ event })?.chain.verification, 'verified');
  assert.equal(
    parseAuditPage({
      data: [{ ...event, raw_metadata: 'forbidden' }],
      meta: { next_cursor: null },
    }),
    null,
  );
  assert.equal(parseAuditPage({ data: [event], meta: { next_cursor: 'short' } }), null);
});

test('audit workspace has bilingual keyboard, focus-return, reflow, and non-color integrity states', () => {
  for (const token of [
    'directionFor(locale)',
    'bdi dir="ltr"',
    'role="list"',
    'role="listitem"',
    'aria-live="polite"',
    'aria-atomic="true"',
    'detailsRef.current?.focus()',
    'returnFocusRef.current?.focus()',
    "authorized ? 'purpose-required' : needsStepUp ? 'aal-required' : 'permission'",
    'useEffect(() => {\n    if (selected) detailsRef.current?.focus();\n  }, [selected])',
    "process.env.NODE_ENV === 'development'",
    "NEXT_PUBLIC_FEATURE_008_EVIDENCE_MODE'] === 'synthetic'",
    'minHeight: 44',
    'auto-fit',
    '@shifaa/design-system/tokens',
    "role={selected.chain.verification === 'failed' ? 'alert' : 'status'}",
  ])
    assert.match(source, new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  for (const forbidden of [
    'raw_metadata',
    'clinicalPayload',
    'signed_url',
    'service_role',
    'BYPASSRLS',
  ])
    assert.doesNotMatch(source, new RegExp(forbidden, 'i'));
});

function safeEvent() {
  return {
    event_id: '82000000-0000-4000-8000-000000000001',
    occurred_at: '2026-08-31T12:00:00.000Z',
    request_id: '84000000-0000-4000-8000-000000000001',
    trace_id: '84000000000040008000000000000001',
    actor_person_id: null,
    authentication_aal: 2,
    facility_id: null,
    patient_id: null,
    purpose_code: 'security.audit.review',
    action_code: 'audit.export.requested',
    resource_type: 'audit_export',
    resource_id: '83000000-0000-4000-8000-000000000001',
    resource_version: 1,
    outcome: 'success',
    reason_code: null,
    source_ip_prefix: null,
    user_agent_class: 'service',
    chain: {
      version: 1,
      partition: '2026-08-01',
      sequence: 1,
      previous_hash: '0'.repeat(64),
      event_hash: '1'.repeat(64),
      verification: 'verified',
    },
  };
}
