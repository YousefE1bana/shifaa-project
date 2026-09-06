// @generated from specs/008-audit-admin-aggregates-observability/contracts/openapi.yaml — DO NOT EDIT.

import type {
  AuditEventListInput,
  CreateAuditExportInput,
  ExportAuditPartitionInput,
} from '@shifaa/contracts/audit-admin';

export const generatedAuditAdminOperationIds = [
  'getAdminSummary',
  'listAuditEvents',
  'getAuditEvent',
  'createAuditExport',
  'exportAuditPartition',
  'healthLive',
  'healthReady',
] as const;

export type AuditAdminClientOptions = {
  baseUrl: string;
  accessToken?: string;
  serviceCredential?: string;
  fetch?: typeof globalThis.fetch;
  acceptLanguage?: 'ar-EG' | 'en-EG';
  defaultHeaders?: Record<string, string>;
};

export class AuditAdminApiError extends Error {
  public constructor(
    public readonly status: number,
    public readonly problem: unknown,
  ) {
    super(`SHIFAA audit/admin API request failed with status ${status}.`);
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
    for (const [key, queryValue] of Object.entries(query))
      if (queryValue !== undefined) parameters.set(key, String(queryValue));
    return this.request('GET', `/admin/audit/events${parameters.size ? `?${parameters}` : ''}`, {
      authentication: 'admin',
      purpose,
    });
  }
  public getAuditEvent(eventId: string, purpose: string) {
    return this.request('GET', `/admin/audit/events/${encodeURIComponent(eventId)}`, {
      authentication: 'admin',
      purpose,
    });
  }
  public createAuditExport(body: CreateAuditExportInput, purpose: string, idempotencyKey: string) {
    return this.request('POST', '/admin/audit/exports', {
      authentication: 'admin',
      purpose,
      idempotencyKey,
      body,
    });
  }
  public exportAuditPartition(body: ExportAuditPartitionInput, idempotencyKey: string) {
    return this.request('POST', '/internal/audit/exports', {
      authentication: 'service',
      idempotencyKey,
      body,
    });
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
    const credential =
      options.authentication === 'service'
        ? this.options.serviceCredential
        : this.options.accessToken;
    const headers: Record<string, string> = {
      Accept: 'application/json, application/problem+json',
      'Accept-Language': this.options.acceptLanguage ?? 'ar-EG',
      ...this.options.defaultHeaders,
    };
    if (credential) headers['Authorization'] = `Bearer ${credential}`;
    if (options.purpose) headers['X-Purpose'] = options.purpose;
    if (options.idempotencyKey) headers['Idempotency-Key'] = options.idempotencyKey;
    if (options.body !== undefined) headers['Content-Type'] = 'application/json';
    const response = await this.fetcher(new URL(`/v1${endpoint}`, this.options.baseUrl), {
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
