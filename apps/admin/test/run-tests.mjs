import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const testDirectory = path.dirname(fileURLToPath(import.meta.url));
const filters = process.argv.slice(2).filter((argument) => argument !== '--');
const files = fs
  .readdirSync(testDirectory)
  .filter((file) => file.endsWith('.test.ts'))
  .filter((file) => filters.length === 0 || filters.some((filter) => file.includes(filter)))
  .map((file) => path.join(testDirectory, file));

if (files.length === 0) {
  console.error(`No admin test file matched: ${filters.join(', ') || '(all)'}.`);
  process.exit(1);
}

const result = spawnSync(process.execPath, ['--test', ...files], { stdio: 'inherit' });
process.exit(result.status ?? 1);
