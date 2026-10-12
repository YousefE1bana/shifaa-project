import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { startFeature011NativeSupabase } from './start-feature-011-native-supabase.mjs';

function temporaryProject() {
  const root = mkdtempSync(join(tmpdir(), 'shifaa-f011-start-'));
  mkdirSync(join(root, 'supabase'), { recursive: true });
  mkdirSync(join(root, 'node_modules', 'supabase'), { recursive: true });
  mkdirSync(join(root, 'node_modules', 'supabase', 'dist'), { recursive: true });
  writeFileSync(join(root, 'node_modules', 'supabase', 'package.json'), '{"version":"2.113.0"}\n');
  writeFileSync(join(root, 'supabase', 'config.toml'), configBytes);
  return root;
}

const configBytes = Buffer.from(
  '# preserve comments and CRLF\r\nproject_id = "shifaa-local-supabase"\r\n\r\n[db.migrations]\r\nenabled = true\r\nschema_paths = ["./schemas/*.sql"]\r\n\r\n[db.seed]\r\nenabled = true\r\nsql_paths = ["./seed.sql"]\r\n\r\n[api]\r\nenabled = true\r\n',
);
const startupLockPath = (root) =>
  join(
    root,
    'artifacts',
    'feature-011',
    'pr-remediation',
    'startup',
    '.native-supabase-start.lock',
  );

test('native start skips CLI migrations and seeds, then restores exact config bytes', async () => {
  const root = temporaryProject();
  try {
    let cliArgs;
    await startFeature011NativeSupabase({
      root,
      runCli: (args) => {
        cliArgs = args;
        const config = readFileSync(join(root, 'supabase', 'config.toml'), 'utf8');
        assert.match(config, /\[db\.migrations\]\r\nenabled = false/);
        assert.match(config, /\[db\.seed\]\r\nenabled = false/);
        assert.match(config, /schema_paths = \["\.\/schemas\/\*\.sql"\]/);
        assert.match(config, /sql_paths = \["\.\/seed\.sql"\]/);
      },
    });
    assert.deepEqual(cliArgs, ['start', '--exclude', 'vector']);
    assert.deepEqual(readFileSync(join(root, 'supabase', 'config.toml')), configBytes);
    assert.equal(existsSync(startupLockPath(root)), false);
    assert.equal(existsSync(startupLockPath(root) + '.config-backup'), false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('native start default runner invokes the worktree-local CLI with startup arguments', async () => {
  const root = temporaryProject();
  const cliPath = join(root, 'node_modules', 'supabase', 'dist', 'supabase.js');
  writeFileSync(
    cliPath,
    `import { writeFileSync } from 'node:fs';\nwriteFileSync(new URL('./invocation.json', import.meta.url), JSON.stringify({args:process.argv.slice(2),cwd:process.cwd()}));\n`,
  );
  try {
    await startFeature011NativeSupabase({ root });
    assert.deepEqual(
      JSON.parse(
        readFileSync(join(root, 'node_modules', 'supabase', 'dist', 'invocation.json'), 'utf8'),
      ),
      {
        args: ['start', '--exclude', 'vector'],
        cwd: root,
      },
    );
    assert.deepEqual(readFileSync(join(root, 'supabase', 'config.toml')), configBytes);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('native start restores exact config bytes when the CLI fails', async () => {
  const root = temporaryProject();
  try {
    await assert.rejects(
      startFeature011NativeSupabase({
        root,
        runCli: () => {
          assert.notDeepEqual(readFileSync(join(root, 'supabase', 'config.toml')), configBytes);
          throw new Error('simulated CLI failure');
        },
      }),
      /simulated CLI failure/,
    );
    assert.deepEqual(readFileSync(join(root, 'supabase', 'config.toml')), configBytes);
    assert.equal(existsSync(startupLockPath(root)), false);
    assert.equal(existsSync(startupLockPath(root) + '.config-backup'), false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('native start rejects an existing lock without changing config or removing the lock', async () => {
  const root = temporaryProject();
  try {
    const lockPath = startupLockPath(root);
    mkdirSync(join(root, 'artifacts', 'feature-011', 'pr-remediation', 'startup'), {
      recursive: true,
    });
    writeFileSync(lockPath, 'owner requires manual recovery\n');
    await assert.rejects(
      startFeature011NativeSupabase({ root, runCli: () => assert.fail('CLI must not run') }),
      /lock already exists/,
    );
    assert.deepEqual(readFileSync(join(root, 'supabase', 'config.toml')), configBytes);
    assert.equal(readFileSync(lockPath, 'utf8'), 'owner requires manual recovery\n');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('native start requires the pinned local CLI before editing config', async () => {
  const root = temporaryProject();
  try {
    writeFileSync(
      join(root, 'node_modules', 'supabase', 'package.json'),
      '{"version":"2.114.0"}\n',
    );
    await assert.rejects(
      startFeature011NativeSupabase({ root, runCli: () => assert.fail() }),
      /pinned Supabase CLI 2\.113\.0/,
    );
    assert.deepEqual(readFileSync(join(root, 'supabase', 'config.toml')), configBytes);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
