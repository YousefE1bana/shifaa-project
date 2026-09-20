import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const allSpecs = [
  'tests/e2e/clinic-scheduling-notifications.spec.ts',
  'tests/e2e/clinic-scheduling-discovery-booking.spec.ts',
  'tests/e2e/clinic-scheduling-appointments.spec.ts',
  'tests/e2e/clinic-scheduling-queue.spec.ts',
  'tests/e2e/clinic-scheduling-schedule-delay-absence.spec.ts',
];
const userArgs = process.argv.slice(2).filter((arg) => arg !== '--');
const selector = userArgs[0];
if (selector !== undefined && selector !== 'notifications') {
  throw new Error(`Unknown clinic-scheduling E2E selector: ${selector}`);
}
const specs = selector === 'notifications' ? [allSpecs[0]] : allSpecs;
const tsx = fileURLToPath(new URL('../node_modules/tsx/dist/cli.mjs', import.meta.url));
const result = spawnSync(
  process.execPath,
  [
    tsx,
    '--test',
    '--test-concurrency=1',
    ...specs,
    ...userArgs.slice(selector === undefined ? 0 : 1),
  ],
  { stdio: 'inherit' },
);
if (result.error) throw result.error;
process.exit(result.status ?? 1);
