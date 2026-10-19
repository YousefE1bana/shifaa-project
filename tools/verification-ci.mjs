// CI uses the same resource owner as pnpm verify, never fixed Compose projects.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createVerificationEnvironment } from './verification-test-environment.mjs';

// Only source locations and closed prerequisite codes may leave startup errors.
// Never print exception messages, assertion values, argv or subprocess stderr.
export function ciFailureLocations(error) {
  const locations = [];
  for (let depth = 0; error && depth < 6; depth++, error = error.cause) {
    for (const match of String(error.stack ?? '').matchAll(
      /(?:tools[\\/])([a-z0-9-]+\.mjs:\d+:\d+)/g,
    ))
      if (!locations.includes(match[1])) locations.push(match[1]);
  }
  return locations.join(', ') || 'no source location';
}

export async function verifyCiDatabase(
  scope,
  { createEnvironment = createVerificationEnvironment, run = spawnSync } = {},
) {
  const suites = { database: ['db:migrate', 'db:test', 'db:rls-test'], native: ['supabase:test'] };
  assert.ok(Object.hasOwn(suites, scope), 'Unknown CI database suite');
  const root = path.resolve(import.meta.dirname, '..');
  const owner = await createEnvironment(root);
  try {
    for (const script of suites[scope]) {
      const result = run('corepack', ['pnpm', script], {
        cwd: root,
        env: { ...process.env },
        stdio: 'inherit',
        windowsHide: true,
      });
      if (result.error) throw result.error;
      if (result.status !== 0) return result.status ?? 1;
    }
    return 0;
  } finally {
    await owner.close();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    process.exitCode = await verifyCiDatabase(process.argv[2]);
  } catch (error) {
    console.error(
      'BLOCKED: disposable CI database ownership/startup/teardown failed; resources preserved when ownership is uncertain.',
    );
    console.error(`Safety failure locations: ${ciFailureLocations(error)}`);
    process.exitCode = 2;
  }
}
