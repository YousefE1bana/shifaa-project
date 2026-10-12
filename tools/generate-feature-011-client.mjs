import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { format } from 'prettier';
import { parse } from 'yaml';
import {
  readFeature011CanonicalizationMetadata,
  readFeature011ProtocolMetadata,
} from './generate-feature-011-contract.mjs';

const defaultRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export async function renderFeature011Client(root = defaultRoot) {
  const canonicalizationMetadata = readFeature011CanonicalizationMetadata(root);
  const protocolMetadata = readFeature011ProtocolMetadata(root);
  const sourcePath = path.join(
    root,
    'specs/011-allergies-clinical-content-governance/contracts/openapi.yaml',
  );
  const prettierOptions = {
    parser: 'typescript',
    semi: true,
    singleQuote: true,
    trailingComma: 'all',
    printWidth: 100,
    endOfLine: 'lf',
  };

  const expectedBindings = [
    ['listAllergies', 'GET', '/patients/{managedPatientId}/allergies'],
    ['createAllergy', 'POST', '/patients/{managedPatientId}/allergies'],
    ['verifyAllergy', 'POST', '/allergies/{allergyId}/verification'],
    ['listClinicalContent', 'GET', '/admin/clinical-content/{contentType}'],
    ['createClinicalContentRelease', 'POST', '/admin/clinical-content/{contentType}/releases'],
    [
      'signClinicalContentRelease',
      'POST',
      '/admin/clinical-content/releases/{releaseId}/signatures',
    ],
    [
      'publishClinicalContentRelease',
      'POST',
      '/admin/clinical-content/releases/{releaseId}/publish',
    ],
  ];
  const expectedOperationIds = expectedBindings.map(([id]) => id);
  const document = parse(fs.readFileSync(sourcePath, 'utf8'));
  if (document.openapi !== '3.1.1')
    throw new Error('Feature 011 client generation requires the approved OpenAPI 3.1.1 contract.');

  const methods = ['get', 'post', 'put', 'patch', 'delete', 'head', 'options', 'trace'];
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
    JSON.stringify(operations.map((o) => [o.operationId, o.method, o.apiPath])) !==
      JSON.stringify(expectedBindings) ||
    new Set(actualOperationIds).size !== expectedOperationIds.length
  )
    throw new Error(
      'Feature 011 OpenAPI must contain exactly its seven approved client operations.',
    );

  const resolveReference = (reference, collection) => {
    const prefix = `#/components/${collection}/`;
    if (typeof reference !== 'string' || !reference.startsWith(prefix)) return undefined;
    const name = reference.slice(prefix.length);
    const value = document.components?.[collection]?.[name];
    if (!value) throw new Error(`Unresolved Feature 011 ${collection} reference: ${name}`);
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
  const typeName = (name) => `Feature011${name}`;
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
        `Feature 011 request body must reference a named schema: ${operation.operationId}`,
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
      throw new Error(
        `Feature 011 response must reference a named schema: ${operation.operationId}`,
      );
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
    throw new Error(`Unsupported Feature 011 client parameter schema: ${JSON.stringify(schema)}`);
  }

  function querySchemaType(operationId) {
    return `Feature011${upperFirst(operationId)}Query`;
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
    const hasIdempotency = headerParameters.some(
      (parameter) => parameter.name === 'Idempotency-Key',
    );
    const hasVersion = headerParameters.some((parameter) => parameter.name === 'If-Match');
    const queryName = queryParameters.length ? 'query' : undefined;
    const queryType = queryParameters.length ? querySchemaType(operationId) : undefined;
    const optionsType = [
      'Feature011RequestOptions',
      hasIdempotency ? '{ idempotencyKey: string }' : undefined,
      hasVersion ? '{ version: number }' : undefined,
    ]
      .filter(Boolean)
      .join(' & ');

    const signature = [
      ...pathParameters.map((parameter) => `${parameter.name}: ${schemaType(parameter.schema)}`),
      ...(queryName
        ? [`${queryName}: ${queryType}${queryParameters.some((p) => p.required) ? '' : ' = {}'}`]
        : []),
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
    '// @generated from specs/011-allergies-clinical-content-governance/contracts/openapi.yaml — DO NOT EDIT.\n';
  const generatedSourceText = `${banner}
import type {
${[...imports]
  .sort()
  .map((name) => `  ${name},`)
  .join('\n')}
} from '@shifaa/contracts';

export const feature011ArtifactCanonicalizationMetadata = ${JSON.stringify(canonicalizationMetadata, null, 2)} as const;

export const feature011ProtocolMetadata = ${JSON.stringify(protocolMetadata, null, 2)} as const;

export const generatedFeature011OperationIds = [
${operations.map(({ operationId }) => `  '${operationId}',`).join('\n')}
] as const;

export interface Feature011ClientOptions {
  baseUrl: string;
  accessToken: () => string | undefined;
  purpose?: string;
  fetch?: typeof globalThis.fetch;
  acceptLanguage?: 'ar-EG' | 'en-EG';
  defaultHeaders?: Readonly<Record<string, string>>;
}

export interface Feature011RequestOptions {
  requestId?: string;
  signal?: AbortSignal;
}

interface Feature011RequestInput extends Feature011RequestOptions {
  body?: unknown;
  idempotencyKey?: string;
  version?: number;
}

export class Feature011ApiError extends Error {
  public constructor(
    public readonly status: number,
    public readonly problem: unknown,
  ) {
    super(\`SHIFAA Feature 011 API request failed with status \${status}.\`);
    this.name = 'Feature011ApiError';
  }
}

interface Feature011QueryParameter {
  name: string;
  explode: boolean;
}

export class Feature011Client {
  private readonly fetcher: typeof globalThis.fetch;

  public constructor(private readonly options: Feature011ClientOptions) {
    this.fetcher = (options.fetch ?? globalThis.fetch).bind(globalThis);
  }

${operations.map(generatedOperation).join('\n\n')}

  private queryPath(path: string, query: object, parameters: readonly Feature011QueryParameter[]): string {
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
    input: Feature011RequestInput,
  ): Promise<T> {
    const accessToken = this.options.accessToken();
    if (!accessToken)
      throw new Feature011ApiError(401, { code: 'authentication-required' });

    const headers = new Headers({
      Accept: 'application/json, application/problem+json',
      'Accept-Language': this.options.acceptLanguage ?? 'ar-EG',
      ...(this.options.defaultHeaders ?? {}),
    });
    // Mutation and identity bindings come from request/current session options.
    for (const name of ['Authorization', 'Idempotency-Key', 'If-Match', 'X-AAL', 'X-Actor-Id', 'X-Purpose', 'X-Request-Id', 'Content-Type']) headers.delete(name);
    if (this.options.purpose) headers.set('X-Purpose', this.options.purpose);
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
      throw new Feature011ApiError(502, { code: 'unsafe-cache-policy' });

    const payload: unknown = await response.json();
    if (!response.ok) throw new Feature011ApiError(response.status, payload);
    return payload as T;
  }
}

export const createFeature011Client = (options: Feature011ClientOptions) =>
  new Feature011Client(options);
`;
  const generatedSource = await format(generatedSourceText, prettierOptions);

  return generatedSource;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const check = process.argv.includes('--check');
  const target = path.join(defaultRoot, 'packages/api-client/src/feature-011.ts');
  const source = await renderFeature011Client();
  if (check) {
    if (!fs.existsSync(target) || fs.readFileSync(target, 'utf8') !== source) {
      console.error('Feature 011 generated client is stale.');
      process.exitCode = 1;
    }
  } else fs.writeFileSync(target, source);
  if (!process.exitCode)
    console.log(
      check ? 'Feature 011 generated client is current.' : 'Generated Feature 011 API client.',
    );
}
