// @generated from specs/007-identity-continuity-sessions-mfa-recovery/contracts/openapi.yaml — DO NOT EDIT.
import type {
  BeginEnrollmentRequest,
  CompleteRecoveryRequest,
  LogoutRequest,
  RefreshRequest,
  RemoveFactorRequest,
  StartRecoveryRequest,
  TransitionRequest,
  VerifyEnrollmentRequest,
} from '@shifaa/contracts/identity-continuity';

export const generatedIdentityContinuityOperationIds = [
  'refreshSession',
  'logout',
  'beginMfaEnrollment',
  'verifyMfaEnrollment',
  'removeMfaFactor',
  'startRecovery',
  'completeRecovery',
  'transitionDependent',
] as const;

export interface IdentityContinuityClientOptions {
  baseUrl: string;
  accessToken?: () => string | undefined;
  fetch?: typeof globalThis.fetch;
  acceptLanguage?: 'ar-EG' | 'en-EG';
  csrfToken?: () => string | undefined;
  origin?: string;
  defaultHeaders?: Readonly<Record<string, string>>;
}

export class IdentityContinuityApiError extends Error {
  public constructor(
    public readonly status: number,
    public readonly problem: unknown,
  ) {
    super(`SHIFAA identity continuity API failed with status ${status}.`);
    this.name = 'IdentityContinuityApiError';
  }
}

export class IdentityContinuityClient {
  private readonly fetcher: typeof globalThis.fetch;

  public constructor(private readonly options: IdentityContinuityClientOptions) {
    this.fetcher = (options.fetch ?? globalThis.fetch).bind(globalThis);
  }

  public refreshSession(body: RefreshRequest, key: string) {
    return this.request('POST', '/auth/session/refresh', body, key, {
      anonymous: body.client === 'web',
      webRefresh: body.client === 'web',
    });
  }

  public logout(body: LogoutRequest, key: string) {
    return this.request('POST', '/auth/logout', body, key);
  }

  public beginMfaEnrollment(body: BeginEnrollmentRequest, key: string) {
    return this.request('POST', '/auth/mfa/enroll', body, key);
  }

  public verifyMfaEnrollment(body: VerifyEnrollmentRequest, key: string) {
    return this.request('POST', '/auth/mfa/enroll/verify', body, key);
  }

  public removeMfaFactor(factorId: string, body: RemoveFactorRequest, key: string) {
    return this.request('DELETE', `/auth/mfa/factors/${factorId}`, body, key);
  }

  public startRecovery(body: StartRecoveryRequest, key: string) {
    return this.request('POST', '/auth/recovery', body, key, { anonymous: true });
  }

  public completeRecovery(caseId: string, body: CompleteRecoveryRequest, key: string) {
    return this.request('POST', `/auth/recovery/${caseId}/complete`, body, key, {
      anonymous: true,
    });
  }

  public transitionDependent(
    relationshipId: string,
    body: TransitionRequest,
    version: number,
    key: string,
  ) {
    return this.request('POST', `/guardianships/${relationshipId}/transition`, body, key, {
      version,
    });
  }

  private async request(
    method: 'POST' | 'DELETE',
    path: string,
    body: unknown,
    key: string,
    controls: {
      anonymous?: boolean;
      webRefresh?: boolean;
      version?: number;
    } = {},
  ): Promise<unknown> {
    const headers = new Headers({
      Accept: 'application/json, application/problem+json',
      'Accept-Language': this.options.acceptLanguage ?? 'ar-EG',
      'Content-Type': 'application/json',
      'Idempotency-Key': key,
      ...(this.options.defaultHeaders ?? {}),
    });
    if (!controls.anonymous) {
      const accessToken = this.options.accessToken?.();
      if (!accessToken)
        throw new IdentityContinuityApiError(401, { code: 'authentication-required' });
      headers.set('Authorization', `Bearer ${accessToken}`);
    }
    if (controls.webRefresh) {
      const csrfToken = this.options.csrfToken?.();
      if (!csrfToken) throw new IdentityContinuityApiError(403, { code: 'forbidden' });
      headers.set('X-CSRF-Token', csrfToken);
      if (this.options.origin) headers.set('Origin', this.options.origin);
      headers.set('Sec-Fetch-Site', 'same-origin');
    }
    if (controls.version !== undefined) headers.set('If-Match', `"${controls.version}"`);
    const response = await this.fetcher(`${this.options.baseUrl.replace(/\/$/, '')}/v1${path}`, {
      method,
      headers,
      body: JSON.stringify(body),
      cache: 'no-store',
      ...(controls.webRefresh ? { credentials: 'include' as const } : {}),
    });
    const payload = await response.json();
    if (!response.ok) throw new IdentityContinuityApiError(response.status, payload);
    return payload;
  }
}
