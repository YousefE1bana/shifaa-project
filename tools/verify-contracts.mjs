import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { parseDocument } from 'yaml';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const openApiPath = path.join(repoRoot, 'specs/001-identity-onboarding/contracts/openapi.yaml');
const catalogPath = path.join(repoRoot, 'docs/architecture/SHIFAA-API-Catalog.md');
const contractModulePath = path.join(repoRoot, 'packages/contracts/src/identity-onboarding.ts');
const clientPath = path.join(repoRoot, 'packages/api-client/src/identity-onboarding.ts');
const facilityOpenApiPath = path.join(
  repoRoot,
  'specs/003-facility-onboarding-rbac/contracts/openapi.yaml',
);
const facilityContractModulePath = path.join(
  repoRoot,
  'packages/contracts/src/facility-onboarding.ts',
);
const facilityClientPath = path.join(repoRoot, 'packages/api-client/src/facility-onboarding.ts');
const facilityRoutesPath = path.join(repoRoot, 'services/api/src/routes/facility-onboarding.ts');
const familyOpenApiPath = path.join(
  repoRoot,
  'specs/004-family-care-relationships/contracts/openapi.yaml',
);
const familyContractModulePath = path.join(repoRoot, 'packages/contracts/src/family-care.ts');
const familyClientPath = path.join(repoRoot, 'packages/api-client/src/family-care.ts');
const familyRoutesPath = path.join(repoRoot, 'services/api/src/routes/family-care.ts');
const privacyOpenApiPath = path.join(
  repoRoot,
  'specs/005-privacy-dsr-notifications/contracts/openapi.yaml',
);
const privacyContractModulePath = path.join(
  repoRoot,
  'packages/contracts/src/privacy-dsr-notifications.ts',
);
const privacyClientPath = path.join(
  repoRoot,
  'packages/api-client/src/privacy-dsr-notifications.ts',
);
const privacyRoutesPath = path.join(
  repoRoot,
  'services/api/src/routes/privacy-dsr-notifications.ts',
);
const discoverySosOpenApiPath = path.join(
  repoRoot,
  'specs/006-discovery-sos-foundation/contracts/openapi.yaml',
);
const discoverySosContractModulePath = path.join(
  repoRoot,
  'packages/contracts/src/discovery-sos.ts',
);
const discoverySosClientPath = path.join(repoRoot, 'packages/api-client/src/discovery-sos.ts');
const discoverySosRoutesPath = path.join(repoRoot, 'services/api/src/routes/discovery-sos.ts');
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
  const document = parseDocument(text, { uniqueKeys: true });
  for (const error of document.errors) failures.push(`Invalid OpenAPI YAML: ${error.message}`);
  const value = document.toJS();
  for (const [apiPath, pathItem] of Object.entries(value?.paths ?? {})) {
    for (const method of ['get', 'post', 'put', 'patch', 'delete']) {
      const operation = pathItem?.[method];
      if (!operation) continue;
      if (typeof operation.operationId !== 'string' || !operation.operationId)
        failures.push(`OpenAPI operation ${method.toUpperCase()} ${apiPath} has no operationId.`);
      else if (operations.has(operation.operationId))
        failures.push(`Duplicate OpenAPI operationId: ${operation.operationId}.`);
      else
        operations.set(operation.operationId, {
          method: method.toUpperCase(),
          path: apiPath,
          requirements: Array.isArray(operation['x-shifaa-requirements'])
            ? operation['x-shifaa-requirements'].map(String)
            : [],
        });
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

const quotedOperationProbe = parseOpenApi(`openapi: 3.1.0
paths:
  /probe:
    post:
      operationId: "transitionDependent"
`);
if (!quotedOperationProbe.has('transitionDependent'))
  failures.push('OpenAPI parser failed the quoted operationId security probe.');

function parseCatalog(text) {
  const operations = new Map();
  for (const line of text.split(/\r?\n/)) {
    const match = line.match(
      /^\|\s*`([^`]+)`\s*\|\s*`(GET|POST|PUT|PATCH|DELETE) ([^`]+)`\s*\|[^|]*\|[^|]*\|[^|]*\|\s*([^|]+?)\s*\|\s*$/,
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

const facilityOpenApiText = mustRead(facilityOpenApiPath);
const facilityContractModule = mustRead(facilityContractModulePath);
const facilityClient = mustRead(facilityClientPath);
const facilityRoutes = mustRead(facilityRoutesPath);
const facilityOpenApi = parseOpenApi(facilityOpenApiText);
if (!/^openapi:\s*3\.1\.1\s*$/m.test(facilityOpenApiText))
  failures.push('Facility feature contract must declare OpenAPI 3.1.1.');
if (facilityOpenApi.size !== 22)
  failures.push(
    `Facility feature OpenAPI must contain 22 operations; found ${facilityOpenApi.size}.`,
  );
for (const [operationId, operation] of facilityOpenApi) {
  const canonical = catalog.get(operationId);
  if (!canonical) {
    failures.push(`Facility operation ${operationId} is absent from the canonical API catalog.`);
    continue;
  }
  if (canonical.method !== operation.method || canonical.path !== operation.path) {
    failures.push(
      `${operationId} drift: facility OpenAPI ${operation.method} ${operation.path}; catalog ${canonical.method} ${canonical.path}.`,
    );
  }
  for (const [label, source] of [
    ['contract module', facilityContractModule],
    ['generated client', facilityClient],
    ['registered routes', facilityRoutes],
  ]) {
    if (!new RegExp(`\\b${operationId}\\b`).test(source))
      failures.push(`Facility ${label} is missing ${operationId}.`);
  }
}
if (!/@generated\b/i.test(facilityClient))
  failures.push('Facility API client is missing an @generated marker.');

const familyOpenApiText = mustRead(familyOpenApiPath);
const familyContractModule = mustRead(familyContractModulePath);
const familyClient = mustRead(familyClientPath);
const familyRoutes = mustRead(familyRoutesPath);
const familyOpenApi = parseOpenApi(familyOpenApiText);
const activeFamilyRequirements = new Set([
  'FR-FAM-001',
  'FR-FAM-002',
  'FR-FAM-004',
  'FR-FAM-005',
  'FR-FAM-006',
  'FR-FAM-007',
  'FR-FAM-008',
]);
if (!/^openapi:\s*3\.1\.(?:0|1)\s*$/m.test(familyOpenApiText))
  failures.push('Family Care feature contract must declare OpenAPI 3.1.x.');
if (familyOpenApi.size !== 12)
  failures.push(`Family Care OpenAPI must contain 12 operations; found ${familyOpenApi.size}.`);
for (const [operationId, operation] of familyOpenApi) {
  for (const requirement of operation.requirements)
    if (requirement.startsWith('FR-FAM-') && !activeFamilyRequirements.has(requirement))
      failures.push(`${operationId} references excluded or unknown requirement ${requirement}.`);
  const canonical = catalog.get(operationId);
  if (!canonical) {
    failures.push(`Family Care operation ${operationId} is absent from the canonical API catalog.`);
    continue;
  }
  if (canonical.method !== operation.method || canonical.path !== operation.path) {
    failures.push(
      `${operationId} drift: Family Care OpenAPI ${operation.method} ${operation.path}; catalog ${canonical.method} ${canonical.path}.`,
    );
  }
  for (const requirement of canonical.requirements.filter((value) =>
    activeFamilyRequirements.has(value),
  )) {
    if (!operation.requirements.includes(requirement))
      failures.push(
        `${operationId} is missing catalog requirement ${requirement} in Family Care x-shifaa-requirements.`,
      );
  }
  for (const [label, source] of [
    ['contract module', familyContractModule],
    ['generated client', familyClient],
    ['registered routes', familyRoutes],
  ]) {
    if (!new RegExp(`\\b${operationId}\\b`).test(source))
      failures.push(`Family Care ${label} is missing ${operationId}.`);
  }
}
if (!/@generated\b/i.test(familyClient))
  failures.push('Family Care API client is missing an @generated marker.');
for (const forbidden of ['transitionDependent', 'createGuardianshipUpload', 'createSosIncident'])
  if (familyOpenApi.has(forbidden))
    failures.push(`Forbidden Family Care operation is present: ${forbidden}.`);

const privacyOpenApiText = mustRead(privacyOpenApiPath);
const privacyContractModule = mustRead(privacyContractModulePath);
const privacyClient = mustRead(privacyClientPath);
const privacyRoutes = mustRead(privacyRoutesPath);
const privacyOpenApi = parseOpenApi(privacyOpenApiText);
if (!/^openapi:\s*3\.1\.1\s*$/m.test(privacyOpenApiText))
  failures.push('Privacy DSR and Notifications contract must declare OpenAPI 3.1.1.');
if (privacyOpenApi.size !== 12)
  failures.push(
    `Privacy DSR and Notifications OpenAPI must contain 12 operations; found ${privacyOpenApi.size}.`,
  );
for (const [operationId, operation] of privacyOpenApi) {
  const canonical = catalog.get(operationId);
  if (!canonical) {
    failures.push(`Privacy operation ${operationId} is absent from the canonical API catalog.`);
    continue;
  }
  if (canonical.method !== operation.method || canonical.path !== operation.path)
    failures.push(
      `${operationId} drift: Privacy OpenAPI ${operation.method} ${operation.path}; catalog ${canonical.method} ${canonical.path}.`,
    );
  for (const [label, source] of [
    ['contract module', privacyContractModule],
    ['generated client', privacyClient],
    ['registered routes', privacyRoutes],
  ])
    if (!new RegExp(`\\b${operationId}\\b`).test(source))
      failures.push(`Privacy ${label} is missing ${operationId}.`);
}
if (!/@generated\b/i.test(privacyClient))
  failures.push('Privacy API client is missing an @generated marker.');

const discoverySosOpenApiText = mustRead(discoverySosOpenApiPath);
const discoverySosContractModule = mustRead(discoverySosContractModulePath);
const discoverySosClient = mustRead(discoverySosClientPath);
const discoverySosRoutes = mustRead(discoverySosRoutesPath);
const discoverySosOpenApi = parseOpenApi(discoverySosOpenApiText);
if (!/^openapi:\s*3\.1\.1\s*$/m.test(discoverySosOpenApiText))
  failures.push('Discovery and SOS contract must declare OpenAPI 3.1.1.');
if (discoverySosOpenApi.size !== 10)
  failures.push(
    `Discovery and SOS OpenAPI must contain exactly 10 operations; found ${discoverySosOpenApi.size}.`,
  );
for (const [operationId, operation] of discoverySosOpenApi) {
  const canonical = catalog.get(operationId);
  if (!canonical) {
    failures.push(
      `Discovery/SOS operation ${operationId} is absent from the canonical API catalog.`,
    );
    continue;
  }
  if (canonical.method !== operation.method || canonical.path !== operation.path)
    failures.push(
      `${operationId} drift: Discovery/SOS OpenAPI ${operation.method} ${operation.path}; catalog ${canonical.method} ${canonical.path}.`,
    );
  for (const [label, source] of [
    ['contract module', discoverySosContractModule],
    ['generated client', discoverySosClient],
    ['registered routes', discoverySosRoutes],
  ])
    if (!new RegExp(`\\b${operationId}\\b`).test(source))
      failures.push(`Discovery/SOS ${label} is missing ${operationId}.`);
}
if (!/@generated\b/i.test(discoverySosClient))
  failures.push('Discovery and SOS API client is missing an @generated marker.');
for (const forbidden of [
  'searchDoctors',
  'searchPharmacyStock',
  'changeBedState',
  'recordArrival',
  'updateTriage',
])
  if (discoverySosOpenApi.has(forbidden))
    failures.push(`Forbidden later-phase operation is present in 006: ${forbidden}.`);

if (failures.length > 0) {
  console.error('Contract verification failed:');
  for (const failure of failures.sort()) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(
  'Contract verification passed: 72 OpenAPI operations match the catalog, generated contracts, generated clients, and registered feature routes.',
);
