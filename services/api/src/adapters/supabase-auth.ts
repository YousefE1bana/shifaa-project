import { randomUUID } from 'node:crypto';

import {
  SupabaseJwtVerifier,
  type ContinuityAuthPort,
  type NativeFactorSummary,
  type NativeSessionProjection,
  type NativeTotpEnrollment,
  type VerifiedContinuitySession,
} from '@shifaa/auth';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import { ApiPolicyError } from '../modules/identity-onboarding/errors.js';
import type { AuthIssuer, AuthSession } from '../modules/identity-onboarding/ports.js';

type ChallengePayload = { email: string; subjectId: string; type: 'signup' | 'email'; exp: number };

export interface SupabaseAuthOptions {
  url: string;
  anonKey: string;
  jwksUrl: string;
  issuer: string;
  audience: string;
}

export class SupabaseAuthIssuer implements AuthIssuer, ContinuityAuthPort {
  private readonly client: SupabaseClient;
  private readonly verifier: SupabaseJwtVerifier;
  private readonly challenges = new Map<string, ChallengePayload>();

  public constructor(private readonly options: SupabaseAuthOptions) {
    this.client = createClient(options.url, options.anonKey, {
      auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
    });
    this.verifier = new SupabaseJwtVerifier(options.jwksUrl, options.issuer, options.audience);
  }

  public async ready(): Promise<void> {
    const response = await fetch(this.options.jwksUrl, { signal: AbortSignal.timeout(5_000) });
    if (!response.ok) throw new Error('Supabase Auth JWKS is unavailable.');
    const body = (await response.json()) as { keys?: unknown[] };
    if (!body.keys?.length) throw new Error('Supabase Auth JWKS has no signing keys.');
  }

  public async register(
    handle: string,
    password: string,
  ): Promise<{ subjectId: string; challengeId: string }> {
    const { data, error } = await this.client.auth.signUp({ email: handle, password });
    if (error || !data.user?.id) {
      throw new ApiPolicyError(
        'registration-failed',
        409,
        error?.message ?? 'Registration failed.',
      );
    }
    return {
      subjectId: data.user.id,
      challengeId: this.createChallenge({
        email: handle,
        subjectId: data.user.id,
        type: 'signup',
        exp: Date.now() + 10 * 60_000,
      }),
    };
  }

  public async login(
    handle: string,
    password: string,
  ): Promise<{ subjectId: string; challengeId: string }> {
    const passwordResult = await this.client.auth.signInWithPassword({ email: handle, password });
    if (passwordResult.error || !passwordResult.data.user?.id) {
      throw new ApiPolicyError('authentication-failed', 401, 'Email or password is incorrect.');
    }
    const otpResult = await this.client.auth.signInWithOtp({
      email: handle,
      options: { shouldCreateUser: false },
    });
    if (otpResult.error)
      throw new ApiPolicyError('otp-delivery-failed', 503, 'Could not send the verification code.');
    return {
      subjectId: passwordResult.data.user.id,
      challengeId: this.createChallenge({
        email: handle,
        subjectId: passwordResult.data.user.id,
        type: 'email',
        exp: Date.now() + 10 * 60_000,
      }),
    };
  }

  public async verifyOtp(challengeId: string, code: string): Promise<AuthSession> {
    const challenge = this.readChallenge(challengeId);
    const { data, error } = await this.client.auth.verifyOtp({
      email: challenge.email,
      token: code,
      type: challenge.type,
    });
    if (error || !data.session?.access_token || data.user?.id !== challenge.subjectId) {
      throw new ApiPolicyError('otp-invalid', 401, 'The verification code is invalid or expired.');
    }
    const verified = await this.verifier.verify(data.session.access_token);
    if (!verified || verified.subjectId !== challenge.subjectId) {
      throw new ApiPolicyError('session-invalid', 401, 'The issued session could not be verified.');
    }
    this.challenges.delete(challengeId);
    return {
      subjectId: verified.subjectId,
      accessToken: data.session.access_token,
      aal: verified.aal,
    };
  }

  public async resolveSession(accessToken: string): Promise<AuthSession | undefined> {
    const verified = await this.verifier.verify(accessToken);
    return verified ? { subjectId: verified.subjectId, accessToken, aal: verified.aal } : undefined;
  }

  public async verifyAccessToken(
    accessToken: string,
  ): Promise<VerifiedContinuitySession | undefined> {
    const verified = await this.verifier.verify(accessToken);
    const expiresAt = verified?.payload.exp;
    if (!verified || typeof expiresAt !== 'number') return undefined;
    return {
      subjectId: verified.subjectId,
      sessionId: verified.sessionId,
      aal: verified.aal,
      amr: verified.amr,
      expiresAt,
    };
  }

  public async refresh(refreshToken: string): Promise<NativeSessionProjection> {
    const client = this.createUserClient();
    const { data, error } = await client.auth.refreshSession({ refresh_token: refreshToken });
    const session = data.session;
    if (error || !session?.access_token || !session.refresh_token || !session.expires_at)
      throw new ApiPolicyError('session-expired', 401, 'The session cannot be refreshed.');
    const verified = await this.verifier.verify(session.access_token);
    if (!verified) throw new ApiPolicyError('session-revoked', 401, 'The session is not current.');
    return {
      accessToken: session.access_token,
      refreshToken: session.refresh_token,
      sessionId: verified.sessionId,
      assurance: verified.aal === 2 ? 'aal2' : 'aal1',
      expiresAt: new Date(session.expires_at * 1_000).toISOString(),
    };
  }

  public async logout(accessToken: string, scope: 'local' | 'global'): Promise<void> {
    const response = await fetch(`${this.options.url}/auth/v1/logout?scope=${scope}`, {
      method: 'POST',
      headers: { apikey: this.options.anonKey, authorization: `Bearer ${accessToken}` },
      signal: AbortSignal.timeout(5_000),
    });
    if (!response.ok)
      throw new ApiPolicyError('vendor-unavailable', 503, 'Native session revocation failed.');
  }

  public async listFactors(accessToken: string): Promise<readonly NativeFactorSummary[]> {
    const { data, error } = await this.createUserClient(accessToken).auth.mfa.listFactors();
    if (error)
      throw new ApiPolicyError('vendor-unavailable', 503, 'Native factors are unavailable.');
    return data.totp
      .filter((factor) => factor.status === 'verified')
      .map((factor) => ({
        id: factor.id,
        type: 'totp' as const,
        status: 'verified' as const,
        friendlyName: factor.friendly_name ?? null,
        createdAt: factor.created_at,
      }));
  }

  public async enrollTotp(
    accessToken: string,
    friendlyName?: string,
  ): Promise<NativeTotpEnrollment> {
    const { data, error } = await this.createUserClient(accessToken).auth.mfa.enroll({
      factorType: 'totp',
      ...(friendlyName ? { friendlyName } : {}),
    });
    if (error || data.type !== 'totp')
      throw new ApiPolicyError('vendor-unavailable', 503, 'Native TOTP enrollment failed.');
    return { enrollmentId: data.id, secret: data.totp.secret, qrUri: data.totp.uri };
  }

  public async verifyTotp(
    accessToken: string,
    enrollmentId: string,
    code: string,
  ): Promise<NativeFactorSummary> {
    const client = this.createUserClient(accessToken);
    const challenge = await client.auth.mfa.challenge({ factorId: enrollmentId });
    if (challenge.error || !challenge.data.id)
      throw new ApiPolicyError('factor-code-invalid', 422, 'The factor code is invalid.');
    const verified = await client.auth.mfa.verify({
      factorId: enrollmentId,
      challengeId: challenge.data.id,
      code,
    });
    if (verified.error)
      throw new ApiPolicyError('factor-code-invalid', 422, 'The factor code is invalid.');
    const factors = await this.listFactors(accessToken);
    const factor = factors.find((entry) => entry.id === enrollmentId);
    if (!factor)
      throw new ApiPolicyError('vendor-unavailable', 503, 'Verified factor is unavailable.');
    return factor;
  }

  public async unenrollFactor(accessToken: string, factorId: string): Promise<void> {
    const { error } = await this.createUserClient(accessToken).auth.mfa.unenroll({ factorId });
    if (error) throw new ApiPolicyError('vendor-unavailable', 503, 'Native factor removal failed.');
  }

  public async startRecovery(handle: string): Promise<void> {
    const { error } = await this.createUserClient().auth.resetPasswordForEmail(handle);
    if (error) throw new ApiPolicyError('vendor-unavailable', 503, 'Recovery delivery failed.');
  }

  public async updateRecoveredCredential(
    accessToken: string,
    newCredential: string,
  ): Promise<void> {
    const response = await fetch(`${this.options.url}/auth/v1/user`, {
      method: 'PUT',
      headers: {
        apikey: this.options.anonKey,
        authorization: `Bearer ${accessToken}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ password: newCredential }),
      signal: AbortSignal.timeout(5_000),
    });
    if (!response.ok)
      throw new ApiPolicyError('vendor-unavailable', 503, 'Credential replacement failed.');
  }

  private createUserClient(accessToken?: string): SupabaseClient {
    return createClient(this.options.url, this.options.anonKey, {
      auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
      ...(accessToken ? { global: { headers: { Authorization: `Bearer ${accessToken}` } } } : {}),
    });
  }

  private createChallenge(payload: ChallengePayload): string {
    const id = randomUUID();
    this.challenges.set(id, payload);
    return id;
  }

  private readChallenge(value: string): ChallengePayload {
    const payload = this.challenges.get(value);
    if (!payload || payload.exp <= Date.now()) {
      this.challenges.delete(value);
      throw new ApiPolicyError(
        'otp-challenge-invalid',
        401,
        'The verification challenge is invalid or expired.',
      );
    }
    return payload;
  }
}
