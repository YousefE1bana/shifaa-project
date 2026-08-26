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
import type { ContinuityAuthPort, VerifiedContinuitySession } from '@shifaa/auth';

import { ApiPolicyError } from '../identity-onboarding/errors.js';
import { constantTimeMatch } from './security.js';
import type {
  ContinuityRepository,
  ContinuityRequestContext,
  IdentityContinuityServicePort,
  PreparedLogout,
} from './types.js';

const pendingStory = (): never => {
  throw new ApiPolicyError(
    'vendor-unavailable',
    503,
    'This continuity operation is not enabled in the current implementation checkpoint.',
  );
};

export class FailClosedIdentityContinuityService implements IdentityContinuityServicePort {
  private unavailable(): never {
    throw new ApiPolicyError(
      'vendor-unavailable',
      503,
      'Native Auth and PostgreSQL continuity adapters are required.',
    );
  }
  public async refreshSession(): Promise<never> {
    return this.unavailable();
  }
  public async prepareLogout(): Promise<never> {
    return this.unavailable();
  }
  public async commitLogout(): Promise<never> {
    return this.unavailable();
  }
  public async logout(): Promise<never> {
    return this.unavailable();
  }
  public async beginMfaEnrollment(): Promise<never> {
    return this.unavailable();
  }
  public async verifyMfaEnrollment(): Promise<never> {
    return this.unavailable();
  }
  public async removeMfaFactor(): Promise<never> {
    return this.unavailable();
  }
  public async startRecovery(): Promise<never> {
    return this.unavailable();
  }
  public async completeRecovery(): Promise<never> {
    return this.unavailable();
  }
  public async transitionDependent(): Promise<never> {
    return this.unavailable();
  }
}

export class IdentityContinuityService implements IdentityContinuityServicePort {
  public constructor(
    private readonly dependencies: {
      auth: ContinuityAuthPort;
      repository: ContinuityRepository;
      allowedWebOrigins: ReadonlySet<string>;
      now(): Date;
    },
  ) {}

  public async refreshSession(context: ContinuityRequestContext, body: RefreshRequest) {
    const refreshToken = this.refreshToken(context, body);
    const session = await this.dependencies.auth.refresh(refreshToken);
    const current = await this.dependencies.repository.isNativeSessionCurrent(
      session.sessionId,
      await this.subjectForAccessToken(session.accessToken),
    );
    if (!current) throw new ApiPolicyError('session-revoked', 401, 'The session is not current.');
    const restriction = await this.dependencies.repository.restrictionForSession(
      session.sessionId,
      await this.subjectForAccessToken(session.accessToken),
    );
    await this.dependencies.repository.appendAudit({
      requestId: context.requestId,
      action: 'identity.session.refreshed',
      outcome: 'succeeded',
      occurredAt: this.dependencies.now().toISOString(),
      metadata: { client: body.client, restricted: restriction !== null },
    });
    return { ...session, restriction };
  }

  public async logout(context: ContinuityRequestContext, body: LogoutRequest) {
    return this.commitLogout(await this.prepareLogout(context, body));
  }

  public async prepareLogout(
    context: ContinuityRequestContext,
    body: LogoutRequest,
  ): Promise<PreparedLogout> {
    const { accessToken, claims } = await this.currentActor(context, 'logout');
    await this.dependencies.auth.logout(accessToken, body.allSessions ? 'global' : 'local');
    const revokedAt = this.dependencies.now().toISOString();
    const result = {
      scope: body.allSessions ? ('all' as const) : ('current' as const),
      revokedAt,
    };
    return {
      result,
      audit: {
        requestId: context.requestId,
        action: 'identity.session.logged_out',
        outcome: 'succeeded',
        occurredAt: revokedAt,
        metadata: { scope: result.scope, aal: claims.aal },
      },
    };
  }

  public async commitLogout(prepared: PreparedLogout) {
    await this.dependencies.repository.appendAudit(prepared.audit);
    return prepared.result;
  }

  public async beginMfaEnrollment(
    _context: ContinuityRequestContext,
    _body: BeginEnrollmentRequest,
  ) {
    return pendingStory();
  }

  public async verifyMfaEnrollment(
    _context: ContinuityRequestContext,
    _body: VerifyEnrollmentRequest,
  ) {
    return pendingStory();
  }

  public async removeMfaFactor(
    _context: ContinuityRequestContext,
    _factorId: string,
    _body: RemoveFactorRequest,
  ) {
    return pendingStory();
  }

  public async startRecovery(_context: ContinuityRequestContext, _body: StartRecoveryRequest) {
    return pendingStory();
  }

  public async completeRecovery(
    _context: ContinuityRequestContext,
    _caseId: string,
    _body: CompleteRecoveryRequest,
  ) {
    return pendingStory();
  }

  public async transitionDependent(
    _context: ContinuityRequestContext,
    _relationshipId: string,
    _body: TransitionRequest,
    _expectedVersion: number,
  ) {
    return pendingStory();
  }

  private refreshToken(context: ContinuityRequestContext, body: RefreshRequest): string {
    if (body.client === 'native') {
      if (context.refreshCookie || context.csrfCookie || context.csrfHeader) {
        throw new ApiPolicyError(
          'validation-failed',
          400,
          'Native and web session inputs cannot mix.',
        );
      }
      return body.refreshToken;
    }
    if (!context.refreshCookie || !constantTimeMatch(context.csrfCookie, context.csrfHeader)) {
      throw new ApiPolicyError('forbidden', 403, 'The web refresh request failed CSRF validation.');
    }
    if (!context.origin || !this.dependencies.allowedWebOrigins.has(context.origin)) {
      throw new ApiPolicyError('forbidden', 403, 'The web refresh origin is not allowed.');
    }
    if (context.fetchSite !== 'same-origin') {
      throw new ApiPolicyError('forbidden', 403, 'The web refresh request is not same-origin.');
    }
    return context.refreshCookie;
  }

  private async subjectForAccessToken(accessToken: string): Promise<string> {
    const claims = await this.dependencies.auth.verifyAccessToken(accessToken);
    if (!claims) throw new ApiPolicyError('session-revoked', 401, 'The session is not current.');
    return claims.subjectId;
  }

  private async currentActor(
    context: ContinuityRequestContext,
    operation: string,
  ): Promise<{ accessToken: string; claims: VerifiedContinuitySession }> {
    const accessToken = context.accessToken;
    if (!accessToken)
      throw new ApiPolicyError('authentication-required', 401, 'Sign in to continue.');
    const claims = await this.dependencies.auth.verifyAccessToken(accessToken);
    if (!claims) throw new ApiPolicyError('authentication-required', 401, 'Sign in to continue.');
    const current = await this.dependencies.repository.isNativeSessionCurrent(
      claims.sessionId,
      claims.subjectId,
    );
    if (!current) throw new ApiPolicyError('session-revoked', 401, 'The session is not current.');
    const restriction = await this.dependencies.repository.restrictionForSession(
      claims.sessionId,
      claims.subjectId,
    );
    if (
      restriction &&
      !['refreshSession', 'logout', 'beginMfaEnrollment', 'verifyMfaEnrollment'].includes(operation)
    ) {
      throw new ApiPolicyError(
        'recovery-mfa-enrollment-required',
        403,
        'Complete replacement-factor enrollment before continuing.',
      );
    }
    return { accessToken, claims };
  }
}
