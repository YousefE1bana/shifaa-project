import { spawnSync } from 'node:child_process';
const result = spawnSync('node', ['tools/run-clinic-scheduling-postgres-test.mjs', 'migration'], {
  cwd: process.cwd(),
  encoding: 'utf8',
  stdio: 'inherit',
});
if (result.error) throw result.error;
if (result.status !== 0) process.exit(result.status ?? 1);
console.log(
  'clinic-scheduling migration: PASS clean=1 upgrade=1 pre_feature_absence=1 seed_survival=1 flags=asserted',
);
