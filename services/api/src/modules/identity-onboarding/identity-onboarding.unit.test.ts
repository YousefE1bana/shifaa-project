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

function serviceHarness() {
  const repository = new InMemoryIdentityRepository();
  const utilities = defaultPortUtilities();
  const service = new IdentityOnboardingService({
    auth: new LocalAuthIssuer(),
    cipher: new AesGcmIdentityCipher(randomBytes(32), randomBytes(32), 1),
    proofing: new LocalProofingProvider(),
    uploads: new LocalQuarantineUploadStore(),
    repository,
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

  it('SEC-001 denies self-review even when assignment, AAL2, and purpose all match', async () => {
    const { service, repository } = serviceHarness();
    const challenge = await service.register({
      handle: 'reviewer.self@synthetic.shifaa.test',
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
    if (!actor || actor.kind !== 'PAT') throw new Error('Synthetic session missing.');
    const identity = await service.createIdentity(
      actor,
      { identity_type: 'passport', value: 'SYNTHETIC-SELF-REVIEW', issuing_country: 'EG' },
      randomUUID(),
    );
    const crafted = await repository.createVerificationCase({
      identityId: identity.id,
      identityType: identity.identity_type,
      maskedValue: identity.masked_value,
      ownerPersonId: actor.personId,
      provider: 'local',
      status: 'manual_review',
      assignedReviewerPersonId: actor.personId,
    });
    await expect(
      service.reviewCase(
        {
          kind: 'ADM-FACILITY',
          personId: actor.personId,
          principal: 'synthetic-reviewer:self',
          aal: 2,
          purposes: ['identity.review'],
        },
        crafted.id,
        1,
        { decision: 'approve', reason: 'Self approval attempt.' },
        randomUUID(),
      ),
    ).rejects.toMatchObject({ code: 'separation-of-duties' });
  });
});
