import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { parseDocument } from 'yaml';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const featureRoot = path.join(repositoryRoot, 'specs/009-clinic-scheduling-appointments-queue');
const contractPath = path.join(featureRoot, 'contracts/openapi.yaml');
const catalogPath = path.join(repositoryRoot, 'docs/architecture/SHIFAA-API-Catalog.md');
const failures = [];

const expectedOperations = new Map([
  ['searchDoctors', ['GET', '/discovery/doctors', '—']],
  ['listDoctorAvailability', ['GET', '/clinics/{facilityId}/doctors/{doctorId}/availability', '—']],
  ['createSchedule', ['POST', '/clinics/{facilityId}/schedules', 'I']],
  ['updateSchedule', ['PATCH', '/clinics/{facilityId}/schedules/{scheduleId}', 'I,V']],
  [
    'createScheduleException',
    ['POST', '/clinics/{facilityId}/schedules/{scheduleId}/exceptions', 'I,V'],
  ],
  ['createAppointment', ['POST', '/appointments', 'I']],
  ['getAppointment', ['GET', '/appointments/{appointmentId}', '—']],
  ['listAppointments', ['GET', '/appointments', '—']],
  ['cancelAppointment', ['POST', '/appointments/{appointmentId}/cancel', 'I,V']],
  ['rescheduleAppointment', ['POST', '/appointments/{appointmentId}/reschedule', 'I,V']],
  ['checkInAppointment', ['POST', '/appointments/{appointmentId}/check-in', 'I,V']],
  ['getQueue', ['GET', '/clinics/{facilityId}/queues', '—']],
  ['getMyQueuePosition', ['GET', '/appointments/{appointmentId}/queue-position', '—']],
  ['callQueueEntry', ['POST', '/queue-entries/{queueEntryId}/call', 'I,V']],
  ['reorderQueueEntry', ['POST', '/queue-entries/{queueEntryId}/reorder', 'I,V']],
  ['completeQueueEntry', ['POST', '/queue-entries/{queueEntryId}/complete', 'I,V']],
  ['sendDoctorDelay', ['POST', '/clinics/{facilityId}/doctors/{doctorId}/delay', 'I']],
  ['declareDoctorAbsence', ['POST', '/clinics/{facilityId}/doctors/{doctorId}/absence', 'I']],
]);

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
const expectedOrdinaryExceptionTypes = ['blocked', 'added'];
const expectedPublicDoctorFields = [
  'doctorId',
  'doctorDisplayName',
  'specialty',
  'professionalLicenseVerified',
  'facilityId',
  'facilityDisplayName',
  'facilityVerified',
  'feeMinorUnits',
  'currency',
  'paymentMethod',
  'nextAvailableSlot',
  'distanceMeters',
  'availabilityVersion',
  'updatedAt',
  'stale',
];

function fail(message) {
  failures.push(message);
}

function readText(filePath, label) {
  try {
    return fs.readFileSync(filePath, 'utf8');
  } catch (error) {
    fail(`Unable to read ${label}: ${error.message}`);
    return '';
  }
}

function resolveRef(document, ref) {
  if (typeof ref !== 'string' || !ref.startsWith('#/')) return undefined;
  return ref
    .slice(2)
    .split('/')
    .map((part) => part.replaceAll('~1', '/').replaceAll('~0', '~'))
    .reduce((current, part) => current?.[part], document);
}

function verifyAllRefs(value, document, location = '#') {
  if (Array.isArray(value)) {
    value.forEach((entry, index) => verifyAllRefs(entry, document, `${location}[${index}]`));
    return;
  }
  if (!value || typeof value !== 'object') return;
  if ('$ref' in value) {
    if (typeof value.$ref !== 'string' || !value.$ref.startsWith('#/'))
      fail(`${location} contains a non-local reference.`);
    else if (resolveRef(document, value.$ref) == null)
      fail(`${location} contains an unresolved reference: ${value.$ref}.`);
  }
  for (const [key, child] of Object.entries(value))
    verifyAllRefs(child, document, `${location}.${key}`);
}

function parseOpenApi(text) {
  if (!text) return null;
  let document;
  try {
    document = parseDocument(text, { uniqueKeys: true });
  } catch (error) {
    fail(`Invalid Feature 009 OpenAPI YAML: ${error.message}`);
    return null;
  }
  for (const error of document.errors) fail(`Invalid Feature 009 OpenAPI YAML: ${error.message}`);
  try {
    const api = document.toJS();
    verifyAllRefs(api, api);
    return api;
  } catch (error) {
    fail(`Invalid Feature 009 OpenAPI document: ${error.message}`);
    return null;
  }
}

function parseCatalog(text) {
  const rows = new Map();
  for (const line of text.split(/\r?\n/)) {
    const cells = line.split('|').map((cell) => cell.trim());
    if (cells.length < 6) continue;
    const id = cells[1].match(/^`([^`]+)`$/)?.[1];
    const route = cells[2].match(/^`(GET|POST|PUT|PATCH|DELETE) ([^`]+)`$/);
    if (!id || !route) continue;
    const flags = cells[5];
    if (rows.has(id)) fail(`API Catalog contains duplicate operation row: ${id}.`);
    rows.set(id, [route[1], route[2], flags]);
  }
  return rows;
}

function operationEntries(api) {
  const found = new Map();
  for (const [apiPath, pathItem] of Object.entries(api?.paths ?? {})) {
    if (!pathItem || typeof pathItem !== 'object') {
      fail(`OpenAPI path item is not an object: ${apiPath}.`);
      continue;
    }
    for (const method of ['get', 'post', 'put', 'patch', 'delete', 'head', 'options', 'trace']) {
      const operation = pathItem[method];
      if (!operation) continue;
      const operationId = operation.operationId;
      if (typeof operationId !== 'string' || operationId.length === 0) {
        fail(`${method.toUpperCase()} ${apiPath} is missing operationId.`);
        continue;
      }
      if (found.has(operationId)) fail(`Duplicate OpenAPI operationId: ${operationId}.`);
      found.set(operationId, { method: method.toUpperCase(), path: apiPath, operation });
    }
  }
  return found;
}

function hasRef(items, name) {
  return (items ?? []).some((item) => item?.$ref === `#/components/parameters/${name}`);
}

function resolvedSchema(api, operation) {
  const body = operation?.requestBody;
  const requestBody = body?.$ref ? resolveRef(api, body.$ref) : body;
  const schema = requestBody?.content?.['application/json']?.schema;
  return schema?.$ref ? resolveRef(api, schema.$ref) : schema;
}

function response(api, operation, status) {
  const value = operation?.responses?.[status];
  return value?.$ref ? resolveRef(api, value.$ref) : value;
}

function schema(api, value) {
  let current = value;
  const seen = new Set();
  while (current?.$ref && !seen.has(current.$ref)) {
    seen.add(current.$ref);
    current = resolveRef(api, current.$ref);
  }
  return current;
}

function required(schemaValue, fields, label) {
  const actual = schemaValue?.required ?? [];
  if (JSON.stringify(actual) !== JSON.stringify(fields))
    fail(`${label} required fields drifted; expected ${fields.join(', ')}.`);
}

function verifyOperations(api, catalog) {
  const found = operationEntries(api);
  if (found.size !== expectedOperations.size)
    fail(`Feature 009 OpenAPI must contain exactly 18 operations; found ${found.size}.`);
  for (const [operationId, [method, apiPath, flags]] of expectedOperations) {
    const actual = found.get(operationId);
    if (!actual) {
      fail(`Missing Feature 009 OpenAPI operation: ${operationId}.`);
      continue;
    }
    if (actual.method !== method || actual.path !== apiPath)
      fail(`${operationId} must be ${method} ${apiPath}.`);
    const catalogEntry = catalog.get(operationId);
    if (!catalogEntry) fail(`API Catalog is missing Feature 009 operation: ${operationId}.`);
    else if (JSON.stringify(catalogEntry) !== JSON.stringify([method, apiPath, flags]))
      fail(`API Catalog mismatch for ${operationId}; expected ${method} ${apiPath} (${flags}).`);
    if (!hasRef(actual.operation.parameters, 'Locale'))
      fail(`${operationId} must accept the shared Accept-Language parameter.`);
    if (flags.includes('I') !== hasRef(actual.operation.parameters, 'IdempotencyKey'))
      fail(`${operationId} Idempotency-Key applicability does not match catalog flag ${flags}.`);
    if (flags.includes('V') !== hasRef(actual.operation.parameters, 'IfMatch'))
      fail(`${operationId} If-Match applicability does not match catalog flag ${flags}.`);
    if (actual.operation.responses?.default?.$ref !== '#/components/responses/Problem')
      fail(`${operationId} must expose the shared RFC 9457 default problem response.`);
    const problem = response(api, actual.operation, 'default');
    if (
      problem?.content?.['application/problem+json']?.schema?.$ref !==
      '#/components/schemas/Problem'
    )
      fail(`${operationId} default response must use application/problem+json Problem.`);
    const cacheSchema = problem?.headers?.['Cache-Control']?.schema;
    if (cacheSchema?.const !== 'private, no-store')
      fail(`${operationId} problem responses must be private, no-store.`);
    for (const [status, value] of Object.entries(actual.operation.responses ?? {})) {
      const declared = value?.$ref ? resolveRef(api, value.$ref) : value;
      const cache = declared?.headers?.['Cache-Control']?.schema?.const;
      if (cache !== undefined && cache !== 'private, no-store')
        fail(`${operationId} ${status} declares an unsafe Cache-Control value.`);
    }
  }
  for (const operationId of found.keys())
    if (!expectedOperations.has(operationId))
      fail(`Unapproved Feature 009 operation: ${operationId}.`);
}

function verifyParameters(api) {
  const parameters = api?.components?.parameters ?? {};
  const locale = parameters.Locale;
  if (locale?.name !== 'Accept-Language' || locale?.in !== 'header')
    fail('Locale parameter must be the Accept-Language header.');
  if (JSON.stringify(locale?.schema?.enum) !== JSON.stringify(['ar-EG', 'en-EG']))
    fail('Accept-Language must allow exactly ar-EG and en-EG.');
  const idempotency = parameters.IdempotencyKey;
  if (idempotency?.required !== true || idempotency?.name !== 'Idempotency-Key')
    fail('Idempotency-Key must be required by the shared parameter contract.');
  if (idempotency?.schema?.minLength !== 16 || idempotency?.schema?.maxLength !== 128)
    fail('Idempotency-Key bounds must remain 16..128 characters.');
  const ifMatch = parameters.IfMatch;
  if (ifMatch?.required !== true || ifMatch?.name !== 'If-Match')
    fail('If-Match must be required by the shared version parameter contract.');
  if (ifMatch?.schema?.pattern !== '^"[1-9][0-9]*"$')
    fail('If-Match must use the quoted positive integer version format.');
  const near = parameters.NearQuery;
  const radius = parameters.RadiusQuery;
  if (near?.name !== 'near' || near?.in !== 'query' || near?.schema?.type !== 'string')
    fail('Doctor discovery must expose the bounded transient near query.');
  if (radius?.name !== 'radius' || radius?.in !== 'query' || radius?.schema?.type !== 'integer')
    fail('Doctor discovery must expose the bounded radius query.');
  if (radius?.schema?.minimum !== 100 || radius?.schema?.maximum !== 100000)
    fail('Doctor radius must remain bounded to 100..100000 meters.');
}

function verifyShapes(api, operations) {
  const components = api?.components?.schemas ?? {};
  const appointmentStatus = schema(api, components.AppointmentStatus);
  if (JSON.stringify(appointmentStatus?.enum) !== JSON.stringify(expectedAppointmentStates))
    fail('AppointmentStatus must contain exactly the nine canonical states.');
  const queueStatus = schema(api, components.QueueStatus);
  if (JSON.stringify(queueStatus?.enum) !== JSON.stringify(expectedQueueStates))
    fail('QueueStatus must contain exactly the five canonical states.');
  const ordinary = schema(api, components.OrdinaryExceptionType);
  if (JSON.stringify(ordinary?.enum) !== JSON.stringify(expectedOrdinaryExceptionTypes))
    fail('OrdinaryExceptionType must contain only blocked and added.');

  const search = operations.get('searchDoctors')?.operation;
  const availability = operations.get('listDoctorAvailability')?.operation;
  const appointmentList = operations.get('listAppointments')?.operation;
  const queue = operations.get('getQueue')?.operation;
  if (!hasRef(search?.parameters, 'NearQuery') || !hasRef(search?.parameters, 'RadiusQuery'))
    fail('searchDoctors must expose near and radius filters.');
  if (
    !(appointmentList?.parameters ?? []).some(
      (parameter) =>
        parameter?.name === 'status' &&
        parameter?.schema?.$ref === '#/components/schemas/AppointmentStatus',
    )
  )
    fail('listAppointments must expose the AppointmentStatus status filter.');
  if (!(queue?.parameters ?? []).some((parameter) => parameter?.name === 'cursor'))
    fail('getQueue must expose an opaque cursor query.');

  const availabilityPage = schema(api, components.AvailabilityPage);
  if (
    !availabilityPage?.required?.includes('version') ||
    availabilityPage.properties?.version?.$ref !== '#/components/schemas/Version'
  )
    fail('AvailabilityPage must expose the authoritative version.');
  const queueSchema = schema(api, components.Queue);
  if (
    !queueSchema?.required?.includes('nextCursor') ||
    queueSchema.properties?.nextCursor?.type?.toString() !== 'string,null'
  )
    fail('Queue must expose nullable nextCursor pagination.');
  const queuePosition = schema(api, components.QueuePosition);
  if (
    !queuePosition?.required?.includes('updatedAt') ||
    !queuePosition?.required?.includes('stale')
  )
    fail('QueuePosition must require updatedAt and stale.');
  if (
    queuePosition.properties?.updatedAt?.format !== 'date-time' ||
    queuePosition.properties?.stale?.type !== 'boolean'
  )
    fail('QueuePosition updatedAt/stale shapes are invalid.');

  const publicDoctor = schema(api, components.PublicDoctorProjection);
  if (publicDoctor?.additionalProperties !== false)
    fail('PublicDoctorProjection must be closed (additionalProperties=false).');
  required(publicDoctor, expectedPublicDoctorFields, 'PublicDoctorProjection');
  if (
    JSON.stringify(Object.keys(publicDoctor?.properties ?? {})) !==
    JSON.stringify(expectedPublicDoctorFields)
  )
    fail('PublicDoctorProjection properties must remain the closed minimum projection.');
  if (
    publicDoctor.properties?.professionalLicenseVerified?.const !== true ||
    publicDoctor.properties?.facilityVerified?.const !== true
  )
    fail('PublicDoctorProjection must require verified professional and facility projections.');
  if (publicDoctor.properties?.paymentMethod?.const !== 'cash_on_arrival')
    fail('PublicDoctorProjection must remain cash_on_arrival only.');
  if (publicDoctor.properties?.availabilityVersion?.$ref !== '#/components/schemas/Version')
    fail('PublicDoctorProjection must expose availabilityVersion.');

  const exceptionOperation = operations.get('createScheduleException')?.operation;
  const exceptionRequest = resolvedSchema(api, exceptionOperation);
  if (
    exceptionRequest?.additionalProperties !== false ||
    exceptionRequest?.properties?.delayMinutes
  )
    fail('Ordinary createScheduleException must reject delayMinutes and unknown properties.');
  if (exceptionRequest?.properties?.type?.$ref !== '#/components/schemas/OrdinaryExceptionType')
    fail('Ordinary createScheduleException must accept only OrdinaryExceptionType.');
  const updateRequest = resolvedSchema(api, operations.get('updateSchedule')?.operation);
  if (updateRequest?.additionalProperties !== false)
    fail('UpdateScheduleRequest must be closed so unknown doctorId reassignment is rejected.');
  if (updateRequest?.properties?.doctorId || updateRequest?.required?.includes('doctorId'))
    fail('UpdateScheduleRequest must reject doctorId schedule reassignment.');

  const requestRefs = new Map();
  for (const [operationId, entry] of operations) {
    const request = entry.operation.requestBody;
    const body = request?.$ref ? resolveRef(api, request.$ref) : request;
    const requestSchema = body?.content?.['application/json']?.schema;
    if (requestSchema?.$ref) requestRefs.set(operationId, requestSchema.$ref);
  }
  for (const [schemaName, operationId] of [
    ['DelayRequest', 'sendDoctorDelay'],
    ['AbsenceRequest', 'declareDoctorAbsence'],
  ]) {
    const ref = `#/components/schemas/${schemaName}`;
    for (const [candidate, requestRef] of requestRefs)
      if (requestRef === ref && candidate !== operationId)
        fail(`${schemaName} is not exclusive to ${operationId}.`);
    if (requestRefs.get(operationId) !== ref) fail(`${operationId} must use ${schemaName}.`);
  }
  if (
    requestRefs.get('createScheduleException') === '#/components/schemas/DelayRequest' ||
    requestRefs.get('createScheduleException') === '#/components/schemas/AbsenceRequest'
  )
    fail('Ordinary createScheduleException must not use dedicated delay/absence request schemas.');

  const publicOperations = ['searchDoctors', 'listDoctorAvailability'];
  for (const operationId of publicOperations)
    if (JSON.stringify(operations.get(operationId)?.operation?.security) !== '[]')
      fail(`${operationId} must remain explicitly public.`);
  if (api?.security?.[0]?.bearerAuth === undefined)
    fail('Feature 009 must retain the bearer security baseline for non-public operations.');
}

const contractText = readText(contractPath, 'Feature 009 OpenAPI contract');
const catalogText = readText(catalogPath, 'API Catalog');
const api = parseOpenApi(contractText);
const catalog = parseCatalog(catalogText);
if (api) {
  if (api.openapi !== '3.1.1') fail('Feature 009 OpenAPI must use version 3.1.1.');
  verifyOperations(api, catalog);
  verifyParameters(api);
  verifyShapes(api, operationEntries(api));
}

if (failures.length > 0) {
  console.error('Feature 009 contract verification failed:');
  for (const failure of [...new Set(failures)].sort()) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(
  'Feature 009 contract verified: openapi=3.1.1, operation_count=18, flags=I/V-catalog-parity, doctor_filters=near+radius, appointment_status=canonical, queue_cursor=opaque+nextCursor, availability_version=required, queue_position=updatedAt+stale, public_projection=closed-minimum, cache=private-no-store-problems, problems=RFC9457, refs=local-resolved.',
);
