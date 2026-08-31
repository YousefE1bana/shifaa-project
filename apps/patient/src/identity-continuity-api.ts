import { IdentityContinuityClient } from '@shifaa/api-client/identity-continuity';
import { IdentityOnboardingClient } from '@shifaa/api-client';
import { FamilyCareClient } from '@shifaa/api-client/family-care';
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
  CompleteRecoveryResult,
  EnrollmentSecretResult,
  FactorRemovalResult,
  FactorResult,
  RemoveFactorRequest,
  RecoveryAccepted,
  RecoveryResult,
  StartRecoveryRequest,
  VerifyEnrollmentRequest,
  TransitionResult,
} from '@shifaa/contracts/identity-continuity';
import type { IdentityInput, IdentitySummaryDto } from '@shifaa/contracts';
import type { RelationshipsPageWithTransition } from '@shifaa/contracts/family-care';

import { patientOnboardingApi } from './identity-onboarding-api';
import { resolvePatientApiBaseUrl } from './patient-api-base-url';
import { patientPlatform } from './patient-auth-store';

export interface PatientSessionClientOptions {
  locale: 'ar-EG' | 'en-EG';
  platform: 'web' | 'native';
  apiBaseUrl?: string;
  accessTokens?: MemoryAccessTokenStore;
  csrfToken?: () => string | undefined;
  nativeRefreshTokens?: NativeSecureRefreshStorage;
  fetch?: typeof globalThis.fetch;
}

export function createPatientSessionClient(options: PatientSessionClientOptions) {
  const accessTokens = options.accessTokens ?? new MemoryAccessTokenStore();
  const client = new IdentityContinuityClient({
    baseUrl: resolvePatientApiBaseUrl({
      platform: options.platform,
      configuredBaseUrl: options.apiBaseUrl ?? process.env['EXPO_PUBLIC_API_BASE_URL'],
      ...(typeof globalThis.location?.origin === 'string'
        ? { webOrigin: globalThis.location.origin }
        : {}),
    }),
    accessToken: () => accessTokens.read(),
    acceptLanguage: options.locale,
    ...(options.platform === 'web'
      ? { csrfToken: options.csrfToken ?? readBrowserCsrfCookie }
      : {}),
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

function readBrowserCsrfCookie(): string | undefined {
  if (typeof document === 'undefined') return undefined;
  for (const item of document.cookie.split(';')) {
    const [rawName, ...rawValue] = item.trim().split('=');
    if (rawName === 'shifaa_csrf') return decodeURIComponent(rawValue.join('='));
  }
  return undefined;
}

export { resolvePatientApiBaseUrl } from './patient-api-base-url';

export function assertIdentityContinuityOnline(): void {
  if (typeof navigator !== 'undefined' && !navigator.onLine) throw new Error('offline-no-queue');
}

export interface PatientRecoveryApiPort {
  startRecovery(body: StartRecoveryRequest): Promise<RecoveryAccepted>;
  completeRecovery(caseId: string, body: CompleteRecoveryRequest): Promise<CompleteRecoveryResult>;
  createRecoveryProof(grant: string, body: IdentityInput): Promise<IdentitySummaryDto>;
  installSession(session: RecoveryResult['session']): Promise<void>;
}

export class PatientRecoveryApi implements PatientRecoveryApiPort {
  public constructor(
    private readonly options: {
      locale: 'ar-EG' | 'en-EG';
      fetch?: typeof globalThis.fetch;
      apiBaseUrl?: string;
      nativeRefreshTokens?: NativeSecureRefreshStorage;
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
  ): Promise<CompleteRecoveryResult> {
    assertIdentityContinuityOnline();
    return (await this.client().completeRecovery(
      caseId,
      body,
      mutationKey('recovery-complete'),
    )) as CompleteRecoveryResult;
  }

  public async createRecoveryProof(
    grant: string,
    body: IdentityInput,
  ): Promise<IdentitySummaryDto> {
    assertIdentityContinuityOnline();
    const client = new IdentityOnboardingClient({
      baseUrl: defaultPatientApiBaseUrl(this.options.apiBaseUrl),
      acceptLanguage: this.options.locale,
      defaultHeaders: { 'Recovery-Proof-Grant': grant },
      ...(this.options.fetch ? { fetch: this.options.fetch } : {}),
    });
    return (await client.createIdentityProof(
      body,
      mutationKey('recovery-reproof'),
    )) as IdentitySummaryDto;
  }

  public async installSession(session: RecoveryResult['session']): Promise<void> {
    patientOnboardingApi.installAccessToken(session.accessToken);
    if (session.refreshToken && this.options.nativeRefreshTokens)
      await this.options.nativeRefreshTokens.write(session.refreshToken);
  }

  private client(): IdentityContinuityClient {
    return new IdentityContinuityClient({
      baseUrl: defaultPatientApiBaseUrl(this.options.apiBaseUrl),
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
  installSession(session: FactorResult['session']): Promise<void>;
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
      nativeRefreshTokens?: NativeSecureRefreshStorage;
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

  public async installSession(session: FactorResult['session']): Promise<void> {
    patientOnboardingApi.installAccessToken(session.accessToken);
    if (session.refreshToken && this.options.nativeRefreshTokens)
      await this.options.nativeRefreshTokens.write(session.refreshToken);
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
      baseUrl: defaultPatientApiBaseUrl(this.options.apiBaseUrl),
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

export class PatientTransitionApi {
  public constructor(
    private readonly options: {
      locale: 'ar-EG' | 'en-EG';
      accessToken?: () => string | undefined;
      fetch?: typeof globalThis.fetch;
      apiBaseUrl?: string;
    },
  ) {}

  public async read(patientId: string): Promise<RelationshipsPageWithTransition> {
    assertIdentityContinuityOnline();
    return this.familyClient().listRelationships(patientId, { includeDependentTransition: true });
  }

  public async submitProof(
    relationshipId: string,
    verificationCaseId: string,
    continuityCaseVersion: number,
  ): Promise<TransitionResult> {
    assertIdentityContinuityOnline();
    return (await this.identityClient().transitionDependent(
      relationshipId,
      { action: 'submit_proof', verificationCaseId },
      continuityCaseVersion,
      mutationKey('transition-proof'),
    )) as TransitionResult;
  }

  private familyClient(): FamilyCareClient {
    return new FamilyCareClient({
      baseUrl: this.baseUrl(),
      accessToken: this.requireAccessToken(),
      acceptLanguage: this.options.locale,
      ...(this.options.fetch ? { fetch: this.options.fetch } : {}),
    });
  }

  private identityClient(): IdentityContinuityClient {
    return new IdentityContinuityClient({
      baseUrl: this.baseUrl(),
      accessToken: () => this.requireAccessToken(),
      acceptLanguage: this.options.locale,
      ...(this.options.fetch ? { fetch: this.options.fetch } : {}),
    });
  }

  private baseUrl(): string {
    return defaultPatientApiBaseUrl(this.options.apiBaseUrl);
  }

  private requireAccessToken(): string {
    const accessToken = this.options.accessToken?.() ?? patientOnboardingApi.readAccessToken();
    if (!accessToken) throw new Error('authentication-required');
    return accessToken;
  }
}

function defaultPatientApiBaseUrl(configuredBaseUrl?: string): string {
  return resolvePatientApiBaseUrl({
    platform: patientPlatform,
    configuredBaseUrl: configuredBaseUrl ?? process.env['EXPO_PUBLIC_API_BASE_URL'],
    ...(typeof globalThis.location?.origin === 'string'
      ? { webOrigin: globalThis.location.origin }
      : {}),
  });
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
