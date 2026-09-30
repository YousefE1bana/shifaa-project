import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { randomBytes, randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { fileURLToPath } from 'node:url';

import { buildApp } from '../services/api/src/app.js';
import { loadConfig } from '../services/api/src/config.js';

export const SAMPLE_COUNT = 20;
export const WARMUP_COUNT = 3;
export const TARGETS_MS = {
  lcp_p95: 3000,
  input_p95: 200,
  api_read_p95: 400,
  api_mutation_p95: 800,
} as const;

export const API_READS = [
  'encounter_read',
  'referral_projection_read',
  'contextual_messages_read',
] as const;
export const API_MUTATIONS = ['encounter_update', 'referral_create', 'message_send'] as const;
export const BROWSER_MEASUREMENTS = [
  'records_lcp',
  'encounter_lcp',
  'message_input_to_render',
] as const;

export type Metric = {
  samples: number;
  warmups_excluded: number;
  concurrency: number;
  samples_ms: number[];
  p95_ms: number;
  success_count?: number;
  error_count?: number;
  warmup_success_count?: number;
  warmup_error_count?: number;
};

export function nearestRankP95(values: readonly number[]): number {
  assert.ok(values.length > 0, 'p95 requires at least one sample.');
  assert.ok(
    values.every((value) => Number.isFinite(value) && value >= 0),
    'Samples must be finite and non-negative.',
  );
  return [...values].sort((left, right) => left - right)[Math.ceil(0.95 * values.length) - 1]!;
}

export function metric(samples: number[]): Metric {
  return {
    samples: samples.length,
    warmups_excluded: WARMUP_COUNT,
    concurrency: 1,
    samples_ms: samples.map((value) => Number(value.toFixed(3))),
    p95_ms: Number(nearestRankP95(samples).toFixed(3)),
  };
}

type Evidence = {
  profile?: Record<string, unknown>;
  targets_ms?: Record<string, unknown>;
  measurements?: {
    api?: Record<string, unknown>;
    api_by_runtime?: Record<string, Record<string, unknown>>;
    browser?: Record<string, unknown>;
  };
  acceptance?: Record<string, unknown>;
};

export function validatePerformanceEvidence(evidence: Evidence): string[] {
  const issues: string[] = [];
  const add = (message: string) => issues.push(message);
  const profile = evidence.profile;
  if (!profile || profile.synthetic !== true)
    add('profile must identify synthetic fixture evidence');
  if (
    !['shifaa-local-postgres', 'shifaa-local-supabase', 'both-local-runtimes'].includes(
      String(profile?.runtime),
    )
  )
    add('profile runtime must be a named local PostgreSQL or Supabase runtime');
  if (profile?.runtime === 'both-local-runtimes') {
    const names = profile.runtimes;
    if (
      !Array.isArray(names) ||
      names.length !== 2 ||
      !['shifaa-local-postgres', 'shifaa-local-supabase'].every((name) => names.includes(name))
    )
      add('both-runtime profile must include both named local runtimes');
    const measured = Object.keys(evidence.measurements?.api_by_runtime ?? {});
    for (const runtime of ['shifaa-local-postgres', 'shifaa-local-supabase']) {
      if (!measured.includes(runtime))
        add(`both-runtime profile must include API measurements for ${runtime}`);
    }
  }
  if (profile?.browser !== 'desktop-chromium-loopback-fixture-rest')
    add('profile browser must be desktop Chromium using loopback fixture REST');
  if (profile?.locale !== 'en-EG') add('profile locale must record en-EG');
  if (profile?.reduced_motion !== 'reduce') add('profile must record reduced-motion preference');
  if (profile?.browser_server !== 'Expo web development server, warm during sampling')
    add('profile must identify the warm Expo web development server');
  if (profile?.browser_navigation_cache !== 'fresh browser context and empty cache per navigation')
    add('profile must identify cold browser context/cache per navigation');
  if (profile?.throttling !== 'none') add('profile must record unthrottled measurements');
  const viewport = profile?.viewport as { width?: unknown; height?: unknown } | undefined;
  if (viewport?.width !== 1440 || viewport?.height !== 900)
    add('profile viewport must record the measured 1440x900 desktop Chromium size');

  const targets = evidence.targets_ms;
  for (const [key, expected] of Object.entries(TARGETS_MS)) {
    if (targets?.[key] !== expected) add(`target ${key} must be ${expected} ms`);
  }

  const validateMetric = (name: string, value: unknown) => {
    if (!value || typeof value !== 'object') {
      add(`missing measurement ${name}`);
      return;
    }
    const item = value as Partial<Metric>;
    const values = item.samples_ms;
    if (!Array.isArray(values)) {
      add(`measurement ${name} samples_ms must be an array`);
      return;
    }
    if (item.samples !== SAMPLE_COUNT || values.length !== SAMPLE_COUNT)
      add(`measurement ${name} must contain exactly ${SAMPLE_COUNT} measured samples`);
    if (item.warmups_excluded !== WARMUP_COUNT)
      add(`measurement ${name} must exclude ${WARMUP_COUNT} warmups`);
    if (item.concurrency !== 1) add(`measurement ${name} must use concurrency 1`);
    if (
      !values.every(
        (sample) => typeof sample === 'number' && Number.isFinite(sample) && sample >= 0,
      )
    )
      add(`measurement ${name} samples must be finite and non-negative`);
    if (
      values.length &&
      values.every((sample) => typeof sample === 'number' && Number.isFinite(sample) && sample >= 0)
    ) {
      const expectedP95 = Number(nearestRankP95(values as number[]).toFixed(3));
      if (item.p95_ms !== expectedP95) add(`measurement ${name} p95_ms must use nearest-rank p95`);
    }
  };
  const apiByRuntime = evidence.measurements?.api_by_runtime;
  const apiProfiles = apiByRuntime
    ? Object.entries(apiByRuntime)
    : evidence.measurements?.api
      ? [['single-runtime', evidence.measurements.api] as const]
      : [];
  if (!apiProfiles.length) add('missing API runtime measurement profile');
  for (const [runtime, api] of apiProfiles) {
    if (!['single-runtime', 'shifaa-local-postgres', 'shifaa-local-supabase'].includes(runtime))
      add(`unknown API runtime profile ${runtime}`);
    for (const name of API_READS) validateMetric(`api.${runtime}.${name}`, api[name]);
    for (const name of API_MUTATIONS) validateMetric(`api.${runtime}.${name}`, api[name]);
    for (const name of [...API_READS, ...API_MUTATIONS]) {
      const item = api[name] as Partial<Metric> | undefined;
      if (
        item?.success_count !== SAMPLE_COUNT ||
        item?.error_count !== 0 ||
        item?.warmup_success_count !== WARMUP_COUNT ||
        item?.warmup_error_count !== 0
      )
        add(`api.${runtime}.${name} requires explicit successful request counts and zero errors`);
    }
  }
  for (const name of BROWSER_MEASUREMENTS)
    validateMetric(`browser.${name}`, evidence.measurements?.browser?.[name]);

  const acceptance = evidence.acceptance;
  if (acceptance?.local_result !== 'PASS' && acceptance?.local_result !== 'FAIL')
    add('acceptance local_result must be PASS or FAIL');
  if (acceptance?.production_evidence !== 'UNAVAILABLE-AS-PRODUCTION-EVIDENCE')
    add('production evidence must remain unavailable while OPEN-TECH-003 is open');
  if (acceptance?.open_gate !== 'OPEN-TECH-003') add('acceptance must retain OPEN-TECH-003');
  if (evidence.measurements) {
    const apiProfiles = evidence.measurements.api_by_runtime
      ? Object.values(evidence.measurements.api_by_runtime)
      : evidence.measurements.api
        ? [evidence.measurements.api]
        : [];
    const browser = evidence.measurements.browser ?? {};
    const over = (entry: unknown, target: number) =>
      entry &&
      typeof entry === 'object' &&
      typeof (entry as Metric).p95_ms === 'number' &&
      (entry as Metric).p95_ms > target;
    const hasAll =
      apiProfiles.length > 0 &&
      apiProfiles.every((api) => [...API_READS, ...API_MUTATIONS].every((name) => api[name])) &&
      BROWSER_MEASUREMENTS.every((name) => browser[name]);
    if (hasAll) {
      const failures = [
        ...apiProfiles.flatMap((api) => [
          ...API_READS.map((name) => over(api[name], TARGETS_MS.api_read_p95)),
          ...API_MUTATIONS.map((name) => over(api[name], TARGETS_MS.api_mutation_p95)),
        ]),
        over(browser.records_lcp, TARGETS_MS.lcp_p95),
        over(browser.encounter_lcp, TARGETS_MS.lcp_p95),
        over(browser.message_input_to_render, TARGETS_MS.input_p95),
      ].some(Boolean);
      const expected = failures ? 'FAIL' : 'PASS';
      if (acceptance?.local_result !== expected)
        add(`acceptance local_result must be ${expected} for the measured thresholds`);
    }
  }
  return issues;
}

type RuntimeName = 'shifaa-local-postgres' | 'shifaa-local-supabase';
type Runtime = {
  name: RuntimeName;
  container: string;
  user: string;
  adminDatabase: string;
};
type Operation = {
  method: string;
  url: string;
  payload?: unknown;
  purpose: string;
  expectedStatus: number;
};

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let currentStage = 'runner initialization';
const runtimeConfigs: Runtime[] = [
  {
    name: 'shifaa-local-postgres',
    container: 'shifaa-local-postgres-postgres-1',
    user: 'shifaa_owner',
    adminDatabase: 'shifaa',
  },
  {
    name: 'shifaa-local-supabase',
    container: 'supabase_db_shifaa-local-supabase',
    user: 'supabase_admin',
    adminDatabase: 'postgres',
  },
];
const fixtureIds = {
  clinician: 'f0101000-0000-4000-8000-000000000001',
  patient: 'f0101000-0000-4000-8000-000000000002',
  facility: 'f0101000-0000-4000-8200-000000000001',
  appointment: 'f0101000-0000-4000-8500-000000000004',
  encounter: 'f0101000-0000-4000-8800-000000000002',
};

function selectedRuntimes(): Runtime[] {
  const selection = process.env.SHIFAA_PERF_RUNTIME;
  if (!selection || selection === 'both') return runtimeConfigs;
  const selected = runtimeConfigs.filter((runtime) => runtime.name === selection);
  if (selected.length !== 1)
    throw new Error(
      'SHIFAA_PERF_RUNTIME must be shifaa-local-postgres, shifaa-local-supabase, or both.',
    );
  return selected;
}

function requireBothRuntimes(): boolean {
  return process.argv.includes('--require-both-runtimes');
}

function runDocker(runtime: Runtime, args: string[], label: string, input?: string): string {
  const dockerArgs = ['exec'];
  if (input !== undefined) dockerArgs.push('-i');
  dockerArgs.push(runtime.container, ...args);
  const child = spawnSync('docker', dockerArgs, {
    cwd: root,
    encoding: 'utf8',
    input,
    maxBuffer: 64 * 1024 * 1024,
    windowsHide: true,
  });
  if (child.error || child.status !== 0) {
    const sqlState =
      child.stderr?.match(/(?:ERROR|FATAL):\s*([0-9A-Z]{5}):/)?.[1] ??
      child.stderr?.match(/SQL state:\s*([0-9A-Z]{5})/i)?.[1];
    throw new Error(
      `${label} failed (${child.status ?? 'no exit status'}${sqlState ? `, PostgreSQL SQLSTATE ${sqlState}` : ''}).`,
    );
  }
  return child.stdout;
}

function runPsql(runtime: Runtime, database: string, sql: string, label: string): string {
  currentStage = label;
  return runDocker(
    runtime,
    [
      'psql',
      '-X',
      '-q',
      '-v',
      'ON_ERROR_STOP=1',
      '-v',
      'VERBOSITY=verbose',
      '-U',
      runtime.user,
      '-d',
      database,
    ],
    label,
    sql,
  );
}

function runMigration(runtime: Runtime, database: string, migration: string): void {
  const label = `${runtime.name} apply migration ${path.basename(migration)}`;
  currentStage = label;
  const sourcePath = path.resolve(root, migration);
  const source = readFileSync(sourcePath, 'utf8').replace(
    /^\\ir\s+(\S+)\s*$/gm,
    (_, included: string) => readFileSync(path.resolve(path.dirname(sourcePath), included), 'utf8'),
  );
  assert.ok(!/^\\ir\s/m.test(source), 'Nested migration includes are unsupported.');
  runDocker(
    runtime,
    [
      'psql',
      '-X',
      '-q',
      '-v',
      'ON_ERROR_STOP=1',
      '-v',
      'VERBOSITY=verbose',
      '-U',
      runtime.user,
      '-d',
      database,
    ],
    label,
    source,
  );
}

function runTuples(runtime: Runtime, database: string, sql: string, label: string): string {
  currentStage = label;
  return runDocker(
    runtime,
    [
      'psql',
      '-X',
      '-qAt',
      '-v',
      'ON_ERROR_STOP=1',
      '-v',
      'VERBOSITY=verbose',
      '-U',
      runtime.user,
      '-d',
      database,
      '-c',
      sql,
    ],
    label,
  ).trim();
}

function migrationList(): string[] {
  const packageJson = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8')) as {
    scripts?: Record<string, string>;
  };
  const command = packageJson.scripts?.['db:migrate'];
  assert.ok(command, 'package db:migrate chain is unavailable.');
  const paths = [...command.matchAll(/-f \/workspace\/([^\s]+\.sql)/g)].map((match) => match[1]!);
  assert.ok(paths.length > 0, 'package db:migrate contains no migration files.');
  return paths;
}

function databaseName(runtime: Runtime): string {
  const slug = runtime.name.endsWith('postgres') ? 'pg' : 'supa';
  return `shifaa_test_f010_perf_${slug}_${process.pid}_${randomBytes(4).toString('hex')}`;
}

function portFor(runtime: Runtime): number {
  const result = spawnSync('docker', ['port', runtime.container, '5432/tcp'], {
    cwd: root,
    encoding: 'utf8',
    windowsHide: true,
  });
  const port = result.stdout.trim().split(/\r?\n/)[0]?.split(':').at(-1);
  if (result.error || result.status !== 0 || !port || !/^\d+$/.test(port))
    throw new Error(`${runtime.name} PostgreSQL has no mapped loopback port.`);
  return Number(port);
}

function runBrowserProfile(output: string): Record<string, unknown> {
  currentStage = 'desktop Chromium browser measurements';
  const child = spawnSync(
    process.execPath,
    [
      path.join(root, 'node_modules/playwright/cli.js'),
      'test',
      '--config',
      'tools/feature-010-performance-playwright.config.ts',
    ],
    {
      cwd: root,
      env: { ...process.env, SHIFAA_PERF_BROWSER_OUTPUT: output },
      encoding: 'utf8',
      windowsHide: true,
      maxBuffer: 16 * 1024 * 1024,
    },
  );
  if (child.error || child.status !== 0) {
    currentStage = `desktop Chromium browser measurements (Playwright exit ${child.status ?? 'no exit status'})`;
    throw new Error('Synthetic patient Chromium profile failed.');
  }
  return JSON.parse(readFileSync(output, 'utf8')) as Record<string, unknown>;
}

async function provisionDatabase(
  runtime: Runtime,
  database: string,
  onCreated: () => void,
): Promise<void> {
  assert.match(database, /^shifaa_test_f010_perf_(pg|supa)_\d+_[a-f0-9]+$/);
  runPsql(
    runtime,
    runtime.adminDatabase,
    `CREATE DATABASE "${database}" TEMPLATE template0;`,
    `${runtime.name} create isolated performance database`,
  );
  onCreated();
  for (const migration of migrationList()) {
    runMigration(runtime, database, migration);
  }
  const fixturePath = 'infra/db/tests/feature-010-update.sql';
  const fixture = readFileSync(path.join(root, fixturePath), 'utf8');
  const rollbackIndex = fixture.lastIndexOf('\nROLLBACK;');
  assert.ok(
    rollbackIndex >= 0 && fixture.slice(rollbackIndex).trim() === 'ROLLBACK;',
    'C11 fixture rollback boundary changed.',
  );
  runPsql(
    runtime,
    database,
    `${fixture.slice(0, rollbackIndex)}\nCOMMIT;\n`,
    `${runtime.name} commit C11 synthetic fixture`,
  );
  runPsql(
    runtime,
    runtime.adminDatabase,
    `ALTER DATABASE "${database}" SET shifaa.test_now TO '2030-04-05 07:30:00+00';`,
    `${runtime.name} set isolated fixture clock`,
  );
}

function apiDatabaseUrl(runtime: Runtime, database: string): string {
  return `postgresql://shifaa_api:synthetic_api_only@127.0.0.1:${portFor(runtime)}/${database}`;
}

function verifyFixture(runtime: Runtime, database: string): void {
  const state = runTuples(
    runtime,
    database,
    `SELECT
      (SELECT count(*) FROM clinical.encounters WHERE id='${fixtureIds.encounter}' AND status='open')::text || '|' ||
      (SELECT count(*) FROM clinical.appointments WHERE id='${fixtureIds.appointment}' AND status='in_consultation')::text || '|' ||
      (SELECT count(*) FROM clinical.encounter_participants WHERE encounter_id='${fixtureIds.encounter}' AND person_id='${fixtureIds.clinician}' AND ended_at IS NULL)::text;`,
    `${runtime.name} verify committed C11 fixture`,
  );
  assert.equal(
    state,
    '1|1|1',
    `${runtime.name} C11 fixture must establish open encounter, active consultation and clinician participant.`,
  );
}

function headers(personId: string, key: string, purpose: string) {
  return {
    authorization: `Bearer synthetic-person:${personId}`,
    'idempotency-key': key,
    'x-aal': '2',
    'x-purpose': purpose,
    'accept-language': 'en-EG',
  };
}

async function timeOperation(
  app: Awaited<ReturnType<typeof buildApp>>['app'],
  key: string,
  operation: Operation,
  version?: number,
  stage = `Fastify ${operation.method} API request`,
) {
  currentStage = stage;
  const started = performance.now();
  const response = await app.inject({
    method: operation.method as 'GET' | 'PATCH' | 'POST',
    url: operation.url,
    headers: {
      ...headers(fixtureIds.clinician, key, operation.purpose),
      ...(version === undefined ? {} : { 'if-match': `"${version}"` }),
    },
    ...(operation.payload === undefined ? {} : { payload: operation.payload }),
  });
  const elapsed = performance.now() - started;
  if (response.statusCode !== operation.expectedStatus) {
    let problemCode = 'unavailable';
    try {
      const problem = response.json() as { code?: unknown };
      if (problem.code === 'internal-error') problemCode = 'internal-error';
    } catch {
      // HTTP status and a fixed fallback are sufficient safe diagnostics.
    }
    currentStage = `${stage} HTTP ${response.statusCode} problem ${problemCode} (expected ${operation.expectedStatus})`;
  }
  assert.equal(
    response.statusCode,
    operation.expectedStatus,
    `F010 performance ${operation.method} operation must return ${operation.expectedStatus}.`,
  );
  return { elapsed, body: response.json() as Record<string, unknown> };
}

async function sampleApi(app: Awaited<ReturnType<typeof buildApp>>['app'], runId: string) {
  const operations: Record<string, Operation> = {
    encounter_read: {
      method: 'GET',
      url: `/v1/encounters/${fixtureIds.encounter}`,
      purpose: 'appointment.scheduling',
      expectedStatus: 200,
    },
    referral_projection_read: {
      method: 'GET',
      url: `/v1/referrals?limit=100&patientId=${fixtureIds.patient}&facilityId=${fixtureIds.facility}`,
      purpose: 'clinical.care',
      expectedStatus: 200,
    },
    contextual_messages_read: {
      method: 'GET',
      url: `/v1/contexts/appointment/${fixtureIds.appointment}/messages?limit=100`,
      purpose: 'appointment.scheduling',
      expectedStatus: 200,
    },
    encounter_update: {
      method: 'PATCH',
      url: `/v1/encounters/${fixtureIds.encounter}`,
      payload: { conditionIds: [] },
      purpose: 'appointment.scheduling',
      expectedStatus: 200,
    },
    referral_create: {
      method: 'POST',
      url: `/v1/encounters/${fixtureIds.encounter}/referrals`,
      payload: { targetSpecialty: 'cardiology', reasonSummary: `Synthetic performance ${runId}` },
      purpose: 'clinical.care',
      expectedStatus: 201,
    },
    message_send: {
      method: 'POST',
      url: `/v1/contexts/appointment/${fixtureIds.appointment}/messages`,
      payload: { body: `Synthetic performance ${runId}` },
      purpose: 'appointment.scheduling',
      expectedStatus: 201,
    },
  };
  const samples: Record<string, number[]> = Object.fromEntries(
    [...API_READS, ...API_MUTATIONS].map((name) => [name, []]),
  );
  const metrics: Record<string, Metric> = {};

  // Populate the projections through the same authorized API before measuring reads.
  // These real writes are bootstrap work and are deliberately excluded from timings.
  const seededReferral = await timeOperation(
    app,
    `f010-perf-${runId}-seed-referral`,
    {
      ...operations.referral_create!,
      payload: {
        targetSpecialty: 'cardiology',
        reasonSummary: `Synthetic performance seed ${runId}`,
      },
    },
    undefined,
    'referral API projection bootstrap',
  );
  assert.ok(
    seededReferral.body && typeof seededReferral.body === 'object',
    'F010 referral bootstrap must return a projection.',
  );
  const seededMessage = await timeOperation(
    app,
    `f010-perf-${runId}-seed-message`,
    {
      ...operations.message_send!,
      payload: { body: `Synthetic performance seed ${runId}` },
    },
    undefined,
    'contextual message API projection bootstrap',
  );
  assert.ok(
    seededMessage.body && typeof seededMessage.body === 'object',
    'F010 contextual message bootstrap must return a projection.',
  );
  const referrals = await timeOperation(
    app,
    `f010-perf-${runId}-verify-referral-projection`,
    operations.referral_projection_read!,
    undefined,
    'verify seeded referral API projection',
  );
  const messages = await timeOperation(
    app,
    `f010-perf-${runId}-verify-message-projection`,
    operations.contextual_messages_read!,
    undefined,
    'verify seeded contextual message API projection',
  );
  assert.ok(
    Array.isArray(referrals.body.data) && referrals.body.data.length > 0,
    'F010 referral projection must contain a seeded API-created referral before timing.',
  );
  assert.ok(
    Array.isArray(messages.body.data) && messages.body.data.length > 0,
    'F010 contextual message projection must contain a seeded API-created message before timing.',
  );

  for (const name of [...API_READS, ...API_MUTATIONS]) {
    const operation = operations[name]!;
    let successes = 0;
    let warmupSuccesses = 0;
    for (let index = 0; index < WARMUP_COUNT + SAMPLE_COUNT; index += 1) {
      let currentVersion: number | undefined;
      if (name === 'encounter_update') {
        const current = await timeOperation(
          app,
          `f010-perf-${runId}-version-${index}`,
          operations.encounter_read!,
          undefined,
          'encounter version pre-read for update',
        );
        currentVersion = Number(current.body.version);
        assert.ok(
          Number.isInteger(currentVersion) && currentVersion > 0,
          'C11 encounter response omitted the current version.',
        );
      }
      const measured = await timeOperation(
        app,
        `f010-perf-${runId}-${name}-${index}`,
        operation,
        currentVersion,
        `${name} API ${index < WARMUP_COUNT ? 'warmup' : 'measurement'} ${index + 1}`,
      );
      if (name === 'encounter_update')
        assert.ok(
          Number.isInteger(measured.body.version),
          'C11 update response omitted the new version.',
        );
      if (index >= WARMUP_COUNT) {
        samples[name]!.push(measured.elapsed);
        successes += 1;
      } else warmupSuccesses += 1;
    }
    // Any HTTP/schema failure above aborts the run and emits no accepted metric.
    metrics[name] = {
      ...metric(samples[name]!),
      success_count: successes,
      error_count: 0,
      warmup_success_count: warmupSuccesses,
      warmup_error_count: 0,
    };
  }
  return metrics;
}

async function measureRuntime(runtime: Runtime, runId: string) {
  const database = databaseName(runtime);
  let created = false;
  let harness: Awaited<ReturnType<typeof buildApp>> | undefined;
  let metrics: Record<string, Metric> | undefined;
  let operationFailure: unknown;
  let operationFailureStage = '';
  try {
    await provisionDatabase(runtime, database, () => {
      created = true;
    });
    currentStage = `${runtime.name} verify committed C11 fixture`;
    verifyFixture(runtime, database);
    currentStage = `${runtime.name} build real Fastify/Postgres adapter`;
    const config = loadConfig({ NODE_ENV: 'test' });
    harness = await buildApp({
      config: {
        ...config,
        repositoryAdapter: 'postgres',
        databaseUrl: apiDatabaseUrl(runtime, database),
        identityOnboardingEnabled: true,
        syntheticMode: true,
      },
      clock: { now: () => new Date('2030-04-05T07:30:00.000Z') },
    });
    currentStage = `${runtime.name} authorized API bootstrap and measurements`;
    metrics = await sampleApi(harness.app, `${runId}-${runtime.name.slice(-2)}`);
  } catch (error) {
    operationFailure = error;
    operationFailureStage = currentStage;
  }

  let cleanupFailure: unknown;
  let cleanupFailureStage = '';
  if (harness) {
    currentStage = `${runtime.name} close real Fastify/Postgres adapter`;
    try {
      await harness.app.close();
    } catch (error) {
      cleanupFailure = error;
      cleanupFailureStage = currentStage;
    }
  }
  if (created) {
    try {
      const count = runTuples(
        runtime,
        runtime.adminDatabase,
        `SELECT count(*) FROM pg_database WHERE datname='${database}' AND datallowconn;`,
        `${runtime.name} confirm owned disposable database`,
      );
      if (count !== '1')
        throw new Error(`${runtime.name} owned performance database disappeared before cleanup.`);
      runPsql(
        runtime,
        runtime.adminDatabase,
        `DROP DATABASE "${database}" WITH (FORCE);`,
        `${runtime.name} drop owned performance database`,
      );
    } catch (error) {
      cleanupFailure ??= error;
      cleanupFailureStage ||= currentStage;
    }
  }
  if (operationFailure) {
    currentStage = operationFailureStage;
    if (cleanupFailure)
      throw new Error(
        `${operationFailureStage} failed; owned database cleanup also failed during ${cleanupFailureStage}.`,
      );
    throw operationFailure;
  }
  if (cleanupFailure) {
    currentStage = cleanupFailureStage;
    throw cleanupFailure;
  }
  assert.ok(metrics, `${runtime.name} performance metrics were not produced.`);
  return metrics;
}

function runtimePass(api: Record<string, Metric>, browser: Record<string, Metric>): boolean {
  return [
    ...API_READS.map((name) => api[name]!.p95_ms <= TARGETS_MS.api_read_p95),
    ...API_MUTATIONS.map((name) => api[name]!.p95_ms <= TARGETS_MS.api_mutation_p95),
    browser.records_lcp!.p95_ms <= TARGETS_MS.lcp_p95,
    browser.encounter_lcp!.p95_ms <= TARGETS_MS.lcp_p95,
    browser.message_input_to_render!.p95_ms <= TARGETS_MS.input_p95,
  ].every(Boolean);
}

export async function runFeature010Performance(): Promise<Record<string, unknown>> {
  const runtimes = selectedRuntimes();
  if (requireBothRuntimes())
    assert.equal(
      runtimes.length,
      runtimeConfigs.length,
      '--require-both-runtimes requires both named local PostgreSQL runtimes.',
    );
  const browserOutput = path.join(
    os.tmpdir(),
    `shifaa-f010-perf-browser-${process.pid}-${randomUUID()}.json`,
  );
  let browserEvidence: Record<string, unknown>;
  const runId = randomUUID().replaceAll('-', '');
  const apiByRuntime: Record<string, Record<string, Metric>> = {};
  try {
    browserEvidence = runBrowserProfile(browserOutput);
    const rawSamples = browserEvidence.measurements_ms as Record<string, number[]>;
    const browserMetrics = Object.fromEntries(
      BROWSER_MEASUREMENTS.map((name) => [name, metric(rawSamples[name] ?? [])]),
    );
    for (const runtime of runtimes)
      apiByRuntime[runtime.name] = await measureRuntime(runtime, runId);
    const runtimeResults = Object.fromEntries(
      runtimes.map((runtime) => [
        runtime.name,
        runtimePass(apiByRuntime[runtime.name]!, browserMetrics) ? 'PASS' : 'FAIL',
      ]),
    );
    const passed = Object.values(runtimeResults).every((result) => result === 'PASS');
    const evidence = {
      generated_at: new Date().toISOString(),
      profile: {
        runtime: runtimes.length === 1 ? runtimes[0]!.name : 'both-local-runtimes',
        runtimes: runtimes.map((runtime) => runtime.name),
        synthetic: true,
        api: 'real Fastify app.inject over Postgres-backed adapters using non-owner shifaa_api; in-process HTTP injection, excluding socket/TLS/network latency',
        api_timing_source:
          'Node performance.now around Fastify inject request plus response serialization; JSON parse after timing',
        api_operation_mix: {
          reads: API_READS,
          mutations: API_MUTATIONS,
          projection_seed:
            'one referral and one contextual message created through API before timed reads',
        },
        percentile_method: 'nearest-rank: sorted[ceil(0.95*n)-1]',
        sample_method: `${SAMPLE_COUNT} measured sequential requests per operation after ${WARMUP_COUNT} excluded sequential warmups`,
        browser: browserEvidence.browser,
        browser_measurement_sources: {
          lcp: 'actual page PerformanceObserver largest-contentful-paint entry in the cold navigation context',
          input_to_render:
            'real sequential key input event to the second requestAnimationFrame where the input value is rendered',
        },
        browser_version: browserEvidence.browser_version,
        locale: browserEvidence.locale,
        reduced_motion: browserEvidence.reduced_motion,
        browser_server: browserEvidence.server,
        browser_navigation_cache: browserEvidence.navigation_cache,
        browser_viewport: browserEvidence.viewport,
        browser_throttling: browserEvidence.throttling,
        viewport: browserEvidence.viewport,
        throttling: browserEvidence.throttling,
        browser_fixture_scope:
          'one shared desktop Chromium profile, measured once and reused across runtime API profiles',
        api_concurrency: 1,
        browser_contexts: 'cold context per route navigation; Expo server warm',
        warmups_excluded: WARMUP_COUNT,
        platform: `${process.platform}/${os.arch()}`,
        node: process.version,
        isolated_database_family:
          'shifaa_test_f010_perf_{pg|supa}_*; each dropped after its runtime profile',
        fixture:
          'committed C11 synthetic encounter fixture; C22 real API adapter and transactional request paths',
      },
      targets_ms: TARGETS_MS,
      measurements: { api_by_runtime: apiByRuntime, browser: browserMetrics },
      runtime_results: runtimeResults,
      acceptance: {
        local_result: passed ? 'PASS' : 'FAIL',
        production_evidence: 'UNAVAILABLE-AS-PRODUCTION-EVIDENCE',
        open_gate: 'OPEN-TECH-003',
      },
    };
    const issues = validatePerformanceEvidence(evidence);
    assert.deepEqual(issues, [], issues.join('\n'));
    return evidence;
  } finally {
    await rm(browserOutput, { force: true });
  }
}

async function main() {
  const output =
    process.env.SHIFAA_PERF_REPORT ??
    path.join(os.tmpdir(), `shifaa-f010-performance-${process.pid}-${Date.now()}.json`);
  let evidence: Record<string, unknown>;
  try {
    evidence = await runFeature010Performance();
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    const sqlState = message.match(/PostgreSQL SQLSTATE ([0-9A-Z]{5})/)?.[1];
    const safeMessage = message.startsWith('SHIFAA_PERF_RUNTIME must be ')
      ? message
      : `performance runner failed during ${currentStage} (${error instanceof Error ? error.name : 'unknown error'}${sqlState ? `, PostgreSQL SQLSTATE ${sqlState}` : ''})`;
    evidence = {
      profile: {
        runtime: process.env.SHIFAA_PERF_RUNTIME ?? 'both-local-runtimes',
        synthetic: true,
      },
      targets_ms: TARGETS_MS,
      measurements: { api_by_runtime: {}, browser: {} },
      acceptance: {
        local_result: 'FAIL',
        production_evidence: 'UNAVAILABLE-AS-PRODUCTION-EVIDENCE',
        open_gate: 'OPEN-TECH-003',
      },
      failure: safeMessage,
    };
    process.stderr.write(`${safeMessage}\n`);
  }
  await mkdir(path.dirname(output), { recursive: true });
  await writeFile(output, `${JSON.stringify(evidence, null, 2)}\n`, 'utf8');
  const measurements = evidence.measurements as
    | { api_by_runtime?: Record<string, Record<string, Metric>>; browser?: Record<string, Metric> }
    | undefined;
  const summarize = (groups: Record<string, Record<string, Metric>> | undefined) =>
    Object.fromEntries(
      Object.entries(groups ?? {}).map(([group, metrics]) => [
        group,
        Object.fromEntries(
          Object.entries(metrics).map(([name, value]) => [
            name,
            {
              samples: value.samples,
              warmups_excluded: value.warmups_excluded,
              success_count: value.success_count,
              error_count: value.error_count,
              warmup_success_count: value.warmup_success_count,
              warmup_error_count: value.warmup_error_count,
              p95_ms: value.p95_ms,
            },
          ]),
        ),
      ]),
    );
  const summary = {
    report: output,
    runtime_results: evidence.runtime_results,
    acceptance: evidence.acceptance,
    measurements: {
      api_by_runtime: summarize(measurements?.api_by_runtime),
      browser: Object.fromEntries(
        Object.entries(measurements?.browser ?? {}).map(([name, value]) => [
          name,
          {
            samples: value.samples,
            warmups_excluded: value.warmups_excluded,
            p95_ms: value.p95_ms,
          },
        ]),
      ),
    },
  };
  process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
  if ((evidence.acceptance as Record<string, unknown>)?.local_result !== 'PASS')
    process.exitCode = 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url))
  void main();
