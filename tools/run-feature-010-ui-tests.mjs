import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const generatedTypes = resolve(root, 'apps/clinic/next-env.d.ts');
const before = readFileSync(generatedTypes);
const listOnly = process.argv.includes('--list');

// The existing matrix includes all prior F010 live route regressions. Run each
// app once, with its own server, rather than duplicating every older config.
try {
  for (const app of ['patient', 'clinic']) {
    const execution = spawnSync(
      process.execPath,
      [
        resolve(root, 'node_modules/playwright/cli.js'),
        'test',
        '--config',
        'tools/feature-010-accessibility-playwright.config.ts',
        ...(listOnly ? ['--list'] : []),
      ],
      {
        cwd: root,
        env: { ...process.env, SHIFAA_F010_ACCESSIBILITY_APP: app },
        stdio: 'inherit',
        windowsHide: true,
      },
    );
    if (execution.error || execution.status !== 0)
      throw new Error(`Feature 010 ${app} live matrix failed (${execution.status}).`);
  }
} finally {
  const after = readFileSync(generatedTypes);
  if (!after.equals(before)) {
    // Next dev rewrites only these generated import paths. Preserve any other
    // change and fail loudly instead of overwriting concurrent user work.
    const expectedDev = before.toString('utf8').replaceAll('./.next/types/', './.next/dev/types/');
    assert.equal(
      after.toString('utf8').replaceAll('\r\n', '\n'),
      expectedDev.replaceAll('\r\n', '\n'),
      'unexpected next-env change; preserved',
    );
    writeFileSync(generatedTypes, before);
  }
}
