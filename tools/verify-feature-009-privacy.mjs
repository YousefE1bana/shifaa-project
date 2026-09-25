import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const featureEvidence = path.join(
  repositoryRoot,
  'specs/009-clinic-scheduling-appointments-queue/evidence',
);
const actualDirectory = path.join(featureEvidence, 'ui/actual');
const sourceRoots = [
  'apps/clinic/src',
  'apps/patient/app',
  'apps/patient/src',
  'services/api/src',
  'services/worker/src',
  'packages/api-client/src',
  'packages/contracts/src',
  'packages/core/src',
  'packages/design-system/src',
  'packages/i18n/src',
  'packages/observability/src',
  'infra/db/migrations',
  'supabase/migrations',
];
const ignoredDirectories = new Set([
  '__tests__',
  'coverage',
  'dist',
  'fixtures',
  'node_modules',
  'test',
  'tests',
]);
const sourceExtensions = new Set([
  '.css',
  '.js',
  '.json',
  '.mjs',
  '.sql',
  '.ts',
  '.tsx',
  '.yaml',
  '.yml',
]);

// Exact canaries injected by the focused Feature 009 telemetry test. That test
// source and other test fixtures are deliberately outside the release scan.
const sentinels = {
  patient_name: 'Patient Name Sentinel',
  destination: 'patient009@example.invalid',
  raw_reason: 'raw reason must never escape',
  coordinate: '30.0444,31.2357',
  token: 'Bearer clinic-token-sentinel',
  appointment_detail: '09:30 appointment detail sentinel',
  high_cardinality_identifier: '93000000-0000-4000-8000-000000000001',
};
const sentinelBytes = Object.entries(sentinels).map(([name, value]) => [name, Buffer.from(value)]);
const failures = [];

function relative(filePath) {
  return path.relative(repositoryRoot, filePath).replaceAll('\\', '/');
}

function walk(root, includeFile) {
  if (!fs.existsSync(root)) {
    failures.push(`Missing release scan root: ${relative(root)}.`);
    return [];
  }
  const files = [];
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    const filePath = path.join(root, entry.name);
    if (entry.isSymbolicLink()) {
      failures.push(`Symlink cannot be counted as a release scan file: ${relative(filePath)}.`);
      continue;
    }
    if (entry.isDirectory()) {
      if (!ignoredDirectories.has(entry.name)) files.push(...walk(filePath, includeFile));
    } else if (entry.isFile() && includeFile(filePath)) {
      files.push(filePath);
    }
  }
  return files;
}

function hits(buffer) {
  return sentinelBytes.filter(([, bytes]) => buffer.includes(bytes)).map(([name]) => name);
}

for (const [name, bytes] of sentinelBytes) {
  if (!hits(Buffer.concat([Buffer.from('before'), bytes, Buffer.from('after')])).includes(name))
    failures.push(`In-memory sentinel self-check failed for ${name}.`);
}

const sourceFiles = sourceRoots.flatMap((root) =>
  walk(path.join(repositoryRoot, root), (filePath) => {
    const name = path.basename(filePath);
    return (
      sourceExtensions.has(path.extname(name)) &&
      !/\.(?:test|spec|fixture)\.[cm]?[jt]sx?$/.test(name)
    );
  }),
);
const evidenceFiles = walk(featureEvidence, () => true);
const scanned = [...new Set([...sourceFiles, ...evidenceFiles])].sort();
let totalBytes = 0;
for (const filePath of scanned) {
  const bytes = fs.readFileSync(filePath);
  totalBytes += bytes.length;
  for (const name of hits(bytes))
    failures.push(`Prohibited ${name} sentinel in release surface ${relative(filePath)}.`);
}

let mappedCaptures = 0;
let actualPngs = 0;
try {
  const manifest = JSON.parse(fs.readFileSync(path.join(actualDirectory, 'capture-manifest.json')));
  mappedCaptures = Array.isArray(manifest.captures) ? manifest.captures.length : 0;
  const imageNames = fs.readdirSync(actualDirectory).filter((name) => name.endsWith('.png'));
  actualPngs = imageNames.length;
  if (mappedCaptures !== 492 || actualPngs !== 492)
    failures.push(
      `Expected 492 mapped actual PNGs, found ${mappedCaptures} rows and ${actualPngs} files.`,
    );
  const mappedNames = new Set(manifest.captures?.map((capture) => capture.path));
  if (
    mappedNames.size !== mappedCaptures ||
    imageNames.some((name) => !mappedNames.has(name)) ||
    [...mappedNames].some((name) => typeof name !== 'string' || path.basename(name) !== name)
  )
    failures.push('Actual PNG filenames do not exactly match the capture manifest.');
} catch (error) {
  failures.push(`Actual capture inventory is unreadable: ${error.message}.`);
}
if (scanned.some((filePath) => filePath.includes(`${path.sep}visual-baselines${path.sep}`)))
  failures.push('The privacy scan must not read approved visual-baseline files.');

if (failures.length > 0) {
  console.error('Feature 009 privacy scan failed:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}
console.log(
  `Feature 009 privacy scan: privacy_scan=passed, source_files=${sourceFiles.length}, evidence_files=${evidenceFiles.length}, actual_pngs=${actualPngs}, mapped_captures=${mappedCaptures}, bytes_scanned=${totalBytes}, sentinel_classes=${sentinelBytes.length}, sentinel_hits=0, in_memory_self_check=passed, test_fixtures=excluded, reference_png_io=none, image_ocr=not_performed.`,
);
