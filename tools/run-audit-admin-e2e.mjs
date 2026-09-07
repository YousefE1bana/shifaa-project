import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const requested = new Set(process.argv.slice(2).filter((argument) => argument !== '--'));
const selected = [];
if (requested.size === 0 || requested.has('summary')) selected.push('audit-admin-summary.spec.ts');
if (requested.size === 0 || requested.has('audit')) selected.push('audit-admin-events.spec.ts');
if (requested.size === 0 || requested.has('export')) selected.push('audit-export.spec.ts');
if (selected.length === 0) {
  console.error(`Unsupported Feature 008 E2E selection: ${[...requested].join(', ')}.`);
  process.exit(1);
}
const files = selected.map((file) => path.join(repositoryRoot, 'tests/e2e', file));
const missing = files.filter((file) => !fs.existsSync(file));
if (missing.length > 0) {
  console.error(
    `Missing Feature 008 E2E file: ${missing.map((file) => path.relative(repositoryRoot, file)).join(', ')}.`,
  );
  process.exit(1);
}
const tsxCli = path.join(repositoryRoot, 'node_modules/tsx/dist/cli.mjs');
const result = spawnSync(process.execPath, [tsxCli, '--test', '--test-concurrency=1', ...files], {
  cwd: repositoryRoot,
  stdio: 'inherit',
});
process.exit(result.status ?? 1);
