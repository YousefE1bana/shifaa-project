import type {
  BeginEnrollmentRequest,
  CompleteRecoveryRequest,
  LogoutRequest,
  RefreshRequest,
  RemoveFactorRequest,
  RecoveryResult,
  StartRecoveryRequest,
  TransitionRequest,
  VerifyEnrollmentRequest,
} from '@shifaa/contracts/identity-continuity';
import { randomBytes, randomUUID } from 'node:crypto';
import {
  latestPrimaryAuthenticationAt,
  latestQualifyingFactorAt,
  type ContinuityAuthPort,
  type VerifiedContinuitySession,
} from '@shifaa/auth';
import { evaluateFactorRemoval, evaluateMfaEnrollment, hasFreshQualifyingMfa } from '@shifaa/core';

import { ApiPolicyError } from '../identity-onboarding/errors.js';
import { constantTimeMatch, hmacDigest, HmacRateLimiter, scopedPrincipal } from './security.js';
import type {
  ContinuityRepository,
  ContinuityRequestContext,
  IdentityContinuityServicePort,
  PreparedRecoveryCompletion,
  PreparedLogout,
  RecoveryResumeMarker,
} from './types.js';

const ENROLLMENT_TTL_MS = 10 * 60_000;
const RECOVERY_TTL_MS = 15 * 60_000;
export const restrictedRecoveryOperationIds = [
  'refreshSession',
  'logout',
  'beginMfaEnrollment',
  'verifyMfaEnrollment',
] as const;
const FRESH_PROOF_SECONDS = 300;

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
  public async prepareRecoveryCompletion(): Promise<never> {
    return this.unavailable();
  }
  public async commitRecoveryCompletion(): Promise<never> {
    return this.unavailable();
  }
  public async transitionDependent(): Promise<never> {
    return this.unavailable();
  }
}

export class IdentityContinuityService implements IdentityContinuityServicePort {
  private readonly mfaRateLimiter: HmacRateLimiter;

  public constructor(
    private readonly dependencies: {
      auth: ContinuityAuthPort;
      repository: ContinuityRepository;
      allowedWebOrigins: ReadonlySet<string>;
      hmacKey: Uint8Array;
      now(): Date;
    },
  ) {
    this.mfaRateLimiter = new HmacRateLimiter(dependencies.hmacKey, () =>
      dependencies.now().getTime(),
    );
  }

  private pendingMarkerKey(subjectId: string): string {
    return scopedPrincipal('mfa-pending', subjectId, this.dependencies.hmacKey);
  }

  public async refreshSession(context: ContinuityRequestContext, body: RefreshRequest) {
    const refreshToken = this.refreshToken(context, body);
    const session = await this.dependencies.auth.refresh(refreshToken);
    const current = await this.dependencies.repository.isNativeSessionCurrent(
      session.sessionId,
      await this.subjectForAccessToken(session.accessToken),
      session.assurance === 'aal2' ? 2 : 1,
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

  public async beginMfaEnrollment(context: ContinuityRequestContext, body: BeginEnrollmentRequest) {
    const { accessToken, claims } = await this.currentActor(context, 'beginMfaEnrollment');
    this.enforceMfaRate('beginMfaEnrollment', claims.subjectId, 3, 60 * 60_000);
    return this.dependencies.repository.withSerializedFactorState(claims.subjectId, () =>
      this.beginMfaEnrollmentSerialized(context, body, accessToken, claims),
    );
  }

  private async beginMfaEnrollmentSerialized(
    context: ContinuityRequestContext,
    body: BeginEnrollmentRequest,
    accessToken: string,
    claims: VerifiedContinuitySession,
  ) {
    const markerKey = this.pendingMarkerKey(claims.subjectId);
    const [verified, liveMarker] = await Promise.all([
      this.dependencies.auth.listFactors(accessToken),
      this.dependencies.repository.findPendingEnrollmentMarker({ markerKey, liveOnly: true }),
    ]);
    const pendingCount =
      liveMarker && !verified.some((factor) => factor.id === liveMarker.enrollmentId) ? 1 : 0;
    const proofs = this.freshProofs(claims);
    const decision = evaluateMfaEnrollment({
      factorType: body.factorType,
      pendingCount,
      verifiedFactorCount: verified.length,
      freshMfa: proofs.freshMfa,
      freshPrimaryReauthentication: proofs.freshPrimaryReauthentication,
    });
    if (!decision.allowed) throw this.policyProblem(decision.reason);
    const enrollment = await this.dependencies.auth.enrollTotp(accessToken, body.friendlyName);
    const occurredAt = this.dependencies.now();
    await this.dependencies.repository.savePendingEnrollmentMarker({
      markerKey,
      enrollmentId: enrollment.enrollmentId,
      expiresAt: new Date(occurredAt.getTime() + ENROLLMENT_TTL_MS).toISOString(),
    });
    await this.dependencies.repository.appendAudit({
      requestId: context.requestId,
      action: 'identity.factor.enrollment_started',
      outcome: 'succeeded',
      occurredAt: occurredAt.toISOString(),
      metadata: {
        aal: claims.aal === 2 ? 'aal2' : 'aal1',
        existingVerifiedFactors: verified.length,
      },
    });
    return {
      enrollmentId: enrollment.enrollmentId,
      factorType: 'totp' as const,
      secret: enrollment.secret,
      qrUri: enrollment.qrUri,
      expiresAt: new Date(occurredAt.getTime() + ENROLLMENT_TTL_MS).toISOString(),
    };
  }

  public async verifyMfaEnrollment(
    context: ContinuityRequestContext,
    body: VerifyEnrollmentRequest,
  ) {
    const { accessToken, claims } = await this.currentActor(context, 'verifyMfaEnrollment');
    return this.dependencies.repository.withSerializedFactorState(claims.subjectId, () =>
      this.verifyMfaEnrollmentSerialized(context, body, accessToken, claims),
    );
  }

  private async verifyMfaEnrollmentSerialized(
    context: ContinuityRequestContext,
    body: VerifyEnrollmentRequest,
    accessToken: string,
    claims: VerifiedContinuitySession,
  ) {
    const marker = await this.dependencies.repository.findPendingEnrollmentMarker({
      markerKey: this.pendingMarkerKey(claims.subjectId),
      liveOnly: false,
    });
    if (!marker || marker.enrollmentId !== body.enrollmentId)
      throw new ApiPolicyError('factor-code-invalid', 422, 'The enrollment is not available.');
    if (this.dependencies.now().getTime() >= marker.expiresAtMs)
      throw new ApiPolicyError(
        'factor-enrollment-pending',
        410,
        'The setup window expired. Start a new setup.',
      );
    const verification = await this.dependencies.auth.verifyTotp(
      accessToken,
      body.enrollmentId,
      body.code,
    );
    await this.dependencies.repository.consumePendingEnrollmentMarker({
      markerKey: this.pendingMarkerKey(claims.subjectId),
    });
    await this.completeRestrictedEnrollmentWhenBound(context, claims);
    const recipientPersonId = await this.requirePersonForActor(claims);
    const occurredAt = this.dependencies.now().toISOString();
    await this.dependencies.repository.appendFactorChangedEvidence({
      event: {
        aggregateId: verification.factor.id,
        aggregateVersion: 1,
        eventType: 'identity.factor.changed',
        payload: { recipientPersonId, support_action: 'verified', action_time: occurredAt },
      },
      audit: {
        requestId: context.requestId,
        action: 'identity.factor.verified',
        outcome: 'succeeded',
        occurredAt,
        metadata: { aal: 'aal2' },
      },
    });
    return {
      factor: verification.factor,
      assurance: 'aal2' as const,
      session: { ...verification.session, restriction: null },
    };
  }

  public async removeMfaFactor(
    context: ContinuityRequestContext,
    factorId: string,
    body: RemoveFactorRequest,
  ) {
    const { accessToken, claims } = await this.currentActor(context, 'removeMfaFactor');
    this.enforceMfaRate('removeMfaFactor', claims.subjectId, 3, 60 * 60_000);
    return this.dependencies.repository.withSerializedFactorState(claims.subjectId, async () => {
      const personId = await this.requirePersonForActor(claims);
      const verified = await this.dependencies.auth.listFactors(accessToken);
      if (!verified.some((factor) => factor.id === factorId))
        throw new ApiPolicyError('not-found', 404, 'The named verification factor is not present.');
      const accountClass = await this.dependencies.repository.accountClassForPerson(personId);
      const proofs = this.freshProofs(claims);
      const decision = evaluateFactorRemoval({
        accountClass,
        verifiedFactorCount: verified.length,
        freshMfa: proofs.freshMfa,
        optionalLastFactorConfirmed: body.confirmOptionalLastFactor,
        completedReproof: false,
        recoveryRestricted: false,
      });
      if (!decision.allowed) throw this.policyProblem(decision.reason);
      await this.dependencies.auth.unenrollFactor(accessToken, factorId);
      const remaining = await this.dependencies.auth.listFactors(accessToken);
      const nativeAalStillMatches = await this.dependencies.repository.isNativeSessionCurrent(
        claims.sessionId,
        claims.subjectId,
        claims.aal,
      );
      const assurance =
        nativeAalStillMatches && claims.aal === 2 ? ('aal2' as const) : ('aal1' as const);
      const occurredAt = this.dependencies.now().toISOString();
      await this.dependencies.repository.appendFactorChangedEvidence({
        event: {
          aggregateId: factorId,
          aggregateVersion: 2,
          eventType: 'identity.factor.changed',
          payload: {
            recipientPersonId: personId,
            support_action: 'removed',
            action_time: occurredAt,
          },
        },
        audit: {
          requestId: context.requestId,
          action: 'identity.factor.removed',
          outcome: 'succeeded',
          occurredAt,
          metadata: {
            assuranceRecomputedFrom: 'live-native-factors',
            postRemovalAssurance: assurance,
            remainingVerifiedFactors: remaining.length,
          },
        },
      });
      return { removedFactorId: factorId, assurance, removedAt: occurredAt };
    });
  }

  public async startRecovery(_context: ContinuityRequestContext, body: StartRecoveryRequest) {
    const handle = normalizeRecoveryHandle(body.handle);
    const caseId = randomUUID();
    const caseToken = randomBytes(32).toString('base64url');
    const expiresAt = new Date(this.dependencies.now().getTime() + RECOVERY_TTL_MS).toISOString();
    await this.dependencies.auth.startRecovery(handle);
    await this.dependencies.repository.createRecoveryIntake({
      caseId,
      handleDigest: hmacDigest(handle, this.dependencies.hmacKey),
      caseTokenDigest: hmacDigest(caseToken, this.dependencies.hmacKey),
      expiresAt,
    });
    return {
      caseId,
      caseToken,
      status: 'accepted' as const,
      messageCode: 'recovery.accepted' as const,
    };
  }

  public async completeRecovery(
    context: ContinuityRequestContext,
    caseId: string,
    body: CompleteRecoveryRequest,
  ) {
    return this.commitRecoveryCompletion(
      await this.prepareRecoveryCompletion(context, caseId, body),
    );
  }

  public async prepareRecoveryCompletion(
    context: ContinuityRequestContext,
    caseId: string,
    body: CompleteRecoveryRequest,
  ): Promise<PreparedRecoveryCompletion> {
    const handle = normalizeRecoveryHandle(body.handle);
    this.assertRecoveryProofShape(body);
    let marker = await this.dependencies.repository.findRecoveryResumeMarker(caseId);
    let bindingHandle = handle;
    if (!marker) {
      const recovery = await this.dependencies.auth.redeemRecoveryOtp(handle, body.recoveryOtp);
      bindingHandle = normalizeRecoveryHandle(recovery.handle);
      marker = {
        subjectId: recovery.subjectId,
        accessToken: recovery.session.accessToken,
        restricted: null,
        credentialUpdated: false,
        expiresAt: new Date(this.dependencies.now().getTime() + RECOVERY_TTL_MS).toISOString(),
      };
    }
    const binding = await this.dependencies.repository.bindRecoveryIntake({
      caseId,
      subjectId: marker.subjectId,
      handleDigest: hmacDigest(bindingHandle, this.dependencies.hmacKey),
      caseTokenDigest: hmacDigest(body.caseToken, this.dependencies.hmacKey),
    });
    await this.dependencies.repository.saveRecoveryResumeMarker(caseId, marker);
    if (marker.restricted === null) {
      const proof = await this.recoveryProofSession(body, marker.accessToken, binding.personId);
      marker = { ...marker, accessToken: proof.accessToken, restricted: proof.restricted };
      await this.dependencies.repository.saveRecoveryResumeMarker(caseId, marker);
    }
    const restricted = marker.restricted;
    if (restricted === null) throw new Error('Recovery proof checkpoint was not established.');
    await this.dependencies.repository.stageRecoveryRestriction({
      caseId,
      personId: binding.personId,
    });
    if (!marker.credentialUpdated) {
      await this.dependencies.auth.updateRecoveredCredential(
        marker.accessToken,
        body.newCredential,
      );
      marker = { ...marker, credentialUpdated: true } satisfies RecoveryResumeMarker;
      await this.dependencies.repository.saveRecoveryResumeMarker(caseId, marker);
    }
    try {
      await this.dependencies.auth.logout(marker.accessToken, 'global');
    } catch {
      const checkpointSession = await this.dependencies.auth.signInWithPassword(
        handle,
        body.newCredential,
      );
      await this.dependencies.auth.logout(checkpointSession.accessToken, 'global');
    }
    const freshSession = await this.dependencies.auth.signInWithPassword(
      handle,
      body.newCredential,
    );
    return {
      caseId,
      personId: binding.personId,
      requestId: context.requestId,
      restricted,
      session: {
        ...freshSession,
        restriction: restricted ? 'mfa_enrollment_only' : null,
      },
    };
  }

  public async commitRecoveryCompletion(
    prepared: PreparedRecoveryCompletion,
  ): Promise<RecoveryResult> {
    const occurredAt = this.dependencies.now().toISOString();
    await this.dependencies.repository.finalizeRecovery({
      caseId: prepared.caseId,
      personId: prepared.personId,
      sessionId: prepared.session.sessionId,
      restricted: prepared.restricted,
      requestId: prepared.requestId,
      occurredAt,
    });
    return {
      caseId: prepared.caseId,
      status: prepared.restricted ? ('restricted_enrollment' as const) : ('completed' as const),
      session: prepared.session,
    };
  }

  public async transitionDependent(
    context: ContinuityRequestContext,
    relationshipId: string,
    body: TransitionRequest,
    expectedVersion: number,
  ) {
    const { claims } = await this.currentActor(context, 'transitionDependent');
    const actorPersonId = await this.requirePersonForActor(claims);
    const occurredAt = this.dependencies.now().toISOString();
    if (body.action === 'submit_proof') {
      return this.dependencies.repository.submitTransitionProof({
        relationshipId,
        verificationCaseId: body.verificationCaseId,
        expectedVersion,
        actorPersonId,
        idempotencyKey: context.idempotencyKey,
        idempotencyPrincipal: scopedPrincipal(
          'transitionDependent',
          actorPersonId,
          this.dependencies.hmacKey,
        ),
        requestId: context.requestId,
        occurredAt,
      });
    }
    const factorAt = latestQualifyingFactorAt(claims.amr);
    const factorAgeSeconds =
      factorAt === undefined
        ? Number.POSITIVE_INFINITY
        : Math.floor(this.dependencies.now().getTime() / 1_000) - factorAt;
    if (!hasFreshQualifyingMfa(factorAgeSeconds, claims.aal === 2 ? 'aal2' : 'aal1'))
      throw this.transitionProblem('mfa-step-up-required');
    if (context.purpose !== 'guardianship_review') throw this.transitionProblem('purpose-required');
    if (!/^human_review\.[a-z0-9_.-]{2,49}$/.test(body.reasonCode))
      throw this.transitionProblem('reason-required');
    if (body.decision === 'defer' && !body.reviewRequiredReason)
      throw this.transitionProblem('human-review-required');
    return this.dependencies.repository.decideTransition({
      relationshipId,
      expectedVersion,
      actorPersonId,
      idempotencyKey: context.idempotencyKey,
      idempotencyPrincipal: scopedPrincipal(
        'transitionDependent',
        actorPersonId,
        this.dependencies.hmacKey,
      ),
      decision: body.decision,
      reasonCode: body.reasonCode,
      reviewRequiredReason: body.reviewRequiredReason ?? null,
      aal: claims.aal,
      purpose: context.purpose,
      ...(factorAt === undefined ? {} : { factorAmrAt: new Date(factorAt * 1_000).toISOString() }),
      requestId: context.requestId,
      occurredAt,
    });
  }

  private transitionProblem(reason: string): ApiPolicyError {
    if (reason === 'mfa-step-up-required')
      return new ApiPolicyError(
        reason,
        403,
        'Confirm a recent verification-factor challenge first.',
      );
    if (reason === 'purpose-required')
      return new ApiPolicyError(reason, 403, 'The guardianship review purpose is required.');
    if (reason === 'reason-required')
      return new ApiPolicyError(reason, 422, 'A stable review reason is required.');
    if (reason === 'human-review-required')
      return new ApiPolicyError(reason, 409, 'The controlling evidence requires human review.');
    return new ApiPolicyError('validation-failed', 422, 'The transition decision is invalid.');
  }

  private freshProofs(claims: VerifiedContinuitySession): {
    freshMfa: boolean;
    freshPrimaryReauthentication: boolean;
  } {
    const nowSeconds = Math.floor(this.dependencies.now().getTime() / 1_000);
    const factorAt = latestQualifyingFactorAt(claims.amr);
    const primaryAt = latestPrimaryAuthenticationAt(claims.amr);
    const assurance = claims.aal === 2 ? ('aal2' as const) : ('aal1' as const);
    return {
      freshMfa: factorAt !== undefined && hasFreshQualifyingMfa(nowSeconds - factorAt, assurance),
      freshPrimaryReauthentication:
        claims.aal >= 1 &&
        primaryAt !== undefined &&
        nowSeconds - primaryAt >= 0 &&
        nowSeconds - primaryAt <= FRESH_PROOF_SECONDS,
    };
  }

  private async recoveryProofSession(
    body: CompleteRecoveryRequest,
    accessToken: string,
    personId: string,
  ): Promise<{ restricted: boolean; accessToken: string }> {
    if (body.proofMethod === 'repeated_identity_proof') {
      if (!body.verificationCaseId)
        throw new ApiPolicyError(
          'identity-proof-required',
          403,
          'A repeated identity proof is required.',
        );
      const approved = await this.dependencies.repository.recoveryProofIsApproved({
        personId,
        verificationCaseId: body.verificationCaseId,
      });
      if (!approved)
        throw new ApiPolicyError(
          'identity-proof-required',
          403,
          'A repeated identity proof is required.',
        );
      return { restricted: true, accessToken };
    }
    if (!body.factorEvidence)
      throw new ApiPolicyError('identity-proof-required', 403, 'A bound factor is required.');
    const factors = await this.dependencies.auth.listFactors(accessToken);
    for (const factor of factors) {
      try {
        const verification = await this.dependencies.auth.verifyTotp(
          accessToken,
          factor.id,
          body.factorEvidence,
        );
        return { restricted: false, accessToken: verification.session.accessToken };
      } catch (error) {
        if (!(error instanceof ApiPolicyError) || error.code !== 'factor-code-invalid') throw error;
      }
    }
    throw new ApiPolicyError('identity-proof-required', 403, 'A bound factor is required.');
  }

  private assertRecoveryProofShape(body: CompleteRecoveryRequest): void {
    if (body.proofMethod === 'repeated_identity_proof' && !body.verificationCaseId)
      throw new ApiPolicyError(
        'identity-proof-required',
        403,
        'A repeated identity proof is required.',
      );
    if (body.proofMethod === 'bound_factor_independent_method' && !body.factorEvidence)
      throw new ApiPolicyError('identity-proof-required', 403, 'A bound factor is required.');
  }

  private enforceMfaRate(
    operation: string,
    subjectId: string,
    limit: number,
    windowMs: number,
  ): void {
    const retryAfter = this.mfaRateLimiter.consume(operation, subjectId, limit, windowMs);
    if (retryAfter === null) return;
    throw new ApiPolicyError('rate-limited', 429, 'The security request limit was reached.', {
      'retry-after': String(retryAfter),
    });
  }

  private policyProblem(reason: string): ApiPolicyError {
    switch (reason) {
      case 'factor-type-unsupported':
        return new ApiPolicyError(
          'factor-type-unsupported',
          422,
          'Only authenticator-app factors are supported in this stage.',
        );
      case 'factor-enrollment-pending':
        return new ApiPolicyError(
          'factor-enrollment-pending',
          409,
          'Finish or abandon the pending setup first.',
        );
      case 'mfa-step-up-required':
        return new ApiPolicyError(
          'mfa-step-up-required',
          403,
          'Confirm a recent verification-factor challenge first.',
        );
      case 'identity-proof-required':
        return new ApiPolicyError(
          'identity-proof-required',
          403,
          'Sign in again shortly before this security change.',
        );
      case 'not-found':
        return new ApiPolicyError('not-found', 404, 'The named item is not present.');
      case 'last-factor-removal-denied':
        return new ApiPolicyError(
          'last-factor-removal-denied',
          422,
          'The last required verification factor cannot be removed.',
        );
      case 'restricted-operation':
        return new ApiPolicyError(
          'recovery-mfa-enrollment-required',
          403,
          'This session can only add a replacement factor.',
        );
      default:
        return new ApiPolicyError('validation-failed', 400, 'The security request is invalid.');
    }
  }

  private async completeRestrictedEnrollmentWhenBound(
    context: ContinuityRequestContext,
    claims: VerifiedContinuitySession,
  ): Promise<void> {
    const restriction = await this.dependencies.repository.restrictionForSession(
      claims.sessionId,
      claims.subjectId,
    );
    if (restriction !== 'mfa_enrollment_only') return;
    await this.dependencies.repository.completeRestrictedEnrollmentCase({
      sessionId: claims.sessionId,
      subjectId: claims.subjectId,
      requestId: context.requestId,
      occurredAt: this.dependencies.now().toISOString(),
    });
  }

  private async requirePersonForActor(claims: VerifiedContinuitySession): Promise<string> {
    const personId = await this.dependencies.repository.resolveSubjectPerson(claims.subjectId);
    if (!personId)
      throw new ApiPolicyError('forbidden', 403, 'The account has no platform identity.');
    return personId;
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
      claims.aal,
    );
    if (!current) throw new ApiPolicyError('session-revoked', 401, 'The session is not current.');
    const restriction = await this.dependencies.repository.restrictionForSession(
      claims.sessionId,
      claims.subjectId,
    );
    if (
      restriction &&
      !restrictedRecoveryOperationIds.includes(
        operation as (typeof restrictedRecoveryOperationIds)[number],
      )
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

function normalizeRecoveryHandle(value: string): string {
  return value.trim().toLowerCase();
}
