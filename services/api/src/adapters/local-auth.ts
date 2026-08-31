import { randomUUID, timingSafeEqual } from 'node:crypto';

import type { Locale } from '@shifaa/core';

import { ApiPolicyError } from '../modules/identity-onboarding/errors.js';
import type {
  AuthChallenge,
  AuthIssuer,
  AuthSession,
} from '../modules/identity-onboarding/ports.js';

interface LocalUser {
  subjectId: string;
  handle: string;
  password: string;
}

interface LocalChallenge {
  subjectId: string;
  expiresAt: number;
  attempts: number;
  consumedSession?: AuthSession;
}

export class LocalAuthIssuer implements AuthIssuer {
  public static readonly developmentOtp = '246810';
  private readonly users = new Map<string, LocalUser>();
  private readonly challenges = new Map<string, LocalChallenge>();
  private readonly sessions = new Map<string, AuthSession>();

  public async register(handle: string, password: string, _locale: Locale): Promise<AuthChallenge> {
    const normalized = handle.toLowerCase();
    if (this.users.has(normalized)) {
      throw new ApiPolicyError(
        'handle-already-registered',
        409,
        'This handle is already registered.',
      );
    }
    const user = { subjectId: randomUUID(), handle: normalized, password };
    this.users.set(normalized, user);
    return this.issueChallenge(user.subjectId);
  }

  public async login(handle: string, password: string): Promise<AuthChallenge> {
    const user = this.users.get(handle.toLowerCase());
    const supplied = Buffer.from(password.padEnd(128, '\0').slice(0, 128));
    const expected = Buffer.from(
      (user?.password ?? 'constant-shape-failure').padEnd(128, '\0').slice(0, 128),
    );
    const valid = timingSafeEqual(supplied, expected) && Boolean(user);
    if (!valid || !user) {
      throw new ApiPolicyError(
        'authentication-failed',
        401,
        'The credentials could not be verified.',
      );
    }
    return this.issueChallenge(user.subjectId);
  }

  public async verifyOtp(challengeId: string, code: string): Promise<AuthSession> {
    const challenge = this.challenges.get(challengeId);
    if (!challenge)
      throw new ApiPolicyError('otp-invalid', 400, 'The verification code is invalid.');
    if (challenge.consumedSession) return challenge.consumedSession;
    if (Date.now() >= challenge.expiresAt) {
      throw new ApiPolicyError('otp-expired', 410, 'The verification code has expired.');
    }
    challenge.attempts += 1;
    if (challenge.attempts > 5) {
      throw new ApiPolicyError(
        'rate-limited',
        429,
        'Wait before trying another verification code.',
      );
    }
    const supplied = Buffer.from(code.padEnd(6, '0').slice(0, 6));
    const expected = Buffer.from(LocalAuthIssuer.developmentOtp);
    if (!timingSafeEqual(supplied, expected)) {
      throw new ApiPolicyError('otp-invalid', 400, 'The verification code is invalid.');
    }
    const accessToken = `synthetic:${challenge.subjectId}:${randomUUID()}`;
    const session: AuthSession = {
      subjectId: challenge.subjectId,
      accessToken,
      refreshToken: `synthetic-refresh:${randomUUID()}`,
      aal: 1,
    };
    challenge.consumedSession = session;
    this.sessions.set(accessToken, session);
    return session;
  }

  public async resolveSession(accessToken: string): Promise<AuthSession | undefined> {
    return this.sessions.get(accessToken);
  }

  private issueChallenge(subjectId: string): AuthChallenge {
    const challengeId = randomUUID();
    this.challenges.set(challengeId, {
      subjectId,
      attempts: 0,
      expiresAt: Date.now() + 5 * 60_000,
    });
    return { subjectId, challengeId };
  }
}
