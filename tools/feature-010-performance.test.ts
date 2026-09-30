import assert from 'node:assert/strict';
import test from 'node:test';
import { nearestRankP95, validatePerformanceEvidence } from './feature-010-performance.ts';

const metric = (n = 20) => ({
  samples: n,
  warmups_excluded: 3,
  concurrency: 1,
  samples_ms: Array(n).fill(10),
  p95_ms: 10,
  success_count: n,
  error_count: 0,
  warmup_success_count: 3,
  warmup_error_count: 0,
});
type TestEvidence = {
  profile: {
    runtime: string;
    synthetic: boolean;
    browser: string;
    locale: string;
    reduced_motion: string;
    browser_server: string;
    browser_navigation_cache: string;
    viewport: { width: number; height: number };
    throttling: string;
    runtimes?: string[];
  };
  targets_ms: Record<string, number>;
  measurements: {
    api?: Record<string, ReturnType<typeof metric>>;
    api_by_runtime?: Record<string, Record<string, ReturnType<typeof metric>>>;
    browser: Record<string, ReturnType<typeof metric>>;
  };
  acceptance: Record<string, unknown>;
};
const valid = (): TestEvidence => ({
  profile: {
    runtime: 'shifaa-local-postgres',
    synthetic: true,
    browser: 'desktop-chromium-loopback-fixture-rest',
    locale: 'en-EG',
    reduced_motion: 'reduce',
    browser_server: 'Expo web development server, warm during sampling',
    browser_navigation_cache: 'fresh browser context and empty cache per navigation',
    viewport: { width: 1440, height: 900 },
    throttling: 'none',
  },
  targets_ms: { lcp_p95: 3000, input_p95: 200, api_read_p95: 400, api_mutation_p95: 800 },
  measurements: {
    api: {
      encounter_read: metric(),
      referral_projection_read: metric(),
      contextual_messages_read: metric(),
      encounter_update: metric(),
      referral_create: metric(),
      message_send: metric(),
    },
    browser: { records_lcp: metric(), encounter_lcp: metric(), message_input_to_render: metric() },
  },
  acceptance: {
    local_result: 'PASS',
    production_evidence: 'UNAVAILABLE-AS-PRODUCTION-EVIDENCE',
    open_gate: 'OPEN-TECH-003',
  },
});

test('p95 uses nearest rank ceil(.95*n)-1', () => {
  assert.equal(nearestRankP95(Array.from({ length: 20 }, (_, i) => i + 1)), 19);
  assert.equal(nearestRankP95([1, 2, 3, 4, 100]), 100);
});

test('runner evidence includes every measured F010 read, mutation, and browser operation', () => {
  assert.deepEqual(validatePerformanceEvidence(valid()), []);
});

test('shared browser profile is validated once beside complete measurements for each local runtime', () => {
  const report = valid();
  const api = report.measurements.api!;
  delete report.measurements.api;
  report.profile.runtime = 'both-local-runtimes';
  report.profile.runtimes = ['shifaa-local-postgres', 'shifaa-local-supabase'];
  report.measurements.api_by_runtime = {
    'shifaa-local-postgres': structuredClone(api),
    'shifaa-local-supabase': structuredClone(api),
  };
  assert.deepEqual(validatePerformanceEvidence(report), []);
  report.measurements.api_by_runtime['shifaa-local-supabase']!.message_send!.samples = 19;
  assert.ok(
    validatePerformanceEvidence(report).some((issue) =>
      issue.includes('shifaa-local-supabase.message_send'),
    ),
  );
  report.measurements.api_by_runtime = {
    'shifaa-local-postgres': structuredClone(api),
  };
  assert.ok(
    validatePerformanceEvidence(report).some((issue) =>
      issue.includes('API measurements for shifaa-local-supabase'),
    ),
  );
});

test('missing measurements, non-finite/negative samples, and undersized samples fail closed', () => {
  const report = valid();
  delete report.measurements.api!.referral_projection_read;
  report.measurements.api!.encounter_read!.samples_ms[0] = Number.NaN;
  report.measurements.api!.contextual_messages_read!.samples_ms[1] = -1;
  report.measurements.api!.encounter_update!.samples = 19;
  assert.ok(validatePerformanceEvidence(report).length >= 4);
});

test('profile cannot be presented as production evidence while OPEN-TECH-003 is open', () => {
  const report = valid();
  report.acceptance.production_evidence = 'PASS';
  assert.ok(validatePerformanceEvidence(report).some((issue) => issue.includes('production')));
});

test('HTTP errors cannot be reported as accepted latency samples', () => {
  const report = valid();
  report.measurements.api!.encounter_read!.error_count = 1;
  report.measurements.api!.encounter_read!.success_count = 19;
  assert.ok(validatePerformanceEvidence(report).some((issue) => issue.includes('zero errors')));
});

test('reference device and throttling are not invented when profile metadata changes', () => {
  const report = valid();
  report.profile.viewport.width = 390;
  report.profile.throttling = 'slow-4g';
  const issues = validatePerformanceEvidence(report);
  assert.ok(issues.some((issue) => issue.includes('1440x900')));
  assert.ok(issues.some((issue) => issue.includes('unthrottled')));
});

test('local PASS is rejected when a measured operation misses its numeric target', () => {
  const report = valid();
  report.measurements.api!.encounter_read!.samples_ms[18] = 500;
  report.measurements.api!.encounter_read!.samples_ms[19] = 500;
  report.measurements.api!.encounter_read!.p95_ms = 500;
  assert.ok(
    validatePerformanceEvidence(report).some((issue) =>
      issue.includes('local_result must be FAIL'),
    ),
  );
});
