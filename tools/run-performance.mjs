import { spawnSync } from 'node:child_process';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const image =
  'grafana/k6:2.1.0@sha256:65c920dc067d5e2e00befbf982af6ad6ad0117034e8b1c65817c7975c52d4669';
const baseUrl =
  process.env.SHIFAA_BASE_URL ??
  (process.platform === 'linux'
    ? 'http://127.0.0.1:3000/v1'
    : 'http://host.docker.internal:3000/v1');

const args = ['run', '--rm'];
if (process.platform === 'linux') args.push('--network', 'host');
args.push(
  '-e',
  `SHIFAA_BASE_URL=${baseUrl}`,
  '-e',
  `SHIFAA_SYNTHETIC_OTP=${process.env.SHIFAA_SYNTHETIC_OTP ?? '246810'}`,
  '-v',
  `${repoRoot}:/workspace`,
  '-w',
  '/workspace',
  image,
  'run',
  'services/api/test/performance/identity-onboarding.k6.js',
);

const result = spawnSync('docker', args, { cwd: repoRoot, stdio: 'inherit', shell: false });
if (result.error) {
  console.error(`Unable to start the pinned k6 container: ${result.error.message}`);
  process.exit(1);
}
process.exit(result.status ?? 1);
