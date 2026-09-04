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
if (requestedModes.length > 0 && !requestedModes.every((argument) => argument === '--fixtures'))
  failures.push(
    `Evidence mode is not available before its implementation task: ${requestedModes.join(' ')}.`,
  );

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

if (failures.length > 0) {
  console.error('Feature 008 evidence fixture verification failed:');
  for (const failure of failures.sort()) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(
  `Feature 008 evidence fixtures verified: privacy_vectors=34, authorization_scenarios=18, failure_classes=${requiredFailureClasses.length}, policy_sha256=${privacyDigest}, fixture_sha256=${sha256(privacyFixtures + auditFixtures)}.`,
);
