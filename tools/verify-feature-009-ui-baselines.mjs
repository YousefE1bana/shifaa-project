import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const visualRoot = path.join(
  repositoryRoot,
  'specs/009-clinic-scheduling-appointments-queue/visual-baselines',
);
const sourceVersion = 'SHIFAA-F009-P0-SOURCE@1.0.0-candidate';
const approvedManifestDigest = '3ac755cc03c263826d1a07d53e08716e8390857249dbda1eb936833265ac0a4c';
const sourceArtifactSha256 = 'cf3607d85090572b392e21cfdc99e118588984da543fb8070dfe7651323239d5';
const inventoryArtifactSha256 = '05be6513adbb3a68d3d07a41c59a0890f64ed04a25de970fc0c5ae463ed53d3f';
const referenceCount = 492;
const recordedBytes = 29237789;
const locales = ['ar-EG', 'en-EG'];
const routeFamilies = [
  {
    baselineId: 'F009-P0-PAT-DISCOVER-001',
    app: 'patient',
    route: '/discover',
    viewports: ['360x800', '412x915'],
    states: [
      'loading',
      'empty',
      'location-denied',
      'results',
      'stale',
      'error-recoverable',
      'error-terminal',
      'offline',
    ],
  },
  {
    baselineId: 'F009-P0-PAT-DOCTOR-001',
    app: 'patient',
    route: '/doctors/:id',
    viewports: ['360x800', '412x915'],
    states: [
      'loading',
      'available',
      'no-slots',
      'stale',
      'offline',
      'error-recoverable',
      'error-terminal',
      'permission-denied',
    ],
  },
  {
    baselineId: 'F009-P0-PAT-BOOK-001',
    app: 'patient',
    route: '/appointments/new',
    viewports: ['360x800', '412x915'],
    states: [
      'loading',
      'ready',
      'submitting',
      'conflict',
      'offline',
      'error-recoverable',
      'error-terminal',
      'permission-denied',
      'success',
    ],
  },
  {
    baselineId: 'F009-P0-PAT-APPOINTMENT-001',
    app: 'patient',
    route: '/appointments/:id',
    viewports: ['360x800', '412x915'],
    states: [
      'loading',
      'confirmed',
      'checked-in',
      'cancelled',
      'reschedule-required',
      'requested-readonly',
      'in-queue-readonly',
      'in-consultation-readonly',
      'completed-readonly',
      'no-show-readonly',
      'queue-waiting',
      'queue-called',
      'queue-in-service-readonly',
      'queue-completed',
      'queue-removed',
      'delay-active',
      'cancel-confirmation',
      'stale',
      'offline',
      'conflict',
      'error-recoverable',
      'error-terminal',
      'permission-denied',
      'submitting',
      'success',
    ],
  },
  {
    baselineId: 'F009-P0-CLN-TODAY-001',
    app: 'clinic',
    route: '/today',
    viewports: ['768x1024', '1440x900'],
    states: [
      'loading',
      'empty',
      'worklist',
      'delay-active',
      'absence-active',
      'stale',
      'offline',
      'conflict',
      'error-recoverable',
      'error-terminal',
      'permission-denied',
      'success',
    ],
  },
  {
    baselineId: 'F009-P0-CLN-QUEUE-001',
    app: 'clinic',
    route: '/queue',
    viewports: ['768x1024', '1440x900'],
    states: [
      'loading',
      'empty',
      'waiting',
      'called',
      'in-service-readonly',
      'completed',
      'removed',
      'delay-active',
      'reorder-review',
      'stale',
      'offline',
      'conflict',
      'error-recoverable',
      'error-terminal',
      'permission-denied',
      'submitting',
      'success',
    ],
  },
  {
    baselineId: 'F009-P0-CLN-SCHEDULE-001',
    app: 'clinic',
    route: '/schedule',
    viewports: ['768x1024', '1440x900'],
    states: [
      'loading',
      'empty',
      'active',
      'paused',
      'retired-readonly',
      'exception-list',
      'delay-active',
      'absence-review',
      'absence-confirmation',
      'retire-confirmation',
      'overlap-conflict',
      'stale',
      'offline',
      'conflict',
      'error-recoverable',
      'error-terminal',
      'permission-denied',
      'submitting',
      'success',
    ],
  },
  {
    baselineId: 'F009-P0-CLN-APPOINTMENT-001',
    app: 'clinic',
    route: '/appointments/:id',
    viewports: ['768x1024', '1440x900'],
    states: [
      'loading',
      'confirmed',
      'checked-in',
      'cancelled',
      'reschedule-required',
      'requested-readonly',
      'in-queue-readonly',
      'in-consultation-readonly',
      'completed-readonly',
      'no-show-readonly',
      'queue-waiting',
      'queue-called',
      'queue-in-service-readonly',
      'queue-completed',
      'queue-removed',
      'delay-active',
      'cancel-confirmation',
      'stale',
      'offline',
      'conflict',
      'error-recoverable',
      'error-terminal',
      'permission-denied',
      'submitting',
      'success',
    ],
  },
];

const failures = [];

function fail(message) {
  failures.push(message);
}

function readJson(relativePath, label) {
  try {
    return JSON.parse(fs.readFileSync(path.join(repositoryRoot, relativePath), 'utf8'));
  } catch (error) {
    fail(`Unable to read ${label}: ${error.message}`);
    return null;
  }
}

function readMetadata(relativePath, label) {
  try {
    return fs.readFileSync(path.join(repositoryRoot, relativePath), 'utf8');
  } catch (error) {
    fail(`Unable to read ${label}: ${error.message}`);
    return '';
  }
}

function expectedInventory() {
  return routeFamilies.map(({ baselineId, app, route, viewports, states }) => ({
    baselineId,
    app,
    route,
    viewports,
    states,
  }));
}

function verifyInventory(inventory) {
  if (inventory?.schemaVersion !== '1.0.0') fail('Baseline inventory schemaVersion must be 1.0.0.');
  if (inventory?.sourceVersion !== sourceVersion)
    fail('Baseline inventory sourceVersion is not approved.');
  if (JSON.stringify(inventory?.locales) !== JSON.stringify(locales))
    fail('Baseline inventory must contain exactly ar-EG and en-EG.');
  if (JSON.stringify(inventory?.routes) !== JSON.stringify(expectedInventory()))
    fail('Baseline inventory route/locale/viewport/state mapping has drifted.');
}

function verifyManifest(manifest, inventory) {
  if (manifest?.schemaVersion !== '1.0.0') fail('Reference manifest schemaVersion must be 1.0.0.');
  if (manifest?.status !== 'CANDIDATE_PENDING_REQUIRED_APPROVALS')
    fail('Reference manifest candidate status must remain immutable.');
  if (manifest?.sourceVersion !== sourceVersion)
    fail('Reference manifest sourceVersion is not approved.');
  if (manifest?.sourceArtifact !== 'source/composition.html')
    fail('Reference manifest source artifact drifted.');
  if (manifest?.sourceArtifactSha256 !== sourceArtifactSha256)
    fail('Reference manifest source artifact digest drifted.');
  if (manifest?.inventoryArtifact !== 'baseline-inventory.json')
    fail('Reference manifest inventory artifact drifted.');
  if (manifest?.inventoryArtifactSha256 !== inventoryArtifactSha256)
    fail('Reference manifest inventory artifact digest drifted.');
  if (manifest?.entryCount !== referenceCount || !Array.isArray(manifest?.entries))
    fail(`Reference manifest must record exactly ${referenceCount} entries.`);
  if (manifest?.entries?.length !== referenceCount)
    fail(`Reference manifest entries must contain exactly ${referenceCount} rows.`);

  const inventoryById = new Map(
    (inventory?.routes ?? []).map((entry) => [entry.baselineId, entry]),
  );
  const expectedKeys = new Set();
  for (const route of inventory?.routes ?? [])
    for (const locale of locales)
      for (const viewport of route.viewports)
        for (const state of route.states)
          expectedKeys.add(`${route.baselineId}|${locale}|${viewport}|${state}`);
  const actualKeys = new Set();
  for (const [index, entry] of (manifest?.entries ?? []).entries()) {
    const route = inventoryById.get(entry?.baselineId);
    const key = `${entry?.baselineId}|${entry?.locale}|${entry?.viewport}|${entry?.state}`;
    if (actualKeys.has(key)) fail(`Reference manifest has a duplicate mapping at entry ${index}.`);
    actualKeys.add(key);
    if (!route) {
      fail(`Reference manifest entry ${index} uses an unknown baseline family.`);
      continue;
    }
    if (entry.sourceVersion !== sourceVersion)
      fail(`Reference manifest entry ${index} sourceVersion drifted.`);
    if (entry.app !== route.app || entry.route !== route.route)
      fail(`Reference manifest entry ${index} route ownership drifted.`);
    if (
      !locales.includes(entry.locale) ||
      !route.viewports.includes(entry.viewport) ||
      !route.states.includes(entry.state)
    )
      fail(`Reference manifest entry ${index} has an invalid locale/viewport/state combination.`);
    const expectedArtifact = `references/${entry.baselineId}/${entry.locale}/${entry.viewport}/${entry.state}.png`;
    if (entry.referenceArtifact !== expectedArtifact)
      fail(`Reference manifest entry ${index} reference path does not match its metadata mapping.`);
    if (entry.sourceNode !== `${sourceVersion}#${entry.baselineId}--${entry.state}`)
      fail(`Reference manifest entry ${index} sourceNode drifted.`);
    if (!/^[a-f0-9]{64}$/.test(entry.sha256 ?? ''))
      fail(`Reference manifest entry ${index} has an invalid recorded digest string.`);
    if (entry.fixtureId !== 'F009-SYNTHETIC-VISUAL-001')
      fail(`Reference manifest entry ${index} must use the approved synthetic visual fixture.`);
  }
  if (
    actualKeys.size !== expectedKeys.size ||
    [...expectedKeys].some((key) => !actualKeys.has(key))
  )
    fail('Reference manifest does not exactly cover the approved 492-entry mapping.');
}

function verifyApprovalMetadata() {
  const map = readMetadata(
    'specs/009-clinic-scheduling-appointments-queue/contracts/ui-baseline-map.md',
    'UI baseline map',
  );
  const review = readMetadata(
    'specs/009-clinic-scheduling-appointments-queue/visual-baselines/approval-review.md',
    'visual approval record',
  );
  const decision = readMetadata(
    'specs/009-clinic-scheduling-appointments-queue/decisions/OPEN-UX-001-test-only-p0-baselines.md',
    'visual baseline decision',
  );
  for (const [label, text] of [
    ['UI baseline map', map],
    ['visual approval record', review],
    ['visual baseline decision', decision],
  ]) {
    if (!text.includes(sourceVersion)) fail(`${label} is missing the approved source version.`);
    if (!text.includes(approvedManifestDigest))
      fail(`${label} is missing the approved manifest digest string.`);
  }
  if (!/Immutable references:\s*492 PNGs,\s*29,237,789 bytes/.test(map))
    fail('UI baseline map is missing the approved recorded byte count.');
  if (!/Reference images\s*\|\s*492 seeded-synthetic PNGs/.test(review))
    fail('Visual approval record is missing the approved reference count.');
}

const inventory = readJson(
  'specs/009-clinic-scheduling-appointments-queue/visual-baselines/baseline-inventory.json',
  'baseline inventory metadata',
);
const manifest = readJson(
  'specs/009-clinic-scheduling-appointments-queue/visual-baselines/reference-manifest.json',
  'reference manifest metadata',
);
verifyInventory(inventory);
verifyManifest(manifest, inventory);
verifyApprovalMetadata();

if (failures.length > 0) {
  console.error('Feature 009 UI baseline metadata verification failed:');
  for (const failure of [...new Set(failures)].sort()) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(
  `Feature 009 UI baseline metadata verified: source_version=${sourceVersion}, manifest_digest=${approvedManifestDigest}, reference_count=${referenceCount}, recorded_bytes=${recordedBytes}, families=${routeFamilies.length}, locales=${locales.join('+')}, canonical_viewports=patient(360x800,412x915)+clinic(768x1024,1440x900), png_io=none.`,
);
