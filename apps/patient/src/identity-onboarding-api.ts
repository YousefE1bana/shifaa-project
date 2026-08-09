import { IdentityOnboardingClient, ShifaaApiError } from '@shifaa/api-client';
import type {
  ConsentInput,
  IdentityInput,
  IdentitySummaryDto,
  ProfileDto,
  ProfilePatchInput,
} from '@shifaa/contracts';

type AuthResult = {
  kind: 'challenge' | 'session';
  challenge_id?: string | null;
  access_token?: string | null;
};

type PrivacyNotice = {
  notice_code: string;
  version: string;
  locale: 'ar-EG' | 'en-EG';
  content: string;
  purposes: Array<{
    purpose_code: string;
    version: string;
    label: string;
    optional: boolean;
  }>;
};

const idempotencyKey = (action: string) =>
  `${action}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;

export class PatientOnboardingApi {
  private readonly baseUrl: string;
  private readonly fetcher: typeof globalThis.fetch;
  private locale: 'ar-EG' | 'en-EG' = 'ar-EG';
  private accessToken?: string;
  private challengeId?: string;
  private profileVersion?: number;
  private notice?: PrivacyNotice;

  public constructor(baseUrl: string, fetcher: typeof globalThis.fetch = globalThis.fetch) {
    this.baseUrl = baseUrl;
    this.fetcher = fetcher;
  }

  public hasPendingChallenge(): boolean {
    return Boolean(this.challengeId);
  }

  public async register(handle: string, password: string, locale: 'ar-EG' | 'en-EG') {
    this.locale = locale;
    const result = (await this.client().registerPerson(
      { handle, password, locale },
      idempotencyKey('register'),
    )) as AuthResult;
    this.captureChallenge(result);
  }

  public async login(handle: string, password: string) {
    const result = (await this.client().login(
      { handle, password },
      idempotencyKey('login'),
    )) as AuthResult;
    this.captureChallenge(result);
  }

  public async verifyOtp(code: string) {
    if (!this.challengeId) throw new Error('No OTP challenge is active.');
    const result = (await this.client().verifyOtp(
      { challenge_id: this.challengeId, code },
      idempotencyKey('verify-otp'),
    )) as AuthResult;
    if (!result.access_token) throw new Error('The API did not return a session token.');
    this.accessToken = result.access_token;
    this.challengeId = undefined;
  }

  public async getProfile(): Promise<ProfileDto> {
    const profile = (await this.authenticatedClient().getMyProfile()) as ProfileDto;
    this.profileVersion = profile.version;
    return profile;
  }

  public async updateProfile(patch: ProfilePatchInput): Promise<ProfileDto> {
    if (!this.profileVersion) await this.getProfile();
    const profile = (await this.authenticatedClient().updateMyProfile(
      patch,
      this.profileVersion!,
      idempotencyKey('profile'),
    )) as ProfileDto;
    this.profileVersion = profile.version;
    return profile;
  }

  public async createIdentity(input: IdentityInput): Promise<IdentitySummaryDto> {
    return (await this.authenticatedClient().createIdentityProof(
      input,
      idempotencyKey('identity'),
    )) as IdentitySummaryDto;
  }

  public async getPrivacyNotice(): Promise<PrivacyNotice> {
    this.notice = (await this.authenticatedClient().getPrivacyNotice()) as PrivacyNotice;
    return this.notice;
  }

  public async recordConsent(
    purposeCode: string,
    decision: ConsentInput['decision'],
  ): Promise<unknown> {
    const notice = this.notice ?? (await this.getPrivacyNotice());
    const purpose = notice.purposes.find((item) => item.purpose_code === purposeCode);
    if (!purpose) throw new Error(`Privacy purpose ${purposeCode} is not in the active notice.`);
    return this.authenticatedClient().recordConsent(
      {
        purpose_code: purpose.purpose_code,
        purpose_version: purpose.version,
        decision,
        notice_version: notice.version,
      },
      idempotencyKey(`consent-${purposeCode}`),
    );
  }

  public clearSession(): void {
    this.accessToken = undefined;
    this.challengeId = undefined;
    this.profileVersion = undefined;
    this.notice = undefined;
  }

  private client(): IdentityOnboardingClient {
    return new IdentityOnboardingClient({
      baseUrl: this.baseUrl,
      fetch: this.fetcher,
      acceptLanguage: this.locale,
      ...(this.accessToken ? { accessToken: this.accessToken } : {}),
    });
  }

  private authenticatedClient(): IdentityOnboardingClient {
    if (!this.accessToken) throw new ShifaaApiError(401, { code: 'authentication-required' });
    return this.client();
  }

  private captureChallenge(result: AuthResult): void {
    if (!result.challenge_id) throw new Error('The API did not return an OTP challenge.');
    this.challengeId = result.challenge_id;
  }
}

export const patientOnboardingApi = new PatientOnboardingApi(
  process.env['EXPO_PUBLIC_API_BASE_URL'] ?? 'http://127.0.0.1:3000',
);
