import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

import {
  canQueueAuditExport,
  exportStateFromEvidence,
  parseAuditPage,
} from '../src/app/audit/audit-model.ts';

const source = fs.readFileSync(
  new URL('../src/app/audit/AuditWorkspace.tsx', import.meta.url),
  'utf8',
);

test('export is never queued offline and has no polling or toast-only success', () => {
  assert.equal(
    canQueueAuditExport({
      online: false,
      authorized: true,
      purpose: 'security.audit.review',
      partitionStart: '2026-05-01',
      partitionEndExclusive: '2026-08-01',
    }),
    false,
  );
  assert.match(source, /if \(!online\) setExportState\('offline'\)/);
  assert.match(source, /auditAdmin\.export\.nextStep/);
  assert.doesNotMatch(source, /getAuditExport|listAuditExports|pollExport|setInterval|toast/i);
});

test('queued, retrying, dead-letter, proven, digest, and retention evidence derive from audit events', () => {
  const expected = new Map([
    ['audit.export.requested', 'queued'],
    ['audit.export.retryable', 'retrying'],
    ['audit.export.failed', 'failed'],
    ['audit.export.dead_lettered', 'dead_letter'],
    ['audit.export.proven', 'proven'],
  ]);
  for (const [action, state] of expected) {
    const page = parseAuditPage({ data: [safeEvent(action)], meta: { next_cursor: null } });
    assert.ok(page);
    assert.equal(exportStateFromEvidence(page.events[0]!), state);
  }
  assert.match(source, /selected\.chain\.eventHash/);
  assert.match(source, /auditAdmin\.export\.proven/);
});

function safeEvent(action: string) {
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
    action_code: action,
    resource_type: 'audit_export',
    resource_id: '83000000-0000-4000-8000-000000000001',
    resource_version: 1,
    outcome: 'success',
    reason_code: null,
    source_ip_prefix: null,
    user_agent_class: 'worker',
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
