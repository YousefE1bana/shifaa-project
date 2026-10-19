import { testDockerExec, testEvidenceDirectory } from './verification-database.mjs';
// K22 preserves accepted evidence and records exact disposable-copy changes:
// output redirection and current approved preflight bindings only.
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import {
  readdirSync,
  readFileSync,
  mkdirSync,
  writeFileSync,
  unlinkSync,
  existsSync,
  copyFileSync,
} from 'node:fs';
import { spawn, execFileSync } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  verifyFeature011Contracts,
  currentEvidenceRoot,
  prReviewEvidenceRoot,
} from './verify-feature-011-contracts.mjs';
import { runtimeManifest, runtimes } from './run-feature-011-postgres-test.mjs';
import { readDocumentationSuccessor } from './feature-011-documentation-successor.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
process.chdir(root);
// Resolve lazily: unit imports remain pure; executable suites require the run owner.
export const evidence = process.env.SHIFAA_VERIFY_CONTEXT
  ? testEvidenceDirectory('feature-011/composition')
  : null;
const logs = evidence + '/logs';
const hash = (p) => createHash('sha256').update(readFileSync(p)).digest('hex');
const write = (p, v) => {
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, JSON.stringify(v, null, 2) + '\n');
};
const testFiles = (dir) =>
  readdirSync(dir, { recursive: true })
    .filter(
      (p) =>
        /feature-011.*\.(?:test|spec)\.tsx?$/.test(p.replaceAll('\\', '/')) ||
        (dir.includes('feature-011') && /\.test\.ts$/.test(p)),
    )
    .map((p) => (dir + '/' + p).replaceAll('\\', '/'));
export function inventory() {
  const dirs = [
    'packages/core/src/feature-011',
    'packages/contracts/src',
    'packages/api-client/src',
    'packages/i18n/src',
    'services/api/src',
    'apps/patient/test',
    'apps/clinic/test',
    'apps/admin/test',
    'tests/e2e',
  ];
  const suites = dirs.flatMap(testFiles);
  const tooling = readdirSync('tools')
    .filter((p) =>
      /^(?:(?:start-|reset-)?feature-011.*|verify-feature-011-scope)\.test\.mjs$/.test(p),
    )
    .map((p) => 'tools/' + p);
  return {
    suites,
    tooling,
    hashes: Object.fromEntries([...suites, ...tooling].map((p) => [p, hash(p)])),
  };
}
export async function command(id, args, env = {}) {
  assert.ok(evidence, 'Verified test environment required before composition');
  mkdirSync(logs, { recursive: true });
  const path = logs + '/' + id + '.log';
  if (existsSync(path)) copyFileSync(path, path + '.attempt-' + hash(path).slice(0, 12));
  writeFileSync(path, '');
  const { createWriteStream } = await import('node:fs');
  const out = createWriteStream(path, { flags: 'a' });
  console.log('START ' + id);
  const child = spawn(process.execPath, args, {
    cwd: root,
    env: { ...process.env, ...env },
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.stdout.pipe(out, { end: false });
  child.stderr.pipe(out, { end: false });
  const status = await new Promise((done, reject) => {
    child.once('error', reject);
    child.once('close', done);
  });
  await new Promise((done) => out.end(done));
  if (status !== 0) throw new Error(id + ' failed (' + status + '); inspect ' + path);
  console.log('PASS ' + id);
  return {
    id,
    result: 'PASS',
    command: [process.execPath, ...args],
    log: { path, sha256: hash(path) },
  };
}
export async function copiedSuite(file, id, outputPattern, tail = '', args = [], preflight = []) {
  const original = readFileSync(file, 'utf8');
  const target = evidence + '/reruns/' + id;
  const matches = [
    ...original.matchAll(
      new RegExp(
        outputPattern.source,
        outputPattern.flags.includes('g') ? outputPattern.flags : outputPattern.flags + 'g',
      ),
    ),
  ];
  assert.equal(matches.length, 1, id + ' requires one exact output-only substitution');
  const prefix = matches[0][0].startsWith('const f =')
    ? "const f = 'specs/011-allergies-clinical-content-governance'; "
    : '';
  const binding = prefix ? 'e' : matches[0][0].match(/^const\s+(\w+)\s*=/)?.[1];
  assert.ok(binding, 'Exact output binding required');
  let transformed =
    original.replace(outputPattern, `${prefix}const ${binding} = ${JSON.stringify(target)};`) +
    tail;
  for (const [from, to] of preflight) {
    assert.equal(transformed.split(from).length, 2, 'Exact approved-current preflight seam');
    transformed = transformed.replace(from, to);
  }
  const temporary = resolve(root, 'tools', '.f011-k22-' + randomUUID() + '.mjs');
  const record = {
    original: file,
    originalSha256: hash(file),
    substitution: matches[0][0],
    output: target,
    temporarySha256: createHash('sha256').update(transformed).digest('hex'),
    testAssertionsChanged: false,
    preflightSubstitutions: preflight,
  };
  writeFileSync(temporary, transformed, { flag: 'wx' });
  try {
    const result = await command(id, ['--import', 'tsx', temporary, ...args]);
    write(target + '/execution.json', { ...result, ...record });
    return { ...result, output: target, transformation: record };
  } finally {
    unlinkSync(temporary);
    assert.equal(hash(file), record.originalSha256, 'Original suite changed');
  }
}
const output = /const f = 'specs\/011-allergies-clinical-content-governance',\s*e = [^;]+;/;
const standaloneOutput = /const e = [^;]+;/;
async function units() {
  const records = [];
  const pnpm = resolve(dirname(process.execPath), 'node_modules/corepack/dist/pnpm.js');
  for (const pkg of ['core', 'contracts', 'api-client', 'i18n'])
    records.push(await command('package-' + pkg, [pnpm, '--filter', '@shifaa/' + pkg, 'test']));
  records.push(await command('package-api', [pnpm, '--filter', '@shifaa/api', 'test']));
  for (const app of ['patient', 'clinic', 'admin'])
    records.push(await command('package-' + app, [pnpm, '--filter', '@shifaa/' + app, 'test']));
  const found = inventory();
  records.push(await command('tooling', ['--test', ...found.tooling]));
  records.push(
    await command('native-handoff', [
      '--import',
      'tsx',
      '--test',
      'tests/e2e/feature-011-handoff.test.ts',
    ]),
  );
  return records;
}
async function browser() {
  const records = [];
  const cli = resolve('node_modules/playwright/cli.js');
  for (const app of ['patient', 'clinic']) {
    const generated = 'apps/clinic/next-env.d.ts';
    const before = app === 'clinic' ? readFileSync(generated) : null;
    try {
      records.push(
        await command(
          'browser-' + app,
          [
            cli,
            'test',
            '--config',
            'tools/feature-011-composition-playwright.config.ts',
            '--max-failures=1',
          ],
          { SHIFAA_F011_UI_APP: app, SHIFAA_F011_UI_EVIDENCE: evidence + '/browser/' + app },
        ),
      );
    } finally {
      if (before) {
        const current = readFileSync(generated);
        const expected = Buffer.from(
          before.toString().replaceAll('"./.next/types/', '"./.next/dev/types/'),
        );
        assert.ok(
          current.equals(before) || current.equals(expected),
          'Unexpected concurrent generated-file drift',
        );
        if (!current.equals(before)) writeFileSync(generated, before);
      }
    }
  }
  return records;
}
export async function physical(kind) {
  const file = 'tools/feature-011-physical-' + kind + '.mjs';
  const target = evidence + '/reruns/physical-' + kind;
  const original = readFileSync(file, 'utf8');
  const substitutions =
    kind === 'green'
      ? [
          [
            'const path = `${evidenceRoot}/${name}`;',
            `const path = ${JSON.stringify(target)} + '/' + name;`,
          ],
          [
            'mkdirSync(resolve(root, evidenceRoot), { recursive: true });',
            `mkdirSync(resolve(root, ${JSON.stringify(target)}), { recursive: true });`,
          ],
        ]
      : [
          [
            "const runtimeEvidenceDir = resolve(root, evidenceRoot, 'runtime');",
            `const runtimeEvidenceDir = resolve(root, ${JSON.stringify(target)}, 'runtime');`,
          ],
        ];
  // Accepted K07/K17 evidence owns its historical completion boundary. A fresh
  // K22 run checks the current accepted prefix without rewriting those sources.
  const greenSource = 'tools/feature-011-physical-green.mjs';
  const greenOriginal = readFileSync(greenSource, 'utf8');
  const lifecycleSubstitutions = [
    [
      'for (let i = 0; i < 92; i++)',
      `const firstUnchecked = map.tasks.findIndex(t => t.status === 'UNCHECKED');
  const acceptedBoundary = firstUnchecked < 0 ? 92 : firstUnchecked;
  assert.ok(acceptedBoundary >= 79 && acceptedBoundary >= boundary, 'K21/current accepted prefix required');
  for (let i = 0; i < 92; i++)`,
    ],
    ["i < boundary ? 'CHECKED' : 'UNCHECKED'", "i < acceptedBoundary ? 'CHECKED' : 'UNCHECKED'"],
  ];
  let greenAdapted = greenOriginal;
  for (const [from, to] of lifecycleSubstitutions) {
    assert.equal(greenAdapted.split(from).length, 2, 'Exact historical lifecycle preflight');
    greenAdapted = greenAdapted.replace(from, to);
  }
  const helper = resolve('tools', '.f011-k22-' + randomUUID() + '.mjs');
  let transformed = kind === 'green' ? greenAdapted : original;
  if (kind === 'races') {
    const from = "from './feature-011-physical-green.mjs'";
    assert.equal(transformed.split(from).length, 2);
    transformed = transformed.replace(from, `from './${helper.split(/[\\/]/).at(-1)}'`);
    writeFileSync(helper, greenAdapted, { flag: 'wx' });
  }
  for (const [from, to] of substitutions) {
    assert.equal(transformed.split(from).length, 2, 'Exact output-only redirection');
    transformed = transformed.replace(from, to);
  }
  transformed += `\nconst proof = await runPhysical${kind === 'green' ? 'Green' : 'Races'}();\nwriteFileSync(${JSON.stringify(target + '/proof.json')}, JSON.stringify(proof,null,2)+'\\n');\nconsole.log('Complete physical ${kind} both-runtime PASS');\n`;
  const temporary = resolve('tools', '.f011-k22-' + randomUUID() + '.mjs');
  writeFileSync(temporary, transformed, { flag: 'wx' });
  try {
    const result = await command('physical-' + kind, ['--import', 'tsx', temporary]);
    write(target + '/execution.json', {
      ...result,
      original: file,
      originalSha256: hash(file),
      substitutions,
      lifecycleSubstitutions,
      lifecycleSource: { path: greenSource, sha256: hash(greenSource) },
      lifecyclePreflightAdaptedToCurrentAcceptedPrefix: true,
      physicalAssertionsChanged: false,
    });
    return { ...result, output: target };
  } finally {
    unlinkSync(temporary);
    if (kind === 'races') unlinkSync(helper);
    assert.equal(readFileSync(file, 'utf8'), original);
    assert.equal(readFileSync(greenSource, 'utf8'), greenOriginal);
  }
}
async function races() {
  const records = [];
  for (const [id, file, pattern] of [
    ['allergy-api', 'tools/run-feature-011-allergy-api-test.mjs', output],
    ['verify-api', 'tools/run-feature-011-verify-api-test.mjs', standaloneOutput],
    [
      'create-api',
      'tools/run-feature-011-content-api-test.mjs',
      /const e = f \+ '\/evidence\/fresh-implementation\/K15';/,
    ],
    [
      'sign-api',
      'tools/run-feature-011-sign-api-test.mjs',
      /const e = f \+ '\/evidence\/fresh-implementation\/K16';/,
    ],
    [
      'publish-api',
      'tools/run-feature-011-publish-api-test.mjs',
      /const e =\s*f \+\s*'\/evidence\/fresh-implementation\/' \+\s*\(process\.argv\.includes\('--k18-revalidation'\) \? 'K18\/k17-revalidation' : 'K17'\);/,
    ],
  ])
    records.push(await copiedSuite(file, id, pattern));
  records.push(await physical('races'));
  return records;
}
export async function security(prior = []) {
  // A stopped setup attempt may retain fresh, hash-verified earlier suites.
  const records = [...prior];
  if (!prior.length) records.push(await physical('green'));
  else {
    assert.ok(prior.length <= 5);
    assert.deepEqual(
      prior.map((r) => r.id),
      ['physical-green', 'evidence', 'core-equivalence', 'review', 'status'].slice(0, prior.length),
    );
  }
  for (const [id, file, pattern] of [
    ['evidence', 'tools/run-feature-011-evidence-test.mjs', output],
    ['core-equivalence', 'tools/run-feature-011-core-equivalence-test.mjs', output],
    ['review', 'tools/run-feature-011-review-test.mjs', output],
    ['status', 'tools/run-feature-011-status-test.mjs', /const evidence =\s*[^;]+;/],
  ])
    if (!records.some((r) => r.id === id))
      records.push(
        await copiedSuite(
          file,
          id,
          pattern,
          '',
          [],
          id === 'core-equivalence'
            ? [
                [
                  "import { verifyFeature011Contracts } from './verify-feature-011-contracts.mjs';",
                  "import { verifyFeature011Contracts, currentEvidenceRoot } from './verify-feature-011-contracts.mjs';",
                ],
                [
                  "const stage = read(\n  f + '/evidence/fresh-implementation/K08/prerequisite-remediation/stage-assertion.json',\n);",
                  "const stage = read(currentEvidenceRoot(root) + '/stage-assertion.json');",
                ],
                [
                  '  ...stage.sourceDigests,\n  ...unlock.sourceDigests,',
                  `  ...unlock.sourceDigests,\n  ...producers.sourceDigests,\n  ...stage.sourceDigests,`,
                ],
                [
                  'const paths = [',
                  `const producers = read(${JSON.stringify(evidence + '/reruns/evidence/evidence-proof.json')});
assert.equal(producers.result, 'PASS');
assert.deepEqual(producers.results.map(r => r.runtime), ['shifaa-local-postgres', 'shifaa-local-supabase']);
for (const r of producers.results) assert.equal(r.result, 'PASS');
const paths = [`,
                ],
              ]
            : [],
        ),
      );
  records.push(
    await command('native-abuse', [
      '--import',
      'tsx',
      'tools/feature-011-composition-security.mjs',
    ]),
  );
  return records;
}
async function atomic() {
  const { atomicBoundaryProof } = await import('./feature-011-composition-atomic.mjs');
  return [
    await copiedSuite('tools/run-feature-011-protection-test.mjs', 'protection', output),
    await atomicBoundaryProof({ command, evidence }),
    await copiedSuite(
      'tools/run-feature-011-storage-test.mjs',
      'deferred-obligations',
      /const output =\s*process\.argv\[3\][\s\S]*?: 'artifacts\/feature-011\/k05-k06';/,
      '',
      ['k05'],
    ),
  ];
}
async function main() {
  const stage = process.argv[2] ?? '--all';
  assert(
    ['--inventory', '--units', '--browser', '--races', '--security', '--atomic', '--all'].includes(
      stage,
    ),
    'Unknown stage',
  );
  assert.ok(evidence, 'Verified test environment required before composition');
  const found = inventory();
  assert(found.suites.length > 20);
  assert(found.tooling.length > 0);
  if (stage === '--inventory') {
    write(evidence + '/inventory.json', found);
    console.log(JSON.stringify({ suites: found.suites.length, tooling: found.tooling.length }));
    return;
  }
  const parity = await verifyFeature011Contracts();
  assert.equal(parity.result, 'PASS', parity.failures.join('\n'));
  const manifests = runtimes.map((r) => ({
    ...runtimeManifest(r),
    serverVersion: testDockerExec(
      [
        'exec',
        r.container,
        'psql',
        '-X',
        '-qAt',
        '-U',
        r.user,
        '-d',
        r.adminDatabase,
        '-c',
        'SHOW server_version',
      ],
      { encoding: 'utf8', windowsHide: true },
    )
      .trim()
      .split(' ')[0],
  }));
  assert.deepEqual(
    manifests.map((m) => m.serverVersion),
    ['17.11', '17.6'],
  );
  const records = [];
  for (const [flag, run] of [
    ['--units', units],
    ['--browser', browser],
    ['--races', races],
    ['--security', security],
    ['--atomic', atomic],
  ])
    if (stage === '--all' || stage === flag) records.push(...(await run()));
  assert.deepEqual(inventory().hashes, found.hashes, 'Test drift during run');
  const after = await verifyFeature011Contracts();
  assert.equal(after.result, 'PASS');
  assert.deepEqual(after.inputDigests, parity.inputDigests);
  write(evidence + '/composition' + (stage === '--all' ? '' : stage.replace('--', '-')) + '.json', {
    result: 'PASS',
    task: { '--races': 'T081', '--security': 'T082', '--atomic': 'T083' }[stage] ?? 'T080',
    stage,
    inventory: found,
    runtimes: manifests,
    records,
    parityPins: Object.keys(parity.inputDigests).length,
    failMissingRuntime: true,
    expectedVectorsRegenerated: false,
    sharedReset: false,
    capturedAt: new Date().toISOString(),
  });
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
