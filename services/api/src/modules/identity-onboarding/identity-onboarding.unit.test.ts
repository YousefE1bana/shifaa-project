import { randomBytes, randomUUID } from 'node:crypto';

import { AesGcmIdentityCipher } from '@shifaa/core';
import { describe, expect, it } from 'vitest';

import {
  LocalAuthIssuer,
  LocalProofingProvider,
  LocalQuarantineUploadStore,
} from '../../adapters/index.js';
import { IdentityOnboardingService, defaultPortUtilities } from './service.js';
import { InMemoryIdentityRepository } from './in-memory-repository.js';
import type { RecoveryProofGrantAuthority } from './ports.js';

function serviceHarness(
  sessionAuthority?: {
    authorize(session: { subjectId: string }): Promise<'allowed' | 'revoked' | 'restricted'>;
  },
  recoveryProofGrants?: RecoveryProofGrantAuthority,
) {
  const repository = new InMemoryIdentityRepository();
  const utilities = defaultPortUtilities();
  const service = new IdentityOnboardingService({
    auth: new LocalAuthIssuer(),
    cipher: new AesGcmIdentityCipher(randomBytes(32), randomBytes(32), 1),
    proofing: new LocalProofingProvider(),
    uploads: new LocalQuarantineUploadStore(),
    repository,
    ...(sessionAuthority ? { sessionAuthority } : {}),
    ...(recoveryProofGrants ? { recoveryProofGrants } : {}),
    ...utilities,
  });
  return { service, repository };
}

describe('identity onboarding use-case module', () => {
  it('creates registration atomically and audits only approved fields', async () => {
    const { service, repository } = serviceHarness();
    const challenge = await service.register({
      handle: 'patient.one@synthetic.shifaa.test',
      password: 'Synthetic-Only-2026!',
      locale: 'ar-EG',
      requestId: randomUUID(),
    });
    const session = await service.verifyOtp({
      challengeId: challenge.challenge_id,
      code: LocalAuthIssuer.developmentOtp,
      requestId: randomUUID(),
    });
    const actor = await service.actorFromAccessToken(session.access_token);
    expect(actor?.kind).toBe('PAT');
    expect(repository.audits).toHaveLength(2);
    expect(JSON.stringify(repository.audits)).not.toContain('Synthetic-Only-2026');
    expect(JSON.stringify(repository.audits)).not.toContain('patient.one@');
  });

  it('defaults to deny and commits audit/outbox with the domain result', async () => {
    const { service, repository } = serviceHarness();
    await expect(
      service.listReviewCases({ kind: 'PUB', principal: 'anonymous' }),
    ).rejects.toMatchObject({ code: 'permission-denied' });

    const challenge = await service.register({
      handle: 'patient.two@synthetic.shifaa.test',
      password: 'Synthetic-Only-2026!',
      locale: 'en-EG',
      requestId: randomUUID(),
    });
    const session = await service.verifyOtp({
      challengeId: challenge.challenge_id,
      code: LocalAuthIssuer.developmentOtp,
      requestId: randomUUID(),
    });
    const actor = await service.actorFromAccessToken(session.access_token);
    if (!actor) throw new Error('Synthetic session missing.');
    const result = await service.recordConsent(
      actor,
      {
        purpose_code: 'care_updates',
        purpose_version: '1.0.0',
        notice_version: '1.0.0',
        decision: 'granted',
      },
      randomUUID(),
    );
    expect(result.decision).toBe('granted');
    expect(repository.outbox.at(-1)).toMatchObject({ eventType: 'consent.changed' });
    expect(repository.audits.at(-1)).toMatchObject({ action: 'consent.decision.recorded' });
  });

  it('denies a restricted native session before protected onboarding access', async () => {
    let decision: 'allowed' | 'restricted' = 'allowed';
    const { service } = serviceHarness({
      authorize: () => Promise.resolve(decision),
    });
    const challenge = await service.register({
      handle: 'patient.restricted@synthetic.shifaa.test',
      password: 'Synthetic-Only-2026!',
      locale: 'en-EG',
      requestId: randomUUID(),
    });
    const session = await service.verifyOtp({
      challengeId: challenge.challenge_id,
      code: LocalAuthIssuer.developmentOtp,
      requestId: randomUUID(),
    });
    decision = 'restricted';

    await expect(service.actorFromAccessToken(session.access_token)).rejects.toMatchObject({
      code: 'recovery-mfa-enrollment-required',
      status: 403,
    });
  });

  it('locks and consumes a recovery proof grant around the linked verification case', async () => {
    const calls: string[] = [];
    const digest = randomBytes(32);
    const recoveryCaseId = randomUUID();
    const personId = randomUUID();
    const authority: RecoveryProofGrantAuthority = {
      authorizeRecoveryProofGrant: () =>
        Promise.resolve({ recoveryCaseId, personId, principal: 'recovery-proof:test' }),
      lockRecoveryProofGrant: (input) => {
        expect(input).toEqual({ grantDigest: digest, recoveryCaseId, personId });
        calls.push('lock');
        return Promise.resolve();
      },
      consumeRecoveryProofGrant: (input) => {
        expect(input.recoveryCaseId).toBe(recoveryCaseId);
        expect(input.personId).toBe(personId);
        expect(input.verificationCaseId).toMatch(/^[0-9a-f-]{36}$/i);
        calls.push('consume');
        return Promise.resolve();
      },
    };
    const { service, repository } = serviceHarness(undefined, authority);
    await repository.setInventory('identity_proofing', true);
    const result = await service.createIdentity(
      {
        kind: 'PAT',
        subjectId: recoveryCaseId,
        personId,
        principal: 'recovery-proof:test',
        aal: 1,
      },
      { identity_type: 'egyptian_national_id', value: '29913991234567', issuing_country: 'EG' },
      randomUUID(),
      { grantDigest: digest, recoveryCaseId },
    );

    expect(calls).toEqual(['lock', 'consume']);
    expect(result.verification_case.id).toBeDefined();
    expect(repository.audits.at(-1)).toMatchObject({
      actorPersonId: personId,
      metadata: { purpose_code: 'account_recovery_reproof' },
    });
  });
});
