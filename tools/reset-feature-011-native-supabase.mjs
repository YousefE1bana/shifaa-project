import { runTestSupabase } from './verification-database.mjs';
import { execFileSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { resetFeature011NativeSupabase } from './feature-011-native-supabase-bootstrap.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

export function runProjectPnpm(args, capture = false) {
  if (args[0] === 'exec' && args[1] === 'supabase')
    return runTestSupabase(args.slice(2), {
      encoding: capture ? 'utf8' : undefined,
      stdio: capture ? ['ignore', 'pipe', 'pipe'] : 'inherit',
    });
  const command = process.platform === 'win32' ? 'cmd.exe' : 'corepack';
  const commandArgs =
    process.platform === 'win32'
      ? ['/d', '/s', '/c', `corepack pnpm ${args.join(' ')}`]
      : ['pnpm', ...args];
  return execFileSync(command, commandArgs, {
    cwd: root,
    encoding: capture ? 'utf8' : undefined,
    stdio: capture ? ['ignore', 'pipe', 'ignore'] : 'inherit',
    windowsHide: true,
  });
}

export async function runFeature011NativeSupabaseTests({
  reset = resetFeature011NativeSupabase,
  runPnpm = runProjectPnpm,
} = {}) {
  await reset(runPnpm);
  runPnpm(['--filter', '@shifaa/api', 'test:supabase']);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url))
  await runFeature011NativeSupabaseTests();
