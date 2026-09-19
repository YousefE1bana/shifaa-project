import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { format } from 'prettier';
import { parse } from 'yaml';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sourcePath = path.join(
  root,
  'specs/009-clinic-scheduling-appointments-queue/contracts/openapi.yaml',
);
const contractPath = path.join(root, 'packages/contracts/src/clinic-scheduling.ts');
const contractIndexPath = path.join(root, 'packages/contracts/src/index.ts');
const clientPath = path.join(root, 'packages/api-client/src/clinic-scheduling.ts');
const clientIndexPath = path.join(root, 'packages/api-client/src/index.ts');
const check = process.argv.includes('--check');
const prettierOptions = {
  parser: 'typescript',
  semi: true,
  singleQuote: true,
  trailingComma: 'all',
  printWidth: 100,
  endOfLine: 'lf',
};

const expected = [
  ['searchDoctors', 'GET', '/discovery/doctors'],
  ['listDoctorAvailability', 'GET', '/clinics/{facilityId}/doctors/{doctorId}/availability'],
  ['createSchedule', 'POST', '/clinics/{facilityId}/schedules'],
  ['updateSchedule', 'PATCH', '/clinics/{facilityId}/schedules/{scheduleId}'],
  ['createScheduleException', 'POST', '/clinics/{facilityId}/schedules/{scheduleId}/exceptions'],
  ['listAppointments', 'GET', '/appointments'],
  ['createAppointment', 'POST', '/appointments'],
  ['getAppointment', 'GET', '/appointments/{appointmentId}'],
  ['cancelAppointment', 'POST', '/appointments/{appointmentId}/cancel'],
  ['rescheduleAppointment', 'POST', '/appointments/{appointmentId}/reschedule'],
  ['checkInAppointment', 'POST', '/appointments/{appointmentId}/check-in'],
  ['getQueue', 'GET', '/clinics/{facilityId}/queues'],
  ['getMyQueuePosition', 'GET', '/appointments/{appointmentId}/queue-position'],
  ['callQueueEntry', 'POST', '/queue-entries/{queueEntryId}/call'],
  ['reorderQueueEntry', 'POST', '/queue-entries/{queueEntryId}/reorder'],
  ['completeQueueEntry', 'POST', '/queue-entries/{queueEntryId}/complete'],
  ['sendDoctorDelay', 'POST', '/clinics/{facilityId}/doctors/{doctorId}/delay'],
  ['declareDoctorAbsence', 'POST', '/clinics/{facilityId}/doctors/{doctorId}/absence'],
];

const document = parse(fs.readFileSync(sourcePath, 'utf8'));
const operations = [];
for (const [apiPath, pathItem] of Object.entries(document.paths ?? {})) {
  for (const method of ['get', 'post', 'put', 'patch', 'delete']) {
    const operation = pathItem[method];
    if (operation)
      operations.push({
        operationId: operation.operationId,
        method: method.toUpperCase(),
        path: apiPath,
        operation,
      });
  }
}
const actual = operations.map(({ operationId, method, path: apiPath }) => [
  operationId,
  method,
  apiPath,
]);
if (JSON.stringify(actual) !== JSON.stringify(expected))
  throw new Error('Feature 009 OpenAPI operations drifted from the 18 approved operations.');

function refName(value) {
  return typeof value === 'string' && value.startsWith('#/components/schemas/')
    ? value.slice('#/components/schemas/'.length)
    : undefined;
}

function js(value) {
  return JSON.stringify(value);
}

const schemas = { ...(document.components?.schemas ?? {}) };
if (
  !schemas.AppointmentPage?.required?.includes('freshness') ||
  schemas.AppointmentPage?.properties?.freshness?.$ref !== '#/components/schemas/ReadFreshness'
)
  throw new Error('AppointmentPage must require the canonical ReadFreshness field.');
for (const [name, requestBody] of Object.entries(document.components?.requestBodies ?? {})) {
  const bodySchema = requestBody?.content?.['application/json']?.schema;
  if (bodySchema && !refName(bodySchema?.$ref)) schemas[name] = bodySchema;
}

const optionsKeys = [
  'format',
  'pattern',
  'minLength',
  'maxLength',
  'minimum',
  'maximum',
  'minItems',
  'maxItems',
  'uniqueItems',
  'minProperties',
  'maxProperties',
];
function options(schema) {
  const selected = Object.fromEntries(
    optionsKeys.filter((key) => schema[key] !== undefined).map((key) => [key, schema[key]]),
  );
  return Object.keys(selected).length ? `, ${js(selected)}` : '';
}

function mergeAllOf(schema) {
  const properties = {};
  const required = new Set();
  let additionalProperties = true;
  const visitPart = (part) => {
    const resolved = refName(part?.$ref) ? schemas[refName(part.$ref)] : part;
    if (!resolved) return;
    if (resolved.allOf) {
      for (const nested of resolved.allOf) visitPart(nested);
      return;
    }
    for (const [name, property] of Object.entries(resolved.properties ?? {}))
      properties[name] = property;
    for (const name of resolved.required ?? []) required.add(name);
    if (resolved.additionalProperties === false) additionalProperties = false;
  };
  for (const part of schema.allOf ?? []) visitPart(part);
  return {
    type: 'object',
    properties,
    required: [...required],
    ...(additionalProperties ? {} : { additionalProperties: false }),
  };
}

function schemaExpression(schema, required = schema?.required ?? []) {
  if (!schema) return 'Type.Any()';
  const reference = refName(schema.$ref);
  if (reference) return `${reference}Schema`;
  if (schema.const !== undefined) return `Type.Literal(${js(schema.const)})`;
  if (schema.enum) {
    const values = schema.enum.map((value) => `Type.Literal(${js(value)})`);
    return values.length === 1 ? values[0] : `Type.Union([${values.join(', ')}])`;
  }
  if (schema.oneOf || schema.anyOf) {
    const variants = schema.oneOf ?? schema.anyOf;
    return `Type.Union([${variants.map((variant) => schemaExpression(variant)).join(', ')}])`;
  }
  if (schema.allOf) {
    const merged = mergeAllOf(schema);
    return schemaExpression(merged, merged.required);
  }
  if (Array.isArray(schema.type)) {
    const variants = schema.type.map((type) => schemaExpression({ ...schema, type }));
    return `Type.Union([${variants.join(', ')}])`;
  }
  if (schema.type === 'object' || schema.properties) {
    const properties = Object.entries(schema.properties ?? {}).map(([name, property]) => {
      const expression = schemaExpression(property);
      return `${js(name)}: ${required.includes(name) ? expression : `Type.Optional(${expression})`}`;
    });
    const objectOptions = {
      ...(schema.additionalProperties === false ? { additionalProperties: false } : {}),
      ...(schema.minProperties === undefined ? {} : { minProperties: schema.minProperties }),
      ...(schema.maxProperties === undefined ? {} : { maxProperties: schema.maxProperties }),
    };
    return `Type.Object({${properties.join(', ')} }${Object.keys(objectOptions).length ? `, ${js(objectOptions)}` : ''})`;
  }
  if (schema.type === 'array')
    return `Type.Array(${schemaExpression(schema.items)}${options(schema)})`;
  if (schema.type === 'string') return `Type.String(${options(schema).replace(/^, /, '') || '{}'})`;
  if (schema.type === 'integer')
    return `Type.Integer(${options(schema).replace(/^, /, '') || '{}'})`;
  if (schema.type === 'number') return `Type.Number(${options(schema).replace(/^, /, '') || '{}'})`;
  if (schema.type === 'boolean') return `Type.Boolean()`;
  if (schema.type === 'null') return 'Type.Null()';
  return 'Type.Any()';
}

const schemaOrder = [];
const visiting = new Set();
const visited = new Set();
function visit(name) {
  if (visited.has(name)) return;
  if (visiting.has(name)) throw new Error(`Cyclic schema reference: ${name}`);
  visiting.add(name);
  const jsonSchema = schemas[name];
  const refs = JSON.stringify(jsonSchema ?? '').matchAll(
    /#\/components\/schemas\/([A-Za-z0-9_]+)/g,
  );
  for (const [, dependency] of refs) if (schemas[dependency]) visit(dependency);
  visiting.delete(name);
  visited.add(name);
  schemaOrder.push(name);
}
for (const name of Object.keys(schemas)) visit(name);

const operationRows = operations.map(({ operationId, method, path: apiPath }) => ({
  operationId,
  method,
  path: apiPath,
}));
function requestSchemaName(operation) {
  const body = operation.requestBody;
  const bodyValue = body?.$ref
    ? document.components?.requestBodies?.[body.$ref.slice('#/components/requestBodies/'.length)]
    : body;
  return (
    refName(bodyValue?.content?.['application/json']?.schema?.$ref) ??
    (body?.$ref ? body.$ref.slice('#/components/requestBodies/'.length) : undefined)
  );
}
function responseSchemaName(operation) {
  for (const status of ['200', '201', '202']) {
    const response = operation.responses?.[status];
    const resolved = response?.$ref
      ? document.components?.responses?.[response.$ref.slice('#/components/responses/'.length)]
      : response;
    const name = refName(resolved?.content?.['application/json']?.schema?.$ref);
    if (name) return name;
  }
  return 'Problem';
}
const requestSchemas = new Map();
const responseSchemas = new Map();
for (const { operationId, operation } of operations) {
  const request = requestSchemaName(operation);
  if (request) requestSchemas.set(operationId, request);
  responseSchemas.set(operationId, responseSchemaName(operation));
}

const typeAliases = [
  ['CreateScheduleInput', 'CreateScheduleRequest'],
  ['UpdateScheduleInput', 'UpdateScheduleRequest'],
  ['CreateScheduleExceptionInput', 'CreateScheduleExceptionRequest'],
  ['CreateAppointmentInput', 'CreateAppointmentRequest'],
  ['CancelAppointmentInput', 'ReasonRequest'],
  ['RescheduleInput', 'RescheduleRequest'],
  ['ReorderInput', 'ReorderRequest'],
  ['DelayInput', 'DelayRequest'],
  ['AbsenceInput', 'AbsenceRequest'],
];

// Query objects are derived from operation parameters because they are not component schemas.
const queryNames = {
  searchDoctors: 'SearchDoctorsQuery',
  listDoctorAvailability: 'AvailabilityQuery',
  listAppointments: 'AppointmentListQuery',
  getQueue: 'QueueQuery',
};
const querySchemas = Object.fromEntries(
  Object.entries(queryNames).map(([operationId, name]) => {
    const operation = operations.find((entry) => entry.operationId === operationId)?.operation;
    const queryParameters = parameters(operation, 'query');
    return [
      name,
      {
        type: 'object',
        required: queryParameters
          .filter((parameter) => parameter.required)
          .map((parameter) => parameter.name),
        properties: Object.fromEntries(
          queryParameters.map((parameter) => [parameter.name, parameter.schema]),
        ),
        additionalProperties: false,
      },
    ];
  }),
);
const queryDeclarations = Object.entries(querySchemas).map(
  ([name, schema]) =>
    `export const ${name}Schema = ${schemaExpression(schema, schema.required ?? [])};`,
);
const aliasDeclarations = typeAliases.map(
  ([alias, source]) => `export type ${alias} = Static<typeof ${source}Schema>;`,
);
const schemaTypeDeclarations = schemaOrder.map(
  (name) => `export type ${name} = Static<typeof ${name}Schema>;`,
);
const responseTypeImports = [...new Set(responseSchemas.values())]
  .map((name) => `  ${name},`)
  .join('\n');

const banner =
  '// @generated from specs/009-clinic-scheduling-appointments-queue/contracts/openapi.yaml — DO NOT EDIT.\n';
const contractSource = await format(
  `${banner}
import { FormatRegistry, Type, type Static } from '@sinclair/typebox';

if (!FormatRegistry.Has('uuid')) {
  FormatRegistry.Set('uuid', (value) =>
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value),
  );
}
if (!FormatRegistry.Has('date-time')) {
  FormatRegistry.Set('date-time', (value) => Number.isFinite(Date.parse(value)));
}
if (!FormatRegistry.Has('date')) {
  FormatRegistry.Set('date', (value) => /^\\d{4}-\\d{2}-\\d{2}$/.test(value));
}
if (!FormatRegistry.Has('time')) {
  FormatRegistry.Set('time', (value) => /^\\d{2}:\\d{2}(?::\\d{2}(?:\\.\\d+)?)?(?:Z|[+-]\\d{2}:\\d{2})?$/.test(value));
}
if (!FormatRegistry.Has('uri-reference')) {
  FormatRegistry.Set('uri-reference', (value) => !/\\s/.test(value));
}

export const clinicSchedulingOperations = ${JSON.stringify(operationRows, null, 2)} as const;
export type ClinicSchedulingOperationId = (typeof clinicSchedulingOperations)[number]['operationId'];

${schemaOrder.map((name) => `export const ${name}Schema = ${schemaExpression(schemas[name], schemas[name]?.required ?? [])};`).join('\n')}

${queryDeclarations.join('\n')}

export const clinicSchedulingSchemas = {
${schemaOrder.map((name) => `  ${name}: ${name}Schema,`).join('\n')}
${Object.keys(querySchemas)
  .map((name) => `  ${name}: ${name}Schema,`)
  .join('\n')}
} as const;

${aliasDeclarations.join('\n')}
${schemaTypeDeclarations.join('\n')}
export type SearchDoctorsQuery = Static<typeof SearchDoctorsQuerySchema>;
export type DoctorSearchQuery = SearchDoctorsQuery;
export type AppointmentListQuery = Static<typeof AppointmentListQuerySchema>;
export type QueueQuery = Static<typeof QueueQuerySchema>;
export type AvailabilityQuery = Static<typeof AvailabilityQuerySchema>;

export const clinicSchedulingRequestSchemas = {
${[...requestSchemas.entries()].map(([operationId, schemaName]) => `  ${operationId}: ${schemaName}Schema,`).join('\n')}
} as const;
export const clinicSchedulingResponseSchemas = {
${[...responseSchemas.entries()].map(([operationId, schemaName]) => `  ${operationId}: ${schemaName}Schema,`).join('\n')}
} as const;
`,
  prettierOptions,
);

function parameters(operation, location) {
  return (operation.parameters ?? [])
    .map((parameter) =>
      parameter.$ref
        ? document.components.parameters[parameter.$ref.slice('#/components/parameters/'.length)]
        : parameter,
    )
    .filter((parameter) => parameter?.in === location);
}
function parameterNames(operation, location) {
  return parameters(operation, location).map((parameter) => parameter.name);
}
function routeExpression(apiPath) {
  const pieces = apiPath.split(/(\{[^}]+\})/g);
  if (!pieces.some((piece) => piece.startsWith('{'))) return js(apiPath);
  return `\`${pieces.map((piece) => (piece.startsWith('{') ? `\${encodeURIComponent(${piece.slice(1, -1)})}` : piece)).join('')}\``;
}
const methodBodies = [];
for (const entry of operations) {
  const { operationId, method, path: apiPath, operation } = entry;
  const responseType = responseSchemas.get(operationId);
  const pathParameters = parameterNames(operation, 'path');
  const queryParameters = parameterNames(operation, 'query');
  const queryType =
    operationId === 'searchDoctors'
      ? 'DoctorSearchQuery'
      : operationId === 'listDoctorAvailability'
        ? 'AvailabilityQuery'
        : operationId === 'listAppointments'
          ? 'AppointmentListQuery'
          : 'QueueQuery';
  const queryRequired = parameters(operation, 'query').some((parameter) => parameter.required);
  const bodyType = requestSchemas.get(operationId);
  const hasKey = parameterNames(operation, 'header').includes('Idempotency-Key');
  const hasVersion = parameterNames(operation, 'header').includes('If-Match');
  const isPublic = JSON.stringify(operation.security) === '[]';
  const args = [
    ...pathParameters.map((name) => `${name}: string`),
    ...(queryParameters.length ? [`query: ${queryType}${queryRequired ? '' : ' = {}'}`] : []),
    ...(bodyType
      ? [
          `body: ${bodyType === 'ReasonRequest' ? 'CancelAppointmentInput' : bodyType === 'RescheduleRequest' ? 'RescheduleInput' : bodyType === 'ReorderRequest' ? 'ReorderInput' : bodyType === 'DelayRequest' ? 'DelayInput' : bodyType === 'AbsenceRequest' ? 'AbsenceInput' : bodyType === 'CreateScheduleRequest' ? 'CreateScheduleInput' : bodyType === 'UpdateScheduleRequest' ? 'UpdateScheduleInput' : bodyType === 'CreateScheduleExceptionRequest' ? 'CreateScheduleExceptionInput' : 'CreateAppointmentInput'}`,
        ]
      : []),
    ...(hasVersion ? ['version: number'] : []),
    ...(hasKey ? ['idempotencyKey: string'] : []),
    'options: ClinicSchedulingRequestOptions = {}',
  ];
  const values = [
    ...pathParameters,
    ...(queryParameters.length
      ? [`this.queryPath(${routeExpression(apiPath)}, query)`]
      : [routeExpression(apiPath)]),
    `{${bodyType ? 'body, ' : ''}${hasVersion ? 'version, ' : ''}${hasKey ? 'idempotencyKey, ' : ''}${isPublic ? 'anonymous: true, ' : ''}...options}`,
  ];
  const endpoint = queryParameters.length
    ? values[values.length - 2]
    : values[pathParameters.length];
  const requestInput = values.at(-1);
  methodBodies.push(`  public ${operationId}(${args.join(', ')}): Promise<${responseType}> {
    return this.request<${responseType}>(${js(method)}, ${endpoint}, ${requestInput});
  }`);
}
const clientSource = await format(
  `${banner}
import type {
  AbsenceInput,
  AppointmentListQuery,
  AvailabilityQuery,
  CancelAppointmentInput,
  CreateAppointmentInput,
  CreateScheduleExceptionInput,
  CreateScheduleInput,
  DelayInput,
  DoctorSearchQuery,
  QueueQuery,
  ReorderInput,
  RescheduleInput,
  UpdateScheduleInput,
${responseTypeImports}
} from '@shifaa/contracts';

export const generatedClinicSchedulingOperationIds = ${JSON.stringify(
    operationRows.map(({ operationId }) => operationId),
    null,
    2,
  )} as const;

export interface ClinicSchedulingClientOptions {
  baseUrl: string;
  accessToken?: string;
  fetch?: typeof globalThis.fetch;
  acceptLanguage?: 'ar-EG' | 'en-EG';
  defaultHeaders?: Record<string, string>;
}
export interface ClinicSchedulingRequestOptions {
  signal?: AbortSignal;
}
export class ClinicSchedulingApiError extends Error {
  public constructor(public readonly status: number, public readonly problem: unknown) {
    super(\`SHIFAA clinic scheduling API failed with status \${status}.\`);
    this.name = 'ClinicSchedulingApiError';
  }
}
export class ClinicSchedulingClient {
  private readonly fetcher: typeof globalThis.fetch;
  public constructor(private readonly options: ClinicSchedulingClientOptions) {
    this.fetcher = (options.fetch ?? globalThis.fetch).bind(globalThis);
  }
  private queryPath(path: string, query: object): string {
    const values = new URLSearchParams();
    for (const [key, value] of Object.entries(query)) if (value !== undefined && value !== '') values.set(key, String(value));
    return values.size ? \`\${path}?\${values}\` : path;
  }
${methodBodies.join('\n')}
  private async request<T>(method: 'GET' | 'POST' | 'PATCH', path: string, input: { body?: unknown; version?: number; idempotencyKey?: string; anonymous?: boolean; signal?: AbortSignal } = {}): Promise<T> {
    const headers = new Headers({ Accept: 'application/json, application/problem+json', 'Accept-Language': this.options.acceptLanguage ?? 'ar-EG', ...(this.options.defaultHeaders ?? {}) });
    if (input.anonymous) headers.delete('Authorization');
    else {
      if (!this.options.accessToken) throw new ClinicSchedulingApiError(401, { code: 'authentication-required' });
      headers.set('Authorization', \`Bearer \${this.options.accessToken}\`);
    }
    if (input.body !== undefined) { headers.set('Content-Type', 'application/json'); }
    if (input.idempotencyKey) headers.set('Idempotency-Key', input.idempotencyKey);
    if (input.version !== undefined) headers.set('If-Match', \`"\${input.version}"\`);
    const response = await this.fetcher(\`\${this.options.baseUrl.endsWith('/') ? this.options.baseUrl.slice(0, -1) : this.options.baseUrl}/v1\${path}\`, { method, headers, cache: 'no-store', ...(input.signal ? { signal: input.signal } : {}), ...(input.body === undefined ? {} : { body: JSON.stringify(input.body) }) });
    const payload = response.status === 204 ? undefined : await response.json();
    if (!response.ok) throw new ClinicSchedulingApiError(response.status, payload);
    return payload as T;
  }
}
export const createClinicSchedulingClient = (options: ClinicSchedulingClientOptions) => new ClinicSchedulingClient(options);
`,
  prettierOptions,
);

function writeOrCheck(target, output) {
  if (check) {
    if (!fs.existsSync(target) || fs.readFileSync(target, 'utf8') !== output) {
      console.error(`Generated artifact is stale: ${path.relative(root, target)}`);
      process.exitCode = 1;
    }
  } else fs.writeFileSync(target, output);
}
writeOrCheck(contractPath, contractSource);
writeOrCheck(clientPath, clientSource);
if (!check) {
  for (const [filePath, exportLine] of [
    [contractIndexPath, "export * from './clinic-scheduling.js';"],
    [clientIndexPath, "export * from './clinic-scheduling.js';"],
  ]) {
    const current = fs.readFileSync(filePath, 'utf8');
    if (!current.includes(exportLine))
      fs.writeFileSync(filePath, `${current.trimEnd()}\n${exportLine}\n`);
  }
}
if (!process.exitCode)
  console.log(
    check
      ? 'Feature 009 generated artifacts are current.'
      : 'Generated Feature 009 contracts and client.',
  );
