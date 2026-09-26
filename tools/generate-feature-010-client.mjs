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
const clientPath = path.join(root, 'packages/api-client/src/feature-010.ts');
const check = process.argv.includes('--check');
const prettierOptions = {
  parser: 'typescript',
  semi: true,
  singleQuote: true,
  trailingComma: 'all',
  printWidth: 100,
  endOfLine: 'lf',
};

const expectedOperationIds = [
  'createEncounter',
  'getEncounter',
  'updateEncounter',
  'signEncounterNote',
  'completeEncounter',
  'createReferral',
  'listReferrals',
  'acceptReferral',
  'listContextMessages',
  'sendContextMessage',
];
const document = parse(fs.readFileSync(sourcePath, 'utf8'));
if (document.openapi !== '3.1.1')
  throw new Error('Feature 010 client generation requires the approved OpenAPI 3.1.1 contract.');

const methods = ['get', 'post', 'put', 'patch', 'delete'];
const operations = [];
for (const [apiPath, pathItem] of Object.entries(document.paths ?? {})) {
  for (const method of methods) {
    const operation = pathItem?.[method];
    if (!operation) continue;
    operations.push({
      operationId: operation.operationId,
      method: method.toUpperCase(),
      apiPath,
      operation,
      pathItem,
    });
  }
}
const actualOperationIds = operations.map(({ operationId }) => operationId);
if (
  JSON.stringify(actualOperationIds) !== JSON.stringify(expectedOperationIds) ||
  new Set(actualOperationIds).size !== expectedOperationIds.length
)
  throw new Error('Feature 010 OpenAPI must contain exactly its ten approved client operations.');

const resolveReference = (reference, collection) => {
  const prefix = `#/components/${collection}/`;
  if (typeof reference !== 'string' || !reference.startsWith(prefix)) return undefined;
  const name = reference.slice(prefix.length);
  const value = document.components?.[collection]?.[name];
  if (!value) throw new Error(`Unresolved Feature 010 ${collection} reference: ${name}`);
  return value;
};
const resolveObject = (value, collection) =>
  value?.$ref ? resolveReference(value.$ref, collection) : value;
const schemaReference = (schema) => resolveReference(schema?.$ref, 'schemas');
const schemaName = (schema) => {
  const prefix = '#/components/schemas/';
  return typeof schema?.$ref === 'string' && schema.$ref.startsWith(prefix)
    ? schema.$ref.slice(prefix.length)
    : undefined;
};
const typeName = (name) =>
  ({
    Uuid: 'Feature010Uuid',
    Version: 'Feature010Version',
    PageMeta: 'Feature010PageMeta',
    Problem: 'Feature010Problem',
  })[name] ?? name;
const upperFirst = (value) => `${value[0].toUpperCase()}${value.slice(1)}`;

function resolveParameters(pathItem, operation) {
  const values = [...(pathItem.parameters ?? []), ...(operation.parameters ?? [])].map((item) =>
    resolveObject(item, 'parameters'),
  );
  return [...new Map(values.map((item) => [`${item.in}:${item.name}`, item])).values()];
}

function requestBodyType(operation) {
  const body = resolveObject(operation.requestBody, 'requestBodies');
  const schema = body?.content?.['application/json']?.schema;
  const name = schemaName(schema);
  if (schema && !name)
    throw new Error(
      `Feature 010 request body must reference a named schema: ${operation.operationId}`,
    );
  return name ? typeName(name) : undefined;
}

function responseType(operation) {
  const success = Object.entries(operation.responses ?? {}).find(([status]) =>
    /^2\d\d$/.test(status),
  );
  const response = success ? resolveObject(success[1], 'responses') : undefined;
  const schema = response?.content?.['application/json']?.schema;
  const name = schemaName(schema);
  if (!name || !schemaReference(schema))
    throw new Error(`Feature 010 response must reference a named schema: ${operation.operationId}`);
  return typeName(name);
}

function schemaType(schema) {
  const reference = schemaName(schema);
  if (reference) return typeName(reference);
  if (schema?.const !== undefined) return JSON.stringify(schema.const);
  if (schema?.enum) return schema.enum.map((item) => JSON.stringify(item)).join(' | ');
  if (schema?.type === 'array') return `Array<${schemaType(schema.items)}>`;
  if (schema?.type === 'integer' || schema?.type === 'number') return 'number';
  if (schema?.type === 'boolean') return 'boolean';
  if (schema?.type === 'string') return 'string';
  throw new Error(`Unsupported Feature 010 client parameter schema: ${JSON.stringify(schema)}`);
}

function querySchemaType(operationId) {
  return `${upperFirst(operationId)}Query`;
}

function pathExpression(apiPath) {
  if (!/\{[A-Za-z0-9_]+\}/.test(apiPath)) return JSON.stringify(apiPath);
  const template = apiPath.replace(
    /\{([A-Za-z0-9_]+)\}/g,
    (_match, name) => '${encodeURIComponent(' + name + ')}',
  );
  return `\`${template}\``;
}

function generatedOperation(operation) {
  const { apiPath, method, operationId } = operation;
  const parameters = resolveParameters(operation.pathItem, operation.operation);
  const pathParameters = parameters.filter((parameter) => parameter.in === 'path');
  const queryParameters = parameters.filter((parameter) => parameter.in === 'query');
  const headerParameters = parameters.filter((parameter) => parameter.in === 'header');
  const bodyType = requestBodyType(operation.operation);
  const resultType = responseType(operation.operation);
  const hasIdempotency = headerParameters.some((parameter) => parameter.name === 'Idempotency-Key');
  const hasVersion = headerParameters.some((parameter) => parameter.name === 'If-Match');
  const queryName = queryParameters.length ? 'query' : undefined;
  const queryType = queryParameters.length ? querySchemaType(operationId) : undefined;
  const optionsType = [
    'Feature010RequestOptions',
    hasIdempotency ? '{ idempotencyKey: string }' : undefined,
    hasVersion ? '{ version: number }' : undefined,
  ]
    .filter(Boolean)
    .join(' & ');

  const signature = [
    ...pathParameters.map((parameter) => `${parameter.name}: ${schemaType(parameter.schema)}`),
    ...(queryName ? [`${queryName}: ${queryType} = {}`] : []),
    ...(bodyType ? [`body: ${bodyType}`] : []),
    `options: ${optionsType}${hasIdempotency || hasVersion ? '' : ' = {}'}`,
  ].join(', ');
  const requestPath = pathExpression(apiPath);
  const path = queryParameters.length
    ? `this.queryPath(${requestPath}, query, ${JSON.stringify(
        queryParameters.map((parameter) => ({
          name: parameter.name,
          explode: parameter.explode !== false,
        })),
      )})`
    : requestPath;
  const input = bodyType ? '{ ...options, body }' : 'options';
  return `  public ${operationId}(${signature}): Promise<${resultType}> {
    return this.request<${resultType}>('${method}', ${path}, ${input});
  }`;
}

const imports = new Set();
for (const operation of operations) {
  const body = requestBodyType(operation.operation);
  if (body) imports.add(body);
  imports.add(responseType(operation.operation));
  const parameters = resolveParameters(operation.pathItem, operation.operation);
  for (const parameter of parameters.filter(({ in: location }) => location === 'path')) {
    const referencedType = schemaName(parameter.schema);
    if (referencedType) imports.add(typeName(referencedType));
  }
  if (parameters.some(({ in: location }) => location === 'query'))
    imports.add(querySchemaType(operation.operationId));
}
const banner =
  '// @generated from specs/010-encounters-referrals-contextual-chat/contracts/openapi.yaml — DO NOT EDIT.\n';
const generatedSourceText = `${banner}
import type {
${[...imports]
  .sort()
  .map((name) => `  ${name},`)
  .join('\n')}
} from '@shifaa/contracts';

export const generatedFeature010OperationIds = [
${operations.map(({ operationId }) => `  '${operationId}',`).join('\n')}
] as const;

export interface Feature010ClientOptions {
  baseUrl: string;
  accessToken: () => string | undefined;
  fetch?: typeof globalThis.fetch;
  acceptLanguage?: 'ar-EG' | 'en-EG';
  defaultHeaders?: Readonly<Record<string, string>>;
}

export interface Feature010RequestOptions {
  requestId?: string;
  signal?: AbortSignal;
}

interface Feature010RequestInput extends Feature010RequestOptions {
  body?: unknown;
  idempotencyKey?: string;
  version?: number;
}

export class Feature010ApiError extends Error {
  public constructor(
    public readonly status: number,
    public readonly problem: unknown,
  ) {
    super(\`SHIFAA Feature 010 API request failed with status \${status}.\`);
    this.name = 'Feature010ApiError';
  }
}

interface Feature010QueryParameter {
  name: string;
  explode: boolean;
}

export class Feature010Client {
  private readonly fetcher: typeof globalThis.fetch;

  public constructor(private readonly options: Feature010ClientOptions) {
    this.fetcher = (options.fetch ?? globalThis.fetch).bind(globalThis);
  }

${operations.map(generatedOperation).join('\n\n')}

  private queryPath(path: string, query: object, parameters: readonly Feature010QueryParameter[]): string {
    const values = new URLSearchParams();
    const record = query as Record<string, unknown>;
    for (const parameter of parameters) {
      const value = record[parameter.name];
      if (value === undefined || value === null || value === '') continue;
      if (Array.isArray(value)) {
        if (parameter.explode) for (const item of value) values.append(parameter.name, String(item));
        else values.set(parameter.name, value.map(String).join(','));
      } else values.set(parameter.name, String(value));
    }
    return values.size ? \`\${path}?\${values}\` : path;
  }

  private async request<T>(
    method: 'GET' | 'POST' | 'PATCH',
    path: string,
    input: Feature010RequestInput,
  ): Promise<T> {
    const accessToken = this.options.accessToken();
    if (!accessToken)
      throw new Feature010ApiError(401, { code: 'authentication-required' });

    const headers = new Headers({
      Accept: 'application/json, application/problem+json',
      'Accept-Language': this.options.acceptLanguage ?? 'ar-EG',
      ...(this.options.defaultHeaders ?? {}),
    });
    headers.set('Authorization', \`Bearer \${accessToken}\`);
    if (input.body !== undefined) headers.set('Content-Type', 'application/json');
    if (input.requestId) headers.set('X-Request-Id', input.requestId);
    if (input.idempotencyKey) headers.set('Idempotency-Key', input.idempotencyKey);
    if (input.version !== undefined) headers.set('If-Match', \`"\${input.version}"\`);

    const response = await this.fetcher(
      \`\${this.options.baseUrl.replace(/\\/$/, '')}/v1\${path}\`,
      {
        method,
        headers,
        cache: 'no-store',
        ...(input.signal ? { signal: input.signal } : {}),
        ...(input.body === undefined ? {} : { body: JSON.stringify(input.body) }),
      },
    );
    const cacheDirectives = new Set(
      (response.headers.get('cache-control') ?? '')
        .split(',')
        .map((directive) => directive.trim().toLowerCase()),
    );
    if (!cacheDirectives.has('private') || !cacheDirectives.has('no-store'))
      throw new Feature010ApiError(502, { code: 'unsafe-cache-policy' });

    const payload: unknown = await response.json();
    if (!response.ok) throw new Feature010ApiError(response.status, payload);
    return payload as T;
  }
}

export const createFeature010Client = (options: Feature010ClientOptions) =>
  new Feature010Client(options);
`;
const generatedSource = await format(generatedSourceText, prettierOptions);

if (check) {
  if (!fs.existsSync(clientPath) || fs.readFileSync(clientPath, 'utf8') !== generatedSource) {
    console.error(`Generated artifact is stale: ${path.relative(root, clientPath)}`);
    process.exitCode = 1;
  }
} else {
  fs.writeFileSync(clientPath, generatedSource);
}

if (!process.exitCode)
  console.log(
    check ? 'Feature 010 generated client is current.' : 'Generated Feature 010 API client.',
  );
