import assert from 'node:assert/strict';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { testRuntime, testDockerSync, runTestSupabase } from './verification-database.mjs';

export function databaseCommand(args) {
  const [action, ...rest] = args;
  if (action === 'exec') {
    assert.equal(rest[0], 'psql');
    const result = testDockerSync(['compose', 'exec', '-T', 'postgres', ...rest], {
      stdio: 'inherit',
    });
    if (result.error) throw result.error;
    return result.status ?? 1;
  }
  if (action === 'reset') {
    const target = testRuntime('postgres');
    // Only the newly created invocation-owned server is reset. No volume or
    // Compose project is stopped, and no shared URL participates in this path.
    for (const sql of [
      'DROP DATABASE IF EXISTS shifaa WITH (FORCE);',
      'CREATE DATABASE shifaa OWNER shifaa_owner;',
    ]) {
      const result = testDockerSync(
        [
          'exec',
          '-i',
          target.container,
          'psql',
          '-X',
          '-v',
          'ON_ERROR_STOP=1',
          '-U',
          target.user,
          '-d',
          'postgres',
          '-c',
          sql,
        ],
        { stdio: 'inherit' },
      );
      if (result.error) throw result.error;
      if (result.status !== 0) return result.status ?? 1;
    }
    return 0;
  }
  if (action === 'native') {
    assert.ok(
      ['status', 'db', 'migration', '--version'].includes(rest[0]),
      'Native creation/teardown belongs to the run owner',
    );
    runTestSupabase(rest, { stdio: 'inherit' });
    return 0;
  }
  throw new Error('Unknown guarded database command');
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    process.exitCode = databaseCommand(process.argv.slice(2));
  } catch {
    console.error(
      'BLOCKED: verified pnpm verify disposable database context required. No shared fallback.',
    );
    process.exitCode = 2;
  }
}
