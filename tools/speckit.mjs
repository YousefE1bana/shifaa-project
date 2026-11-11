import { existsSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const { version } = JSON.parse(readFileSync(resolve(root, '.specify/tooling-source.json'), 'utf8'));
if (!/^\d+\.\d+\.\d+$/.test(version)) throw new Error('Invalid pinned Spec Kit version.');
const bin = resolve(
  root,
  '.tmp',
  `spec-kit-${version}`,
  process.platform === 'win32' ? 'Scripts' : 'bin',
);
const python = resolve(bin, process.platform === 'win32' ? 'python.exe' : 'python');
const specify = resolve(bin, process.platform === 'win32' ? 'specify.exe' : 'specify');
if (!existsSync(python) || !existsSync(specify)) {
  console.error(
    'Project-local Spec Kit is missing. Follow docs/TEAM-HANDOFF.md; no global fallback or automatic install is used.',
  );
  process.exitCode = 1;
} else {
  const check = spawnSync(
    python,
    [resolve(root, 'tools/speckit_tooling.py'), '--cli-python', python],
    { cwd: root, encoding: 'utf8', shell: false },
  );
  if (check.status !== 0 || check.error) {
    console.error('Pinned Spec Kit metadata/origin validation failed; CLI was not invoked.');
    process.exitCode = 1;
  } else {
    const result = spawnSync(specify, process.argv.slice(2), {
      cwd: process.cwd(),
      stdio: 'inherit',
      shell: false,
    });
    process.exitCode = result.status ?? 1;
  }
}
