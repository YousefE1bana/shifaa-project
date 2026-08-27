import { IdentityContinuityClient } from '@shifaa/api-client/identity-continuity';
import {
  MemoryAccessTokenStore,
  NativeFactorSummaryReader,
  SessionContinuationController,
  type NativeFactorSummary,
  type NativeSecureRefreshStorage,
  type NativeSessionProjection,
} from '@shifaa/auth/identity-continuity';
import type {
  BeginEnrollmentRequest,
  CompleteRecoveryRequest,
  EnrollmentSecretResult,
  FactorRemovalResult,
  FactorResult,
  RemoveFactorRequest,
  RecoveryAccepted,
  RecoveryResult,
  StartRecoveryRequest,
  VerifyEnrollmentRequest,
} from '@shifaa/contracts/identity-continuity';

import { patientOnboardingApi } from './identity-onboarding-api';

export interface PatientSessionClientOptions {
  locale: 'ar-EG' | 'en-EG';
  platform: 'web' | 'native';
  csrfToken?: () => string | undefined;
  nativeRefreshTokens?: NativeSecureRefreshStorage;
  fetch?: typeof globalThis.fetch;
}

export function createPatientSessionClient(options: PatientSessionClientOptions) {
  const accessTokens = new MemoryAccessTokenStore();
  const client = new IdentityContinuityClient({
    baseUrl: process.env['EXPO_PUBLIC_API_BASE_URL'] ?? 'http://127.0.0.1:3000',
    accessToken: () => accessTokens.read(),
    acceptLanguage: options.locale,
    ...(options.csrfToken ? { csrfToken: options.csrfToken } : {}),
    origin: process.env['EXPO_PUBLIC_PATIENT_ORIGIN'] ?? 'http://127.0.0.1:8081',
    ...(options.fetch ? { fetch: options.fetch } : {}),
  });
  const transport = {
    refreshWeb: async () =>
      sessionProjection(
        await client.refreshSession(
          { client: 'web', foregroundEngaged: true },
          mutationKey('refresh-web'),
        ),
      ),
    refreshNative: async (refreshToken: string) =>
      sessionProjection(
        await client.refreshSession(
          { client: 'native', foregroundEngaged: true, refreshToken },
          mutationKey('refresh-native'),
        ),
      ),
    logout: async (allSessions: boolean) => {
      await client.logout(
        { allSessions },
        mutationKey(allSessions ? 'logout-all' : 'logout-current'),
      );
    },
  };
  return {
    accessTokens,
    controller: new SessionContinuationController({
      platform: options.platform,
      accessTokens,
      transport,
      ...(options.nativeRefreshTokens ? { nativeRefreshTokens: options.nativeRefreshTokens } : {}),
    }),
  };
}

export function assertIdentityContinuityOnline(): void {
  if (typeof navigator !== 'undefined' && !navigator.onLine) throw new Error('offline-no-queue');
}

export interface PatientRecoveryApiPort {
  startRecovery(body: StartRecoveryRequest): Promise<RecoveryAccepted>;
  completeRecovery(caseId: string, body: CompleteRecoveryRequest): Promise<RecoveryResult>;
}

export class PatientRecoveryApi implements PatientRecoveryApiPort {
  public constructor(
    private readonly options: {
      locale: 'ar-EG' | 'en-EG';
      fetch?: typeof globalThis.fetch;
      apiBaseUrl?: string;
    },
  ) {}

  public async startRecovery(body: StartRecoveryRequest): Promise<RecoveryAccepted> {
    assertIdentityContinuityOnline();
    return (await this.client().startRecovery(
      body,
      mutationKey('recovery-start'),
    )) as RecoveryAccepted;
  }

  public async completeRecovery(
    caseId: string,
    body: CompleteRecoveryRequest,
  ): Promise<RecoveryResult> {
    assertIdentityContinuityOnline();
    return (await this.client().completeRecovery(
      caseId,
      body,
      mutationKey('recovery-complete'),
    )) as RecoveryResult;
  }

  private client(): IdentityContinuityClient {
    return new IdentityContinuityClient({
      baseUrl:
        this.options.apiBaseUrl ??
        process.env['EXPO_PUBLIC_API_BASE_URL'] ??
        'http://127.0.0.1:3000',
      acceptLanguage: this.options.locale,
      ...(this.options.fetch ? { fetch: this.options.fetch } : {}),
    });
  }
}

export interface PatientMfaApiPort {
  listFactors(): Promise<readonly NativeFactorSummary[]>;
  beginEnrollment(body: BeginEnrollmentRequest): Promise<EnrollmentSecretResult>;
  verifyEnrollment(body: VerifyEnrollmentRequest): Promise<FactorResult>;
  removeFactor(factorId: string, body: RemoveFactorRequest): Promise<FactorRemovalResult>;
}

export class PatientMfaApi implements PatientMfaApiPort {
  private readonly factorReader: NativeFactorSummaryReader;

  public constructor(
    private readonly options: {
      locale: 'ar-EG' | 'en-EG';
      accessToken?: () => string | undefined;
      fetch?: typeof globalThis.fetch;
      apiBaseUrl?: string;
      authBaseUrl?: string;
      publishableKey?: string;
    },
  ) {
    this.factorReader = new NativeFactorSummaryReader({
      listFactors: (accessToken) => this.fetchNativeFactors(accessToken),
    });
  }

  public async listFactors(): Promise<readonly NativeFactorSummary[]> {
    assertIdentityContinuityOnline();
    return this.factorReader.list(this.requireAccessToken());
  }

  public async beginEnrollment(body: BeginEnrollmentRequest): Promise<EnrollmentSecretResult> {
    assertIdentityContinuityOnline();
    return (await this.client().beginMfaEnrollment(
      body,
      mutationKey('mfa-begin'),
    )) as EnrollmentSecretResult;
  }

  public async verifyEnrollment(body: VerifyEnrollmentRequest): Promise<FactorResult> {
    assertIdentityContinuityOnline();
    return (await this.client().verifyMfaEnrollment(
      body,
      mutationKey('mfa-verify'),
    )) as FactorResult;
  }

  public async removeFactor(
    factorId: string,
    body: RemoveFactorRequest,
  ): Promise<FactorRemovalResult> {
    assertIdentityContinuityOnline();
    return (await this.client().removeMfaFactor(
      factorId,
      body,
      mutationKey('mfa-remove'),
    )) as FactorRemovalResult;
  }

  private client(): IdentityContinuityClient {
    return new IdentityContinuityClient({
      baseUrl:
        this.options.apiBaseUrl ??
        process.env['EXPO_PUBLIC_API_BASE_URL'] ??
        'http://127.0.0.1:3000',
      accessToken: () => this.requireAccessToken(),
      acceptLanguage: this.options.locale,
      ...(this.options.fetch ? { fetch: this.options.fetch } : {}),
    });
  }

  private requireAccessToken(): string {
    const accessToken = this.options.accessToken?.() ?? patientOnboardingApi.readAccessToken();
    if (!accessToken) throw new Error('authentication-required');
    return accessToken;
  }

  private async fetchNativeFactors(accessToken: string): Promise<unknown> {
    const authBaseUrl = this.options.authBaseUrl ?? process.env['EXPO_PUBLIC_SUPABASE_URL'];
    const publishableKey =
      this.options.publishableKey ?? process.env['EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY'];
    if (!authBaseUrl || !publishableKey) throw new Error('auth-degraded');
    const fetcher = this.options.fetch ?? globalThis.fetch;
    const response = await fetcher(`${authBaseUrl.replace(/\/$/, '')}/auth/v1/user`, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        apikey: publishableKey,
        Authorization: `Bearer ${accessToken}`,
      },
      cache: 'no-store',
    });
    if (!response.ok)
      throw new Error(response.status === 401 ? 'authentication-required' : 'auth-degraded');
    return response.json();
  }
}

function mutationKey(action: string): string {
  return `synthetic-ui-007-${action}-${globalThis.crypto.randomUUID()}`;
}

function sessionProjection(value: unknown): NativeSessionProjection {
  if (!value || typeof value !== 'object') throw new Error('session-response-invalid');
  const session = value as Record<string, unknown>;
  if (
    typeof session['accessToken'] !== 'string' ||
    typeof session['sessionId'] !== 'string' ||
    (session['assurance'] !== 'aal1' && session['assurance'] !== 'aal2') ||
    typeof session['expiresAt'] !== 'string'
  ) {
    throw new Error('session-response-invalid');
  }
  return {
    accessToken: session['accessToken'],
    ...(typeof session['refreshToken'] === 'string'
      ? { refreshToken: session['refreshToken'] }
      : {}),
    sessionId: session['sessionId'],
    assurance: session['assurance'],
    expiresAt: session['expiresAt'],
  };
}
