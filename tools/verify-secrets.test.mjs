import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const scanner = fileURLToPath(new URL('./verify-secrets.mjs', import.meta.url));

test('scans deep untracked paths with Git long paths disabled locally', () => {
  const fixtureParent = fs.realpathSync(os.tmpdir());
  const fixture = fs.mkdtempSync(path.join(fixtureParent, 'shifaa-secret-scan-'));
  function run(command, args) {
    const result = spawnSync(command, args, {
      cwd: fixture,
      encoding: 'utf8',
      timeout: 10_000,
      env: { ...process.env, GIT_OPTIONAL_LOCKS: '0' },
    });
    assert.ifError(result.error);
    return result;
  }
  function git(...args) {
    const result = run('git', args);
    assert.equal(result.status, 0, result.stderr);
    return result;
  }
  try {
    git('init', '--quiet');
    git('config', '--local', 'core.longpaths', 'false');
    fs.mkdirSync(path.join(fixture, 'tools'));
    fs.copyFileSync(scanner, path.join(fixture, 'tools/verify-secrets.mjs'));
    const relative = path.join(...['a', 'b', 'c', 'd'].map((c) => c.repeat(70)), 'fixture.txt');
    const target = path.join(fixture, relative);
    assert.ok(target.length > 260, 'fixture must exceed the Windows legacy path limit');
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, 'Disposable synthetic text.\n');
    const clean = run(process.execPath, ['tools/verify-secrets.mjs']);
    assert.equal(clean.status, 0, clean.stderr);

    // A nonfunctional marker exercises detection without retaining any key material.
    fs.writeFileSync(target, ['-----BEGIN ', 'PRIVATE KEY-----\n'].join(''));
    const rejected = run(process.execPath, ['tools/verify-secrets.mjs']);
    assert.equal(rejected.status, 1, rejected.stdout + rejected.stderr);
    assert.equal(clean.stderr, '', 'enumeration must not skip deep directories');
    assert.ok(rejected.stderr.includes(relative.replaceAll('\\', '/')));
    assert.match(rejected.stderr, /detected private key/);
    assert.equal(git('config', '--local', '--get', 'core.longpaths').stdout.trim(), 'false');
  } finally {
    const resolved = fs.realpathSync(fixture);
    assert.equal(path.dirname(resolved), fixtureParent);
    assert.ok(path.basename(resolved).startsWith('shifaa-secret-scan-'));
    fs.rmSync(resolved, { recursive: true, force: false });
  }
});
