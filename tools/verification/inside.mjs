// Only executes inside the disposable, offline container; never import on host.
import { cpSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { ordinary, isolatedCategories } from './profiles.mjs';

const results = [];
function command(program, args) {
  return spawnSync(program, args, {
    cwd: '/work',
    env: {
      PATH: '/usr/local/bin:/usr/bin:/bin',
      HOME: '/tmp/home',
      COREPACK_HOME: '/opt/corepack',
      COREPACK_ENABLE_NETWORK: '0',
      COREPACK_DEFAULT_TO_LATEST: '0',
      CI: 'true',
      NODE_ENV: 'test',
      EXPO_OFFLINE: '1',
      EXPO_NO_TELEMETRY: '1',
      TURBO_TELEMETRY_DISABLED: '1',
      GIT_CONFIG_NOSYSTEM: '1',
    },
    stdio: 'inherit',
  }).status;
}

try {
  cpSync('/opt/deps', '/work', { recursive: true, verbatimSymlinks: true });
  cpSync('/source/tree', '/work', { recursive: true });
  if (command('git', ['init', '-q']) !== 0) throw new Error('git-init');
  if (command('git', ['bundle', 'unbundle', '/source/history.bundle']) !== 0)
    throw new Error('history');
  const { head } = JSON.parse(readFileSync('/source/identity.json'));
  if (!/^[a-f0-9]{40}$/.test(head) || command('git', ['update-ref', 'HEAD', head]) !== 0)
    throw new Error('source-identity');
  if (command('git', ['add', '--all']) !== 0) throw new Error('snapshot-index');
  for (const script of ordinary) {
    const exitCode = command('pnpm', ['run', script]);
    results.push({ script, status: exitCode === 0 ? 'PASS' : 'FAIL', exitCode });
  }
} catch {
  results.push({ script: 'sandbox-bootstrap', status: 'FAIL' });
}
const pass = ordinary.every((script) =>
  results.some((result) => result.script === script && result.status === 'PASS'),
);
console.log(
  JSON.stringify({
    profile: 'ordinary-offline',
    status: pass ? 'PASS' : 'FAIL',
    comprehensive: false,
    results,
    notExecuted: [
      ...ordinary.filter((script) => !results.some((result) => result.script === script)),
      ...isolatedCategories,
    ],
  }),
);
process.exitCode = pass ? 0 : 1;
