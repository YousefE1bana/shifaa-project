import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { format } from 'prettier';
import { parse } from 'yaml';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sourcePath = path.join(
  root,
  'specs/010-encounters-referrals-contextual-chat/contracts/openapi.yaml',
);
const contractPath = path.join(root, 'packages/contracts/src/feature-010.ts');
const contractIndexPath = path.join(root, 'packages/contracts/src/index.ts');
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
  ['createEncounter', 'POST', '/encounters'],
  ['getEncounter', 'GET', '/encounters/{encounterId}'],
  ['updateEncounter', 'PATCH', '/encounters/{encounterId}'],
  ['signEncounterNote', 'POST', '/encounters/{encounterId}/notes'],
  ['completeEncounter', 'POST', '/encounters/{encounterId}/complete'],
  ['createReferral', 'POST', '/encounters/{encounterId}/referrals'],
  ['listReferrals', 'GET', '/referrals'],
  ['acceptReferral', 'POST', '/referrals/{referralId}/accept'],
  ['listContextMessages', 'GET', '/contexts/{contextType}/{contextId}/messages'],
  ['sendContextMessage', 'POST', '/contexts/{contextType}/{contextId}/messages'],
];

const document = parse(fs.readFileSync(sourcePath, 'utf8'));
if (document.openapi !== '3.1.1')
  throw new Error('Feature 010 OpenAPI must declare version 3.1.1.');

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
  throw new Error('Feature 010 OpenAPI operations drifted from the ten approved operations.');

const schemas = document.components?.schemas ?? {};
const sharedSchemaNames = new Set(['Uuid', 'Version', 'PageMeta', 'Problem']);
const refName = (reference) =>
  typeof reference === 'string' && reference.startsWith('#/components/schemas/')
    ? reference.slice('#/components/schemas/'.length)
    : undefined;
const jsonLiteral = (serializedValue) => JSON.stringify(serializedValue);
const schemaSymbolName = (schemaName) =>
  sharedSchemaNames.has(schemaName) ? `Feature010${schemaName}` : schemaName;
const querySymbolName = (operationId) =>
  `${operationId[0].toUpperCase()}${operationId.slice(1)}Query`;

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
  'default',
];
function options(schema) {
  const selected = Object.fromEntries(
    optionsKeys.filter((key) => schema[key] !== undefined).map((key) => [key, schema[key]]),
  );
  return Object.keys(selected).length ? `, ${jsonLiteral(selected)}` : '';
}

function constExpression(constant) {
  if (Array.isArray(constant))
    return `Type.Tuple([${constant.map((entry) => schemaExpression({ const: entry })).join(', ')}])`;
  return `Type.Literal(${jsonLiteral(constant)})`;
}

function unionExpression(variants) {
  return `Type.Union([${variants.map(schemaExpression).join(', ')}])`;
}

function objectExpression(schema) {
  const required = new Set(schema.required ?? []);
  const properties = Object.entries(schema.properties ?? {}).map(([propertyName, property]) => {
    const expression = schemaExpression(property);
    return `${jsonLiteral(propertyName)}: ${required.has(propertyName) ? expression : `Type.Optional(${expression})`}`;
  });
  const objectOptions = {
    ...(schema.additionalProperties === false ? { additionalProperties: false } : {}),
    ...(schema.minProperties === undefined ? {} : { minProperties: schema.minProperties }),
    ...(schema.maxProperties === undefined ? {} : { maxProperties: schema.maxProperties }),
  };
  const suffix = Object.keys(objectOptions).length ? `, ${jsonLiteral(objectOptions)}` : '';
  return `Type.Object({ ${properties.join(', ')} }${suffix})`;
}

function arrayExpression(schema) {
  if (Array.isArray(schema.items))
    return `Type.Tuple([${schema.items.map(schemaExpression).join(', ')}])`;
  return `Type.Array(${schemaExpression(schema.items)}${options(schema)})`;
}

function scalarExpression(schema) {
  const schemaOptions = options(schema).replace(/^, /, '') || '{}';
  if (schema.type === 'string') return `Type.String(${schemaOptions})`;
  if (schema.type === 'integer') return `Type.Integer(${schemaOptions})`;
  if (schema.type === 'number') return `Type.Number(${schemaOptions})`;
  if (schema.type === 'boolean') return 'Type.Boolean()';
  if (schema.type === 'null') return 'Type.Null()';
  throw new Error(`Feature 010 contains an unsupported schema: ${JSON.stringify(schema)}`);
}

function schemaExpression(schema) {
  if (!schema) throw new Error('Feature 010 contains a schema without a definition.');
  const reference = refName(schema.$ref);
  if (reference) {
    if (!schemas[reference])
      throw new Error(`Unresolved Feature 010 schema reference: ${reference}`);
    return `${schemaSymbolName(reference)}Schema`;
  }
  if (schema.const !== undefined) return constExpression(schema.const);
  if (schema.enum) return unionExpression(schema.enum.map((entry) => ({ const: entry })));
  if (schema.oneOf || schema.anyOf) return unionExpression(schema.oneOf ?? schema.anyOf);
  if (Array.isArray(schema.type))
    return unionExpression(schema.type.map((type) => ({ ...schema, type })));
  if (schema.allOf)
    throw new Error('Feature 010 OpenAPI uses unsupported allOf composition; generator stopped.');
  if (schema.type === 'object' || schema.properties) return objectExpression(schema);
  if (schema.type === 'array') return arrayExpression(schema);
  return scalarExpression(schema);
}

const schemaOrder = [];
const visiting = new Set();
const visited = new Set();
function visit(schemaName) {
  if (visited.has(schemaName)) return;
  if (visiting.has(schemaName))
    throw new Error(`Cyclic Feature 010 schema reference: ${schemaName}`);
  visiting.add(schemaName);
  const refs = JSON.stringify(schemas[schemaName] ?? '').matchAll(
    /#\/components\/schemas\/([A-Za-z0-9_]+)/g,
  );
  for (const [, dependency] of refs) if (schemas[dependency]) visit(dependency);
  visiting.delete(schemaName);
  visited.add(schemaName);
  schemaOrder.push(schemaName);
}
for (const schemaName of Object.keys(schemas)) visit(schemaName);

function resolveParameter(parameter) {
  if (!parameter?.$ref) return parameter;
  const parameterName = parameter.$ref.slice('#/components/parameters/'.length);
  const resolved = document.components?.parameters?.[parameterName];
  if (!resolved) throw new Error(`Unresolved Feature 010 parameter: ${parameterName}`);
  return resolved;
}
function parameters(operation, location) {
  return (operation.parameters ?? [])
    .map(resolveParameter)
    .filter((parameter) => parameter?.in === location);
}
function parameterRecord(parameter) {
  return {
    name: parameter.name,
    required: Boolean(parameter.required),
    schema: parameter.schema ?? {},
  };
}
function resolveRequestBody(requestBody) {
  if (!requestBody?.$ref) return requestBody;
  const bodyName = requestBody.$ref.slice('#/components/requestBodies/'.length);
  const resolved = document.components?.requestBodies?.[bodyName];
  if (!resolved) throw new Error(`Unresolved Feature 010 request body: ${bodyName}`);
  return resolved;
}
function resolveResponse(response) {
  if (!response?.$ref) return response;
  const responseName = response.$ref.slice('#/components/responses/'.length);
  const resolved = document.components?.responses?.[responseName];
  if (!resolved) throw new Error(`Unresolved Feature 010 response: ${responseName}`);
  return resolved;
}
function requestSchemaName(operation) {
  const requestBody = resolveRequestBody(operation.requestBody);
  const schemaName = refName(requestBody?.content?.['application/json']?.schema?.$ref);
  if (schemaName && !schemas[schemaName])
    throw new Error(`Missing Feature 010 request schema: ${schemaName}`);
  return schemaName;
}
function responseSchemaName(operation) {
  const success = Object.entries(operation.responses ?? {}).find(([status]) =>
    /^2\d\d$/.test(status),
  );
  const response = success ? resolveResponse(success[1]) : undefined;
  const content = response?.content ?? {};
  const mediaType = Object.keys(content).find(
    (type) => type === 'application/json' || type === 'application/problem+json',
  );
  const schemaName = refName(content[mediaType]?.schema?.$ref);
  if (!schemaName || !schemas[schemaName])
    throw new Error(
      `Feature 010 operation has no generated response schema: ${operation.operationId}`,
    );
  return schemaName;
}

const querySchemas = {};
const requestSchemas = new Map();
const responseSchemas = new Map();
const operationRows = operations.map(({ operationId, method, path: apiPath, operation }) => {
  const pathParameters = parameters(operation, 'path').map(parameterRecord);
  const queryParameters = parameters(operation, 'query').map(parameterRecord);
  const headerParameters = parameters(operation, 'header').map(parameterRecord);
  if (queryParameters.length) {
    const required = queryParameters
      .filter(({ required }) => required)
      .map(({ name: queryParameterName }) => queryParameterName);
    querySchemas[operationId] = {
      type: 'object',
      required,
      properties: Object.fromEntries(queryParameters.map(({ name, schema }) => [name, schema])),
      additionalProperties: false,
    };
  }
  const requestSchema = requestSchemaName(operation);
  if (requestSchema) requestSchemas.set(operationId, requestSchema);
  const responseSchema = responseSchemaName(operation);
  responseSchemas.set(operationId, responseSchema);
  return {
    operationId,
    method,
    path: apiPath,
    ...(requestSchema ? { requestSchema } : {}),
    responseSchema,
    pathParameters,
    queryParameters,
    headerParameters,
  };
});

const banner =
  '// @generated from specs/010-encounters-referrals-contextual-chat/contracts/openapi.yaml — DO NOT EDIT.\n';
const contractSource = await format(
  `${banner}
import { FormatRegistry, Type, type Static } from '@sinclair/typebox';

if (!FormatRegistry.Has('uuid')) {
  FormatRegistry.Set('uuid', (formatValue) =>
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(formatValue),
  );
}
if (!FormatRegistry.Has('date-time')) {
  FormatRegistry.Set('date-time', (formatValue) => Number.isFinite(Date.parse(formatValue)));
}
if (!FormatRegistry.Has('date')) {
  FormatRegistry.Set('date', (formatValue) => /^\\d{4}-\\d{2}-\\d{2}$/.test(formatValue));
}
if (!FormatRegistry.Has('uri-reference')) {
  FormatRegistry.Set('uri-reference', (formatValue) => !/\\s/.test(formatValue));
}

export const feature010Operations = ${JSON.stringify(operationRows, null, 2)} as const;
export type Feature010OperationId = (typeof feature010Operations)[number]['operationId'];

${schemaOrder.map((schemaName) => `export const ${schemaSymbolName(schemaName)}Schema = ${schemaExpression(schemas[schemaName])};`).join('\n')}

${Object.entries(querySchemas)
  .map(
    ([operationId, schema]) =>
      `export const ${querySymbolName(operationId)}Schema = ${schemaExpression(schema)};`,
  )
  .join('\n')}

export const feature010Schemas = {
${schemaOrder.map((schemaName) => `  ${schemaName}: ${schemaSymbolName(schemaName)}Schema,`).join('\n')}
${Object.keys(querySchemas)
  .map((operationId) => `  ${operationId}Query: ${querySymbolName(operationId)}Schema,`)
  .join('\n')}
} as const;

export const feature010QuerySchemas = {
${Object.keys(querySchemas)
  .map((operationId) => `  ${operationId}: ${querySymbolName(operationId)}Schema,`)
  .join('\n')}
} as const;

export const feature010RequestSchemas = {
${[...requestSchemas.entries()].map(([operationId, schemaName]) => `  ${operationId}: ${schemaSymbolName(schemaName)}Schema,`).join('\n')}
} as const;

export const feature010ResponseSchemas = {
${[...responseSchemas.entries()].map(([operationId, schemaName]) => `  ${operationId}: ${schemaSymbolName(schemaName)}Schema,`).join('\n')}
} as const;

${schemaOrder.map((schemaName) => `export type ${schemaSymbolName(schemaName)} = Static<typeof ${schemaSymbolName(schemaName)}Schema>;`).join('\n')}
${Object.keys(querySchemas)
  .map(
    (operationId) =>
      `export type ${querySymbolName(operationId)} = Static<typeof ${querySymbolName(operationId)}Schema>;`,
  )
  .join('\n')}
`,
  prettierOptions,
);

const currentIndex = fs.readFileSync(contractIndexPath, 'utf8');
const exportLine = "export * from './feature-010.js';";
function writeOrCheck(targetFile, generatedSource) {
  if (check) {
    if (!fs.existsSync(targetFile) || fs.readFileSync(targetFile, 'utf8') !== generatedSource) {
      console.error(`Generated artifact is stale: ${path.relative(root, targetFile)}`);
      process.exitCode = 1;
    }
  } else fs.writeFileSync(targetFile, generatedSource);
}

writeOrCheck(contractPath, contractSource);
if (check) {
  if (!currentIndex.split(/\r?\n/).includes(exportLine)) {
    console.error(`Generated artifact is stale: ${path.relative(root, contractIndexPath)}`);
    process.exitCode = 1;
  }
} else if (!currentIndex.split(/\r?\n/).includes(exportLine)) {
  fs.writeFileSync(contractIndexPath, `${currentIndex.trimEnd()}\n${exportLine}\n`);
}

if (!process.exitCode)
  console.log(
    check ? 'Feature 010 generated contracts are current.' : 'Generated Feature 010 contracts.',
  );
