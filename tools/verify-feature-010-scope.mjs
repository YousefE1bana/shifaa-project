import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { parseDocument } from 'yaml';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const featureRoot = 'specs/010-encounters-referrals-contextual-chat';
const approvedManifestSha256 = '18e4471d686990e797e8a5e370a20ceda7ea823020e3f84fdea0e03a65394310';
const approvedSourceVersion = 'SHIFAA-F010-P0-SOURCE@0.3.0-test-only';

const expectedFunctionalRequirements = ['FR-FAC-006', 'FR-CLINIC-006', 'FR-CLINIC-007'];
const expectedNonFunctionalRequirements = [
  'NFR-SEC-001',
  'NFR-SEC-002',
  'NFR-SEC-003',
  'NFR-SEC-004',
  'NFR-SEC-005',
  'NFR-SEC-006',
  'NFR-SEC-007',
  'NFR-PRIV-001',
  'NFR-PRIV-002',
  'NFR-PRIV-004',
  'NFR-I18N-001',
  'NFR-A11Y-001',
  'NFR-PERF-001',
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
const expectedGates = [
  'OPEN-LEGAL-001',
  'OPEN-LEGAL-002',
  'OPEN-LEGAL-007',
  'OPEN-PRODUCT-001',
  'OPEN-TECH-002',
  'OPEN-TECH-003',
  'OPEN-UX-001',
  'OPEN-UX-002',
];
const expectedAcceptanceCriteria = Array.from(
  { length: 14 },
  (_, index) => `AC-${String(index + 1).padStart(2, '0')}`,
);
const expectedOperations = new Map([
  ['createEncounter', ['POST', '/encounters']],
  ['getEncounter', ['GET', '/encounters/{encounterId}']],
  ['updateEncounter', ['PATCH', '/encounters/{encounterId}']],
  ['signEncounterNote', ['POST', '/encounters/{encounterId}/notes']],
  ['completeEncounter', ['POST', '/encounters/{encounterId}/complete']],
  ['createReferral', ['POST', '/encounters/{encounterId}/referrals']],
  ['listReferrals', ['GET', '/referrals']],
  ['acceptReferral', ['POST', '/referrals/{referralId}/accept']],
  ['listContextMessages', ['GET', '/contexts/{contextType}/{contextId}/messages']],
  ['sendContextMessage', ['POST', '/contexts/{contextType}/{contextId}/messages']],
]);

function readText(root, relativePath, failures) {
  const absolutePath = path.join(root, relativePath);
  try {
    if (!fs.statSync(absolutePath).isFile()) throw new Error('not a regular file');
    return fs.readFileSync(absolutePath, 'utf8');
  } catch (error) {
    failures.push(`Missing or unreadable required text artifact ${relativePath}: ${error.message}`);
    return '';
  }
}

function readJson(relativePath, text, failures) {
  try {
    return JSON.parse(text);
  } catch (error) {
    failures.push(`Invalid JSON in ${relativePath}: ${error.message}`);
    return null;
  }
}

function valuesInBackticks(text, pattern) {
  return [...text.matchAll(pattern)].map((match) => match[1]);
}

function gateIdsIn(text) {
  return [
    ...new Set(
      [...text.matchAll(/\bOPEN-(LEGAL|PRODUCT|TECH|UX)-(\d{3}(?:\/\d{3})*)\b/g)].flatMap(
        ([, family, numbers]) => numbers.split('/').map((number) => `OPEN-${family}-${number}`),
      ),
    ),
  ];
}

function verifyExactInventory(label, actual, expected, failures, detail) {
  const duplicates = actual.filter((value, index) => actual.indexOf(value) !== index);
  const expectedSorted = [...expected].sort();
  const actualUniqueSorted = [...new Set(actual)].sort();
  if (
    duplicates.length > 0 ||
    actual.length !== expected.length ||
    JSON.stringify(actualUniqueSorted) !== JSON.stringify(expectedSorted)
  ) {
    failures.push(
      `${label} must contain exactly ${detail}; found ${actual.length} values (${[...new Set(actual)].join(', ')}).`,
    );
  }
}

function extractSection(text, heading, nextHeadingPattern, source, failures) {
  const start = text.indexOf(heading);
  if (start < 0) {
    failures.push(`${source} is missing ${heading}.`);
    return '';
  }
  const contentStart = start + heading.length;
  const remaining = text.slice(contentStart);
  const nextHeading = nextHeadingPattern.exec(remaining);
  return remaining.slice(0, nextHeading?.index ?? remaining.length);
}

function parseMarkdownOperations(section) {
  const entries = [];
  for (const line of section.split(/\r?\n/)) {
    const match = line.match(
      /^\|\s*`([A-Za-z][A-Za-z0-9]+)`\s*\|\s*`(GET|POST|PUT|PATCH|DELETE) ([^`]+)`\s*\|/,
    );
    if (match) entries.push([match[1], [match[2], match[3]]]);
  }
  return entries;
}

function verifyOperations(source, entries, failures) {
  const actual = new Map();
  for (const [operationId, route] of entries) {
    if (actual.has(operationId)) {
      failures.push(`Duplicate Feature 010 operation in ${source}: ${operationId}.`);
      continue;
    }
    actual.set(operationId, route);
  }

  if (actual.size !== expectedOperations.size)
    failures.push(`${source} must contain exactly the ten approved operation IDs.`);
  for (const [operationId, expectedRoute] of expectedOperations) {
    if (JSON.stringify(actual.get(operationId)) !== JSON.stringify(expectedRoute))
      failures.push(
        `${source} route mismatch for ${operationId}; expected ${expectedRoute.join(' ')}.`,
      );
  }
  for (const operationId of actual.keys())
    if (!expectedOperations.has(operationId))
      failures.push(`Unapproved Feature 010 operation in ${source}: ${operationId}.`);
}

function parseOpenApiOperations(openApiText, failures) {
  let document;
  try {
    document = parseDocument(openApiText, { uniqueKeys: true });
  } catch (error) {
    failures.push(`Invalid Feature 010 OpenAPI: ${error.message}`);
    return [];
  }
  for (const error of document.errors)
    failures.push(`Invalid Feature 010 OpenAPI: ${error.message}`);

  let openApi;
  try {
    openApi = document.toJS();
  } catch (error) {
    failures.push(`Invalid Feature 010 OpenAPI: ${error.message}`);
    return [];
  }
  if (openApi?.openapi !== '3.1.1')
    failures.push('Feature 010 OpenAPI must preserve version 3.1.1.');

  const entries = [];
  for (const [apiPath, pathItem] of Object.entries(openApi?.paths ?? {})) {
    for (const method of ['get', 'post', 'put', 'patch', 'delete', 'head', 'options', 'trace']) {
      const operationId = pathItem?.[method]?.operationId;
      if (operationId) entries.push([String(operationId), [method.toUpperCase(), apiPath]]);
    }
  }
  return entries;
}

function parseCatalogOperations(catalogText, failures) {
  const section = extractSection(
    catalogText,
    '## 4. Clinic, queues, encounters, referrals, and chat',
    /^## /m,
    'API Catalog',
    failures,
  );
  const entries = [];
  for (const line of section.split(/\r?\n/)) {
    const cells = line
      .split('|')
      .slice(1, -1)
      .map((cell) => cell.trim());
    if (cells.length < 6) continue;
    const operationMatch = cells[0].match(/^`([A-Za-z][A-Za-z0-9]+)`$/);
    const routeMatch = cells[1].match(/^`(GET|POST|PUT|PATCH|DELETE) ([^`]+)`$/);
    if (!operationMatch || !routeMatch) continue;
    if (!/\b(?:CLINIC-006|CLINIC-007|FAC-006)\b/.test(cells[5])) continue;
    entries.push([operationMatch[1], [routeMatch[1], routeMatch[2]]]);
  }
  return entries;
}

function verifyAcceptanceCriteria(specText, tasksText, failures) {
  const specCriteriaSection = extractSection(
    specText,
    '### Acceptance Criteria and Test Vectors',
    /^## 12\./m,
    'Feature 010 specification',
    failures,
  );
  const specCriteria = [...specCriteriaSection.matchAll(/^\s*-\s+\*\*(AC-\d{2})\b/gm)].map(
    (match) => match[1],
  );
  verifyExactInventory(
    'spec acceptance criteria',
    specCriteria,
    expectedAcceptanceCriteria,
    failures,
    'AC-01 through AC-14 once',
  );

  const closureSection = extractSection(
    tasksText,
    '## Acceptance criteria closure before final integration',
    /^## Final phase/m,
    'Feature 010 tasks',
    failures,
  );
  const closureCriteria = [...closureSection.matchAll(/^\|\s*`(AC-\d{2})`\s*\|/gm)].map(
    (match) => match[1],
  );
  verifyExactInventory(
    'checkpoint closure table',
    closureCriteria,
    expectedAcceptanceCriteria,
    failures,
    'AC-01 through AC-14 once',
  );
}

function verifyRequirements(specText, failures) {
  const frRow = specText.split(/\r?\n/).find((line) => /^\| Target FR IDs \|/.test(line));
  const nfrRow = specText.split(/\r?\n/).find((line) => /^\| Target NFR IDs \|/.test(line));
  const actualFrs = frRow ? valuesInBackticks(frRow, /(FR-[A-Z]+-\d+)/g) : [];
  const actualNfrs = nfrRow ? valuesInBackticks(nfrRow, /(NFR-[A-Z0-9]+-\d+)/g) : [];

  verifyExactInventory(
    'target FR metadata',
    actualFrs,
    expectedFunctionalRequirements,
    failures,
    'the three approved requirements',
  );
  verifyExactInventory(
    'target NFR metadata',
    actualNfrs,
    expectedNonFunctionalRequirements,
    failures,
    'the 23 approved requirements',
  );
}

function verifyGates(specText, planText, tasksText, failures) {
  for (const [source, text] of [
    ['spec', specText],
    ['plan', planText],
    ['tasks', tasksText],
  ]) {
    verifyExactInventory(
      `Feature 010 ${source} gate inventory`,
      gateIdsIn(text),
      expectedGates,
      failures,
      'the eight approved gate IDs',
    );
  }
}

function verifyBaseline(specText, planText, tasksText, manifestText, manifest, failures) {
  const digest = createHash('sha256').update(manifestText, 'utf8').digest('hex');
  if (digest !== approvedManifestSha256)
    failures.push(`approved Feature 010 baseline manifest SHA-256 mismatch: ${digest}.`);
  for (const [source, text] of [
    ['specification', specText],
    ['plan', planText],
  ]) {
    if (!text.includes(approvedManifestSha256))
      failures.push(`Feature 010 ${source} is missing the approved baseline manifest SHA-256.`);
    if (!text.includes(approvedSourceVersion))
      failures.push(`Feature 010 ${source} is missing the approved TEST-ONLY source version.`);
  }
  if (manifest?.sourceVersion !== approvedSourceVersion)
    failures.push(
      'Feature 010 manifest source version does not match the approved TEST-ONLY version.',
    );
  if (manifest?.entryCount !== 408)
    failures.push('Feature 010 baseline manifest must retain exactly 408 references.');
}

function verifyF009ProducerBoundary(dataModelText, failures) {
  for (const marker of [
    'with no Feature 010 validation, route, or producer',
    'no Feature 009 transition into `requested`, `in_queue`, `in_consultation`, `completed`, or `no_show`',
    'It defines no producer for `in_service`.',
  ]) {
    if (!dataModelText.includes(marker))
      failures.push(`F009 producer boundary marker is missing: ${marker}.`);
  }
}

function verifyRoadmapBoundary(roadmapText, failures) {
  const featureSection = extractSection(
    roadmapText,
    '### 010 — Encounters, Referrals, and Contextual Chat',
    /^### 011 /m,
    'Remaining Specs Roadmap',
    failures,
  );
  const requirementLine = featureSection
    .split(/\r?\n/)
    .find((line) => line.startsWith('- **FR/NFR:**'));
  const roadmapFrs = requirementLine
    ? valuesInBackticks(requirementLine, /(FR-[A-Z0-9]+-\d+)/g)
    : [];
  verifyExactInventory(
    'Feature 010 roadmap FR inventory',
    roadmapFrs,
    expectedFunctionalRequirements,
    failures,
    'the three approved requirements',
  );

  const operationsLine = featureSection
    .split(/\r?\n/)
    .find((line) => line.startsWith('- **API operation IDs:**'));
  const roadmapOperations = operationsLine
    ? valuesInBackticks(operationsLine, /`([A-Za-z][A-Za-z0-9]+)`/g)
    : [];
  verifyExactInventory(
    'Feature 010 roadmap API operation inventory',
    roadmapOperations,
    [...expectedOperations.keys()],
    failures,
    'the ten approved operation IDs',
  );

  const actualRoadmapGates = gateIdsIn(featureSection);
  verifyExactInventory(
    'Feature 010 roadmap gate inventory',
    actualRoadmapGates,
    expectedGates,
    failures,
    'the eight approved gate IDs',
  );
  if (!featureSection.includes('009 appointment/queue context'))
    failures.push('Feature 010 roadmap must retain the Feature 009 appointment/queue dependency.');
}

function verifyPackageScript(packageText, failures) {
  const packageJson = readJson('package.json', packageText, failures);
  if (
    packageJson?.scripts?.['test:encounters:scope'] !==
    'node --test tools/verify-feature-010-scope.test.mjs'
  )
    failures.push('Focused Feature 010 scope test script is missing or has drifted.');
}

export function verifyFeature010Scope({ root = repositoryRoot } = {}) {
  const failures = [];
  const specText = readText(root, `${featureRoot}/spec.md`, failures);
  const planText = readText(root, `${featureRoot}/plan.md`, failures);
  const tasksText = readText(root, `${featureRoot}/tasks.md`, failures);
  const openApiText = readText(root, `${featureRoot}/contracts/openapi.yaml`, failures);
  const manifestText = readText(
    root,
    `${featureRoot}/visual-baselines/reference-manifest.json`,
    failures,
  );
  const manifest = readJson(
    `${featureRoot}/visual-baselines/reference-manifest.json`,
    manifestText,
    failures,
  );
  const catalogText = readText(root, 'docs/architecture/SHIFAA-API-Catalog.md', failures);
  const roadmapText = readText(root, 'docs/governance/SHIFAA-Remaining-Specs-Roadmap.md', failures);
  const predecessorDataModelText = readText(
    root,
    'specs/009-clinic-scheduling-appointments-queue/data-model.md',
    failures,
  );
  const packageText = readText(root, 'package.json', failures);

  verifyRequirements(specText, failures);
  verifyAcceptanceCriteria(specText, tasksText, failures);
  verifyGates(specText, planText, tasksText, failures);
  verifyBaseline(specText, planText, tasksText, manifestText, manifest, failures);
  verifyF009ProducerBoundary(predecessorDataModelText, failures);
  verifyPackageScript(packageText, failures);

  verifyRoadmapBoundary(roadmapText, failures);

  const specOperationsSection = extractSection(
    specText,
    '## 7. API endpoint specifications',
    /^## 8\./m,
    'Feature 010 specification',
    failures,
  );
  verifyOperations(
    'Feature 010 specification operations',
    parseMarkdownOperations(specOperationsSection),
    failures,
  );
  verifyOperations('Feature 010 OpenAPI', parseOpenApiOperations(openApiText, failures), failures);
  verifyOperations(
    'API Catalog Feature 010 operations',
    parseCatalogOperations(catalogText, failures),
    failures,
  );

  return [...new Set(failures)].sort();
}

function main() {
  const failures = verifyFeature010Scope();
  if (failures.length > 0) {
    console.error('Feature 010 scope verification failed:');
    for (const failure of failures) console.error(`- ${failure}`);
    process.exitCode = 1;
    return;
  }
  console.log(
    `Feature 010 scope verified: fr_count=${expectedFunctionalRequirements.length}, nfr_count=${expectedNonFunctionalRequirements.length}, operation_count=${expectedOperations.size}, acceptance_criteria_count=${expectedAcceptanceCriteria.length}, gate_count=${expectedGates.length}, baseline_sha256=${approvedManifestSha256}, f009_producer_boundary=preserved.`,
  );
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
