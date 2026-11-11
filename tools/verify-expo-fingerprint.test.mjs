import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const patientRequire = createRequire(join(root, 'apps/patient/package.json'));
const expoRequire = createRequire(patientRequire.resolve('expo/package.json'));
const fingerprintRequire = createRequire(expoRequire.resolve('@expo/fingerprint/package.json'));
const { createFingerprintAsync } = expoRequire('@expo/fingerprint');

test('patched fingerprint preserves ignore filtering and detects native source changes', async () => {
  const project = await mkdtemp(join(tmpdir(), 'shifaa-fingerprint-'));
  await mkdir(join(project, 'native/ignored'), { recursive: true });
  await writeFile(
    join(project, 'package.json'),
    JSON.stringify({ name: 'synthetic-fingerprint', version: '1.0.0', private: true }),
  );
  await writeFile(join(project, 'native/source.txt'), 'first');
  await writeFile(join(project, 'native/.native-config'), 'included dotfile');
  await writeFile(join(project, 'native/ignored/build.txt'), 'ignored');
  const options = {
    silent: true,
    platforms: [],
    // Disable discovery subprocesses: this fixture tests hashing/filtering only.
    useRNCoreAutolinkingFromExpo: true,
    ignorePaths: ['native/ignored/**'],
    extraSources: [{ type: 'dir', filePath: 'native', reasons: ['synthetic regression'] }],
  };
  const first = await createFingerprintAsync(project, options);
  assert.equal(first.sources.length, 1);
  assert.equal(first.sources[0].filePath, 'native');
  await writeFile(join(project, 'native/ignored/build.txt'), 'ignored change');
  assert.equal((await createFingerprintAsync(project, options)).hash, first.hash);
  await writeFile(join(project, 'native/source.txt'), 'changed native source');
  const changed = await createFingerprintAsync(project, options);
  assert.notEqual(changed.hash, first.hash);
  await writeFile(join(project, 'native/.native-config'), 'changed included dotfile');
  assert.notEqual((await createFingerprintAsync(project, options)).hash, changed.hash);
});

test('fingerprint glob rejects an already cancelled traversal', async () => {
  const { glob } = fingerprintRequire('glob');
  await assert.rejects(glob('**/*', { cwd: root, signal: AbortSignal.abort() }), {
    name: 'AbortError',
  });
});
