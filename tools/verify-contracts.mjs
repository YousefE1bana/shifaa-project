import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const openApiPath = path.join(repoRoot, 'specs/001-identity-onboarding/contracts/openapi.yaml');
const catalogPath = path.join(repoRoot, 'docs/architecture/SHIFAA-API-Catalog.md');
const contractModulePath = path.join(repoRoot, 'packages/contracts/src/identity-onboarding.ts');
const clientPath = path.join(repoRoot, 'packages/api-client/src/identity-onboarding.ts');
const failures = [];

function mustRead(file) {
  if (!fs.existsSync(file)) {
    failures.push(`Missing required contract artifact: ${path.relative(repoRoot, file)}`);
    return '';
  }
  return fs.readFileSync(file, 'utf8');
}

function parseOpenApi(text) {
  const operations = new Map();
  let currentPath;
  let currentMethod;
  for (const line of text.split(/\r?\n/)) {
    const pathMatch = line.match(/^  (\/[^:]+):\s*$/);
    if (pathMatch) {
      currentPath = pathMatch[1];
      currentMethod = undefined;
      continue;
    }
    const methodMatch = line.match(/^    (get|post|put|patch|delete):\s*$/i);
    if (methodMatch) {
      currentMethod = methodMatch[1].toUpperCase();
      continue;
    }
    const operationMatch = line.match(/^      operationId:\s*([A-Za-z0-9_-]+)\s*$/);
    if (operationMatch && currentPath && currentMethod) {
      operations.set(operationMatch[1], {
        method: currentMethod,
        path: currentPath,
        requirements: [],
      });
      continue;
    }
    const requirementsMatch = line.match(/^      x-shifaa-requirements:\s*\[([^\]]*)\]\s*$/);
    if (requirementsMatch && operations.size > 0) {
      const operation = [...operations.values()].at(-1);
      operation.requirements = requirementsMatch[1]
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean);
    }
  }
  return operations;
}

function expandCatalogRequirements(cell) {
  const result = [];
  for (const group of cell
    .split(';')
    .map((item) => item.trim())
    .filter(Boolean)) {
    if (group.startsWith('NFR-')) {
      result.push(
        ...group
          .split('/')
          .map((item, index, all) =>
            index === 0 ? item : `${all[0].split('-').slice(0, -1).join('-')}-${item}`,
          ),
      );
      continue;
    }
    const [first, ...rest] = group.split('/');
    result.push(`FR-${first}`);
    const prefix = first.split('-').slice(0, -1).join('-');
    result.push(...rest.map((item) => `FR-${prefix}-${item}`));
  }
  return result;
}

function parseCatalog(text) {
  const operations = new Map();
  for (const line of text.split(/\r?\n/)) {
    const match = line.match(
      /^\| `([^`]+)` \| `(GET|POST|PUT|PATCH|DELETE) ([^`]+)` \|[^|]*\|[^|]*\|[^|]*\| ([^|]+) \|\s*$/,
    );
    if (!match) continue;
    operations.set(match[1], {
      method: match[2],
      path: match[3],
      requirements: expandCatalogRequirements(match[4].trim()),
    });
  }
  return operations;
}

const openApiText = mustRead(openApiPath);
const catalogText = mustRead(catalogPath);
const contractModule = mustRead(contractModulePath);
const client = mustRead(clientPath);
const openApi = parseOpenApi(openApiText);
const catalog = parseCatalog(catalogText);

if (!/^openapi:\s*3\.1\.1\s*$/m.test(openApiText))
  failures.push('Feature contract must declare OpenAPI 3.1.1.');
if (openApi.size !== 16)
  failures.push(`Feature OpenAPI must contain 16 operations; found ${openApi.size}.`);

for (const [operationId, operation] of openApi) {
  const canonical = catalog.get(operationId);
  if (!canonical) {
    failures.push(`Operation ${operationId} is absent from the canonical API catalog.`);
    continue;
  }
  if (canonical.method !== operation.method || canonical.path !== operation.path) {
    failures.push(
      `${operationId} drift: OpenAPI ${operation.method} ${operation.path}; catalog ${canonical.method} ${canonical.path}.`,
    );
  }
  for (const requirement of canonical.requirements) {
    if (!operation.requirements.includes(requirement)) {
      failures.push(
        `${operationId} is missing catalog requirement ${requirement} in x-shifaa-requirements.`,
      );
    }
  }
  if (!new RegExp(`\\b${operationId}\\b`).test(contractModule)) {
    failures.push(`Generated contract module is missing ${operationId}.`);
  }
  if (!new RegExp(`\\b${operationId}\\b`).test(client)) {
    failures.push(`Generated API client is missing ${operationId}.`);
  }
}

if (!/@generated\b/i.test(client))
  failures.push(
    'API client is missing an @generated marker; handwritten endpoint drift is not allowed.',
  );

if (failures.length > 0) {
  console.error('Contract verification failed:');
  for (const failure of failures.sort()) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(
  'Contract verification passed: 16 OpenAPI operations match the catalog, generated contracts, and generated client.',
);
