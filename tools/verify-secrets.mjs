import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const failures = [];
const textExtensions = new Set([
  '.cjs',
  '.css',
  '.env',
  '.example',
  '.graphql',
  '.html',
  '.js',
  '.json',
  '.jsx',
  '.md',
  '.mjs',
  '.mts',
  '.ps1',
  '.sql',
  '.ts',
  '.tsx',
  '.txt',
  '.yaml',
  '.yml',
]);
const secretPatterns = [
  ['private key', /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/],
  ['AWS access key', /\bAKIA[0-9A-Z]{16}\b/],
  ['GitHub token', /\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{36,255}\b/],
  ['OpenAI key', /\bsk-(?:proj-)?[A-Za-z0-9_-]{20,}\b/],
  ['Slack token', /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/],
  ['Google API key', /\bAIza[0-9A-Za-z_-]{35}\b/],
  ['hard-coded bearer token', /Authorization\s*[:=]\s*["']Bearer\s+[A-Za-z0-9._~-]{20,}["']/i],
];
const sourceFixtureRoots = [
  'apps/',
  'services/',
  'packages/',
  'infra/db/seeds/',
  'infra/db/migrations/',
];

function candidateFiles() {
  const output = execFileSync(
    'git',
    ['ls-files', '--cached', '--others', '--exclude-standard', '-z'],
    {
      cwd: repoRoot,
      encoding: 'utf8',
    },
  );
  return output.split('\0').filter(Boolean);
}

function isTextFile(file) {
  const base = path.basename(file);
  return textExtensions.has(path.extname(file).toLowerCase()) || base.startsWith('.env');
}

function hasValidEgyptianDate(identifier) {
  if (!/^[23]\d{13}$/.test(identifier)) return false;
  const century = identifier[0] === '2' ? 1900 : 2000;
  const year = century + Number(identifier.slice(1, 3));
  const month = Number(identifier.slice(3, 5));
  const day = Number(identifier.slice(5, 7));
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
  );
}

for (const relativeFile of candidateFiles()) {
  const normalized = relativeFile.replaceAll('\\', '/');
  if (!isTextFile(normalized)) continue;
  const absolute = path.join(repoRoot, relativeFile);
  if (!fs.existsSync(absolute) || fs.statSync(absolute).size > 2_000_000) continue;
  const contents = fs.readFileSync(absolute, 'utf8');

  if (
    /^\.env(?:\.|$)/.test(path.basename(normalized)) &&
    path.basename(normalized) !== '.env.example'
  ) {
    failures.push(`${normalized}: local environment files must not be committed.`);
  }

  for (const [label, pattern] of secretPatterns) {
    if (pattern.test(contents)) failures.push(`${normalized}: detected ${label}.`);
  }

  if (sourceFixtureRoots.some((root) => normalized.startsWith(root))) {
    for (const match of contents.matchAll(/(?<!\d)([23]\d{13})(?!\d)/g)) {
      if (hasValidEgyptianDate(match[1])) {
        failures.push(
          `${normalized}: contains a structurally valid Egyptian National ID fixture; use an intentionally invalid synthetic value.`,
        );
      }
    }
  }
}

if (failures.length > 0) {
  console.error('Secret and synthetic-fixture verification failed:');
  for (const failure of [...new Set(failures)].sort()) console.error(`- ${failure}`);
  process.exit(1);
}

console.log('Secret and synthetic-fixture verification passed.');
