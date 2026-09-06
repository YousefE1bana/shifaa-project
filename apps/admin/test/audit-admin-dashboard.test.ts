import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

import { auditAdminArEG, auditAdminEnEG } from '@shifaa/i18n';

import {
  dashboardProblemState,
  dashboardStateFor,
  parseAdminSummary,
} from '../src/app/dashboard/dashboard-model.ts';

const source = fs.readFileSync(
  new URL('../src/app/dashboard/AdminDashboard.tsx', import.meta.url),
  'utf8',
);
const generatedAt = '2026-09-01T12:00:00.000Z';

test('dashboard fails closed for inactive metrics and count-bearing suppressed cells', () => {
  assert.equal(dashboardProblemState(503, 'legal-gate-disabled', false), 'gated');
  assert.equal(
    parseAdminSummary({
      policy_id: 'OPEN-PRIV-001',
      policy_version: '1.0.0-approved',
      data: [],
      generated_at: generatedAt,
    })?.cells.length,
    0,
  );
  assert.equal(
    parseAdminSummary({
      policy_id: 'OPEN-PRIV-001',
      policy_version: '1.0.0-approved',
      generated_at: generatedAt,
      data: [
        {
          metric_id: 'safe.metric',
          period: '2026-08-01',
          dimensions: { calendar_month_utc: '2026-08-01' },
          disclosure: 'suppressed',
          distinct_subject_count: 10,
          suppression_reason: 'small_cell',
          policy_version: '1.0.0-approved',
          snapshot_at: generatedAt,
        },
      ],
    }),
    null,
  );
});

test('dashboard distinguishes empty, suppressed, released, stale, permission, and error states', () => {
  const empty = parseAdminSummary({
    policy_id: 'OPEN-PRIV-001',
    policy_version: '1.0.0-approved',
    data: [],
    generated_at: generatedAt,
  });
  assert.ok(empty);
  assert.equal(dashboardStateFor(empty), 'empty');
  const suppressed = parseAdminSummary({
    policy_id: 'OPEN-PRIV-001',
    policy_version: '1.0.0-approved',
    generated_at: generatedAt,
    data: [
      {
        metric_id: 'safe.metric',
        period: '2026-08-01',
        dimensions: { facility_type: 'clinic' },
        disclosure: 'suppressed',
        suppression_reason: 'linked_release',
        policy_version: '1.0.0-approved',
        snapshot_at: generatedAt,
      },
    ],
  });
  assert.ok(suppressed);
  assert.equal(dashboardStateFor(suppressed), 'suppressed');
  assert.equal(dashboardProblemState(0, undefined, true), 'stale');
  assert.equal(dashboardProblemState(403, 'forbidden', false), 'permission');
  assert.equal(dashboardProblemState(500, undefined, false), 'error');
});

test('dashboard provides Arabic RTL and English LTR accessible, reflow-safe controls', () => {
  assert.deepEqual(Object.keys(auditAdminArEG).sort(), Object.keys(auditAdminEnEG).sort());
  for (const token of [
    'directionFor(locale)',
    'document.documentElement.dir',
    'aria-live="polite"',
    'role="alert"',
    'minWidth: 44',
    'minHeight: 44',
    '@shifaa/design-system/tokens',
    'auto-fit',
    'bdi dir="ltr"',
    "window.addEventListener('offline'",
    "window.addEventListener('online'",
  ])
    assert.match(source, new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  for (const forbidden of [
    'patient selector',
    'drill-down',
    'distinct_subject_count}</',
    'animationDuration',
  ])
    assert.doesNotMatch(source, new RegExp(forbidden, 'i'));
});
