import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const featureRoot = path.join(repositoryRoot, 'specs/009-clinic-scheduling-appointments-queue');
const baselineVerifier = path.join(repositoryRoot, 'tools/verify-feature-009-ui-baselines.mjs');
const privacyVerifier = path.join(repositoryRoot, 'tools/verify-feature-009-privacy.mjs');
const scopeVerifier = path.join(repositoryRoot, 'tools/verify-feature-009-scope.mjs');
const contractVerifier = path.join(repositoryRoot, 'tools/verify-feature-009-contract.mjs');
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
const expectedOperations = [
  'searchDoctors',
  'listDoctorAvailability',
  'createSchedule',
  'updateSchedule',
  'createScheduleException',
  'createAppointment',
  'getAppointment',
  'listAppointments',
  'cancelAppointment',
  'rescheduleAppointment',
  'checkInAppointment',
  'getQueue',
  'getMyQueuePosition',
  'callQueueEntry',
  'reorderQueueEntry',
  'completeQueueEntry',
  'sendDoctorDelay',
  'declareDoctorAbsence',
];
const expectedAppointmentStates = [
  'requested',
  'confirmed',
  'checked_in',
  'in_queue',
  'in_consultation',
  'completed',
  'cancelled',
  'no_show',
  'reschedule_required',
];
const expectedQueueStates = ['waiting', 'called', 'in_service', 'completed', 'removed'];
const expectedGates = [
  'OPEN-UX-002',
  'OPEN-TECH-002',
  'OPEN-TECH-003',
  'OPEN-PRODUCT-001',
  'OPEN-VENDOR-002',
  'OPEN-LEGAL-001',
  'OPEN-LEGAL-002',
  'OPEN-LEGAL-007',
];

function fail(message) {
  failures.push(message);
}

function sameMembers(actual, expected) {
  return (
    Array.isArray(actual) &&
    actual.length === expected.length &&
    new Set(actual).size === expected.length &&
    expected.every((value) => actual.includes(value))
  );
}

function verifyManifest() {
  let manifest;
  try {
    manifest = JSON.parse(
      fs.readFileSync(path.join(featureRoot, 'evidence/manifest.json'), 'utf8'),
    );
  } catch (error) {
    fail(`Synthetic evidence manifest is missing or invalid: ${error.message}.`);
    return;
  }
  if (
    manifest.schemaVersion !== '1.0.0' ||
    manifest.feature !== '009-clinic-scheduling-appointments-queue' ||
    manifest.evidenceClass !== 'synthetic_graduation_engineering' ||
    manifest.productionApproved !== false ||
    !/^[a-f0-9]{40}$/.test(manifest.implementationBaselineCommit ?? '')
  )
    fail(
      'Evidence manifest schema, synthetic classification, production denial, or baseline commit is invalid.',
    );
  else {
    const commit = spawnSync(
      'git',
      ['cat-file', '-e', `${manifest.implementationBaselineCommit}^{commit}`],
      { cwd: repositoryRoot, encoding: 'utf8', windowsHide: true },
    );
    if (commit.error || commit.status !== 0)
      fail('Evidence manifest implementation baseline is not a local Git commit.');
  }
  if (
    manifest.baseline?.sourceVersion !== sourceVersion ||
    manifest.baseline?.manifestDigest !== manifestDigest ||
    manifest.baseline?.referenceCount !== 492 ||
    manifest.baseline?.recordedBytes !== 29237789 ||
    manifest.baseline?.referencePngIo !== 'none'
  )
    fail('Evidence manifest approved reference metadata binding is invalid.');
  if (
    manifest.uiActuals?.captureIndex !== 'ui_actual_index' ||
    manifest.uiActuals?.tupleCount !== 492 ||
    manifest.uiActuals?.routeFamilies !== 8 ||
    !sameMembers(manifest.uiActuals?.locales, ['ar-EG', 'en-EG'])
  )
    fail('Evidence manifest actual UI capture binding is invalid.');
  if (
    !sameMembers(manifest.scope?.operations, expectedOperations) ||
    !sameMembers(manifest.scope?.appointmentStates, expectedAppointmentStates) ||
    !sameMembers(manifest.scope?.queueStates, expectedQueueStates) ||
    !sameMembers(manifest.scope?.paymentMethods, ['cash_on_arrival']) ||
    manifest.scope?.productionSmsEnabled !== false
  )
    fail('Evidence manifest 18-operation, state, payment, or SMS scope is invalid.');
  if (!sameMembers(manifest.retainedGates, expectedGates))
    fail('Evidence manifest retained OPEN gates are incomplete or changed.');
  if (
    !Array.isArray(manifest.limitations) ||
    manifest.limitations.length < 5 ||
    !manifest.limitations.some((item) => item.includes('No live dashboard/alert')) ||
    !manifest.limitations.some((item) => item.includes('no production approval'))
  )
    fail('Evidence manifest omits required synthetic/operational limitations.');
  if (
    !manifest.environment ||
    !['os', 'node', 'pnpm', 'postgres', 'browser', 'source'].every(
      (key) =>
        typeof manifest.environment[key] === 'string' && manifest.environment[key].length > 0,
    )
  )
    fail('Evidence manifest environment versions and provenance are incomplete.');

  const artifacts = manifest.artifacts;
  if (!artifacts || typeof artifacts !== 'object' || Object.keys(artifacts).length < 18)
    fail('Evidence manifest artifact inventory is incomplete.');
  else
    for (const [id, artifact] of Object.entries(artifacts)) {
      const relative = artifact?.path;
      if (
        typeof relative !== 'string' ||
        !/^[\w./-]+$/.test(relative) ||
        relative.startsWith('/') ||
        relative.includes('..') ||
        relative.endsWith('.png') ||
        relative.includes('/visual-baselines/references/')
      ) {
        fail(`Evidence artifact ${id} has an unsafe path or attempts reference PNG IO.`);
        continue;
      }
      if (!/^[a-f0-9]{64}$/.test(artifact.sha256 ?? '')) {
        fail(`Evidence artifact ${id} has no SHA-256 digest.`);
        continue;
      }
      try {
        const bytes = fs.readFileSync(path.join(repositoryRoot, relative));
        if (createHash('sha256').update(bytes).digest('hex') !== artifact.sha256)
          fail(`Evidence artifact ${id} SHA-256 mismatch: ${relative}.`);
      } catch (error) {
        fail(`Evidence artifact ${id} missing/unreadable: ${relative} (${error.message}).`);
      }
    }

  const commands = manifest.commands;
  if (!commands || typeof commands !== 'object' || Object.keys(commands).length < 20)
    fail('Evidence manifest command inventory is incomplete.');
  else
    for (const [id, command] of Object.entries(commands)) {
      if (
        typeof command?.command !== 'string' ||
        !/^(corepack pnpm|node tools\/)/.test(command.command) ||
        command.status !== 'passed' ||
        !Array.isArray(command.fixtures) ||
        command.fixtures.length === 0 ||
        !Array.isArray(command.outputs) ||
        command.outputs.length === 0 ||
        !command.fixtures.every((item) => Object.hasOwn(artifacts ?? {}, item)) ||
        !command.outputs.every((item) => Object.hasOwn(artifacts ?? {}, item))
      )
        fail(`Evidence command ${id} has invalid command, status, fixtures, or outputs.`);
    }
  const expectedCoverage = [
    ...Array.from({ length: 18 }, (_, index) => `AC-${String(index + 1).padStart(2, '0')}`),
    ...Array.from({ length: 10 }, (_, index) => `SC-${String(index + 1).padStart(3, '0')}`),
  ];
  const coverage = manifest.coverage;
  if (
    !coverage ||
    typeof coverage !== 'object' ||
    !sameMembers(Object.keys(coverage), expectedCoverage)
  )
    fail('Evidence manifest must map exactly AC-01..AC-18 and SC-001..SC-010.');
  else
    for (const [id, row] of Object.entries(coverage)) {
      const linkedCommands = Array.isArray(row?.commands)
        ? row.commands.map((item) => commands?.[item]).filter(Boolean)
        : [];
      const expectedFixtures = [...new Set(linkedCommands.flatMap((item) => item.fixtures ?? []))];
      const expectedOutputs = [...new Set(linkedCommands.flatMap((item) => item.outputs ?? []))];
      if (
        !Array.isArray(row?.commands) ||
        row.commands.length === 0 ||
        !Array.isArray(row.fixtures) ||
        row.fixtures.length === 0 ||
        !Array.isArray(row.outputs) ||
        row.outputs.length === 0 ||
        !row.commands.every((item) => Object.hasOwn(commands ?? {}, item)) ||
        !row.fixtures.every((item) => Object.hasOwn(artifacts ?? {}, item)) ||
        !row.outputs.every((item) => Object.hasOwn(artifacts ?? {}, item)) ||
        !sameMembers(row.fixtures, expectedFixtures) ||
        !sameMembers(row.outputs, expectedOutputs)
      )
        fail(`Evidence coverage ${id} has missing command, fixture, or output linkage.`);
    }
  for (const [label, script, args, markers] of [
    [
      'scope',
      scopeVerifier,
      [],
      [
        'operation_count=18',
        'appointment_state_count=9',
        'queue_state_count=5',
        'payment_methods=cash_on_arrival',
        'production_sms=disabled',
        'feature_010=excluded',
      ],
    ],
    [
      'contract',
      contractVerifier,
      ['--generated', '--implemented'],
      ['operation_count=18', 'openapi=3.1.1'],
    ],
  ]) {
    const result = spawnSync(process.execPath, [script, ...args], {
      cwd: repositoryRoot,
      encoding: 'utf8',
      windowsHide: true,
    });
    if (
      result.error ||
      result.status !== 0 ||
      markers.some((marker) => !result.stdout.includes(marker))
    )
      fail(
        `Evidence manifest ${label} parity failed: ${result.error?.message ?? ''}\n${result.stdout ?? ''}${result.stderr ?? ''}`,
      );
  }
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

function uiTuple(entry) {
  return [entry.baselineId, entry.locale, entry.viewport, entry.state].join('|');
}

function verifyUiCaptures(acceptancePath) {
  const metadataPath = path.join(featureRoot, 'visual-baselines/reference-manifest.json');
  const actualDirectory = path.join(featureRoot, 'evidence/ui/actual');
  const captureManifestPath = path.join(actualDirectory, 'capture-manifest.json');
  let referenceRows;
  let captureManifest;
  let acceptance;
  try {
    referenceRows = JSON.parse(fs.readFileSync(metadataPath, 'utf8')).entries;
    captureManifest = JSON.parse(fs.readFileSync(captureManifestPath, 'utf8'));
    acceptance = fs.readFileSync(acceptancePath, 'utf8');
  } catch (error) {
    fail(`UI evidence metadata or capture manifest is missing/unreadable: ${error.message}.`);
    return;
  }
  if (!Array.isArray(referenceRows) || referenceRows.length !== 492) {
    fail('UI evidence requires the approved 492-row reference metadata manifest.');
    return;
  }
  if (captureManifest?.schemaVersion !== '1.0.0' || !Array.isArray(captureManifest.captures)) {
    fail('UI capture-manifest.json must use schemaVersion 1.0.0 and contain captures[].');
    return;
  }
  const referenceByTuple = new Map(referenceRows.map((row) => [uiTuple(row), row]));
  const seenTuples = new Set();
  const seenPaths = new Set();
  for (const [index, capture] of captureManifest.captures.entries()) {
    const label = `UI capture ${index + 1}`;
    if (!capture || typeof capture !== 'object') {
      fail(`${label} must be an object.`);
      continue;
    }
    if (
      !['baselineId', 'locale', 'viewport', 'state', 'route', 'sha256'].every(
        (key) => typeof capture[key] === 'string' && capture[key].length > 0,
      ) ||
      !/^\d+x\d+$/.test(capture.viewport) ||
      !/^[a-f0-9]{64}$/.test(capture.sha256) ||
      !Number.isSafeInteger(capture.bytes) ||
      capture.bytes <= 0
    ) {
      fail(`${label} is missing valid tuple, route, viewport, digest, or byte-count metadata.`);
      continue;
    }
    const tuple = uiTuple(capture);
    const reference = referenceByTuple.get(tuple);
    if (!reference) fail(`${label} does not map to an exact approved metadata row: ${tuple}.`);
    else if (capture.route !== reference.route)
      fail(`${label} route does not match its approved metadata row: ${tuple}.`);
    if (seenTuples.has(tuple))
      fail(`${label} duplicates an already captured approved tuple: ${tuple}.`);
    seenTuples.add(tuple);

    if (
      typeof capture.path !== 'string' ||
      path.basename(capture.path) !== capture.path ||
      !capture.path.endsWith('.png')
    ) {
      fail(`${label} path must be a PNG basename stored directly under evidence/ui/actual.`);
      continue;
    }
    const expectedName = `${capture.baselineId}--${capture.locale}--${capture.viewport}--${capture.state}.png`;
    if (capture.path !== expectedName)
      fail(`${label} path must identify its mapped tuple as ${expectedName}.`);
    if (seenPaths.has(capture.path)) fail(`${label} duplicates capture path ${capture.path}.`);
    seenPaths.add(capture.path);
    const filePath = path.join(actualDirectory, capture.path);
    try {
      const image = fs.readFileSync(filePath);
      const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
      const validPng =
        image.length > 1024 &&
        image.subarray(0, 8).equals(signature) &&
        image.subarray(12, 16).toString('ascii') === 'IHDR' &&
        image.subarray(-8, -4).toString('ascii') === 'IEND';
      if (!validPng) fail(`${label} is not a complete rendered PNG capture: ${capture.path}.`);
      if (capture.bytes !== image.length)
        fail(`${label} byte length does not match its capture manifest: ${capture.path}.`);
      const digest = createHash('sha256').update(image).digest('hex');
      if (capture.sha256 !== digest)
        fail(`${label} SHA-256 does not match its actual PNG: ${capture.path}.`);
      if (validPng) {
        const width = image.readUInt32BE(16);
        const height = image.readUInt32BE(20);
        const [expectedWidth, expectedHeight] = capture.viewport.split('x').map(Number);
        if (width !== expectedWidth || height !== expectedHeight)
          fail(
            `${label} PNG dimensions do not match viewport ${capture.viewport}: ${width}x${height}.`,
          );
      }
    } catch (error) {
      fail(`${label} actual PNG is missing or unreadable: ${capture.path} (${error.message}).`);
    }
  }
  try {
    const imageFiles = fs.readdirSync(actualDirectory).filter((name) => name.endsWith('.png'));
    for (const name of imageFiles)
      if (!seenPaths.has(name)) fail(`Unmapped actual PNG exists in evidence/ui/actual: ${name}.`);
    if (imageFiles.length !== captureManifest.captures.length)
      fail('Actual PNG file count does not match capture-manifest.json.');
  } catch (error) {
    fail(`Unable to inventory actual UI captures: ${error.message}.`);
  }
  const missingCount = referenceRows.length - seenTuples.size;
  if (missingCount !== 0) {
    const missing = referenceRows
      .filter((row) => !seenTuples.has(uiTuple(row)))
      .slice(0, 8)
      .map((row) => uiTuple(row));
    fail(
      `UI capture coverage is incomplete: ${seenTuples.size}/492 approved tuples captured; ${missingCount} missing. First missing rows: ${missing.join(', ')}.`,
    );
  }
  for (const marker of [
    sourceVersion,
    manifestDigest,
    'ar-EG',
    'en-EG',
    'structural/manual',
    'OPEN-UX-002',
  ])
    if (!acceptance.toLowerCase().includes(marker.toLowerCase()))
      fail(`UI acceptance evidence is missing required statement: ${marker}.`);
}

function parseArguments() {
  const args = process.argv.slice(2);
  const requestedStories = new Set();
  const requestedReports = new Set();
  let selfTest = false;
  let manifest = false;
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === '--self-test') {
      selfTest = true;
      continue;
    }
    if (argument === '--all' || argument === '--release') {
      manifest = true;
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
  return { requestedStories, requestedReports, selfTest, manifest };
}

const options = parseArguments();
verifyBaselineMetadata();
if (options.manifest) verifyManifest();

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
      verifyUiCaptures(filePath);
    } catch (error) {
      fail(
        `Missing or unreadable Feature 009 UI evidence: ${reportPaths[report]} (${error.message}).`,
      );
    }
  } else {
    try {
      if (!fs.statSync(filePath).isFile()) throw new Error('not a regular file');
      fs.readFileSync(filePath, 'utf8');
      if (report === 'privacy') {
        const result = spawnSync(process.execPath, [privacyVerifier], {
          cwd: repositoryRoot,
          encoding: 'utf8',
          windowsHide: true,
        });
        if (result.error || result.status !== 0) {
          fail(
            `Feature 009 release-surface privacy scan failed: ${result.error?.message ?? ''}\n${result.stdout ?? ''}${result.stderr ?? ''}`,
          );
        } else if (
          !result.stdout.includes('privacy_scan=passed') ||
          !result.stdout.includes('actual_pngs=492') ||
          !result.stdout.includes('sentinel_hits=0') ||
          !result.stdout.includes('reference_png_io=none')
        ) {
          fail('Feature 009 release-surface privacy scan omitted required pass markers.');
        } else {
          process.stdout.write(result.stdout);
        }
      }
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
  `Feature 009 evidence verifier ready: baseline_metadata=verified, source_version=${sourceVersion}, manifest_digest=${manifestDigest}, reference_count=492, recorded_bytes=29237789, families=8, locales=ar-EG+en-EG, checkpoint_schemas=${Object.keys(checkpointSchemas).length}, reference_png_io=none, ac_count=${options.manifest ? 18 : 'not-requested'}, sc_count=${options.manifest ? 10 : 'not-requested'}, actual_tuple_count=${options.manifest ? 492 : 'not-requested'}, stories=${options.requestedStories.size === 0 ? 'none' : [...options.requestedStories].sort().join(',')}, reports=${options.requestedReports.size === 0 ? 'none' : [...options.requestedReports].sort().join(',')}, self_test=${options.selfTest ? 'passed' : 'not-requested'}.`,
);
