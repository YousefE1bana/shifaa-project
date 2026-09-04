import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { parseDocument } from 'yaml';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const contractPath = path.join(
  repositoryRoot,
  'specs/008-audit-admin-aggregates-observability/contracts/openapi.yaml',
);
const catalogPath = path.join(repositoryRoot, 'docs/architecture/SHIFAA-API-Catalog.md');
const expectedOperations = new Map([
  ['getAdminSummary', ['GET', '/admin/dashboard-summary']],
  ['listAuditEvents', ['GET', '/admin/audit/events']],
  ['getAuditEvent', ['GET', '/admin/audit/events/{eventId}']],
  ['createAuditExport', ['POST', '/admin/audit/exports']],
  ['exportAuditPartition', ['POST', '/internal/audit/exports']],
  ['healthLive', ['GET', '/internal/health/live']],
  ['healthReady', ['GET', '/internal/health/ready']],
]);
const failures = [];

function fail(message) {
  failures.push(message);
}

function parseCatalog(text) {
  const operations = new Map();
  for (const line of text.split(/\r?\n/)) {
    const match = line.match(/^\|\s*`([^`]+)`\s*\|\s*`(GET|POST|PUT|PATCH|DELETE) ([^`]+)`\s*\|/);
    if (match) operations.set(match[1], [match[2], match[3]]);
  }
  return operations;
}

function resolveLocalRef(api, value) {
  if (!value?.$ref?.startsWith('#/')) return value;
  return value.$ref
    .slice(2)
    .split('/')
    .reduce((current, key) => current?.[key], api);
}

function hasParameter(operation, referenceName) {
  return (operation.parameters ?? []).some(
    (parameter) => parameter?.$ref === `#/components/parameters/${referenceName}`,
  );
}

function verifyResponses(api, operationId, operation) {
  for (const [status, unresolvedResponse] of Object.entries(operation.responses ?? {})) {
    const response = resolveLocalRef(api, unresolvedResponse);
    if (!response) {
      fail(`${operationId} ${status} has an unresolved response.`);
      continue;
    }
    if (response.headers?.['X-Request-Id']?.$ref !== '#/components/headers/RequestId')
      fail(`${operationId} ${status} must return X-Request-Id.`);
    if (response.headers?.['Cache-Control']?.$ref !== '#/components/headers/PrivateNoStore')
      fail(`${operationId} ${status} must be private, no-store.`);
    if (/^[45]/.test(status)) {
      const problemSchema = response.content?.['application/problem+json']?.schema;
      if (problemSchema?.$ref !== '#/components/schemas/Problem')
        fail(`${operationId} ${status} must use the RFC 9457 Problem schema.`);
    }
  }
}

function verifyOperations(api, catalog) {
  const found = new Map();
  for (const [apiPath, pathItem] of Object.entries(api.paths ?? {})) {
    for (const method of ['get', 'put', 'post', 'delete', 'options', 'head', 'patch', 'trace']) {
      const operation = pathItem?.[method];
      if (!operation) continue;
      if (!operation.operationId) {
        fail(`${method.toUpperCase()} ${apiPath} is missing operationId.`);
        continue;
      }
      if (found.has(operation.operationId))
        fail(`Duplicate operationId: ${operation.operationId}.`);
      found.set(operation.operationId, [method.toUpperCase(), apiPath]);
      verifyResponses(api, operation.operationId, operation);
    }
  }

  if (found.size !== expectedOperations.size)
    fail(`Expected exactly 7 operations; found ${found.size}.`);
  for (const [operationId, expectedRoute] of expectedOperations) {
    if (JSON.stringify(found.get(operationId)) !== JSON.stringify(expectedRoute))
      fail(`${operationId} must be ${expectedRoute.join(' ')}.`);
    if (JSON.stringify(catalog.get(operationId)) !== JSON.stringify(expectedRoute))
      fail(`API Catalog mismatch for ${operationId}.`);
  }
  for (const operationId of found.keys())
    if (!expectedOperations.has(operationId)) fail(`Unapproved operation: ${operationId}.`);
}

function verifyPagination(api) {
  const limit = api.components?.parameters?.LimitQuery?.schema;
  const cursor = api.components?.parameters?.CursorQuery?.schema;
  if (limit?.minimum !== 1 || limit?.default !== 25 || limit?.maximum !== 100)
    fail('Audit pagination must use limit minimum 1, default 25, maximum 100.');
  if (cursor?.type !== 'string' || cursor?.minLength < 16 || cursor?.maxLength > 512)
    fail('Audit cursors must be bounded opaque strings.');
  const listOperation = api.paths?.['/admin/audit/events']?.get;
  if (!hasParameter(listOperation, 'LimitQuery') || !hasParameter(listOperation, 'CursorQuery'))
    fail('listAuditEvents must expose the approved limit and opaque cursor parameters.');
}

function verifyIdempotency(api) {
  for (const apiPath of ['/admin/audit/exports', '/internal/audit/exports']) {
    const operation = api.paths?.[apiPath]?.post;
    if (!hasParameter(operation, 'IdempotencyKey'))
      fail(`POST ${apiPath} must require Idempotency-Key.`);
    if (!operation?.responses?.['409']) fail(`POST ${apiPath} must define conflict response 409.`);
  }
  if (api.components?.parameters?.IdempotencyKey?.required !== true)
    fail('Idempotency-Key must be required by the shared parameter contract.');
}

function verifyServiceBoundary(api) {
  for (const apiPath of [
    '/internal/audit/exports',
    '/internal/health/live',
    '/internal/health/ready',
  ]) {
    const pathItem = api.paths?.[apiPath] ?? {};
    const operation = pathItem.post ?? pathItem.get;
    const usesServiceAuth = operation?.security?.some((entry) =>
      Object.hasOwn(entry, 'serviceAuth'),
    );
    if (!usesServiceAuth || operation?.['x-shifaa-private-network'] !== true)
      fail(`${apiPath} must require serviceAuth on the private network.`);
  }
}

function verifySummaryBoundary(api) {
  const summary = api.paths?.['/admin/dashboard-summary']?.get;
  const approvedParameters = new Set([
    '#/components/parameters/AcceptLanguage',
    '#/components/parameters/RequestIdOptional',
  ]);
  if ((summary?.parameters ?? []).some((parameter) => !approvedParameters.has(parameter?.$ref)))
    fail('getAdminSummary must not accept selector, dimension, threshold, or drill-down inputs.');
  if (summary?.requestBody) fail('getAdminSummary must not define a request body.');
  if (summary?.responses?.['503']?.$ref !== '#/components/responses/LegalGateProblem')
    fail('getAdminSummary must expose the fail-closed inactive-metric legal gate.');
}

function verifyImplementedRoutes(mode) {
  if (!mode) return;
  const routePath = path.join(repositoryRoot, 'services/api/src/routes/audit-admin.ts');
  if (!fs.existsSync(routePath)) {
    fail('Feature 008 route module is not implemented.');
    return;
  }
  const routeText = fs.readFileSync(routePath, 'utf8');
  const registered = [...routeText.matchAll(/app\.(get|post)\(\s*['"]([^'"]+)['"]/g)].map(
    ([, method, route]) => [
      method.toUpperCase(),
      route.replace(/^\/v1/, '').replace(/:eventId/g, '{eventId}'),
    ],
  );
  const expectedCount = mode === 'admin-export' ? 5 : 7;
  const expected = [...expectedOperations.values()].slice(0, expectedCount);
  const comparableRoutes = (routes) => routes.map((route) => route.join(' ')).sort();
  if (JSON.stringify(comparableRoutes(registered)) !== JSON.stringify(comparableRoutes(expected)))
    fail(
      `Implemented ${mode} routes must match the first ${expectedCount} locked operations exactly; found ${JSON.stringify(registered)}.`,
    );
}

const implementationArguments = process.argv.slice(2);
let implementationMode;
if (implementationArguments.length > 0) {
  if (
    implementationArguments.length !== 2 ||
    implementationArguments[0] !== '--implemented' ||
    !['admin-export', 'all'].includes(implementationArguments[1])
  )
    fail(`Unsupported contract verifier arguments: ${implementationArguments.join(' ')}.`);
  else implementationMode = implementationArguments[1];
}

const contractText = fs.readFileSync(contractPath, 'utf8');
const document = parseDocument(contractText, { uniqueKeys: true });
for (const error of document.errors) fail(`Invalid OpenAPI YAML: ${error.message}`);
const api = document.toJS();
const catalog = parseCatalog(fs.readFileSync(catalogPath, 'utf8'));

if (api?.openapi !== '3.1.1') fail('Feature 008 contract must use OpenAPI 3.1.1.');
if (api?.servers?.[0]?.url !== '/v1') fail('Feature 008 operations must remain under /v1.');
verifyOperations(api, catalog);
verifyPagination(api);
verifyIdempotency(api);
verifyServiceBoundary(api);
verifySummaryBoundary(api);
verifyImplementedRoutes(implementationMode);

if (failures.length > 0) {
  console.error('Feature 008 contract verification failed:');
  for (const failure of failures.sort()) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(
  `Feature 008 contract verified: openapi=3.1.1, operation_count=${expectedOperations.size}, pagination=1/25/100, problems=RFC9457, idempotency=required, internal_auth=service/private${implementationMode ? `, implemented=${implementationMode}` : ''}.`,
);
