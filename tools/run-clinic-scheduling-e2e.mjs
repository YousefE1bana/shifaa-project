import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import process from 'node:process';

const root = process.cwd();

const allSpecs = [
  'tests/e2e/clinic-scheduling-notifications.spec.ts',
  'tests/e2e/clinic-scheduling-discovery-booking.spec.ts',
  'tests/e2e/clinic-scheduling-appointments.spec.ts',
  'tests/e2e/clinic-scheduling-queue.spec.ts',
  'tests/e2e/clinic-scheduling-schedule-delay-absence.spec.ts',
];
const userArgs = process.argv.slice(2).filter((arg) => arg !== '--');
const selector = userArgs[0];
const allowedSelectors = new Set([
  'notifications',
  'discovery-booking',
  'appointments',
  'queue',
  'schedule-delay-absence',
]);
if (selector !== undefined && !allowedSelectors.has(selector)) {
  throw new Error(`Unknown clinic-scheduling E2E selector: ${selector}`);
}
if (selector === undefined) {
  const selectors = [
    'notifications',
    'discovery-booking',
    'appointments',
    'queue',
    'schedule-delay-absence',
  ];
  const runnerPath = fileURLToPath(import.meta.url);
  for (const selected of selectors) {
    const result = spawnSync(process.execPath, [runnerPath, selected, ...userArgs], {
      cwd: root,
      env: process.env,
      stdio: 'inherit',
    });
    if (result.error) throw result.error;
    if (result.status !== 0) process.exit(result.status ?? 1);
  }
  process.exit(0);
}
if (selector === 'discovery-booking' && process.env['SHIFAA_F009_PROVISIONED'] !== '1') {
  const result = spawnSync(
    process.execPath,
    ['tools/run-clinic-scheduling-postgres-test.mjs', 'discovery-booking'],
    {
      cwd: root,
      env: process.env,
      encoding: 'utf8',
      stdio: 'inherit',
    },
  );
  if (result.error) throw result.error;
  process.exit(result.status ?? 1);
}
if (selector === 'appointments' && process.env['SHIFAA_F009_PROVISIONED'] !== '1') {
  const result = spawnSync(
    process.execPath,
    ['tools/run-clinic-scheduling-postgres-test.mjs', 'appointments'],
    {
      cwd: root,
      env: process.env,
      encoding: 'utf8',
      stdio: 'inherit',
    },
  );
  if (result.error) throw result.error;
  process.exit(result.status ?? 1);
}
if (selector === 'queue' && process.env['SHIFAA_F009_PROVISIONED'] !== '1') {
  const result = spawnSync(
    process.execPath,
    ['tools/run-clinic-scheduling-postgres-test.mjs', 'queue'],
    { cwd: root, env: process.env, encoding: 'utf8', stdio: 'inherit' },
  );
  if (result.error) throw result.error;
  process.exit(result.status ?? 1);
}
if (selector === 'schedule-delay-absence' && process.env['SHIFAA_F009_PROVISIONED'] !== '1') {
  const result = spawnSync(
    process.execPath,
    ['tools/run-clinic-scheduling-postgres-test.mjs', 'schedule-delay-absence'],
    { cwd: root, env: process.env, encoding: 'utf8', stdio: 'inherit' },
  );
  if (result.error) throw result.error;
  process.exit(result.status ?? 1);
}
const selectedIndex = allSpecs.indexOf(
  {
    notifications: 'tests/e2e/clinic-scheduling-notifications.spec.ts',
    'discovery-booking': 'tests/e2e/clinic-scheduling-discovery-booking.spec.ts',
    appointments: 'tests/e2e/clinic-scheduling-appointments.spec.ts',
    queue: 'tests/e2e/clinic-scheduling-queue.spec.ts',
    'schedule-delay-absence': 'tests/e2e/clinic-scheduling-schedule-delay-absence.spec.ts',
  }[selector],
);
const specs = selectedIndex >= 0 ? [allSpecs[selectedIndex]] : allSpecs;
const tsx = fileURLToPath(new URL('../node_modules/tsx/dist/cli.mjs', import.meta.url));
const result = spawnSync(
  process.execPath,
  [tsx, '--test', '--test-concurrency=1', ...specs, ...userArgs.slice(1)],
  { stdio: 'inherit' },
);
if (result.error) throw result.error;
process.exit(result.status ?? 1);
