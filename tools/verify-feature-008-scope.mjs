import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { parseDocument } from 'yaml';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const featureDirectory = path.join(
  repositoryRoot,
  'specs/008-audit-admin-aggregates-observability',
);
const planningBaseline = '6a7475f6c7c1311b1b09f4ce94556fba75bb9995';
const approvedPrivacyDigest = '38855c7319b6bcd06b491bf4213a277303a6d6e2c1ebe7499b65fdfa4ae15039';
const canonicalOperations = new Map([
  ['getAdminSummary', ['GET', '/admin/dashboard-summary']],
  ['listAuditEvents', ['GET', '/admin/audit/events']],
  ['getAuditEvent', ['GET', '/admin/audit/events/{eventId}']],
  ['createAuditExport', ['POST', '/admin/audit/exports']],
  ['exportAuditPartition', ['POST', '/internal/audit/exports']],
  ['healthLive', ['GET', '/internal/health/live']],
  ['healthReady', ['GET', '/internal/health/ready']],
]);
const requiredProductionGates = [
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
const plannedTestScripts = [
  'test:audit-admin:scope',
  'test:audit-admin:fixtures',
  'test:audit-admin:contract',
  'test:audit-admin:i18n',
  'test:audit-admin:db',
  'test:audit-admin:stack',
  'test:audit-admin:e2e',
  'test:audit-admin:privacy',
  'test:audit-admin:security',
  'test:audit-admin:performance',
  'test:audit-admin:restore',
];
const failures = [];

function readRequired(relativePath) {
  const absolutePath = path.join(repositoryRoot, relativePath);
  if (!fs.existsSync(absolutePath)) {
    failures.push(`Missing required Feature 008 artifact: ${relativePath}`);
    return '';
  }
  return fs.readFileSync(absolutePath, 'utf8');
}

function parseFeatureOperations(openApiText) {
  const document = parseDocument(openApiText, { uniqueKeys: true });
  for (const error of document.errors)
    failures.push(`Invalid Feature 008 OpenAPI: ${error.message}`);
  const operations = new Map();
  for (const [apiPath, pathItem] of Object.entries(document.toJS()?.paths ?? {})) {
    for (const method of ['get', 'post', 'put', 'patch', 'delete']) {
      const operationId = pathItem?.[method]?.operationId;
      if (operationId) operations.set(String(operationId), [method.toUpperCase(), apiPath]);
    }
  }
  return operations;
}

function parseCatalogOperations(catalogText) {
  const operations = new Map();
  for (const line of catalogText.split(/\r?\n/)) {
    const match = line.match(/^\|\s*`([^`]+)`\s*\|\s*`(GET|POST|PUT|PATCH|DELETE) ([^`]+)`\s*\|/);
    if (match) operations.set(match[1], [match[2], match[3]]);
  }
  return operations;
}

function verifyOperations(openApiText, catalogText) {
  const operations = parseFeatureOperations(openApiText);
  const catalogOperations = parseCatalogOperations(catalogText);
  if (operations.size !== canonicalOperations.size)
    failures.push(`Feature 008 must contain exactly 7 operations; found ${operations.size}.`);
  for (const [operationId, expectedRoute] of canonicalOperations) {
    const actualRoute = operations.get(operationId);
    if (JSON.stringify(actualRoute) !== JSON.stringify(expectedRoute))
      failures.push(`${operationId} must be ${expectedRoute.join(' ')}.`);
    if (JSON.stringify(catalogOperations.get(operationId)) !== JSON.stringify(expectedRoute))
      failures.push(`API Catalog route mismatch for ${operationId}.`);
  }
  for (const operationId of operations.keys())
    if (!canonicalOperations.has(operationId))
      failures.push(`Unapproved Feature 008 operation: ${operationId}.`);
}

function verifyPrivacyPackage(packageText, sidecarText) {
  const canonicalBytes = packageText.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
  const actualDigest = createHash('sha256').update(canonicalBytes, 'utf8').digest('hex');
  const sidecarDigest = sidecarText.trim().split(/\s+/)[0]?.toLowerCase();
  if (actualDigest !== approvedPrivacyDigest || sidecarDigest !== approvedPrivacyDigest)
    failures.push('OPEN-PRIV-001 package or sidecar digest does not match the approved SHA-256.');
  for (const marker of [
    '1.0.0-approved',
    'APPROVED — OPEN-PRIV-001 CLOSED FOR GRADUATION ENGINEERING',
    'minimum_releasable_distinct_subjects: 11',
    'primary_suppression_min: 0',
    'primary_suppression_max: 10',
    'metrics: []',
  ])
    if (!packageText.includes(marker))
      failures.push(`Privacy package marker is missing: ${marker}.`);
}

function verifyGates(specText, planText) {
  if (!specText.includes('SPEC_APPROVED — OPEN-PRIV-001 closed for graduation engineering'))
    failures.push('Feature 008 is not recorded as SPEC_APPROVED with OPEN-PRIV-001 closed.');
  if (!planText.includes('PLAN_APPROVED')) failures.push('Feature 008 plan is not approved.');
  for (const gate of requiredProductionGates)
    if (!specText.includes(gate))
      failures.push(`Production gate is missing from the spec: ${gate}.`);
  for (const marker of [
    'Production adapters remain off',
    'Production flags and adapters remain false',
  ])
    if (!planText.includes(marker))
      failures.push(`Fail-closed production marker is missing: ${marker}.`);
}

function verifyPlannedScripts(packageText) {
  const scripts = JSON.parse(packageText).scripts ?? {};
  for (const scriptName of plannedTestScripts)
    if (typeof scripts[scriptName] !== 'string' || scripts[scriptName].length === 0)
      failures.push(`Planned test command is missing: ${scriptName}.`);
  if (/\bpnpm verify\b/.test(scripts['test:audit-admin:scope'] ?? ''))
    failures.push(
      'The focused Feature 008 scope command must not run the full repository verifier.',
    );
}

function verifyProtectedScope() {
  execFileSync('git', ['merge-base', '--is-ancestor', planningBaseline, 'HEAD'], {
    cwd: repositoryRoot,
    stdio: 'ignore',
  });
  const status = execFileSync('git', ['status', '--porcelain=v1', '--untracked-files=all'], {
    cwd: repositoryRoot,
    encoding: 'utf8',
  });
  const changedPaths = status
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => line.slice(3).replace(/\\/g, '/'));
  for (const changedPath of changedPaths)
    if (
      changedPath.startsWith('security/sec-001-002-remediation/') ||
      changedPath.toLowerCase().endsWith('.docx')
    )
      failures.push(`Protected scope changed: ${changedPath}.`);
}

const openApiText = readRequired(
  'specs/008-audit-admin-aggregates-observability/contracts/openapi.yaml',
);
const catalogText = readRequired('docs/architecture/SHIFAA-API-Catalog.md');
const packageText = readRequired('package.json');
const specText = readRequired('specs/008-audit-admin-aggregates-observability/spec.md');
const planText = readRequired('specs/008-audit-admin-aggregates-observability/plan.md');
const privacyPackageText = readRequired(
  'specs/008-audit-admin-aggregates-observability/decisions/OPEN-PRIV-001-reidentification-risk-decision-package.md',
);
const privacySidecarText = readRequired(
  'specs/008-audit-admin-aggregates-observability/decisions/OPEN-PRIV-001-reidentification-risk-decision-package.sha256',
);

verifyOperations(openApiText, catalogText);
verifyPrivacyPackage(privacyPackageText, privacySidecarText);
verifyGates(specText, planText);
verifyPlannedScripts(packageText);
verifyProtectedScope();

if (failures.length > 0) {
  console.error('Feature 008 scope verification failed:');
  for (const failure of failures.sort()) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(
  `Feature 008 scope verified: OPEN-PRIV-001 closed, metrics empty, operation_count=${canonicalOperations.size}, production gates disabled, and protected remediation scope unchanged.`,
);
