// @generated from specs/001-identity-onboarding/contracts/openapi.yaml — DO NOT EDIT.
import type {
  ConsentInput,
  IdentityInput,
  LoginInput,
  OtpVerificationInput,
  ProfilePatchInput,
  ProviderCallbackInput,
  RegisterPersonInput,
  ReviewDecisionInput,
  UploadMetadata,
} from '@shifaa/contracts';

export const generatedOperationIds = [
  'registerPerson',
  'login',
  'verifyOtp',
  'getMyProfile',
  'updateMyProfile',
  'createIdentityProof',
  'listMyIdentities',
  'createIdentityUpload',
  'getVerificationCase',
  'listIdentityVerificationCases',
  'reviewVerificationCase',
  'getPrivacyNotice',
  'listMyConsents',
  'recordConsent',
  'withdrawConsent',
  'identityProviderCallback',
] as const;

export interface ShifaaClientOptions {
  baseUrl: string;
  accessToken?: string;
  fetch?: typeof globalThis.fetch;
  acceptLanguage?: 'ar-EG' | 'en-EG';
  defaultHeaders?: Record<string, string>;
}

export class ShifaaApiError extends Error {
  public readonly status: number;
  public readonly problem: unknown;

  public constructor(status: number, problem: unknown) {
    super(`SHIFAA API request failed with status ${status}.`);
    this.name = 'ShifaaApiError';
    this.status = status;
    this.problem = problem;
  }
}

export class IdentityOnboardingClient {
  private readonly fetcher: typeof globalThis.fetch;
  private readonly options: ShifaaClientOptions;

  public constructor(options: ShifaaClientOptions) {
    this.options = options;
    this.fetcher = (options.fetch ?? globalThis.fetch).bind(globalThis);
  }

  public registerPerson(body: RegisterPersonInput, idempotencyKey: string) {
    return this.request('POST', '/auth/register', { body, idempotencyKey });
  }
  public login(body: LoginInput, idempotencyKey: string) {
    return this.request('POST', '/auth/login', { body, idempotencyKey });
  }
  public verifyOtp(body: OtpVerificationInput, idempotencyKey: string) {
    return this.request('POST', '/auth/otp/verify', { body, idempotencyKey });
  }
  public getMyProfile() {
    return this.request('GET', '/people/me');
  }
  public updateMyProfile(body: ProfilePatchInput, version: number, idempotencyKey: string) {
    return this.request('PATCH', '/people/me', { body, version, idempotencyKey });
  }
  public createIdentityProof(body: IdentityInput, idempotencyKey: string) {
    return this.request('POST', '/people/me/identities', { body, idempotencyKey });
  }
  public listMyIdentities() {
    return this.request('GET', '/people/me/identities');
  }
  public createIdentityUpload(caseId: string, body: UploadMetadata, idempotencyKey: string) {
    return this.request('POST', `/identity-verifications/${caseId}/upload-intent`, {
      body,
      idempotencyKey,
    });
  }
  public getVerificationCase(caseId: string) {
    return this.request('GET', `/identity-verifications/${caseId}`);
  }
  public listIdentityVerificationCases(cursor?: string, limit?: number) {
    const query = new URLSearchParams();
    if (cursor) query.set('cursor', cursor);
    if (limit !== undefined) query.set('limit', String(limit));
    return this.request('GET', `/admin/identity-verifications${query.size ? `?${query}` : ''}`);
  }
  public reviewVerificationCase(
    caseId: string,
    body: ReviewDecisionInput,
    version: number,
    idempotencyKey: string,
  ) {
    return this.request('POST', `/admin/identity-verifications/${caseId}/decision`, {
      body,
      version,
      idempotencyKey,
    });
  }
  public getPrivacyNotice() {
    return this.request('GET', '/privacy/notices/current');
  }
  public listMyConsents() {
    return this.request('GET', '/privacy/consents');
  }
  public recordConsent(body: ConsentInput, idempotencyKey: string) {
    return this.request('POST', '/privacy/consents', { body, idempotencyKey });
  }
  public withdrawConsent(
    consentId: string,
    version: number,
    idempotencyKey: string,
    reason?: string,
  ) {
    return this.request('POST', `/privacy/consents/${consentId}/withdraw`, {
      body: reason ? { reason } : {},
      version,
      idempotencyKey,
    });
  }
  public identityProviderCallback(
    provider: 'local' | 'valify',
    body: ProviderCallbackInput,
    signature: string,
    idempotencyKey: string,
  ) {
    return this.request('POST', `/internal/callbacks/identity/${provider}`, {
      body,
      idempotencyKey,
      extraHeaders: { 'X-Provider-Signature': signature },
    });
  }

  private async request(
    method: 'GET' | 'POST' | 'PATCH',
    path: string,
    options: {
      body?: unknown;
      idempotencyKey?: string;
      version?: number;
      extraHeaders?: Record<string, string>;
    } = {},
  ): Promise<unknown> {
    const headers = new Headers({
      Accept: 'application/json, application/problem+json',
      'Accept-Language': this.options.acceptLanguage ?? 'ar-EG',
      ...(this.options.defaultHeaders ?? {}),
      ...(options.extraHeaders ?? {}),
    });
    if (options.body !== undefined) headers.set('Content-Type', 'application/json');
    if (this.options.accessToken)
      headers.set('Authorization', `Bearer ${this.options.accessToken}`);
    if (options.idempotencyKey) headers.set('Idempotency-Key', options.idempotencyKey);
    if (options.version !== undefined) headers.set('If-Match', `"${options.version}"`);

    const response = await this.fetcher(`${this.options.baseUrl.replace(/\/$/, '')}/v1${path}`, {
      method,
      headers,
      cache: 'no-store',
      ...(path === '/auth/otp/verify' ? { credentials: 'include' as const } : {}),
      ...(options.body !== undefined ? { body: JSON.stringify(options.body) } : {}),
    });
    const payload = response.status === 204 ? undefined : await response.json();
    if (!response.ok) throw new ShifaaApiError(response.status, payload);
    return payload;
  }
}
