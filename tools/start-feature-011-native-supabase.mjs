import { testRuntime } from './verification-database.mjs';
import { randomUUID } from 'node:crypto';
import {
  closeSync,
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const workspaceRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const pinnedVersion = '2.113.0';
const configPath = (root) => join(root, 'supabase', 'config.toml');
const lockPath = (root) =>
  join(
    root,
    'artifacts',
    'feature-011',
    'pr-remediation',
    'startup',
    '.native-supabase-start.lock',
  );
const backupPath = (root) => `${lockPath(root)}.config-backup`;

function assertPinnedCli(root) {
  const packagePath = join(root, 'node_modules', 'supabase', 'package.json');
  const { version } = JSON.parse(readFileSync(packagePath, 'utf8'));
  if (version !== pinnedVersion)
    throw new Error(
      `Native start requires pinned Supabase CLI ${pinnedVersion}; found ${version}.`,
    );
}

function setStartupSqlEnabled(config, enabled) {
  let section = '';
  const found = new Map([
    ['db.migrations', 0],
    ['db.seed', 0],
  ]);
  const lines = config.match(/[^\r\n]*(?:\r\n|\n|\r|$)/g) ?? [];
  const updated = lines.map((line) => {
    const header = /^\s*\[([^\]]+)\]\s*(?:#.*)?(?:\r?\n)?$/.exec(line);
    if (header) section = header[1];
    if (!found.has(section)) return line;
    const setting = /^([ \t]*enabled[ \t]*=[ \t]*)true([ \t]*(?:#.*)?)(\r?\n)?$/.exec(line);
    if (!setting) return line;
    found.set(section, found.get(section) + 1);
    return `${setting[1]}${enabled ? 'true' : 'false'}${setting[2]}${setting[3] ?? ''}`;
  });
  for (const [name, count] of found) {
    if (count !== 1) throw new Error(`Expected one enabled = true setting in [${name}].`);
  }
  return updated.join('');
}

function acquireLock(root) {
  const path = lockPath(root);
  mkdirSync(dirname(path), { recursive: true });
  let descriptor;
  try {
    descriptor = openSync(path, 'wx');
  } catch (error) {
    if (error.code === 'EEXIST')
      throw new Error(
        `Native Supabase start lock already exists at ${path}; inspect it before manual removal.`,
      );
    throw error;
  }
  const token = `${process.pid}:${randomUUID()}`;
  try {
    writeFileSync(descriptor, `${token}\n`);
  } catch (error) {
    closeSync(descriptor);
    throw error;
  }
  return { path, token, descriptor };
}

function releaseLock(lock) {
  closeSync(lock.descriptor);
  const content = readFileSync(lock.path, 'utf8');
  if (content !== `${lock.token}\n`)
    throw new Error(
      `Native Supabase start lock changed while held at ${lock.path}; leaving it for review.`,
    );
  unlinkSync(lock.path);
}

async function startWithMigrationsDisabled(root, runCli) {
  const path = configPath(root);
  const originalConfig = readFileSync(path);
  const originalText = originalConfig.toString('utf8');
  if (!/^project_id = "shifaa-local-supabase"$/m.test(originalText))
    throw new Error(
      'Native Supabase start requires the worktree-owned shifaa-local-supabase config.',
    );
  let startError;
  // Retain exact recovery bytes if the process is interrupted during startup.
  writeFileSync(backupPath(root), originalConfig, { flag: 'wx' });
  try {
    writeFileSync(path, setStartupSqlEnabled(originalText, false));
    await runCli(['start', '--exclude', 'vector']);
  } catch (error) {
    startError = error;
  } finally {
    try {
      writeFileSync(path, originalConfig);
      unlinkSync(backupPath(root));
    } catch (restoreError) {
      if (startError)
        throw new AggregateError(
          [startError, restoreError],
          'Native startup and config restoration failed.',
        );
      throw restoreError;
    }
  }
  if (startError) throw startError;
}

export async function startFeature011NativeSupabase({ root = workspaceRoot, runCli } = {}) {
  if (!runCli) {
    testRuntime('supabase');
    return;
  }
  root = resolve(root);
  assertPinnedCli(root);
  const executeCli = runCli;
  const lock = acquireLock(root);
  let startError;
  try {
    await startWithMigrationsDisabled(root, executeCli);
  } catch (error) {
    startError = error;
  }
  const failures = startError ? [startError] : [];
  if (existsSync(backupPath(root))) {
    closeSync(lock.descriptor);
    failures.push(
      new Error(
        `Native config recovery is required; retain ${lock.path} and ${backupPath(root)} for review.`,
      ),
    );
  } else {
    try {
      releaseLock(lock);
    } catch (lockError) {
      failures.push(lockError);
    }
  }
  if (failures.length === 1) throw failures[0];
  if (failures.length > 1)
    throw new AggregateError(
      failures,
      'Native startup, config restoration, or lock release failed.',
    );
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url))
  await startFeature011NativeSupabase();
