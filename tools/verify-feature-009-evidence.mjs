import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const featureRoot = path.join(repositoryRoot, 'specs/009-clinic-scheduling-appointments-queue');
const baselineVerifier = path.join(repositoryRoot, 'tools/verify-feature-009-ui-baselines.mjs');
const sourceVersion = 'SHIFAA-F009-P0-SOURCE@1.0.0-candidate';
const manifestDigest = '3ac755cc03c263826d1a07d53e08716e8390857249dbda1eb936833265ac0a4c';
const checkpointSchemas = {
  notifications: { path: 'evidence/notifications/checkpoint.md', checkpoint: 'E' },
  US1: { path: 'evidence/patient/discovery-booking-checkpoint.md', checkpoint: 'F' },
  US2: { path: 'evidence/appointments/checkpoint.md', checkpoint: 'G' },
  US3: { path: 'evidence/queue/checkpoint.md', checkpoint: 'H' },
  US4: { path: 'evidence/schedule/checkpoint.md', checkpoint: 'I' },
};
const reportPaths = {
  security: 'evidence/security/security-report.md',
  ui: 'evidence/ui/acceptance.md',
  privacy: 'evidence/observability/redaction-report.md',
};
const failures = [];

function fail(message) {
  failures.push(message);
}

function verifyBaselineMetadata() {
  const result = spawnSync(process.execPath, [baselineVerifier], {
    cwd: repositoryRoot,
    encoding: 'utf8',
    windowsHide: true,
  });
  if (result.error) {
    fail(`Unable to run the metadata-only baseline verifier: ${result.error.message}`);
    return;
  }
  if (result.status !== 0) {
    fail(`Metadata-only baseline verifier failed:\n${result.stdout ?? ''}${result.stderr ?? ''}`);
    return;
  }
  if (
    !result.stdout.includes('reference_count=492') ||
    !result.stdout.includes('recorded_bytes=29237789')
  )
    fail('Baseline verifier did not report the approved count and recorded byte total.');
  if (
    !result.stdout.includes(`manifest_digest=${manifestDigest}`) ||
    !result.stdout.includes(`source_version=${sourceVersion}`)
  )
    fail('Baseline verifier did not report the approved source version and manifest digest.');
}

function validateCheckpointSchema(value, label) {
  if (!value || typeof value !== 'object') {
    fail(`${label} checkpoint schema must be an object.`);
    return;
  }
  if (value.schemaVersion !== '1.0.0') fail(`${label} checkpoint schemaVersion must be 1.0.0.`);
  if (value.feature !== '009-clinic-scheduling-appointments-queue')
    fail(`${label} checkpoint feature identifier is invalid.`);
  if (!['E', 'F', 'G', 'H', 'I'].includes(value.checkpoint))
    fail(`${label} checkpoint identifier is invalid.`);
  if (value.evidenceClass !== 'synthetic_graduation_engineering')
    fail(`${label} checkpoint must be synthetic graduation-engineering evidence.`);
  if (value.productionApproved !== false)
    fail(`${label} checkpoint must not claim production approval.`);
  if (
    value.baseline?.sourceVersion !== sourceVersion ||
    value.baseline?.manifestDigest !== manifestDigest
  )
    fail(`${label} checkpoint must bind the approved baseline metadata.`);
  if (value.baseline?.referenceCount !== 492 || value.baseline?.recordedBytes !== 29237789)
    fail(`${label} checkpoint baseline count/recorded byte metadata is invalid.`);
  if (JSON.stringify(value.locales) !== JSON.stringify(['ar-EG', 'en-EG']))
    fail(`${label} checkpoint must cover both approved locales.`);
  if (value.routeFamilyCount !== 8)
    fail(`${label} checkpoint must record all eight baseline families.`);
}

function verifyCheckpointDocument(label, descriptor) {
  const filePath = path.join(featureRoot, descriptor.path);
  let text;
  try {
    const stat = fs.statSync(filePath);
    if (!stat.isFile()) throw new Error('not a regular file');
    text = fs.readFileSync(filePath, 'utf8');
  } catch (error) {
    fail(
      `Missing or unreadable Feature 009 ${label} checkpoint: ${descriptor.path} (${error.message}).`,
    );
    return;
  }
  for (const marker of [
    '009-clinic-scheduling-appointments-queue',
    sourceVersion,
    manifestDigest,
    '492',
    '29237789',
    'ar-EG',
    'en-EG',
    'synthetic graduation engineering',
    'production approval: not granted',
  ]) {
    if (!text.toLowerCase().includes(marker.toLowerCase()))
      fail(`${label} checkpoint is missing required metadata marker: ${marker}.`);
  }
}

function parseArguments() {
  const args = process.argv.slice(2);
  const requestedStories = new Set();
  const requestedReports = new Set();
  let selfTest = false;
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === '--self-test') {
      selfTest = true;
      continue;
    }
    if (argument === '--all' || argument === '--release') {
      for (const story of ['US1', 'US2', 'US3', 'US4']) requestedStories.add(story);
      for (const report of Object.keys(reportPaths)) requestedReports.add(report);
      continue;
    }
    if (argument === '--ui' || argument === '--security' || argument === '--privacy') {
      requestedReports.add(argument.slice(2));
      continue;
    }
    if (argument === '--story' || argument === '--checkpoint') {
      const value = args[index + 1];
      if (!value || !Object.hasOwn(checkpointSchemas, value)) {
        fail(`Unsupported Feature 009 checkpoint selector: ${value ?? '(missing)'}.`);
      } else if (value === 'notifications') {
        requestedReports.add('notifications');
      } else {
        requestedStories.add(value);
      }
      index += 1;
      continue;
    }
    if (argument === '--fixtures') continue;
    fail(`Unsupported Feature 009 evidence mode: ${argument}.`);
  }
  return { requestedStories, requestedReports, selfTest };
}

const options = parseArguments();
verifyBaselineMetadata();

if (options.selfTest) {
  for (const [label, descriptor] of Object.entries(checkpointSchemas))
    validateCheckpointSchema(
      {
        schemaVersion: '1.0.0',
        feature: '009-clinic-scheduling-appointments-queue',
        checkpoint: descriptor.checkpoint,
        evidenceClass: 'synthetic_graduation_engineering',
        productionApproved: false,
        baseline: {
          sourceVersion,
          manifestDigest,
          referenceCount: 492,
          recordedBytes: 29237789,
        },
        locales: ['ar-EG', 'en-EG'],
        routeFamilyCount: 8,
      },
      label,
    );
}

for (const story of options.requestedStories)
  verifyCheckpointDocument(story, checkpointSchemas[story]);
for (const report of options.requestedReports) {
  if (report === 'notifications') {
    verifyCheckpointDocument(report, checkpointSchemas.notifications);
    continue;
  }
  const filePath = path.join(featureRoot, reportPaths[report]);
  if (!filePath) {
    fail(`No evidence path is registered for report: ${report}.`);
    continue;
  }
  if (report === 'ui') {
    try {
      if (!fs.statSync(filePath).isFile()) throw new Error('not a regular file');
      const text = fs.readFileSync(filePath, 'utf8');
      for (const marker of [sourceVersion, manifestDigest, 'ar-EG', 'en-EG', 'structural/manual'])
        if (!text.toLowerCase().includes(marker.toLowerCase()))
          fail(`UI evidence is missing required metadata marker: ${marker}.`);
    } catch (error) {
      fail(
        `Missing or unreadable Feature 009 UI evidence: ${reportPaths[report]} (${error.message}).`,
      );
    }
  } else {
    try {
      if (!fs.statSync(filePath).isFile()) throw new Error('not a regular file');
      fs.readFileSync(filePath, 'utf8');
    } catch (error) {
      fail(
        `Missing or unreadable Feature 009 ${report} evidence: ${reportPaths[report]} (${error.message}).`,
      );
    }
  }
}

if (failures.length > 0) {
  console.error('Feature 009 evidence verification failed:');
  for (const failure of [...new Set(failures)].sort()) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(
  `Feature 009 evidence verifier ready: baseline_metadata=verified, source_version=${sourceVersion}, manifest_digest=${manifestDigest}, reference_count=492, recorded_bytes=29237789, families=8, locales=ar-EG+en-EG, checkpoint_schemas=${Object.keys(checkpointSchemas).length}, png_io=none, stories=${options.requestedStories.size === 0 ? 'none' : [...options.requestedStories].sort().join(',')}, reports=${options.requestedReports.size === 0 ? 'none' : [...options.requestedReports].sort().join(',')}, self_test=${options.selfTest ? 'passed' : 'not-requested'}.`,
);
