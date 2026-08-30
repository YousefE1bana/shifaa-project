import { randomUUID } from 'node:crypto';

import {
  DomainPolicyError,
  appendConsentDecision,
  assertLoginHandle,
  maskIdentity,
  transitionVerification,
  withdrawConsent,
  type IdentityType,
  type Locale,
} from '@shifaa/core';

import { ApiPolicyError, deny } from './errors.js';
import type {
  AuthChallenge,
  AuthSession,
  IdentityOnboardingPorts,
  ProfileRecord,
  StoredVerificationCase,
} from './ports.js';

export interface PublicActor {
  kind: 'PUB';
  principal: string;
}

export interface PatientActor {
  kind: 'PAT';
  subjectId: string;
  personId: string;
  principal: string;
  aal: 1 | 2;
}

export interface ReviewerActor {
  kind: 'ADM-FACILITY';
  personId: string;
  principal: string;
  aal: 1 | 2;
  purposes: readonly string[];
}

export type RequestActor = PublicActor | PatientActor | ReviewerActor;

function profileDto(profile: ProfileRecord) {
  return {
    id: profile.id,
    display_name: profile.displayName,
    birth_date: profile.birthDate,
    nationality_code: profile.nationalityCode,
    preferred_locale: profile.preferredLocale,
    verification_status: profile.verificationStatus,
    version: profile.version,
  };
}

function caseDto(value: StoredVerificationCase) {
  return {
    id: value.id,
    identity_type: value.identityType,
    masked_value: value.maskedValue,
    status: value.status,
    reason_code: value.reasonCode ?? null,
    next_action: value.status === 'manual_review' ? 'wait_for_review' : null,
    version: value.version,
  };
}

export class IdentityOnboardingService {
  public constructor(private readonly ports: IdentityOnboardingPorts) {}

  public async register(input: {
    handle: string;
    password: string;
    locale: Locale;
    requestId: string;
  }) {
    const challenge = await this.prepareRegistration(input);
    return this.completeRegistration(input, challenge);
  }

  public async prepareRegistration(input: { handle: string; password: string; locale: Locale }) {
    this.assertLoginHandle(input.handle);
    return this.ports.auth.register(input.handle, input.password, input.locale);
  }

  public async completeRegistration(
    input: { handle: string; locale: Locale; requestId: string },
    challenge: AuthChallenge,
  ) {
    return this.ports.repository.transaction(async () => {
      const aggregate = await this.ports.repository.createRegistration(
        challenge.subjectId,
        input.handle,
        input.locale,
      );
      await this.ports.repository.appendAudit({
        actorPersonId: aggregate.personId,
        action: 'identity.registration.created',
        resourceType: 'person',
        resourceId: aggregate.personId,
        outcome: 'allowed',
        requestId: input.requestId,
        metadata: { locale: input.locale },
      });
      return { kind: 'challenge' as const, challenge_id: challenge.challengeId, aal: null };
    });
  }

  public async login(input: { handle: string; password: string }) {
    this.assertLoginHandle(input.handle);
    const challenge = await this.ports.auth.login(input.handle, input.password);
    return { kind: 'challenge' as const, challenge_id: challenge.challengeId, aal: null };
  }

  public async verifyOtp(input: { challengeId: string; code: string; requestId: string }) {
    const session = await this.prepareOtpVerification(input.challengeId, input.code);
    return this.completeOtpVerification(session, input.requestId);
  }

  public async prepareOtpVerification(challengeId: string, code: string) {
    return this.ports.auth.verifyOtp(challengeId, code);
  }

  public async completeOtpVerification(session: AuthSession, requestId: string) {
    await this.assertSessionAuthority(session);
    const profile = await this.ports.repository.profileByAuthSubject(session.subjectId);
    if (!profile) throw new ApiPolicyError('profile-not-found', 404, 'Profile not found.');
    await this.ports.repository.appendAudit({
      actorPersonId: profile.id,
      action: 'auth.otp.verified',
      resourceType: 'session',
      outcome: 'allowed',
      requestId,
    });
    return { kind: 'session' as const, access_token: session.accessToken, aal: session.aal };
  }

  public async actorFromAccessToken(accessToken: string): Promise<PatientActor | undefined> {
    const session = await this.ports.auth.resolveSession(accessToken);
    if (!session) return undefined;
    await this.assertSessionAuthority(session);
    const profile = await this.ports.repository.profileByAuthSubject(session.subjectId);
    if (!profile) return undefined;
    return {
      kind: 'PAT',
      subjectId: session.subjectId,
      personId: profile.id,
      principal: profile.id,
      aal: session.aal,
    };
  }

  private async assertSessionAuthority(session: AuthSession): Promise<void> {
    const decision = await this.ports.sessionAuthority?.authorize(session);
    if (!decision || decision === 'allowed') return;
    if (decision === 'revoked')
      throw new ApiPolicyError('session-revoked', 401, 'The session is not current.');
    throw new ApiPolicyError(
      'recovery-mfa-enrollment-required',
      403,
      'Complete replacement-factor enrollment before continuing.',
    );
  }

  public async getProfile(actor: RequestActor) {
    const patient = this.requirePatient(actor);
    const profile = await this.ports.repository.profileByAuthSubject(patient.subjectId);
    if (!profile || profile.id !== patient.personId) deny();
    return profileDto(profile);
  }

  public async updateProfile(
    actor: RequestActor,
    expectedVersion: number,
    patch: {
      display_name?: string;
      birth_date?: string | null;
      nationality_code?: string;
      preferred_locale?: Locale;
    },
    requestId: string,
  ) {
    const patient = this.requirePatient(actor);
    return this.ports.repository.transaction(async () => {
      const profile = await this.ports.repository.updateProfile(patient.personId, expectedVersion, {
        ...(patch.display_name !== undefined ? { displayName: patch.display_name } : {}),
        ...(patch.birth_date !== undefined ? { birthDate: patch.birth_date } : {}),
        ...(patch.nationality_code !== undefined
          ? { nationalityCode: patch.nationality_code }
          : {}),
        ...(patch.preferred_locale !== undefined
          ? { preferredLocale: patch.preferred_locale }
          : {}),
      });
      await this.ports.repository.appendAudit({
        actorPersonId: patient.personId,
        action: 'identity.profile.updated',
        resourceType: 'person',
        resourceId: patient.personId,
        outcome: 'allowed',
        requestId,
      });
      return profileDto(profile);
    }, this.repositoryContext(patient));
  }

  public async createIdentity(
    actor: RequestActor,
    input: {
      identity_type: IdentityType;
      value: string;
      issuing_country: string;
      expires_on?: string | null;
    },
    requestId: string,
  ) {
    const patient = this.requirePatient(actor);
    if (!(await this.ports.repository.hasActiveInventory('identity_proofing'))) {
      throw new ApiPolicyError(
        'processing-purpose-disabled',
        503,
        'Identity verification is unavailable until its processing purpose is active.',
      );
    }
    const encrypted = this.ports.cipher.encrypt(input.value, input.identity_type);
    const maskedValue = maskIdentity(input.identity_type, input.value);
    const provider = await this.ports.proofing.verify({
      identityType: input.identity_type,
      value: input.value,
      issuingCountry: input.issuing_country,
    });
    const status = provider.outcome === 'timeout' ? 'pending' : provider.outcome;

    return this.ports.repository.transaction(async () => {
      const identity = await this.ports.repository.createIdentity({
        personId: patient.personId,
        identityType: input.identity_type,
        encrypted,
        issuingCountry: input.issuing_country,
        ...(input.expires_on !== undefined ? { expiresOn: input.expires_on } : {}),
        maskedValue,
        verificationStatus: status,
      });
      const verificationCase = await this.ports.repository.createVerificationCase({
        identityId: identity.id,
        identityType: identity.identityType,
        maskedValue,
        ownerPersonId: patient.personId,
        provider: this.ports.proofing.name,
        ...(provider.transactionId ? { providerTransactionId: provider.transactionId } : {}),
        status,
        ...(status === 'manual_review'
          ? { assignedReviewerPersonId: '00000000-0000-4000-8000-000000000002' }
          : {}),
      });
      await this.ports.repository.appendAudit({
        actorPersonId: patient.personId,
        action: 'identity.proof.created',
        resourceType: 'verification_case',
        resourceId: verificationCase.id,
        outcome: 'allowed',
        requestId,
        metadata: { identity_type: input.identity_type, status },
      });
      await this.ports.repository.appendOutbox({
        eventType:
          status === 'manual_review'
            ? 'identity.manual_review.requested'
            : 'identity.verification.changed',
        aggregateId: verificationCase.id,
        payload: { case_id: verificationCase.id, identity_type: input.identity_type, status },
      });
      return {
        id: identity.id,
        identity_type: identity.identityType,
        masked_value: identity.maskedValue,
        verification_case: caseDto(verificationCase),
      };
    }, this.repositoryContext(patient));
  }

  public async listIdentities(actor: RequestActor) {
    const patient = this.requirePatient(actor);
    return this.ports.repository.transaction(async () => {
      const identities = await this.ports.repository.identitiesForPerson(patient.personId);
      const cases = await this.ports.repository.verificationCases();
      return identities.map((identity) => {
        const verificationCase = cases.find((candidate) => candidate.identityId === identity.id);
        if (!verificationCase)
          throw new ApiPolicyError(
            'verification-case-not-found',
            500,
            'Verification state is missing.',
          );
        return {
          id: identity.id,
          identity_type: identity.identityType,
          masked_value: identity.maskedValue,
          verification_case: caseDto(verificationCase),
        };
      });
    }, this.repositoryContext(patient));
  }

  public async createUpload(
    actor: RequestActor,
    caseId: string,
    input: {
      mime_type: 'image/jpeg' | 'image/png' | 'application/pdf';
      size_bytes: number;
      sha256: string;
    },
  ) {
    const intent = await this.prepareUpload(actor, caseId, input);
    return this.completeUpload(intent);
  }

  public async prepareUpload(
    actor: RequestActor,
    caseId: string,
    input: {
      mime_type: 'image/jpeg' | 'image/png' | 'application/pdf';
      size_bytes: number;
      sha256: string;
    },
  ) {
    const patient = this.requirePatient(actor);
    const verificationCase = await this.ports.repository.transaction(
      () => this.ports.repository.verificationCase(caseId),
      this.repositoryContext(patient),
    );
    if (!verificationCase || verificationCase.ownerPersonId !== patient.personId) deny();
    return this.ports.uploads.createIntent({
      caseId,
      mimeType: input.mime_type,
      sizeBytes: input.size_bytes,
      sha256: input.sha256,
    });
  }

  public async completeUpload(
    intent: Awaited<ReturnType<IdentityOnboardingPorts['uploads']['createIntent']>>,
  ) {
    return {
      object_id: intent.objectId,
      upload_url: intent.uploadUrl,
      expires_at: intent.expiresAt,
    };
  }

  public async getVerificationCase(actor: RequestActor, caseId: string) {
    const value = await this.ports.repository.transaction(
      () => this.ports.repository.verificationCase(caseId),
      actor.kind === 'PUB' ? undefined : this.repositoryContext(actor),
    );
    if (!value)
      throw new ApiPolicyError('verification-case-not-found', 404, 'Verification case not found.');
    if (actor.kind === 'PAT' && value.ownerPersonId === actor.personId) return caseDto(value);
    if (this.isAuthorizedReviewer(actor, value)) return caseDto(value);
    return deny();
  }

  public async listReviewCases(actor: RequestActor) {
    const reviewer = this.requireReviewer(actor);
    const cases = await this.ports.repository.transaction(
      () => this.ports.repository.verificationCases(),
      this.repositoryContext(reviewer),
    );
    return {
      data: cases
        .filter((value) => value.assignedReviewerPersonId === reviewer.personId)
        .map(caseDto),
      meta: { next_cursor: null },
    };
  }

  public async reviewCase(
    actor: RequestActor,
    caseId: string,
    expectedVersion: number,
    input: { decision: 'approve' | 'reject'; reason: string; evidence_object_id?: string | null },
    requestId: string,
  ) {
    const reviewer = this.requireReviewer(actor);
    const current = await this.ports.repository.transaction(
      () => this.ports.repository.verificationCase(caseId),
      this.repositoryContext(reviewer),
    );
    if (!current || !this.isAuthorizedReviewer(reviewer, current)) deny();
    if (current.ownerPersonId === reviewer.personId) deny('separation-of-duties');

    return this.ports.repository.transaction(async () => {
      let transitioned;
      try {
        transitioned = transitionVerification(
          { id: current.id, state: current.status, version: current.version },
          input.decision === 'approve' ? 'verified' : 'rejected',
          expectedVersion,
          input.reason,
        );
      } catch (error) {
        if (error instanceof DomainPolicyError)
          throw new ApiPolicyError(error.code, 409, error.message);
        throw error;
      }
      const next: StoredVerificationCase = {
        ...current,
        status: transitioned.state,
        version: transitioned.version,
        reviewerPersonId: reviewer.personId,
        reasonCode: input.reason,
        ...(input.evidence_object_id ? { evidenceObjectId: input.evidence_object_id } : {}),
      };
      await this.ports.repository.replaceVerificationCase(next);
      await this.ports.repository.appendAudit({
        actorPersonId: reviewer.personId,
        action: 'identity.review.decided',
        resourceType: 'verification_case',
        resourceId: next.id,
        outcome: 'allowed',
        requestId,
        metadata: { decision: input.decision },
      });
      await this.ports.repository.appendOutbox({
        eventType: 'identity.verification.changed',
        aggregateId: next.id,
        payload: { case_id: next.id, status: next.status },
      });
      return caseDto(next);
    }, this.repositoryContext(reviewer));
  }

  public async currentNotice(locale: Locale) {
    const notice = await this.ports.repository.currentNotice(locale);
    return {
      notice_code: notice.noticeCode,
      version: notice.version,
      locale: notice.locale,
      content: notice.content,
      purposes: notice.purposes.map((purpose) => ({
        purpose_code: purpose.purposeCode,
        version: purpose.version,
        label: purpose.label,
        optional: purpose.optional,
      })),
    };
  }

  public async listConsents(actor: RequestActor) {
    const patient = this.requirePatient(actor);
    return this.ports.repository.transaction(
      async () =>
        (await this.ports.repository.consentsForPerson(patient.personId)).map((record) => ({
          id: record.id,
          purpose_code: record.purposeCode,
          purpose_version: record.purposeVersion,
          decision: record.decision,
          occurred_at: record.occurredAt,
          supersedes_id: record.supersedesId ?? null,
          version: record.version,
        })),
      this.repositoryContext(patient),
    );
  }

  public async recordConsent(
    actor: RequestActor,
    input: {
      purpose_code: string;
      purpose_version: string;
      decision: 'granted' | 'refused';
      notice_version: string;
    },
    requestId: string,
  ) {
    const patient = this.requirePatient(actor);
    if (!(await this.ports.repository.hasActiveInventory(input.purpose_code))) {
      throw new ApiPolicyError(
        'processing-purpose-disabled',
        503,
        'This privacy purpose is not active.',
      );
    }
    return this.ports.repository.transaction(async () => {
      const record = appendConsentDecision({
        id: this.ports.ids.uuid(),
        personId: patient.personId,
        purposeCode: input.purpose_code,
        purposeVersion: input.purpose_version,
        noticeVersion: input.notice_version,
        decision: input.decision,
        occurredAt: this.ports.clock.now().toISOString(),
      });
      await this.ports.repository.appendConsent(record);
      await this.ports.repository.appendAudit({
        actorPersonId: patient.personId,
        action: 'consent.decision.recorded',
        resourceType: 'consent',
        resourceId: record.id,
        outcome: 'allowed',
        requestId,
        metadata: { purpose_code: record.purposeCode, decision: record.decision },
      });
      await this.ports.repository.appendOutbox({
        eventType: 'consent.changed',
        aggregateId: record.id,
        payload: {
          consent_id: record.id,
          purpose_code: record.purposeCode,
          decision: record.decision,
        },
      });
      return {
        id: record.id,
        purpose_code: record.purposeCode,
        purpose_version: record.purposeVersion,
        decision: record.decision,
        occurred_at: record.occurredAt,
        supersedes_id: null,
        version: record.version,
      };
    }, this.repositoryContext(patient));
  }

  public async withdrawConsent(
    actor: RequestActor,
    consentId: string,
    expectedVersion: number,
    requestId: string,
  ) {
    const patient = this.requirePatient(actor);
    const current = await this.ports.repository.transaction(
      () => this.ports.repository.consent(consentId),
      this.repositoryContext(patient),
    );
    if (!current || current.personId !== patient.personId) deny();
    if (current.version !== expectedVersion) {
      throw new ApiPolicyError(
        'version-conflict',
        409,
        'Refresh your privacy choices before trying again.',
      );
    }
    return this.ports.repository.transaction(async () => {
      let record;
      try {
        record = withdrawConsent({
          id: this.ports.ids.uuid(),
          current,
          occurredAt: this.ports.clock.now().toISOString(),
        });
      } catch (error) {
        if (error instanceof DomainPolicyError)
          throw new ApiPolicyError(error.code, 409, error.message);
        throw error;
      }
      await this.ports.repository.appendConsent(record);
      await this.ports.repository.appendAudit({
        actorPersonId: patient.personId,
        action: 'consent.withdrawn',
        resourceType: 'consent',
        resourceId: record.id,
        outcome: 'allowed',
        requestId,
      });
      await this.ports.repository.appendOutbox({
        eventType: 'consent.changed',
        aggregateId: record.id,
        payload: { consent_id: record.id, purpose_code: record.purposeCode, decision: 'withdrawn' },
      });
      return {
        id: record.id,
        purpose_code: record.purposeCode,
        purpose_version: record.purposeVersion,
        decision: record.decision,
        occurred_at: record.occurredAt,
        supersedes_id: record.supersedesId ?? null,
        version: record.version,
      };
    }, this.repositoryContext(patient));
  }

  public async providerCallback(
    caseId: string,
    outcome: 'verified' | 'failed' | 'manual_review',
    requestId: string,
  ) {
    return this.ports.repository.transaction(
      async () => {
        const current = await this.ports.repository.verificationCase(caseId);
        if (!current)
          throw new ApiPolicyError(
            'verification-case-not-found',
            404,
            'Verification case not found.',
          );
        if (['verified', 'rejected', 'failed', 'expired'].includes(current.status)) {
          return caseDto(current);
        }
        const transitioned = transitionVerification(
          { id: current.id, state: current.status, version: current.version },
          outcome,
          current.version,
        );
        const next = { ...current, status: transitioned.state, version: transitioned.version };
        await this.ports.repository.replaceVerificationCase(next);
        await this.ports.repository.appendAudit({
          action: 'identity.provider.callback',
          resourceType: 'verification_case',
          resourceId: next.id,
          outcome: 'allowed',
          requestId,
        });
        await this.ports.repository.appendOutbox({
          eventType: 'identity.verification.changed',
          aggregateId: next.id,
          payload: { case_id: next.id, status: next.status },
        });
        return caseDto(next);
      },
      {
        personId: '00000000-0000-4000-8000-000000000000',
        role: 'SYS',
        aal: 2,
        purposes: ['identity.provider_callback'],
        principal: 'provider-callback',
      },
    );
  }

  private requirePatient(actor: RequestActor): PatientActor {
    if (actor.kind !== 'PAT') return deny();
    return actor;
  }

  private assertLoginHandle(handle: string): void {
    try {
      assertLoginHandle(handle);
    } catch (error) {
      if (error instanceof DomainPolicyError)
        throw new ApiPolicyError(error.code, 400, error.message);
      throw error;
    }
  }

  private requireReviewer(actor: RequestActor): ReviewerActor {
    if (
      actor.kind !== 'ADM-FACILITY' ||
      actor.aal < 2 ||
      !actor.purposes.includes('identity.review')
    ) {
      return deny();
    }
    return actor;
  }

  private isAuthorizedReviewer(
    actor: RequestActor,
    value: StoredVerificationCase,
  ): actor is ReviewerActor {
    return (
      actor.kind === 'ADM-FACILITY' &&
      actor.aal >= 2 &&
      actor.purposes.includes('identity.review') &&
      value.assignedReviewerPersonId === actor.personId
    );
  }

  private repositoryContext(actor: PatientActor | ReviewerActor) {
    return {
      personId: actor.personId,
      role: actor.kind,
      aal: actor.aal,
      purposes: actor.kind === 'ADM-FACILITY' ? actor.purposes : [],
      principal: actor.principal,
    } as const;
  }
}

export function defaultPortUtilities() {
  return {
    clock: { now: () => new Date() },
    ids: { uuid: () => randomUUID() },
  };
}
