// Fresh execution of accepted functional suites; output-only copies preserve history.
import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync, unlinkSync, createWriteStream } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { chromium } from 'playwright';
import {
  verifyFeature011Contracts,
  currentPhysicalSourceDigests,
} from './verify-feature-011-contracts.mjs';
const e = 'specs/011-allergies-clinical-content-governance/evidence/fresh-implementation/K24';
const a = 'artifacts/feature-011/k24';
mkdirSync(e + '/browser', { recursive: true });
mkdirSync(a, { recursive: true });
const hash = (p) => createHash('sha256').update(readFileSync(p)).digest('hex');
const pnpm = resolve(dirname(process.execPath), 'node_modules/corepack/dist/pnpm.js');
const node = process.execPath;
const write = (p, data) => writeFileSync(p, JSON.stringify(data, null, 2) + '\n');
const pins = currentPhysicalSourceDigests();
const parity = await verifyFeature011Contracts();
assert.equal(parity.result, 'PASS', parity.failures.join('\n'));
const generated = ['apps/clinic/next-env.d.ts', 'apps/admin/next-env.d.ts'];
const before = new Map(generated.map((p) => [p, readFileSync(p)]));
const records = [];
async function command(id, args, env = {}) {
  const path = a + '/' + id + '.log';
  const output = createWriteStream(path);
  console.log('START ' + id);
  const child = spawn(node, args, {
    env: { ...process.env, ...env },
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.stdout.pipe(output, { end: false });
  child.stderr.pipe(output, { end: false });
  const status = await new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('close', resolve);
  });
  await new Promise((resolve) => output.end(resolve));
  assert.equal(status, 0, id + ' failed; inspect ' + path);
  console.log('PASS ' + id);
  return { id, command: [node, ...args], exitCode: status, log: { path, sha256: hash(path) } };
}
function restoreGenerated() {
  for (const [path, original] of before) {
    const current = readFileSync(path);
    const expected = Buffer.from(
      original
        .toString()
        .replace('.next/types/routes.d.ts', '.next/dev/types/routes.d.ts')
        .replace('.next/types/root-params.d.ts', '.next/dev/types/root-params.d.ts'),
    );
    assert(
      current.equals(original) || current.equals(expected),
      'Unexpected concurrent generated-file change: ' + path,
    );
    if (!current.equals(original)) writeFileSync(path, original);
  }
}
async function ready(url) {
  const deadline = Date.now() + 180000;
  while (Date.now() < deadline) {
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(10000) });
      if (r.ok) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw Error('Owned UI server did not become ready');
}
async function copiedSuite(id, file, substitutions) {
  const original = readFileSync(file, 'utf8');
  let transformed = original;
  for (const [from, to] of substitutions) {
    assert.equal(transformed.split(from).length, 2, 'Exact output-only seam');
    transformed = transformed.replace(from, to);
  }
  const temporary = 'tools/.f011-k24-' + randomUUID() + '.mjs';
  writeFileSync(temporary, transformed, { flag: 'wx' });
  try {
    const record = await command(id, ['--import', 'tsx', temporary]);
    assert.equal(readFileSync(file, 'utf8'), original);
    const execution = {
      ...record,
      original: file,
      originalSha256: hash(file),
      substitutions,
      temporarySha256: createHash('sha256').update(transformed).digest('hex'),
      assertionsChanged: false,
    };
    write(e + '/' + id + '-execution.json', execution);
    return execution;
  } finally {
    unlinkSync(temporary);
  }
}
async function withServer(app, port, host, path, work) {
  const output = createWriteStream(a + '/' + app + '-server.log');
  const child = spawn(
    node,
    [
      pnpm,
      '--filter',
      '@shifaa/' + app,
      'exec',
      'next',
      'dev',
      '--hostname',
      host,
      '-p',
      String(port),
    ],
    {
      windowsHide: true,
      env: { ...process.env, CI: '1', NEXT_PUBLIC_API_BASE_URL: `http://${host}:${port}` },
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );
  child.stdout.pipe(output, { end: false });
  child.stderr.pipe(output, { end: false });
  try {
    await ready(`http://${host}:${port}${path}`);
    return await work();
  } finally {
    if (child.exitCode === null) {
      if (process.platform === 'win32')
        execFileSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], {
          windowsHide: true,
          stdio: 'pipe',
        });
      else child.kill('SIGTERM');
    }
    await new Promise((resolve) => output.end(resolve));
    restoreGenerated();
  }
}
try {
  for (const app of ['patient', 'clinic']) {
    records.push(
      await command(
        'browser-' + app,
        [
          'node_modules/playwright/cli.js',
          'test',
          '--config',
          'tools/feature-011-final-playwright.config.ts',
          '--max-failures=1',
        ],
        {
          SHIFAA_F011_UI_APP: app,
          SHIFAA_F011_UI_EVIDENCE: e + '/browser/' + app,
        },
      ),
    );
    restoreGenerated();
  }
  records.push(
    await withServer('admin', 18219, '127.0.0.1', '/clinical-content', () =>
      copiedSuite('admin-ui', 'tools/run-feature-011-admin-ui-test.mjs', [
        ['e = `${f}/evidence/fresh-implementation/K19`', `e = ${JSON.stringify(e + '/admin')}`],
        ["a = 'artifacts/feature-011/k19'", `a = ${JSON.stringify(a + '/admin')}`],
      ]),
    ),
  );
  records.push(
    await withServer('clinic', 18221, 'localhost', '/clinical-content/status', () =>
      copiedSuite('status-ui', 'tools/run-feature-011-status-ui-test.mjs', [
        [
          "const e = 'specs/011-allergies-clinical-content-governance/evidence/fresh-implementation/K21'",
          `const e = ${JSON.stringify(e + '/status')}`,
        ],
        ["a = 'artifacts/feature-011/k21'", `a = ${JSON.stringify(a + '/status')}`],
      ]),
    ),
  );
  assert.deepEqual(currentPhysicalSourceDigests(), pins);
  const browser = await chromium.launch({ channel: 'chrome' });
  const version = browser.version();
  await browser.close();
  const registryPath =
    'specs/011-allergies-clinical-content-governance/visual-baselines/reference-manifest.json';
  const registry = JSON.parse(readFileSync(registryPath, 'utf8'));
  assert.equal(registry.entries.length, 746);
  assert.equal(new Set(registry.entries.map((r) => r.baselineId + '/' + r.state)).size, 99);
  write(e + '/browser-execution.json', {
    checkpoint: 'K24',
    task: 'T088',
    result: 'PASS_BROWSER_ENGINEERING',
    capturedAt: new Date().toISOString(),
    sourceDigests: pins,
    records,
    browser: version,
    referenceInventory: {
      path: registryPath,
      sha256: hash(registryPath),
      states: 99,
      references: 746,
    },
    routeFamilies: [
      '/records',
      '/patients/:id/summary',
      '/clinical-content',
      '/clinical-content/status',
    ],
    evidenceBoundary:
      'Patient/clinic state transport fixtures; admin/status live native API/non-owner SQL with neutral sources. Browser checks do not replace native assistive-technology or reference-device acceptance.',
    formalAccessibilityAcceptance: 'BLOCKED_OPEN-UX-002',
    formalPerformanceAcceptance: 'BLOCKED_OPEN-TECH-003',
    nativeScreenReaderTested: false,
    referenceDeviceTested: false,
    finalStylingOrPixelLock: false,
    assertionsChanged: false,
    historicalEvidenceOverwritten: false,
    retainedGates: 'UNCHANGED_OPEN',
  });
  console.log(
    'Four-family browser engineering execution PASS; native/reference acceptance not claimed',
  );
} finally {
  restoreGenerated();
}
