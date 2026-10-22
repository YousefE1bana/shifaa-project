import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const patientRoot = join(root, 'apps', 'patient');
const patientRequire = createRequire(join(patientRoot, 'package.json'));
const patientPackage = JSON.parse(await readFile(join(patientRoot, 'package.json'), 'utf8'));
const dependencies = {
  ...patientPackage.dependencies,
  ...patientPackage.devDependencies,
};

const expoPackagePath = patientRequire.resolve('expo/package.json');
const expoPackage = JSON.parse(await readFile(expoPackagePath, 'utf8'));
const bundledVersions = JSON.parse(
  await readFile(join(dirname(expoPackagePath), 'bundledNativeModules.json'), 'utf8'),
);
const expoRequire = createRequire(expoPackagePath);
const semver = expoRequire('semver');

const packageNames = [
  'expo',
  ...Object.keys(dependencies).filter((name) => Object.hasOwn(bundledVersions, name)),
].filter((name, index, values) => values.indexOf(name) === index);

for (const packageName of packageNames) {
  const declaredRange = dependencies[packageName];
  assert.equal(
    typeof declaredRange,
    'string',
    `${packageName} must have an explicit patient-app dependency range`,
  );
  const installedPackage = JSON.parse(
    await readFile(patientRequire.resolve(`${packageName}/package.json`), 'utf8'),
  );
  assert.ok(
    semver.satisfies(installedPackage.version, declaredRange, { includePrerelease: true }),
    `${packageName}@${installedPackage.version} does not satisfy declared range ${declaredRange}`,
  );
  const bundledRange = bundledVersions[packageName];
  if (bundledRange) {
    assert.ok(
      semver.satisfies(installedPackage.version, bundledRange, { includePrerelease: true }),
      `${packageName}@${installedPackage.version} does not satisfy expo@${expoPackage.version} bundled range ${bundledRange}`,
    );
  }
}

// The Xcode tooling uses only the CommonJS uuid.v4 API. Exercise its actual
// consumer after the parent-scoped security override, without generating iOS files.
const pluginsRequire = createRequire(expoRequire.resolve('@expo/config-plugins/package.json'));
const project = pluginsRequire('xcode').project('in-memory-compatibility.pbxproj');
project.hash = { project: { objects: {} } };
const generatedIds = Array.from({ length: 100 }, () => project.generateUuid());
for (const id of generatedIds) assert.match(id, /^[A-F0-9]{24}$/);
assert.equal(new Set(generatedIds).size, generatedIds.length);

const routerRequire = createRequire(patientRequire.resolve('expo-router/package.json'));
const queryString = routerRequire('query-string');
for (const [encoded, expected] of [
  ['name=%D8%B4%D9%81%D8%A7%D8%A1', { name: 'شفاء' }],
  ['literal=a%2Bb&space=a+b', { literal: 'a+b', space: 'a b' }],
  ['tag=a&tag=b', { tag: ['a', 'b'] }],
  ['empty=&flag', { empty: '', flag: null }],
  ['broken=%C0%AF&percent=%', { broken: '%C0%AF', percent: '%' }],
]) {
  assert.deepEqual({ ...queryString.parse(encoded) }, expected);
}
const callback = queryString.parseUrl(
  'exp://127.0.0.1:8081/--/callback?redirect_uri=https%3A%2F%2Flocalhost%2Freturn%3Fa%3D1%26b%3D2#part+one',
  { parseFragmentIdentifier: true },
);
assert.deepEqual(
  { ...callback, query: { ...callback.query } },
  {
    url: 'exp://127.0.0.1:8081/--/callback',
    query: { redirect_uri: 'https://localhost/return?a=1&b=2' },
    fragmentIdentifier: 'part one',
  },
);

// Keep the malformed-input regression in a bounded child so a vulnerable
// transitive decoder cannot hang the verification process (Issue #502).
const malformedProbe = spawnSync(
  process.execPath,
  [
    '--input-type=commonjs',
    '-e',
    `const assert = require('node:assert/strict');
     const queryString = require(process.argv[1]);
     const malformed = '%FF'.repeat(2048);
     assert.equal(queryString.parse('value=' + malformed).value, malformed);`,
    routerRequire.resolve('query-string'),
  ],
  { encoding: 'utf8', timeout: 5000, maxBuffer: 1024 * 1024 },
);
assert.ifError(malformedProbe.error);
assert.equal(malformedProbe.status, 0, malformedProbe.stderr);

// Exercise the real patched RSA consumer; the upstream advisory is still
// reported by the unchanged audit gate until its release/disposition is resolved.
const signatures = spawnSync(
  process.execPath,
  [
    '--max-old-space-size=128',
    '--test',
    '--test-timeout=20000',
    join(root, 'tools/verify-forge-signatures.test.mjs'),
  ],
  { encoding: 'utf8', timeout: 25000, maxBuffer: 1024 * 1024 },
);
assert.ifError(signatures.error);
assert.equal(signatures.status, 0, signatures.stdout + signatures.stderr);

process.stdout.write(
  `Expo dependency verification passed: ${packageNames.length} installed patient dependencies satisfy declared ranges and the expo@${expoPackage.version} bundled native-module map; Xcode UUID, Expo query decoding and RSA signature checks passed.\n`,
);
