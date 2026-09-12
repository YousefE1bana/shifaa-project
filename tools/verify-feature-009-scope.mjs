import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { parseDocument } from 'yaml';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const featureRoot = 'specs/009-clinic-scheduling-appointments-queue';
const failures = [];

const expectedOperations = new Map([
  ['searchDoctors', ['GET', '/discovery/doctors']],
  ['listDoctorAvailability', ['GET', '/clinics/{facilityId}/doctors/{doctorId}/availability']],
  ['createSchedule', ['POST', '/clinics/{facilityId}/schedules']],
  ['updateSchedule', ['PATCH', '/clinics/{facilityId}/schedules/{scheduleId}']],
  ['createScheduleException', ['POST', '/clinics/{facilityId}/schedules/{scheduleId}/exceptions']],
  ['createAppointment', ['POST', '/appointments']],
  ['getAppointment', ['GET', '/appointments/{appointmentId}']],
  ['listAppointments', ['GET', '/appointments']],
  ['cancelAppointment', ['POST', '/appointments/{appointmentId}/cancel']],
  ['rescheduleAppointment', ['POST', '/appointments/{appointmentId}/reschedule']],
  ['checkInAppointment', ['POST', '/appointments/{appointmentId}/check-in']],
  ['getQueue', ['GET', '/clinics/{facilityId}/queues']],
  ['getMyQueuePosition', ['GET', '/appointments/{appointmentId}/queue-position']],
  ['callQueueEntry', ['POST', '/queue-entries/{queueEntryId}/call']],
  ['reorderQueueEntry', ['POST', '/queue-entries/{queueEntryId}/reorder']],
  ['completeQueueEntry', ['POST', '/queue-entries/{queueEntryId}/complete']],
  ['sendDoctorDelay', ['POST', '/clinics/{facilityId}/doctors/{doctorId}/delay']],
  ['declareDoctorAbsence', ['POST', '/clinics/{facilityId}/doctors/{doctorId}/absence']],
]);

const expectedRoutes = [
  '/discover',
  '/doctors/:id',
  '/appointments/new',
  '/appointments/:id',
  '/today',
  '/queue',
  '/schedule',
  '/appointments/:id',
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
const requiredGates = [
  'OPEN-UX-002',
  'OPEN-TECH-002',
  'OPEN-TECH-003',
  'OPEN-PRODUCT-001',
  'OPEN-VENDOR-002',
  'OPEN-LEGAL-001',
  'OPEN-LEGAL-002',
  'OPEN-LEGAL-007',
];
const requiredRequirements = [
  'FR-FAC-005',
  'FR-CLINIC-001',
  'FR-CLINIC-002',
  'FR-CLINIC-003',
  'FR-CLINIC-004',
  'FR-CLINIC-005',
  'FR-CLINIC-008',
  'FR-DISC-001',
  'PATIENT',
  'NFR-AVAIL-001',
  'NFR-API-001',
  'NFR-QUALITY-001',
];
const plannedScripts = new Map([
  ['test:clinic-scheduling:scope', 'node tools/verify-feature-009-scope.mjs'],
  ['test:clinic-scheduling:contract', 'node tools/verify-feature-009-contract.mjs'],
  ['test:clinic-scheduling:db', 'node tools/run-clinic-scheduling-postgres-test.mjs'],
  ['test:clinic-scheduling:rls', 'node tools/run-clinic-scheduling-postgres-test.mjs rls'],
  ['test:clinic-scheduling:migration', 'node tools/run-clinic-scheduling-migration-test.mjs'],
  ['test:clinic-scheduling:restore', 'node tools/run-clinic-scheduling-restore-test.mjs'],
  [
    'test:clinic-scheduling:notifications',
    'pnpm --filter @shifaa/worker test -- clinic-scheduling-notifications',
  ],
  [
    'test:clinic-scheduling:e2e',
    'tsx --test --test-concurrency=1 tests/e2e/clinic-scheduling-notifications.spec.ts tests/e2e/clinic-scheduling-discovery-booking.spec.ts tests/e2e/clinic-scheduling-appointments.spec.ts tests/e2e/clinic-scheduling-queue.spec.ts tests/e2e/clinic-scheduling-schedule-delay-absence.spec.ts',
  ],
  [
    'test:clinic-scheduling:stack',
    'pnpm test:clinic-scheduling:db && pnpm test:clinic-scheduling:rls && pnpm test:clinic-scheduling:migration && pnpm test:clinic-scheduling:scope && pnpm test:clinic-scheduling:contract && pnpm test:clinic-scheduling:notifications && pnpm test:clinic-scheduling:e2e',
  ],
  [
    'test:clinic-scheduling:security',
    'pnpm secrets:check && pnpm architecture:check && node tools/verify-feature-009-evidence.mjs --security',
  ],
  ['test:clinic-scheduling:performance', 'tsx tools/clinic-scheduling-performance.ts'],
  [
    'test:clinic-scheduling:privacy',
    'pnpm secrets:check && pnpm architecture:check && node tools/verify-feature-009-evidence.mjs --privacy',
  ],
]);

function readText(relativePath) {
  const absolutePath = path.join(repositoryRoot, relativePath);
  try {
    if (path.extname(relativePath).toLowerCase() === '.png')
      throw new Error('PNG reads are prohibited by the Feature 009 scope contract');
    const stat = fs.statSync(absolutePath);
    if (!stat.isFile()) throw new Error('not a regular file');
    return fs.readFileSync(absolutePath, 'utf8');
  } catch (error) {
    failures.push(`Missing or unreadable required text artifact ${relativePath}: ${error.message}`);
    return '';
  }
}

function parseJson(relativePath, text) {
  try {
    return JSON.parse(text);
  } catch (error) {
    failures.push(`Invalid JSON in ${relativePath}: ${error.message}`);
    return null;
  }
}

function addOperation(entries, operationId, method, apiPath, source) {
  if (entries.some(([existingId]) => existingId === operationId)) {
    failures.push(`Duplicate operation in ${source}: ${operationId}.`);
    return;
  }
  entries.push([operationId, [method, apiPath]]);
}

function parseOpenApiOperations(openApiText) {
  let document;
  try {
    document = parseDocument(openApiText, { uniqueKeys: true });
  } catch (error) {
    failures.push(`Invalid Feature 009 OpenAPI: ${error.message}`);
    return [];
  }
  for (const error of document.errors)
    failures.push(`Invalid Feature 009 OpenAPI: ${error.message}`);
  let openApi;
  try {
    openApi = document.toJS();
  } catch (error) {
    failures.push(`Invalid Feature 009 OpenAPI: ${error.message}`);
    return [];
  }
  if (openApi?.openapi !== '3.1.1')
    failures.push('Feature 009 OpenAPI must preserve version 3.1.1.');
  const operations = [];
  for (const [apiPath, pathItem] of Object.entries(openApi?.paths ?? {})) {
    for (const method of ['get', 'post', 'put', 'patch', 'delete', 'head', 'options', 'trace']) {
      const operationId = pathItem?.[method]?.operationId;
      if (operationId)
        addOperation(operations, String(operationId), method.toUpperCase(), apiPath, 'OpenAPI');
    }
  }
  return operations;
}

function sectionText(text, sectionName, source) {
  const sectionStart = text.indexOf(sectionName);
  if (sectionStart < 0) {
    failures.push(`${source} is missing ${sectionName}.`);
    return '';
  }
  const sectionEnd = text.indexOf('\n## ', sectionStart + sectionName.length);
  return text.slice(sectionStart, sectionEnd < 0 ? text.length : sectionEnd);
}

function parseMarkdownOperations(text, sectionName, source) {
  const section = sectionText(text, sectionName, source);
  const operations = [];
  for (const line of section.split(/\r?\n/)) {
    const match = line.match(/^\|\s*`([^`]+)`\s*\|\s*`(GET|POST|PUT|PATCH|DELETE)\s+([^`]+)`\s*\|/);
    if (match) addOperation(operations, match[1], match[2], match[3], source);
  }
  return operations;
}

function operationMap(entries) {
  return new Map(entries);
}

function verifyExpectedOperations(source, entries) {
  if (entries.length !== expectedOperations.size)
    failures.push(
      `${source} must contain exactly 18 Feature 009 operations; found ${entries.length}.`,
    );
  const actual = operationMap(entries);
  for (const [operationId, expected] of expectedOperations) {
    if (JSON.stringify(actual.get(operationId)) !== JSON.stringify(expected))
      failures.push(`${source} route mismatch for ${operationId}; expected ${expected.join(' ')}.`);
  }
  for (const [operationId] of entries)
    if (!expectedOperations.has(operationId))
      failures.push(`Unapproved Feature 009 operation in ${source}: ${operationId}.`);
}

function verifyOperations(specText, openApiText, catalogText) {
  verifyExpectedOperations(
    'Feature 009 specification',
    parseMarkdownOperations(
      specText,
      '## 7. Exact operation contract boundary',
      'Feature 009 specification',
    ),
  );
  verifyExpectedOperations('OpenAPI', parseOpenApiOperations(openApiText));

  const discoveryCatalog = parseMarkdownOperations(
    catalogText,
    '## 3. Facilities, workforce, discovery, and SOS',
    'API Catalog discovery section',
  );
  const searchDoctorRows = discoveryCatalog.filter(
    ([operationId]) => operationId === 'searchDoctors',
  );
  if (searchDoctorRows.length !== 1)
    failures.push('API Catalog discovery section must contain exactly one searchDoctors row.');
  else if (
    JSON.stringify(searchDoctorRows[0][1]) !==
    JSON.stringify(expectedOperations.get('searchDoctors'))
  )
    failures.push('API Catalog route mismatch for searchDoctors; expected GET /discovery/doctors.');

  const catalogOperations = parseMarkdownOperations(
    catalogText,
    '## 4. Clinic, queues, encounters, referrals, and chat',
    'API Catalog',
  );
  const featureOperations = catalogOperations.slice(0, expectedOperations.size - 1);
  const expectedClinicOperations = [...expectedOperations.entries()].slice(1);
  if (JSON.stringify(featureOperations) !== JSON.stringify(expectedClinicOperations))
    failures.push(
      'API Catalog Feature 009 boundary must contain the 17 clinic/queue rows after searchDoctors in exact order.',
    );
  for (const [operationId] of catalogOperations.slice(expectedOperations.size - 1))
    if (expectedOperations.has(operationId))
      failures.push(
        `Duplicate Feature 009 operation after the API Catalog boundary: ${operationId}.`,
      );
  if (catalogOperations.length < expectedOperations.size - 1)
    failures.push('API Catalog Feature 009 clinic/queue boundary is incomplete.');
}

function backtickValues(line) {
  return [...line.matchAll(/`([^`]+)`/g)].map((match) => match[1]);
}

function verifyStates(dataModelText, specText, planText) {
  const appointmentLine = dataModelText.split(/\r?\n/).find((line) => /exact nine:/.test(line));
  const queueLine = dataModelText.split(/\r?\n/).find((line) => /exact five:/.test(line));
  const actualAppointments = appointmentLine ? backtickValues(appointmentLine) : [];
  const actualQueue = queueLine ? backtickValues(queueLine) : [];
  if (JSON.stringify(actualAppointments) !== JSON.stringify(expectedAppointmentStates))
    failures.push('Appointment state inventory must contain exactly the nine canonical states.');
  if (JSON.stringify(actualQueue) !== JSON.stringify(expectedQueueStates))
    failures.push('Queue state inventory must contain exactly the five canonical states.');
  for (const marker of [
    'Appointment states are the exact nine PRD values.',
    'Queue states are the exact five Data/RLS values',
    '`createAppointment` creates `confirmed`',
    '| `checkInAppointment` | `confirmed` → `checked_in`;',
    'Appointment `requested`, `in_queue`, `in_consultation`, `completed`, and `no_show`',
    'queue `removed` is produced only by the clarified absence side effect',
    'queue `in_service` have no Feature 009 producer',
    '`waiting` → `called`',
    '`called` → `completed`',
  ]) {
    if (!specText.includes(marker) && !planText.includes(marker))
      failures.push(`State producer marker is missing: ${marker}.`);
  }
}

function verifyRoutes(specText) {
  const section = sectionText(
    specText,
    '## 8. UI/UX and edge-state matrix',
    'Feature 009 specification',
  );
  const routes = [...section.matchAll(/^\|\s*(?:Patient|Clinic)\s+`([^`]+)`/gm)].map(
    (match) => match[1],
  );
  if (JSON.stringify(routes) !== JSON.stringify(expectedRoutes))
    failures.push(
      'Feature 009 must preserve exactly the eight approved patient/clinic route rows.',
    );
}

function verifyRequirements(specText, roadmapText, planText) {
  for (const requirement of requiredRequirements) {
    if (
      !specText.includes(requirement) &&
      !roadmapText.includes(requirement) &&
      !planText.includes(requirement)
    )
      failures.push(
        `Feature 009 requirement is missing from canonical scope artifacts: ${requirement}.`,
      );
  }
  if (!roadmapText.includes('### 009 — Clinic Scheduling, Appointments, and Queue'))
    failures.push('Feature 009 roadmap boundary is missing.');
}

function verifyPaymentAndNotifications(specText, planText, tasksText) {
  const canonicalText = `${specText}\n${planText}\n${tasksText}`;
  if (!canonicalText.includes('`cash_on_arrival` as the only enabled MVP payment method'))
    failures.push('Cash-only payment marker is missing.');
  if (!canonicalText.includes('`cash_on_arrival` only'))
    failures.push('Cash-only exclusion marker is missing.');
  if (!canonicalText.includes('Digital PSP') || !canonicalText.includes('Production SMS or OTP'))
    failures.push('Digital payment and production SMS exclusions are missing from Feature 009.');
  if (!/production SMS (?:remains )?disabled/i.test(canonicalText))
    failures.push('Production SMS kill-switch marker is missing.');
  if (/production SMS\s+(?:is\s+)?(?:enabled|active|available|true)/i.test(canonicalText))
    failures.push('Feature 009 cannot enable production SMS.');
}

function verifyGates(specText, planText, tasksText) {
  const canonicalText = `${specText}\n${planText}\n${tasksText}`;
  for (const gate of requiredGates) {
    if (!canonicalText.includes(gate))
      failures.push(`Retained Feature 009 gate is missing: ${gate}.`);
  }
}

function verifyFeature010Exclusions(specText, roadmapText, planText) {
  for (const marker of [
    'Feature 010 behavior',
    'Encounters, referrals, prescriptions, medication safety, general consultation chat',
    'Digital PSP',
    'New roles, relationship types, endpoints, operation IDs, UI routes',
  ]) {
    if (!specText.includes(marker))
      failures.push(`Feature 010/exclusion marker is missing: ${marker}.`);
  }
  if (!roadmapText.includes('excludes digital PSP, encounters, prescriptions, general chat'))
    failures.push('Roadmap Feature 010 exclusion boundary is missing.');
  if (!planText.includes('no new vendor, payment adapter, route, role, or operation'))
    failures.push('Plan scope exclusion boundary is missing.');
}

function verifyPlannedScripts(packageText) {
  const packageJson = parseJson('package.json', packageText);
  const scripts = packageJson?.scripts ?? {};
  for (const [name, expected] of plannedScripts) {
    if (scripts[name] !== expected)
      failures.push(`Planned Feature 009 command alias mismatch: ${name}.`);
  }
  if (
    /--parallel|--test-concurrency\s*[=:]\s*(?!1\b)\d+/.test(
      scripts['test:clinic-scheduling:stack'] ?? '',
    )
  )
    failures.push('Feature 009 stack alias must remain serial.');
  if (!/--test-concurrency=1\b/.test(scripts['test:clinic-scheduling:e2e'] ?? ''))
    failures.push('Feature 009 E2E alias must force test concurrency 1.');
}

const specText = readText(`${featureRoot}/spec.md`);
const planText = readText(`${featureRoot}/plan.md`);
const tasksText = readText(`${featureRoot}/tasks.md`);
const dataModelText = readText(`${featureRoot}/data-model.md`);
const openApiText = readText(`${featureRoot}/contracts/openapi.yaml`);
const roadmapText = readText('docs/governance/SHIFAA-Remaining-Specs-Roadmap.md');
const catalogText = readText('docs/architecture/SHIFAA-API-Catalog.md');
const packageText = readText('package.json');

verifyRequirements(specText, roadmapText, planText);
verifyOperations(specText, openApiText, catalogText);
verifyRoutes(specText);
verifyStates(dataModelText, specText, planText);
verifyPaymentAndNotifications(specText, planText, tasksText);
verifyGates(specText, planText, tasksText);
verifyFeature010Exclusions(specText, roadmapText, planText);
verifyPlannedScripts(packageText);

if (failures.length > 0) {
  console.error('Feature 009 scope verification failed:');
  for (const failure of [...new Set(failures)].sort()) console.error(`- ${failure}`);
  process.exit(1);
}

for (const gate of requiredGates) console.log(`gate=${gate} retained`);
console.log(
  `Feature 009 scope verified: operation_count=${expectedOperations.size}, appointment_state_count=${expectedAppointmentStates.length}, queue_state_count=${expectedQueueStates.length}, payment_methods=cash_on_arrival, production_sms=disabled, feature_010=excluded.`,
);
