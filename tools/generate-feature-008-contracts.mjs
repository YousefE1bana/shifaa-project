import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { format } from 'prettier';
import { parse } from 'yaml';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sourcePath = path.join(
  root,
  'specs/008-audit-admin-aggregates-observability/contracts/openapi.yaml',
);
const contractPath = path.join(root, 'packages/contracts/src/audit-admin.ts');
const clientPath = path.join(root, 'packages/api-client/src/audit-admin.ts');
const check = process.argv.includes('--check');
const prettierOptions = {
  parser: 'typescript',
  semi: true,
  singleQuote: true,
  trailingComma: 'all',
  printWidth: 100,
  endOfLine: 'lf',
};
const document = parse(fs.readFileSync(sourcePath, 'utf8'));
const expected = [
  ['getAdminSummary', 'GET', '/admin/dashboard-summary'],
  ['listAuditEvents', 'GET', '/admin/audit/events'],
  ['getAuditEvent', 'GET', '/admin/audit/events/{eventId}'],
  ['createAuditExport', 'POST', '/admin/audit/exports'],
  ['exportAuditPartition', 'POST', '/internal/audit/exports'],
  ['healthLive', 'GET', '/internal/health/live'],
  ['healthReady', 'GET', '/internal/health/ready'],
];
const operations = [];
for (const [apiPath, pathItem] of Object.entries(document.paths ?? {}))
  for (const method of ['get', 'post', 'put', 'patch', 'delete']) {
    const operation = pathItem[method];
    if (operation)
      operations.push({
        operationId: operation.operationId,
        method: method.toUpperCase(),
        path: apiPath,
      });
  }
if (
  JSON.stringify(
    operations.map(({ operationId, method, path: apiPath }) => [operationId, method, apiPath]),
  ) !== JSON.stringify(expected)
)
  throw new Error('Feature 008 OpenAPI operations drifted from the seven approved operations.');

const banner =
  '// @generated from specs/008-audit-admin-aggregates-observability/contracts/openapi.yaml — DO NOT EDIT.\n';
const generatedSchemas = Object.entries(document.components.schemas)
  .map(
    ([name, schema]) =>
      `  ${name}: Type.Unsafe(${JSON.stringify(schema, null, 2).replaceAll('\n', '\n  ')}),`,
  )
  .join('\n');
const contract = await format(
  `${banner}
import { Type } from '@sinclair/typebox';

export const auditAdminOperations = ${JSON.stringify(operations, null, 2)} as const;
export type AuditAdminOperationId = (typeof auditAdminOperations)[number]['operationId'];

export const auditAdminSchemas = {
${generatedSchemas}
} as const;

export type AuditOutcome = 'success' | 'denied' | 'failed';
export type CreateAuditExportInput = {
  partition_start: string;
  partition_end_exclusive: string;
};
export type ExportAuditPartitionInput = { export_batch_id: string };
export type AuditEventListInput = {
  actor?: string;
  action?: string;
  resource_type?: string;
  resource_id?: string;
  occurred_from?: string;
  occurred_before?: string;
  outcome?: AuditOutcome;
  limit?: number;
  cursor?: string;
};
`,
  prettierOptions,
);

const client = await format(
  `${banner}
import type {
  AuditEventListInput,
  CreateAuditExportInput,
  ExportAuditPartitionInput,
} from '@shifaa/contracts/audit-admin';

export const generatedAuditAdminOperationIds = ${JSON.stringify(
    expected.map(([id]) => id),
    null,
    2,
  )} as const;

export type AuditAdminClientOptions = {
  baseUrl: string;
  accessToken?: string;
  serviceCredential?: string;
  fetch?: typeof globalThis.fetch;
  acceptLanguage?: 'ar-EG' | 'en-EG';
  defaultHeaders?: Record<string, string>;
};

export class AuditAdminApiError extends Error {
  public constructor(public readonly status: number, public readonly problem: unknown) {
    super(\`SHIFAA audit/admin API request failed with status \${status}.\`);
    this.name = 'AuditAdminApiError';
  }
}

export class AuditAdminClient {
  private readonly fetcher: typeof globalThis.fetch;
  public constructor(private readonly options: AuditAdminClientOptions) {
    this.fetcher = (options.fetch ?? globalThis.fetch).bind(globalThis);
  }
  public getAdminSummary() {
    return this.request('GET', '/admin/dashboard-summary', { authentication: 'admin' });
  }
  public listAuditEvents(query: AuditEventListInput, purpose: string) {
    const parameters = new URLSearchParams();
    for (const [key, queryValue] of Object.entries(query)) if (queryValue !== undefined) parameters.set(key, String(queryValue));
    return this.request('GET', \`/admin/audit/events\${parameters.size ? \`?\${parameters}\` : ''}\`, { authentication: 'admin', purpose });
  }
  public getAuditEvent(eventId: string, purpose: string) {
    return this.request('GET', \`/admin/audit/events/\${encodeURIComponent(eventId)}\`, { authentication: 'admin', purpose });
  }
  public createAuditExport(body: CreateAuditExportInput, purpose: string, idempotencyKey: string) {
    return this.request('POST', '/admin/audit/exports', { authentication: 'admin', purpose, idempotencyKey, body });
  }
  public exportAuditPartition(body: ExportAuditPartitionInput, idempotencyKey: string) {
    return this.request('POST', '/internal/audit/exports', { authentication: 'service', idempotencyKey, body });
  }
  public healthLive() {
    return this.request('GET', '/internal/health/live', { authentication: 'service' });
  }
  public healthReady() {
    return this.request('GET', '/internal/health/ready', { authentication: 'service' });
  }
  private async request(
    method: 'GET' | 'POST',
    endpoint: string,
    options: {
      authentication: 'admin' | 'service';
      purpose?: string;
      idempotencyKey?: string;
      body?: unknown;
    },
  ): Promise<unknown> {
    const credential = options.authentication === 'service' ? this.options.serviceCredential : this.options.accessToken;
    const headers: Record<string, string> = {
      Accept: 'application/json, application/problem+json',
      'Accept-Language': this.options.acceptLanguage ?? 'ar-EG',
      ...this.options.defaultHeaders,
    };
    if (credential) headers['Authorization'] = \`Bearer \${credential}\`;
    if (options.purpose) headers['X-Purpose'] = options.purpose;
    if (options.idempotencyKey) headers['Idempotency-Key'] = options.idempotencyKey;
    if (options.body !== undefined) headers['Content-Type'] = 'application/json';
    const response = await this.fetcher(new URL(\`/v1\${endpoint}\`, this.options.baseUrl), {
      method,
      headers,
      cache: 'no-store',
      ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
    });
    const responseBody: unknown = await response.json();
    if (!response.ok) throw new AuditAdminApiError(response.status, responseBody);
    return responseBody;
  }
}
`,
  prettierOptions,
);

for (const [target, output] of [
  [contractPath, contract],
  [clientPath, client],
]) {
  if (check) {
    if (!fs.existsSync(target) || fs.readFileSync(target, 'utf8') !== output) {
      console.error(`Generated artifact is stale: ${path.relative(root, target)}`);
      process.exitCode = 1;
    }
  } else fs.writeFileSync(target, output);
}
if (!process.exitCode)
  console.log(
    check
      ? 'Feature 008 generated artifacts are current.'
      : 'Generated Feature 008 contracts and client.',
  );
