import { randomUUID } from 'node:crypto';

import { SupabaseJwtVerifier } from '@shifaa/auth';
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

export class SupabaseAuthIssuer implements AuthIssuer {
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
