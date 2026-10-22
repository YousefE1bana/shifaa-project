import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

test('root integration discovery selects the active checkout without archived worktree copies', () => {
  const fixture = mkdtempSync(join(tmpdir(), 'shifaa-vitest-discovery-'));
  try {
    const active = 'services/api/test/identity-continuity-sessions.integration.test.ts';
    for (const relative of [active, `.worktrees/archived/${active}`]) {
      const path = join(fixture, relative);
      mkdirSync(dirname(path), { recursive: true });
      writeFileSync(path, 'throw new Error("Discovery must not execute database fixtures");\n');
    }
    const discovered = JSON.parse(
      execFileSync(
        process.execPath,
        [
          join(root, 'node_modules/vitest/vitest.mjs'),
          'list',
          active,
          '--root',
          fixture,
          '--config',
          join(root, 'vitest.config.mts'),
          '--filesOnly',
          '--json',
        ],
        { cwd: root, encoding: 'utf8', windowsHide: true },
      ),
    );
    assert.deepEqual(
      discovered.map(({ file }) => resolve(file)),
      [resolve(fixture, active)],
    );
  } finally {
    rmSync(fixture, { recursive: true, force: true });
  }
});

for (const nested of [false, true]) {
  test(`Playwright discovers the ${nested ? 'worktree' : 'primary'} checkout without archived suites`, () => {
    const fixture = mkdtempSync(join(tmpdir(), 'shifaa-playwright-discovery-'));
    try {
      const checkout = nested ? join(fixture, '.worktrees/active') : fixture;
      const active = 'tests/e2e/feature-010-accessibility.spec.ts';
      const path = join(checkout, active);
      mkdirSync(dirname(path), { recursive: true });
      writeFileSync(
        path,
        `import { test } from ${JSON.stringify(join(root, 'node_modules/playwright/test.js'))};\n` +
          `test('active checkout discovery', () => {});\n`,
      );
      const archived = join(checkout, '.worktrees/archived', active);
      mkdirSync(dirname(archived), { recursive: true });
      writeFileSync(archived, 'throw new Error("Archived checkout must not be imported");\n');
      const matrix = join(checkout, 'tools/feature-010-accessibility-playwright.config.ts');
      mkdirSync(dirname(matrix), { recursive: true });
      writeFileSync(
        matrix,
        readFileSync(
          join(root, 'tools/feature-010-accessibility-playwright.config.ts'),
          'utf8',
        ).replace(
          "'playwright/test'",
          JSON.stringify(join(root, 'node_modules/playwright/test.js')),
        ),
      );
      const config = join(checkout, 'tools/playwright.config.ts');
      writeFileSync(
        config,
        `import matrix from ${JSON.stringify(matrix)};\n` +
          `export default { ...matrix, webServer: undefined };\n`,
      );
      const listed = execFileSync(
        process.execPath,
        [join(root, 'node_modules/playwright/cli.js'), 'test', '--config', config, '--list'],
        {
          cwd: checkout,
          encoding: 'utf8',
          windowsHide: true,
          env: { ...process.env, SHIFAA_F010_ACCESSIBILITY_APP: 'patient' },
        },
      );
      assert.match(listed, /Total: 1 test in 1 file/);
    } finally {
      rmSync(fixture, { recursive: true, force: true });
    }
  });
}
