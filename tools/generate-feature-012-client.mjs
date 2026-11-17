import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  formatFeature012,
  queryName,
  readFeature012Contract,
  writeFeature012Output,
} from './generate-feature-012-contract.mjs';

function renderOperation(operation) {
  const {
    operationId,
    method,
    path: apiPath,
    pathParameters,
    queryParameters,
    headerParameters,
    requestSchema,
    responseSchema,
    etag,
  } = operation;
  const idempotency = headerParameters.some(
    (header) => header.name === 'Idempotency-Key' && header.required,
  );
  const versioned = headerParameters.some(
    (header) => header.name === 'If-Match' && header.required,
  );
  const update = operationId === 'updatePrescription';
  const query = queryParameters.length ? queryName(operationId) : undefined;
  const resultType = `Feature012${responseSchema}`;
  const optionTypes = ['Feature012RequestOptions'];
  if (idempotency) optionTypes.push('{ idempotencyKey: string }');
  if (versioned) optionTypes.push(update ? '{ ifMatch: string }' : '{ version: number }');
  const args = pathParameters.map(({ name }) => `${name}: string`);
  if (query)
    args.push(`query: Feature012${query}${queryParameters.some((p) => p.required) ? '' : ' = {}'}`);
  if (requestSchema) args.push(`body: Feature012${requestSchema}`);
  args.push(`options: ${optionTypes.join(' & ')}${idempotency || versioned ? '' : ' = {}'}`);
  const importedTypes = [responseSchema];
  const apiPathExpression =
    '`' + apiPath.replace(/\{(\w+)\}/g, (_, name) => '${encodeURIComponent(' + name + ')}') + '`';
  const lines = [];
  if (query) {
    importedTypes.push(query);
    lines.push(`this.requireInput(feature012QuerySchemas.${operationId}, query);`);
  }
  if (requestSchema) {
    importedTypes.push(requestSchema);
    lines.push(`this.requireInput(feature012RequestSchemas.${operationId}, body);`);
  }
  if (idempotency)
    lines.push(
      'this.requireInput(feature012HeaderSchemas.IdempotencyKey, options.idempotencyKey);',
    );
  if (update) {
    lines.push(`const expected = 'action' in body
      ? '"ppc:' + prescriptionId + ':' + body.expectedSignedRevisionRef + ':' + body.expectedProjectionControlVersion + '"'
      : undefined;
    this.requireInput(expected ? feature012HeaderSchemas.UpdateIfMatch : feature012HeaderSchemas.IfMatch, options.ifMatch);
    if (expected && expected !== options.ifMatch) throw invalidInput();`);
  } else if (versioned) {
    lines.push(`if (!Number.isSafeInteger(options.version)) throw invalidInput();
    const ifMatch = '"' + options.version + '"';
    this.requireInput(feature012HeaderSchemas.IfMatch, ifMatch);`);
  }
  const endpoint = query ? `this.queryPath(${apiPathExpression}, query)` : apiPathExpression;
  const etagExpression = update
    ? 'expected ? feature012HeaderSchemas.UpdateETag : feature012HeaderSchemas.ETag'
    : etag
      ? `feature012HeaderSchemas.${etag}`
      : 'undefined';
  lines.push(`return this.request<${resultType}>('${method}', ${endpoint}, {
    requestId: options.requestId,
    signal: options.signal,
    ${idempotency ? 'idempotencyKey: options.idempotencyKey,' : ''}
    ${versioned ? `ifMatch: ${update ? 'options.ifMatch' : 'ifMatch'},` : ''}
    ${requestSchema ? 'body,' : ''}
  }, ${etagExpression}${update ? ', Boolean(expected)' : ''});`);
  return {
    importedTypes,
    source: `public async ${operationId}(${args.join(', ')}): Promise<${resultType}> {
      ${lines.join('\n')}
    }`,
  };
}

export async function renderFeature012Client() {
  const { operations } = readFeature012Contract();
  const rendered = operations.map(renderOperation);
  const names = [...new Set(rendered.flatMap((operation) => operation.importedTypes))].sort();
  return formatFeature012(`
import {
  checkFeature012WireSchema,
  feature012HeaderSchemas,
  feature012QuerySchemas,
  feature012RequestSchemas,
  ${names.map((name) => `type Feature012${name},`).join('\n')}
} from '@shifaa/contracts/feature-012';

export const generatedFeature012OperationIds = ${JSON.stringify(operations.map((op) => op.operationId))} as const;

export interface Feature012ClientOptions {
  baseUrl: string;
  accessToken: () => string | undefined;
  purpose: string;
  fetch?: typeof globalThis.fetch;
  acceptLanguage?: 'ar-EG' | 'en-EG';
}

export interface Feature012RequestOptions {
  requestId?: string;
  signal?: AbortSignal;
}

interface RequestInput {
  requestId?: string | undefined;
  signal?: AbortSignal | undefined;
  idempotencyKey?: string;
  ifMatch?: string;
  body?: unknown;
}

export class Feature012ApiError extends Error {
  public constructor(public readonly status: number, public readonly problem: unknown) {
    super('SHIFAA Feature 012 API request failed with status ' + status + '.');
    this.name = 'Feature012ApiError';
  }
}

const invalidInput = () => new Feature012ApiError(400, { code: 'validation-failed' });
type Schema = Parameters<typeof checkFeature012WireSchema>[0];

export class Feature012Client {
  private readonly fetcher: typeof globalThis.fetch;

  public constructor(private readonly options: Feature012ClientOptions) {
    this.fetcher = (options.fetch ?? globalThis.fetch).bind(globalThis);
  }

  ${rendered.map((operation) => operation.source).join('\n\n')}

  private requireInput(schema: Schema, input: unknown) {
    if (!checkFeature012WireSchema(schema, input)) throw invalidInput();
  }

  private queryPath(path: string, query: object): string {
    const params = new URLSearchParams();
    for (const [name, value] of Object.entries(query)) {
      if (value !== undefined) params.set(name, String(value));
    }
    return params.size ? path + '?' + params : path;
  }

  private async request<T>(
    method: 'GET' | 'POST' | 'PATCH',
    path: string,
    input: RequestInput,
    etagSchema: Schema | undefined,
    projection = false,
  ): Promise<T> {
    const token = this.options.accessToken();
    if (!token) throw new Feature012ApiError(401, { code: 'authentication-required' });
    if (!this.options.purpose.trim()) throw invalidInput();

    const headers = new Headers({
      Accept: 'application/json, application/problem+json',
      'Accept-Language': this.options.acceptLanguage ?? 'ar-EG',
      Authorization: 'Bearer ' + token,
      'X-Purpose': this.options.purpose,
    });
    if (input.requestId !== undefined) {
      this.requireInput(feature012HeaderSchemas.RequestId, input.requestId);
      headers.set('X-Request-Id', input.requestId);
    }
    if (input.idempotencyKey !== undefined) headers.set('Idempotency-Key', input.idempotencyKey);
    if (input.ifMatch !== undefined) headers.set('If-Match', input.ifMatch);
    if (input.body !== undefined) headers.set('Content-Type', 'application/json');

    const base = this.options.baseUrl.replace(/\\/$/, '');
    const response = await this.fetcher(base + '/v1' + path, {
      method, headers, cache: 'no-store',
      ...(input.signal ? { signal: input.signal } : {}),
      ...(input.body === undefined ? {} : { body: JSON.stringify(input.body) }),
    });
    const cache = new Set((response.headers.get('cache-control') ?? '').split(',').map((value) => value.trim().toLowerCase()));
    if (!cache.has('private') || !cache.has('no-store'))
      throw new Feature012ApiError(502, { code: 'unsafe-cache-policy' });

    const payload: unknown = await response.json();
    if (!response.ok) throw new Feature012ApiError(response.status, payload);
    const etag = response.headers.get('etag');
    if (etagSchema && (!checkFeature012WireSchema(etagSchema, etag) || (projection && !etag?.startsWith('"ppc:'))))
      throw new Feature012ApiError(502, { code: 'invalid-response-etag' });
    return payload as T;
  }
}

export const createFeature012Client = (options: Feature012ClientOptions) => new Feature012Client(options);
`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  writeFeature012Output(
    'packages/api-client/src/feature-012.ts',
    await renderFeature012Client(),
    process.argv.includes('--check'),
  );
}
