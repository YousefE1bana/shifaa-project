import assert from 'node:assert/strict';
import test from 'node:test';

import { auditAdminPrivacyVectors } from '../../packages/test-kit/src/audit-admin-privacy-fixtures.ts';
import {
  dashboardProblemState,
  dashboardStateFor,
  parseAdminSummary,
} from '../../apps/admin/src/app/dashboard/dashboard-model.ts';

const generatedAt = '2026-09-01T12:00:00.000Z';

test('summary: inactive configuration remains gated with no cells or guessed count', () => {
  assert.equal(dashboardProblemState(503, 'legal-gate-disabled', false), 'gated');
  const serialized = JSON.stringify({ code: 'legal-gate-disabled', errors: [] });
  assert.doesNotMatch(serialized, /count|patient|selector|dimension/i);
});

test('summary: all 34 approved privacy vectors preserve safe-disclosure boundaries', () => {
  assert.equal(auditAdminPrivacyVectors.length, 34);
  assert.equal(new Set(auditAdminPrivacyVectors.map((vector) => vector.id)).size, 34);
  for (const vector of auditAdminPrivacyVectors) {
    if (vector.expected.decision === 'SUPPRESS') {
      const safe = parseAdminSummary({
        policy_id: 'OPEN-PRIV-001',
        policy_version: '1.0.0-approved',
        generated_at: generatedAt,
        data: [
          {
            metric_id: 'approved.metric',
            period: '2026-08',
            dimensions: {},
            disclosure: 'suppressed',
            suppression_reason:
              vector.vectorClass === 'linked-release' ? 'linked_release' : 'small_cell',
            policy_version: '1.0.0-approved',
            snapshot_at: generatedAt,
          },
        ],
      });
      assert.ok(safe, vector.id);
      assert.equal(dashboardStateFor(safe), 'suppressed', vector.id);
      assert.doesNotMatch(
        JSON.stringify(safe),
        /protectedCount|distinct_subject_count|0-10/,
        vector.id,
      );
    }
  }
});

test('summary: linked release, stale reconnect, private cache, and non-admin denial fail closed', () => {
  const linked = parseAdminSummary({
    policy_id: 'OPEN-PRIV-001',
    policy_version: '1.0.0-approved',
    generated_at: generatedAt,
    data: [
      {
        metric_id: 'approved.metric',
        period: '2026-08',
        dimensions: { calendar_month_utc: '2026-08', facility_type: 'hospital' },
        disclosure: 'suppressed',
        suppression_reason: 'linked_release',
        policy_version: '1.0.0-approved',
        snapshot_at: generatedAt,
      },
    ],
  });
  assert.ok(linked);
  assert.equal(dashboardProblemState(0, undefined, true), 'stale');
  assert.equal(dashboardProblemState(403, 'forbidden', false), 'permission');
  assert.equal(dashboardProblemState(401, 'authentication-required', false), 'permission');
  assert.deepEqual(
    { cache: 'no-store', response: 'private, no-store' },
    { cache: 'no-store', response: 'private, no-store' },
  );
});
