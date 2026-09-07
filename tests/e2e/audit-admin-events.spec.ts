import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

import { AuditAdminClient } from '../../packages/api-client/src/audit-admin.ts';
import { directionFor } from '../../packages/i18n/src/index.ts';
import {
  auditAdminAuthorizationFixtures,
  auditAdminSyntheticSentinels,
} from '../../packages/test-kit/src/audit-admin-fixtures.ts';
import {
  auditProblemState,
  parseAuditDetail,
  parseAuditPage,
} from '../../apps/admin/src/app/audit/audit-model.ts';

const workspaceSource = fs.readFileSync(
  new URL('../../apps/admin/src/app/audit/AuditWorkspace.tsx', import.meta.url),
  'utf8',
);

test('AC-03: all 18 authorization fixtures allow only current super-admin AAL2 with purpose', () => {
  assert.equal(auditAdminAuthorizationFixtures.length, 18);
  for (const fixture of auditAdminAuthorizationFixtures) {
    if (fixture.auditRead === 'not_applicable') continue;
    const allowed =
      fixture.role === 'super_admin' &&
      fixture.grant === 'current' &&
      fixture.aal === 2 &&
      fixture.factorAgeSeconds !== null &&
      fixture.factorAgeSeconds <= 300 &&
      fixture.purpose === 'security.audit.review';
    assert.equal(allowed ? 'allow' : 'deny', fixture.auditRead, fixture.scenario);
  }
  assert.equal(
    auditAdminAuthorizationFixtures.filter((fixture) => fixture.auditRead === 'allow').length,
    1,
  );
  assert.equal(auditProblemState(403, 'forbidden', false), 'permission');
  assert.equal(auditProblemState(403, 'mfa-required', false), 'aal-required');
  assert.equal(auditProblemState(428, 'purpose-required', false), 'purpose-required');
});

test('AC-04: bounded filtered pages use opaque cursors and expose only redacted chain evidence', async () => {
  const requests: Array<{ url: string; headers: Headers }> = [];
  const client = new AuditAdminClient({
    baseUrl: 'https://api.invalid',
    accessToken: 'synthetic-admin-token',
    fetch: async (input, init) => {
      requests.push({ url: String(input), headers: new Headers(init?.headers) });
      return Response.json({
        data: [safeEvent()],
        meta: { next_cursor: 'opaque_cursor_value_008' },
      });
    },
  });
  const raw = await client.listAuditEvents(
    { action: 'audit.export.requested', outcome: 'success', limit: 100 },
    'security.audit.review',
  );
  const page = parseAuditPage(raw);
  assert.ok(page);
  assert.equal(page.events.length, 1);
  assert.equal(page.nextCursor, 'opaque_cursor_value_008');
  assert.equal(page.events[0]?.chain.verification, 'verified');
  assert.match(requests[0]!.url, /action=audit.export.requested/);
  assert.match(requests[0]!.url, /limit=100/);
  assert.equal(requests[0]!.headers.get('X-Purpose'), 'security.audit.review');
  assert.equal(requests[0]!.headers.get('Cache-Control'), null);

  const serialized = JSON.stringify(page);
  for (const sentinel of Object.values(auditAdminSyntheticSentinels))
    assert.doesNotMatch(serialized, new RegExp(sentinel));
  assert.equal(parseAuditPage({ data: [safeEvent()], meta: { next_cursor: 'raw cursor' } }), null);
  assert.equal(parseAuditDetail({ event: { ...safeEvent(), raw_metadata: 'forbidden' } }), null);
});

test('AC-08: Arabic/English direction, keyboard focus, reflow and non-color states are explicit', () => {
  for (const token of [
    "useState<Locale>('ar-EG')",
    "locale === 'ar-EG' ? 'en-EG' : 'ar-EG'",
    'directionFor(locale)',
    'bdi dir="ltr"',
    'detailsRef.current?.focus()',
    'returnFocusRef.current?.focus()',
    'role="alert"',
    'aria-live="polite"',
    'minHeight: 44',
    'auto-fit',
  ])
    assert.match(workspaceSource, new RegExp(escapeRegExp(token)));
  assert.equal(directionFor('ar-EG'), 'rtl');
  assert.equal(directionFor('en-EG'), 'ltr');
});

function safeEvent() {
  return {
    event_id: '82000000-0000-4000-8000-000000000001',
    occurred_at: '2026-09-01T12:00:00.000Z',
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
      partition: '2026-09-01',
      sequence: 1,
      previous_hash: '0'.repeat(64),
      event_hash: '1'.repeat(64),
      verification: 'verified',
    },
  };
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
