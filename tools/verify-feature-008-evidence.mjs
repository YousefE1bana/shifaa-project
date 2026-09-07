import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const featureDirectory = path.join(
  repositoryRoot,
  'specs/008-audit-admin-aggregates-observability',
);
const approvedPrivacyDigest = '38855c7319b6bcd06b491bf4213a277303a6d6e2c1ebe7499b65fdfa4ae15039';
const requiredFailureClasses = [
  'authentication-required',
  'mfa-required',
  'forbidden',
  'purpose-required',
  'validation-failed',
  'not-found',
  'legal-gate-disabled',
  'idempotency-key-reused',
  'idempotency-in-progress',
  'export-range-invalid',
  'export-state-conflict',
  'audit-integrity-failed',
  'retention-proof-failed',
  'rate-limited',
  'service-unavailable',
];
const requiredAcceptanceCriteria = Array.from(
  { length: 10 },
  (_, index) => `AC-${String(index + 1).padStart(2, '0')}`,
);
const requiredSuccessCriteria = Array.from(
  { length: 8 },
  (_, index) => `SC-${String(index + 1).padStart(3, '0')}`,
);
const requiredRequirements = [
  'FR-ADMIN-002',
  'FR-ADMIN-003',
  'NFR-SEC-001',
  'NFR-SEC-002',
  'NFR-SEC-004',
  'NFR-SEC-005',
  'NFR-SEC-006',
  'NFR-SEC-007',
  'NFR-PRIV-002',
  'NFR-PRIV-004',
  'NFR-I18N-001',
  'NFR-A11Y-001',
  'NFR-PERF-002',
  'NFR-AVAIL-001',
  'NFR-AVAIL-002',
  'NFR-DATA-001',
  'NFR-DATA-002',
  'NFR-API-001',
  'NFR-API-002',
  'NFR-OBS-001',
  'NFR-QUALITY-001',
  'NFR-PORT-001',
];
const canonicalOperations = [
  'getAdminSummary',
  'listAuditEvents',
  'getAuditEvent',
  'createAuditExport',
  'exportAuditPartition',
  'healthLive',
  'healthReady',
];
const retainedProductionGates = [
  'OPEN-LEGAL-001',
  'OPEN-LEGAL-002',
  'OPEN-LEGAL-007',
  'OPEN-TECH-001',
  'OPEN-TECH-002',
  'OPEN-TECH-003',
  'OPEN-UX-001',
  'OPEN-UX-002',
  'OPEN-PRODUCT-001',
];
const failures = [];

function readRequired(absolutePath) {
  if (!fs.existsSync(absolutePath)) {
    failures.push(
      `Missing Feature 008 evidence input: ${path.relative(repositoryRoot, absolutePath)}`,
    );
    return '';
  }
  return fs.readFileSync(absolutePath, 'utf8');
}

function sha256(text) {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

const requestedModes = process.argv.slice(2).filter((argument) => argument !== '--');
const requestedStories = new Set();
const requestedReports = new Set();
let verifyManifest = false;
let verifyRelease = false;
for (let index = 0; index < requestedModes.length; index += 1) {
  const argument = requestedModes[index];
  if (argument === '--fixtures') continue;
  if (argument === '--all' || argument === '--release') {
    verifyManifest = true;
    verifyRelease ||= argument === '--release';
    for (const story of ['US1', 'US2', 'US3', 'US4']) requestedStories.add(story);
    for (const report of ['security', 'ui', 'privacy']) requestedReports.add(report);
    continue;
  }
  if (['--security', '--ui', '--privacy'].includes(argument)) {
    requestedReports.add(argument.slice(2));
    continue;
  }
  if (argument === '--story' && /^US[1-4]$/.test(requestedModes[index + 1] ?? '')) {
    requestedStories.add(requestedModes[index + 1]);
    index += 1;
    continue;
  }
  failures.push(`Unsupported Feature 008 evidence mode: ${argument}.`);
}

const privacyPackage = readRequired(
  path.join(featureDirectory, 'decisions/OPEN-PRIV-001-reidentification-risk-decision-package.md'),
);
const privacySidecar = readRequired(
  path.join(
    featureDirectory,
    'decisions/OPEN-PRIV-001-reidentification-risk-decision-package.sha256',
  ),
);
const privacyFixtures = readRequired(
  path.join(repositoryRoot, 'packages/test-kit/src/audit-admin-privacy-fixtures.ts'),
);
const auditFixtures = readRequired(
  path.join(repositoryRoot, 'packages/test-kit/src/audit-admin-fixtures.ts'),
);
const canonicalPrivacyBytes = privacyPackage.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
const privacyDigest = sha256(canonicalPrivacyBytes);
if (
  privacyDigest !== approvedPrivacyDigest ||
  privacySidecar.trim().split(/\s+/)[0]?.toLowerCase() !== approvedPrivacyDigest
)
  failures.push('Approved OPEN-PRIV-001 package digest mismatch.');

const privacyVectorIds = [...privacyFixtures.matchAll(/id:\s*'(TV-PRIV-001-\d{3})'/g)].map(
  (match) => match[1],
);
if (privacyVectorIds.length !== 34 || new Set(privacyVectorIds).size !== 34)
  failures.push(`Expected 34 unique privacy vectors; found ${privacyVectorIds.length}.`);

const authorizationScenarios = [...auditFixtures.matchAll(/scenario:\s*'([^']+)'/g)].map(
  (match) => match[1],
);
if (authorizationScenarios.length !== 18 || new Set(authorizationScenarios).size !== 18)
  failures.push(
    `Expected 18 unique authorization scenarios; found ${authorizationScenarios.length}.`,
  );
for (const failureClass of requiredFailureClasses)
  if (!auditFixtures.includes(`'${failureClass}'`))
    failures.push(`Missing contracted failure class fixture: ${failureClass}.`);

const storyEvidence = {
  US1: {
    path: 'evidence/dashboard/checkpoint.md',
    tokens: [
      '34/34',
      'ar-EG',
      'en-EG',
      'RTL',
      'LTR',
      '768x1024',
      '1440x900',
      'keyboard',
      'screen reader',
      '200% text',
      '400% zoom',
      'forced colors',
      'reduced motion',
      'engineering evidence only',
    ],
  },
  US2: {
    path: 'evidence/audit/checkpoint.md',
    tokens: ['AC-03', 'AC-04', '18/18', 'redacted', 'opaque cursor', 'SHA-256'],
  },
  US3: {
    path: 'evidence/audit/checkpoint.md',
    tokens: ['AC-05', 'AC-06', 'AC-07', 'no polling operation', 'zero offline export effects'],
  },
  US4: {
    path: 'evidence/operations/health-checkpoint.md',
    tokens: [
      'ready',
      'degraded',
      'not_ready',
      'database_unavailable',
      'outbox_backlog',
      'audit_integrity_failed',
      'export_proof_failed',
    ],
  },
};

const reportEvidence = {
  security: {
    path: 'evidence/security/security-report.md',
    tokens: [
      'authorized=1 denied=13',
      'worker_exact=1',
      'direct_tables=denied',
      'force_rls=3',
      'bypass_roles=0',
      '54/54',
      '47/47',
      '8/8',
      '9/9',
      'exactly seven operations',
      'zero unresolved reportable high or critical findings',
      'synthetic graduation-engineering evidence only',
    ],
  },
  ui: {
    path: 'evidence/ui/acceptance.md',
    tokens: [
      'ar-EG',
      'en-EG',
      'RTL',
      'LTR',
      '768x1024',
      '1440x900',
      'keyboard',
      'focus',
      '200% text',
      '400% zoom',
      'forced colors',
      'reduced motion',
      'informative rather than pixel-identical',
      'synthetic graduation data only',
    ],
  },
  privacy: {
    path: 'evidence/observability/redaction-report.md',
    tokens: [
      'zero prohibited values',
      'zero high-cardinality identifier labels',
      'no PHI',
      'no raw metadata',
      'no suppressed or released exact counts',
      'no tokens, signed URLs, hashes, cursors, or free text in telemetry',
      'request/trace correlation',
      'bounded low-cardinality labels',
      'synthetic graduation-engineering evidence only',
    ],
  },
};

for (const story of requestedStories) verifyEvidenceDocument(story, storyEvidence[story]);
for (const report of requestedReports) verifyEvidenceDocument(report, reportEvidence[report]);
if (requestedReports.has('privacy')) verifyProhibitedSentinels();
if (verifyManifest) verifyEvidenceManifest();
if (verifyRelease) verifyReleaseSignoff();

function verifyEvidenceManifest() {
  const manifestPath = path.join(featureDirectory, 'evidence/manifest.json');
  const manifestText = readRequired(manifestPath);
  let manifest;
  try {
    manifest = JSON.parse(manifestText);
  } catch (error) {
    failures.push(`Invalid Feature 008 evidence manifest JSON: ${error.message}`);
    return;
  }

  if (manifest.feature !== '008-audit-admin-aggregates-observability')
    failures.push('Evidence manifest feature identifier is invalid.');
  if (manifest.evidence_class !== 'synthetic_graduation_engineering')
    failures.push('Evidence manifest must remain synthetic graduation engineering evidence.');
  if (manifest.production_approved !== false)
    failures.push('Evidence manifest must not claim production approval.');
  if (!/^[a-f0-9]{40}$/.test(manifest.implementation_baseline_commit ?? ''))
    failures.push('Evidence manifest must bind the implementation baseline commit.');
  if (JSON.stringify(manifest.operations) !== JSON.stringify(canonicalOperations))
    failures.push('Evidence manifest must contain the exact seven canonical operations in order.');
  if (JSON.stringify(manifest.aggregate_policy?.metrics) !== '[]')
    failures.push('Evidence manifest must keep aggregate metrics inactive.');
  if (manifest.aggregate_policy?.minimum_cell_threshold !== 11)
    failures.push('Evidence manifest must retain the approved k=11 threshold.');
  if (JSON.stringify(manifest.retained_gates) !== JSON.stringify(retainedProductionGates))
    failures.push('Evidence manifest must preserve every production/legal/UX gate.');

  const artifacts = manifest.artifacts ?? {};
  for (const [artifactId, artifact] of Object.entries(artifacts)) {
    const relativePath = artifact?.path;
    const expectedDigest = artifact?.sha256;
    if (typeof relativePath !== 'string' || !/^[a-f0-9]{64}$/.test(expectedDigest ?? '')) {
      failures.push(`Evidence manifest artifact is malformed: ${artifactId}.`);
      continue;
    }
    const artifactPath = path.resolve(repositoryRoot, relativePath);
    if (!artifactPath.startsWith(`${repositoryRoot}${path.sep}`)) {
      failures.push(`Evidence manifest path escapes the repository: ${relativePath}.`);
      continue;
    }
    if (!fs.existsSync(artifactPath)) {
      failures.push(`Evidence manifest artifact is missing: ${relativePath}.`);
      continue;
    }
    const actualDigest = createHash('sha256').update(fs.readFileSync(artifactPath)).digest('hex');
    if (actualDigest !== expectedDigest)
      failures.push(`Evidence manifest digest mismatch: ${relativePath}.`);
  }

  verifyCriterionMap(
    'acceptance criteria',
    manifest.acceptance_criteria,
    requiredAcceptanceCriteria,
    artifacts,
  );
  verifyCriterionMap(
    'success criteria',
    manifest.success_criteria,
    requiredSuccessCriteria,
    artifacts,
  );
  verifyCriterionMap('requirements', manifest.requirements, requiredRequirements, artifacts);
}

function verifyCriterionMap(label, map, requiredIds, artifacts) {
  const actualIds = Object.keys(map ?? {}).sort();
  const expectedIds = [...requiredIds].sort();
  if (JSON.stringify(actualIds) !== JSON.stringify(expectedIds)) {
    failures.push(`Evidence manifest ${label} coverage is incomplete or contains drift.`);
    return;
  }
  for (const [criterion, artifactIds] of Object.entries(map)) {
    if (!Array.isArray(artifactIds) || artifactIds.length === 0) {
      failures.push(`Evidence manifest ${criterion} has no artifact binding.`);
      continue;
    }
    for (const artifactId of artifactIds)
      if (!Object.hasOwn(artifacts, artifactId))
        failures.push(`Evidence manifest ${criterion} references unknown artifact: ${artifactId}.`);
  }
}

function verifyReleaseSignoff() {
  const tasks = readRequired(path.join(featureDirectory, 'tasks.md'));
  const requirements = readRequired(path.join(featureDirectory, 'checklists/requirements.md'));
  const checkedTasks = new Set(
    [...tasks.matchAll(/^- \[x\] (T\d{3})\b/gm)].map((match) => match[1]),
  );
  for (let index = 1; index <= 54; index += 1) {
    const taskId = `T${String(index).padStart(3, '0')}`;
    if (!checkedTasks.has(taskId))
      failures.push(`Release signoff is missing completed task: ${taskId}.`);
  }
  for (const marker of [
    'IMPLEMENTATION_STAGE_APPROVED — synthetic graduation engineering only',
    'Production approval: NOT GRANTED',
    'Exactly seven Feature 008 operations: VERIFIED',
    'Aggregate metrics: INACTIVE (`metrics: []`)',
    'security/sec-001-002-remediation: UNCHANGED',
    ...retainedProductionGates,
  ])
    if (!requirements.includes(marker))
      failures.push(`Release signoff marker is missing: ${marker}.`);
}

function verifyProhibitedSentinels() {
  const sentinels = [...auditFixtures.matchAll(/'((?:SYNTHETIC-008-)[A-Z0-9-]+)'/g)].map(
    ([, sentinel]) => sentinel,
  );
  if (sentinels.length !== 10 || new Set(sentinels).size !== 10) {
    failures.push(`Expected 10 unique prohibited sentinels; found ${sentinels.length}.`);
    return;
  }

  const artifacts = [
    'apps/admin/src/app/audit',
    'apps/admin/src/app/dashboard',
    'packages/core/src/audit-admin',
    'packages/observability/src/audit-admin.ts',
    'services/api/src/adapters/postgres/audit-admin-service.ts',
    'services/api/src/modules/audit-admin',
    'services/api/src/routes/audit-admin.ts',
    'services/worker/src/audit-export.ts',
    'services/worker/src/adapters/local-synthetic-audit-object.ts',
    'specs/008-audit-admin-aggregates-observability/evidence',
  ].flatMap((relativePath) => evidenceFiles(path.join(repositoryRoot, relativePath)));

  for (const artifactPath of artifacts) {
    const bytes = fs.readFileSync(artifactPath);
    for (const sentinel of sentinels) {
      if (bytes.includes(Buffer.from(sentinel))) {
        failures.push(
          `Prohibited sentinel present in ${path.relative(repositoryRoot, artifactPath)}.`,
        );
      }
    }
  }
}

function evidenceFiles(absolutePath) {
  const stat = fs.statSync(absolutePath);
  if (stat.isFile()) return [absolutePath];
  return fs
    .readdirSync(absolutePath, { withFileTypes: true })
    .flatMap((entry) => evidenceFiles(path.join(absolutePath, entry.name)));
}

function verifyEvidenceDocument(label, requirement) {
  const absolutePath = path.join(featureDirectory, requirement.path);
  const evidence = readRequired(absolutePath);
  for (const token of requirement.tokens)
    if (!evidence.includes(token)) failures.push(`${label} evidence is missing: ${token}.`);

  const digestLines = [...evidence.matchAll(/- `([^`]+)`: `([a-f0-9]{64})`/g)];
  if (digestLines.length < 3)
    failures.push(`${label} evidence must bind at least three artifacts.`);
  for (const [, relativePath, expectedDigest] of digestLines) {
    const artifactPath = path.resolve(repositoryRoot, relativePath);
    if (!artifactPath.startsWith(`${repositoryRoot}${path.sep}`)) {
      failures.push(`${label} evidence path escapes the repository: ${relativePath}.`);
      continue;
    }
    if (!fs.existsSync(artifactPath)) {
      failures.push(`${label} evidence input is missing: ${relativePath}.`);
      continue;
    }
    const artifactDigest = createHash('sha256').update(fs.readFileSync(artifactPath)).digest('hex');
    if (artifactDigest !== expectedDigest)
      failures.push(`${label} artifact digest mismatch: ${relativePath}.`);
  }
}

if (failures.length > 0) {
  console.error('Feature 008 evidence fixture verification failed:');
  for (const failure of failures.sort()) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(
  `Feature 008 evidence verified: privacy_vectors=34, authorization_scenarios=18, failure_classes=${requiredFailureClasses.length}, stories=${requestedStories.size === 0 ? 'fixtures' : [...requestedStories].sort().join(',')}, reports=${requestedReports.size === 0 ? 'none' : [...requestedReports].sort().join(',')}, manifest=${verifyManifest ? 'verified' : 'not-requested'}, release=${verifyRelease ? 'verified' : 'not-requested'}, policy_sha256=${privacyDigest}, fixture_sha256=${sha256(privacyFixtures + auditFixtures)}.`,
);
