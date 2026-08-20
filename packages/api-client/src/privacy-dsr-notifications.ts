// @generated from specs/005-privacy-dsr-notifications/contracts/openapi.yaml — DO NOT EDIT.
import type {
  CreateDsrInput,
  CreateNotificationTemplateReleaseInput,
  DownloadDsrExportInput,
  DsrDecisionInput,
  DsrFulfilmentInput,
  PublishNotificationTemplateReleaseInput,
  ReplayDeadLetterInput,
  SmsProviderCallbackInput,
} from '@shifaa/contracts/privacy-dsr-notifications';

export const generatedPrivacyDsrNotificationOperationIds = [
  'createDsr',
  'listMyDsrs',
  'getDsr',
  'downloadDsrExport',
  'listAdminDsrs',
  'decideDsr',
  'fulfilDsr',
  'listNotificationTemplates',
  'createNotificationTemplateRelease',
  'publishNotificationTemplateRelease',
  'smsProviderCallback',
  'replayDeadLetter',
] as const;

export interface PrivacyDsrNotificationClientOptions {
  baseUrl: string;
  accessToken?: string;
  fetch?: typeof globalThis.fetch;
  acceptLanguage?: 'ar-EG' | 'en-EG';
  defaultHeaders?: Record<string, string>;
}
export interface PrivacyDsrPageQuery {
  managedPatientId?: string;
  type?: string;
  status?: string;
  cursor?: string;
  limit?: number;
  dueBefore?: string;
}
export interface NotificationTemplatePageQuery {
  code?: string;
  locale?: 'ar-EG' | 'en-EG';
  channel?: 'sms';
  status?: 'draft' | 'published' | 'retired';
  cursor?: string;
  limit?: number;
}
export interface PrivacyRequestOptions {
  signal?: AbortSignal;
}
export class PrivacyDsrNotificationApiError extends Error {
  public constructor(
    public readonly status: number,
    public readonly problem: unknown,
  ) {
    super(`SHIFAA Privacy API failed with status ${status}.`);
    this.name = 'PrivacyDsrNotificationApiError';
  }
}

export class PrivacyDsrNotificationClient {
  private readonly fetcher: typeof globalThis.fetch;
  public constructor(private readonly options: PrivacyDsrNotificationClientOptions) {
    this.fetcher = (options.fetch ?? globalThis.fetch).bind(globalThis);
  }

  createDsr(body: CreateDsrInput, key: string, options: PrivacyRequestOptions = {}) {
    return this.request('POST', '/privacy/requests', {
      body,
      key,
      ...(body.managed_patient_id ? { patientId: body.managed_patient_id } : {}),
      ...options,
    });
  }
  listMyDsrs(query: PrivacyDsrPageQuery = {}, options: PrivacyRequestOptions = {}) {
    return this.request('GET', this.page('/privacy/requests', query), options);
  }
  getDsr(
    requestId: string,
    context: { aal?: 1 | 2; purpose?: string } = {},
    options: PrivacyRequestOptions = {},
  ) {
    return this.request('GET', `/privacy/requests/${requestId}`, { ...context, ...options });
  }
  downloadDsrExport(
    requestId: string,
    key: string,
    body?: DownloadDsrExportInput,
    options: PrivacyRequestOptions = {},
  ) {
    return this.request('POST', `/privacy/requests/${requestId}/download-link`, {
      body,
      key,
      aal: 2,
      binary: body !== undefined,
      ...options,
    });
  }
  listAdminDsrs(query: PrivacyDsrPageQuery = {}, options: PrivacyRequestOptions = {}) {
    return this.request('GET', this.page('/admin/privacy/requests', query), {
      aal: 2,
      purpose: 'privacy.dsr.review',
      ...options,
    });
  }
  decideDsr(
    requestId: string,
    body: DsrDecisionInput,
    version: number,
    key: string,
    options: PrivacyRequestOptions = {},
  ) {
    return this.request('POST', `/admin/privacy/requests/${requestId}/decision`, {
      body,
      version,
      key,
      aal: 2,
      purpose: 'privacy.dsr.review',
      ...options,
    });
  }
  fulfilDsr(
    requestId: string,
    body: DsrFulfilmentInput,
    version: number,
    key: string,
    options: PrivacyRequestOptions = {},
  ) {
    return this.request('POST', `/admin/privacy/requests/${requestId}/fulfilment`, {
      body,
      version,
      key,
      aal: 2,
      purpose: 'privacy.dsr.review',
      ...options,
    });
  }
  listNotificationTemplates(
    query: NotificationTemplatePageQuery = {},
    options: PrivacyRequestOptions = {},
  ) {
    return this.request('GET', this.page('/admin/notification-templates', query), {
      purpose: 'notification.template.manage',
      ...options,
    });
  }
  createNotificationTemplateRelease(
    templateCode: string,
    body: CreateNotificationTemplateReleaseInput,
    key: string,
    options: PrivacyRequestOptions = {},
  ) {
    return this.request(
      'POST',
      `/admin/notification-templates/${encodeURIComponent(templateCode)}/releases`,
      { body, key, purpose: 'notification.template.manage', ...options },
    );
  }
  publishNotificationTemplateRelease(
    releaseId: string,
    body: PublishNotificationTemplateReleaseInput,
    version: number,
    key: string,
    options: PrivacyRequestOptions = {},
  ) {
    return this.request('POST', `/admin/notification-templates/releases/${releaseId}/publish`, {
      body,
      version,
      key,
      aal: 2,
      purpose: 'notification.template.publish',
      ...options,
    });
  }
  smsProviderCallback(
    body: SmsProviderCallbackInput,
    signature: string,
    timestamp: string,
    options: PrivacyRequestOptions = {},
  ) {
    return this.request('POST', '/internal/callbacks/messages/local-synthetic', {
      body,
      anonymous: true,
      providerSignature: signature,
      providerTimestamp: timestamp,
      ...options,
    });
  }
  replayDeadLetter(
    eventId: string,
    body: ReplayDeadLetterInput,
    version: number,
    key: string,
    options: PrivacyRequestOptions = {},
  ) {
    return this.request('POST', `/internal/outbox/dead-letters/${eventId}/replay`, {
      body,
      version,
      key,
      aal: 2,
      purpose: 'platform.outbox.replay',
      ...options,
    });
  }

  private page<T extends object>(path: string, query: T) {
    const values = new URLSearchParams();
    for (const [key, value] of Object.entries(query)) {
      if (value === undefined || value === '') continue;
      const wireKey = key.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
      values.set(wireKey, String(value));
    }
    return values.size ? `${path}?${values}` : path;
  }

  private async request(
    method: 'GET' | 'POST',
    path: string,
    input: PrivacyRequestOptions & {
      body?: unknown;
      key?: string;
      version?: number;
      patientId?: string;
      aal?: 1 | 2;
      purpose?: string;
      anonymous?: boolean;
      providerSignature?: string;
      providerTimestamp?: string;
      binary?: boolean;
    } = {},
  ) {
    const headers = new Headers({
      Accept: input.binary
        ? 'application/octet-stream, application/problem+json'
        : 'application/json, application/problem+json',
      'Accept-Language': this.options.acceptLanguage ?? 'ar-EG',
      ...(this.options.defaultHeaders ?? {}),
    });
    if (input.anonymous) headers.delete('Authorization');
    else {
      if (!this.options.accessToken)
        throw new PrivacyDsrNotificationApiError(401, { code: 'authentication-required' });
      headers.set('Authorization', `Bearer ${this.options.accessToken}`);
    }
    if (input.body !== undefined) headers.set('Content-Type', 'application/json');
    if (input.key) headers.set('Idempotency-Key', input.key);
    if (input.version !== undefined) headers.set('If-Match', `"${input.version}"`);
    if (input.patientId) headers.set('X-SHIFAA-Patient-Context', input.patientId);
    if (input.aal !== undefined) headers.set('X-AAL', String(input.aal));
    if (input.purpose) headers.set('X-Purpose', input.purpose);
    if (input.providerSignature) headers.set('X-Provider-Signature', input.providerSignature);
    if (input.providerTimestamp) headers.set('X-Provider-Timestamp', input.providerTimestamp);
    const response = await this.fetcher(`${this.options.baseUrl.replace(/\/$/, '')}/v1${path}`, {
      method,
      headers,
      cache: 'no-store',
      ...(input.signal ? { signal: input.signal } : {}),
      ...(input.body !== undefined ? { body: JSON.stringify(input.body) } : {}),
    });
    const cacheControl = response.headers.get('cache-control');
    if (cacheControl && (!cacheControl.includes('private') || !cacheControl.includes('no-store')))
      throw new PrivacyDsrNotificationApiError(502, { code: 'unsafe-cache-policy' });
    const contentType = response.headers.get('content-type') ?? '';
    const payload = contentType.includes('application/octet-stream')
      ? await response.arrayBuffer()
      : response.status === 204
        ? undefined
        : await response.json();
    if (!response.ok) throw new PrivacyDsrNotificationApiError(response.status, payload);
    return payload;
  }
}
