import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { parseDocument } from 'yaml';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const feature = path.join(root, 'specs/007-identity-continuity-sessions-mfa-recovery');
const failures = [];
const expectedOperations = [
  'refreshSession',
  'logout',
  'beginMfaEnrollment',
  'verifyMfaEnrollment',
  'removeMfaFactor',
  'startRecovery',
  'completeRecovery',
  'transitionDependent',
];

function read(file) {
  if (!fs.existsSync(file)) {
    failures.push(`Missing required Feature-007 artifact: ${path.relative(root, file)}`);
    return '';
  }
  return fs.readFileSync(file, 'utf8');
}

const openApiText = read(path.join(feature, 'contracts/openapi.yaml'));
const openApiDocument = parseDocument(openApiText, { uniqueKeys: true });
for (const error of openApiDocument.errors)
  failures.push(`Invalid Feature-007 OpenAPI: ${error.message}`);
const openApi = openApiDocument.toJS();
const operationIds = [];
for (const pathItem of Object.values(openApi?.paths ?? {}))
  for (const method of ['get', 'post', 'put', 'patch', 'delete']) {
    const operationId = pathItem?.[method]?.operationId;
    if (operationId) operationIds.push(String(operationId));
  }
if (operationIds.length !== 8)
  failures.push(`Feature 007 must realize exactly 8 operations; found ${operationIds.length}.`);
if (new Set(operationIds).size !== operationIds.length)
  failures.push('Feature 007 contains a duplicate operation ID.');
for (const operationId of expectedOperations)
  if (!operationIds.includes(operationId)) failures.push(`Missing operation ${operationId}.`);
for (const operationId of operationIds)
  if (!expectedOperations.includes(operationId))
    failures.push(`Unapproved Feature-007 operation ${operationId}.`);
for (const forbidden of ['listAuditEvents', 'getAuditEvent', 'createAuditExport'])
  if (operationIds.includes(forbidden))
    failures.push(`Feature-008 operation leaked into 007: ${forbidden}.`);

const tasks = read(path.join(feature, 'tasks.md'));
const taskRows = [...tasks.matchAll(/^- \[([ x])\] T(\d{3})\b/gm)];
if (taskRows.length !== 48) failures.push(`Expected 48 task rows; found ${taskRows.length}.`);
for (let index = 1; index <= 48; index += 1) {
  const id = String(index).padStart(3, '0');
  const rows = taskRows.filter((row) => row[2] === id);
  if (rows.length !== 1) failures.push(`Expected exactly one T${id} row; found ${rows.length}.`);
  if (rows[0]?.[1] !== 'x') failures.push(`T${id} is not truthfully marked complete.`);
}

const manifestText = read(path.join(feature, 'evidence/manifest.json'));
let manifest = {};
try {
  manifest = JSON.parse(manifestText);
} catch (error) {
  failures.push(`Invalid Feature-007 evidence manifest JSON: ${String(error)}`);
}
if (manifest.operations?.count !== 8) failures.push('Evidence manifest operation count is not 8.');
if (manifest.operations?.canonical_active_catalog_total !== 242)
  failures.push('Evidence manifest changed the canonical active API total.');
if (manifest.operations?.realized_through_feature_007 !== 80)
  failures.push('Evidence manifest realized-operation total is not 80.');
if (manifest.operations?.feature_008_operations !== 0 || manifest.feature_008_scope_introduced)
  failures.push('Evidence manifest introduces Feature-008 scope.');
if (
  manifest.issues?.first !== 188 ||
  manifest.issues?.last !== 235 ||
  manifest.issues?.count !== 48
)
  failures.push('Issue truth is not the exact #188-#235 / T001-T048 mapping.');
if (manifest.issues?.all_open !== true || manifest.issues?.closed_by_this_feature_session !== 0)
  failures.push('Issue manifest does not preserve all Feature-007 Issues as open.');

const catalog = read(path.join(root, 'docs/architecture/SHIFAA-API-Catalog.md'));
if (!/contains 242 active operations/.test(catalog))
  failures.push('Canonical API catalog active total is no longer exactly 242.');
if (!/Feature 007 implements exactly the existing/.test(catalog))
  failures.push('Feature-007 API realization note is missing.');

const performanceText = read(path.join(feature, 'evidence/performance.json'));
let performanceEvidence = {};
try {
  performanceEvidence = JSON.parse(performanceText);
} catch (error) {
  failures.push(`Invalid Feature-007 performance evidence JSON: ${String(error)}`);
}
if (performanceEvidence.result !== 'PASS')
  failures.push('Feature-007 performance result is not PASS.');
if (
  performanceEvidence.dataset?.concurrent_native_sessions !== 100 ||
  performanceEvidence.dataset?.people !== 5000 ||
  performanceEvidence.dataset?.native_session_checks !== 5000 ||
  performanceEvidence.dataset?.recovery_intake_mutations !== 1000 ||
  performanceEvidence.dataset?.dependent_transition_mutations !== 1000
)
  failures.push('Feature-007 performance dataset does not match the declared workload.');
if (
  performanceEvidence.pool_warmup?.configured_connections !== 20 ||
  performanceEvidence.pool_warmup?.observed_connections !== 20
)
  failures.push('Feature-007 performance evidence did not warm and observe all 20 connections.');
if (performanceEvidence.measured_ms?.native_session_check_read_p95 > 400)
  failures.push('Feature-007 measured read p95 exceeds 400 ms.');
if (performanceEvidence.measured_ms?.combined_mutation_p95 > 800)
  failures.push('Feature-007 measured mutation p95 exceeds 800 ms.');

const security = read(path.join(feature, 'evidence/security/final-security.md'));
if (!/Unresolved actionable HIGH\/CRITICAL findings: \*\*0\*\*/.test(security))
  failures.push('Feature-007 security evidence does not report zero unresolved HIGH/CRITICAL.');
for (const artifact of [
  'evidence/security/codex-security-scan-manifest.json',
  'evidence/security/codex-security-coverage.json',
  'evidence/security/codex-security-findings.json',
  'evidence/security/codex-security-report.md',
  'evidence/security/repository-sbom.cdx.json',
  'evidence/live-qa.md',
  'evidence/verification.md',
  'infra/runbooks/identity-continuity.md',
]) {
  const absolute = artifact.startsWith('infra/')
    ? path.join(root, artifact)
    : path.join(feature, artifact);
  read(absolute);
}

const runbook = read(path.join(root, 'infra/runbooks/identity-continuity.md'));
for (const invariant of [
  'Never restore',
  'removed factor',
  'ended guardian',
  'IDENTITY_CONTINUITY_ENABLED=false',
])
  if (!runbook.includes(invariant)) failures.push(`Runbook invariant is missing: ${invariant}.`);

if (failures.length > 0) {
  console.error('Identity continuity evidence verification failed:');
  for (const failure of failures.sort()) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(
  'Identity continuity evidence verified: T001-T048, 4 FRs, 23 NFRs, 48 open Issues, exactly 8 operations, catalog total 242, and no Feature-008 scope.',
);
