import { randomBytes, randomUUID } from 'node:crypto';

import type { ContinuityAuthPort, VerifiedContinuitySession } from '@shifaa/auth';
import Fastify from 'fastify';
import postgres from 'postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { PostgresIdempotencyStore } from '../src/adapters/postgres/idempotency-store.js';
import { PostgresFamilyCareService } from '../src/adapters/postgres/family-service.js';
import { PostgresIdentityContinuityService } from '../src/adapters/postgres/identity-continuity-service.js';
import { PostgresIdentityRepository } from '../src/adapters/postgres/identity-repository.js';
import { IdentityContinuityService } from '../src/modules/identity-continuity/service.js';
import { installIdentityErrorHandler } from '../src/routes/identity-onboarding.js';
import { registerIdentityContinuityRoutes } from '../src/routes/identity-continuity.js';

const enabled = process.env['SHIFAA_RUN_IDENTITY_CONTINUITY_TRANSITION'] === 'true';
const now = new Date('2026-08-25T10:00:00.000Z');
const ownerUrl = 'postgresql://shifaa_owner:synthetic_owner_only@127.0.0.1:5432/shifaa';
const apiUrl = 'postgresql://shifaa_api:synthetic_api_only@127.0.0.1:5432/shifaa';

type Fixture = Awaited<ReturnType<typeof seedTransitionFixture>>;

class TransitionTestRepository extends PostgresIdentityContinuityService {
  public constructor(
    repository: PostgresIdentityRepository,
    private readonly peopleByAuthUser: ReadonlyMap<string, string>,
  ) {
    super(repository, Buffer.alloc(32, 37), 'ci');
  }

  public override isNativeSessionCurrent(): Promise<boolean> {
    return Promise.resolve(true);
  }

  public override restrictionForSession(): Promise<null> {
    return Promise.resolve(null);
  }

  public override resolveSubjectPerson(subjectId: string): Promise<string | undefined> {
    return Promise.resolve(this.peopleByAuthUser.get(subjectId));
  }
}

describe.skipIf(!enabled).sequential('dependent transition real PostgreSQL/API checkpoint', () => {
  const owner = postgres(ownerUrl, { max: 4 });
  const repository = new PostgresIdentityRepository(apiUrl);
  let fixture: Fixture;
  let app = Fastify({ logger: false, genReqId: () => randomUUID() });
  let familyService: PostgresFamilyCareService;
  let transitionRepository: TransitionTestRepository;

  beforeAll(async () => {
    fixture = await seedTransitionFixture(owner);
    await repository.ready();
    const claims = new Map<string, VerifiedContinuitySession>([
      [fixture.subjectToken, session(fixture.subjectAuthUserId, 2, 300)],
      [fixture.reviewerToken, session(fixture.reviewerAuthUserId, 2, 300)],
    ]);
    const auth = {
      verifyAccessToken: (token: string) => Promise.resolve(claims.get(token)),
    } as ContinuityAuthPort;
    transitionRepository = new TransitionTestRepository(
      repository,
      new Map([
        [fixture.subjectAuthUserId, fixture.subjectPersonId],
        [fixture.reviewerAuthUserId, fixture.reviewerPersonId],
      ]),
    );
    familyService = new PostgresFamilyCareService(
      repository,
      Buffer.alloc(32, 40),
      Buffer.alloc(32, 41),
      Buffer.alloc(32, 42),
      () => now,
    );
    const service = new IdentityContinuityService({
      auth,
      repository: transitionRepository,
      allowedWebOrigins: new Set(),
      hmacKey: Buffer.alloc(32, 38),
      now: () => now,
    });
    app = Fastify({ logger: false, genReqId: () => randomUUID() });
    installIdentityErrorHandler(app);
    await registerIdentityContinuityRoutes(app, {
      service,
      idempotency: new PostgresIdempotencyStore(repository, Buffer.alloc(32, 39), () => now),
      hmacKey: Buffer.alloc(32, 38),
      now: () => now.getTime(),
    });
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
    await repository.close();
    await owner.end({ timeout: 5 });
  });

  it('submits assigned proof once and rejects self-review without a partial effect', async () => {
    const key = `synthetic-transition-submit-${randomUUID()}`;
    const response = await transitionRequest(
      app,
      fixture.subjectToken,
      fixture.relationshipId,
      1,
      key,
      { action: 'submit_proof', verificationCaseId: fixture.verificationCaseId },
    );
    expect(response.statusCode, response.body).toBe(200);
    expect(response.json()).toMatchObject({ status: 'review_required', version: 2 });
    expect(response.headers.etag).toBe('"2"');

    const replay = await transitionRequest(
      app,
      fixture.subjectToken,
      fixture.relationshipId,
      1,
      key,
      { action: 'submit_proof', verificationCaseId: fixture.verificationCaseId },
    );
    expect(replay.statusCode).toBe(200);
    expect(replay.json()).toEqual(response.json());
    const changed = await transitionRequest(
      app,
      fixture.subjectToken,
      fixture.relationshipId,
      2,
      key,
      { action: 'submit_proof', verificationCaseId: fixture.verificationCaseId },
    );
    expect(changed.statusCode).toBe(409);
    expect(changed.json()).toMatchObject({ code: 'idempotency-key-reused' });

    const selfReview = await transitionRequest(
      app,
      fixture.subjectToken,
      fixture.relationshipId,
      2,
      `synthetic-transition-self-${randomUUID()}`,
      { action: 'decide', decision: 'approve', reasonCode: 'human_review.approved' },
    );
    expect(selfReview.statusCode).toBe(403);
    const [evidence] = await owner`
      select
        (select count(*)::int from audit.events where resource_id=${response.json().caseId}::uuid) audit_count,
        (select count(*)::int from platform.outbox_events where aggregate_id=${response.json().caseId}::uuid) outbox_count`;
    expect(evidence).toEqual({ audit_count: 1, outbox_count: 1 });

    const reviewerActor = transitionReviewerActor(fixture.reviewerPersonId);
    const assigned = await familyService.listGuardianshipCases(reviewerActor, {
      mode: 'dependent_transition',
    });
    expect(assigned.items).toEqual([
      expect.objectContaining({
        relationshipId: fixture.relationshipId,
        caseType: 'dependent_transition',
        status: 'review_required',
        continuityCaseVersion: 2,
        proofState: 'verified',
        blockerState: 'none',
      }),
    ]);
    expect(JSON.stringify(assigned)).not.toMatch(/patient|person|evidence|auth|document/i);
    const unassigned = await familyService.listGuardianshipCases(
      transitionReviewerActor(fixture.subjectPersonId),
      { mode: 'dependent_transition' },
    );
    expect(unassigned.items).toEqual([]);
    const subjectRelationships = await familyService.listRelationships(
      transitionSubjectActor(fixture.subjectPersonId),
      fixture.patientId,
      { includeDependentTransition: true },
    );
    expect(subjectRelationships.dependentTransition).toMatchObject({
      relationshipId: fixture.relationshipId,
      status: 'review_required',
      continuityCaseVersion: 2,
      recordConsequence: 'unchanged_before_decision',
      priorAuthorityConsequence: 'current_until_decision',
    });
  });

  it('rejects recovery proof whose linked identity is no longer current', async () => {
    await expect(
      transitionRepository.recoveryProofIsApproved({
        personId: fixture.subjectPersonId,
        verificationCaseId: fixture.verificationCaseId,
      }),
    ).resolves.toBe(true);
    await owner`update identity.identities set verification_status='revoked'
      where id=(select identity_id from identity.verification_cases where id=${fixture.verificationCaseId}::uuid)`;
    try {
      await expect(
        transitionRepository.recoveryProofIsApproved({
          personId: fixture.subjectPersonId,
          verificationCaseId: fixture.verificationCaseId,
        }),
      ).resolves.toBe(false);
    } finally {
      await owner`update identity.identities set verification_status='verified'
        where id=(select identity_id from identity.verification_cases where id=${fixture.verificationCaseId}::uuid)`;
    }
  });

  it('stages a recovery restriction across every native session for the subject', async () => {
    const caseId = randomUUID();
    const publicTokenDigest = randomBytes(32);
    const recoveryHandleDigest = randomBytes(32);
    const subjectAuthority = new PostgresIdentityContinuityService(
      repository,
      Buffer.alloc(32, 43),
      'ci',
    );
    await owner`alter table identity.continuity_cases no force row level security`;
    try {
      await owner`insert into identity.continuity_cases(
        id,case_type,subject_person_id,status,public_token_digest,recovery_handle_digest,
        token_key_version,created_at,expires_at
      ) values(
        ${caseId}::uuid,'account_recovery',${fixture.subjectPersonId}::uuid,'proof_required',
        ${publicTokenDigest},${recoveryHandleDigest},1,${now},${new Date(
          now.getTime() + 15 * 60_000,
        )}::timestamptz
      )`;
    } finally {
      await owner`alter table identity.continuity_cases force row level security`;
    }

    try {
      await subjectAuthority.stageRecoveryRestriction({
        caseId,
        personId: fixture.subjectPersonId,
      });
      await expect(
        subjectAuthority.restrictionForSession(randomUUID(), fixture.subjectAuthUserId),
      ).resolves.toBe('mfa_enrollment_only');
    } finally {
      await owner`alter table identity.continuity_cases no force row level security`;
      try {
        await owner`delete from identity.continuity_cases where id=${caseId}::uuid`;
      } finally {
        await owner`alter table identity.continuity_cases force row level security`;
      }
    }
  });

  it('requires human review for a blocker and gives one concurrent decision winner', async () => {
    const deferred = await transitionRequest(
      app,
      fixture.reviewerToken,
      fixture.relationshipId,
      2,
      `synthetic-transition-defer-${randomUUID()}`,
      {
        action: 'decide',
        decision: 'defer',
        reasonCode: 'human_review.dispute',
        reviewRequiredReason: 'dispute',
      },
    );
    expect(deferred.statusCode, deferred.body).toBe(200);
    expect(deferred.json()).toMatchObject({ status: 'human_review_required', version: 3 });

    const decide = (key: string) =>
      transitionRequest(app, fixture.reviewerToken, fixture.relationshipId, 3, key, {
        action: 'decide',
        decision: 'approve',
        reasonCode: 'human_review.approved',
        reviewRequiredReason: null,
      });
    const decisions = await Promise.all([
      decide(`synthetic-transition-race-a-${randomUUID()}`),
      decide(`synthetic-transition-race-b-${randomUUID()}`),
    ]);
    expect(decisions.map((response) => response.statusCode).toSorted()).toEqual([200, 409]);
    expect(decisions.find((response) => response.statusCode === 409)?.json()).toMatchObject({
      code: 'version-conflict',
    });

    const [after] = await owner`
      select
        (select md5(row(p.*)::text) from identity.people p where p.id=${fixture.subjectPersonId}::uuid) person_hash,
        (select md5(row(p.*)::text) from identity.patients p where p.id=${fixture.patientId}::uuid) patient_hash,
        (select medical_record_number from identity.patients where id=${fixture.patientId}::uuid) mrn,
        (select status from identity.care_relationships where id=${fixture.relationshipId}::uuid) guardian_status,
        (select count(*)::int from audit.events where resource_id=(select id from identity.continuity_cases where relationship_id=${fixture.relationshipId}::uuid)) audit_count,
        (select count(*)::int from platform.outbox_events where aggregate_id=(select id from identity.continuity_cases where relationship_id=${fixture.relationshipId}::uuid)) outbox_count`;
    expect(after).toMatchObject({
      person_hash: fixture.personHash,
      patient_hash: fixture.patientHash,
      mrn: fixture.mrn,
      guardian_status: 'revoked',
      audit_count: 3,
      outbox_count: 3,
    });
    const [authority] = await owner`
      select platform.person_has_family_relationship(
        ${fixture.patientId}::uuid,${fixture.guardianPersonId}::uuid,'record.view'
      ) allowed`;
    expect(authority?.['allowed']).toBe(false);
    const subjectRelationships = await familyService.listRelationships(
      transitionSubjectActor(fixture.subjectPersonId),
      fixture.patientId,
      { includeDependentTransition: true },
    );
    expect(subjectRelationships.dependentTransition).toMatchObject({
      status: 'approved',
      recordConsequence: 'same_patient_record_preserved',
      priorAuthorityConsequence: 'ended_after_approval',
    });
  });
});

function transitionReviewerActor(personId: string) {
  return {
    personId,
    principal: `synthetic-transition-reviewer:${personId}`,
    requestId: randomUUID(),
    role: 'support_admin' as const,
    aal: 2 as const,
    purpose: 'guardianship_review',
  };
}

function transitionSubjectActor(personId: string) {
  return {
    personId,
    principal: `synthetic-transition-subject:${personId}`,
    requestId: randomUUID(),
    aal: 2 as const,
    purpose: 'self_care',
  };
}

function session(
  subjectId: string,
  aal: 1 | 2,
  factorAgeSeconds: number,
): VerifiedContinuitySession {
  return {
    subjectId,
    sessionId: randomUUID(),
    aal,
    amr: [{ method: 'totp', timestamp: Math.floor(now.getTime() / 1_000) - factorAgeSeconds }],
    expiresAt: Math.floor(now.getTime() / 1_000) + 900,
  };
}

function transitionRequest(
  app: ReturnType<typeof Fastify>,
  token: string,
  relationshipId: string,
  version: number,
  key: string,
  payload: Record<string, unknown>,
) {
  return app.inject({
    method: 'POST',
    url: `/v1/guardianships/${relationshipId}/transition`,
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
      'idempotency-key': key,
      'if-match': `"${version}"`,
      'x-purpose': 'guardianship_review',
    },
    payload,
  });
}

async function seedTransitionFixture(owner: postgres.Sql) {
  const subjectPersonId = randomUUID();
  const subjectAuthUserId = randomUUID();
  const guardianPersonId = randomUUID();
  const guardianAuthUserId = randomUUID();
  const reviewerPersonId = randomUUID();
  const reviewerAuthUserId = randomUUID();
  const patientId = randomUUID();
  const selfRelationshipId = randomUUID();
  const relationshipId = randomUUID();
  const evidenceId = randomUUID();
  const identityId = randomUUID();
  const verificationCaseId = randomUUID();
  const grantId = randomUUID();
  const mrn = `SYN-TRANSITION-${randomUUID()}`;
  await owner.begin(async (sql) => {
    await sql`
      insert into identity.people(id,user_id,display_name,birth_date,nationality_code,preferred_locale,profile_status)
      values
        (${subjectPersonId}::uuid,${subjectAuthUserId}::uuid,'Synthetic transition subject','2005-08-25','EG','ar-EG','active'),
        (${guardianPersonId}::uuid,${guardianAuthUserId}::uuid,'Synthetic former guardian',NULL,'EG','ar-EG','active'),
        (${reviewerPersonId}::uuid,${reviewerAuthUserId}::uuid,'Synthetic assigned reviewer',NULL,'EG','en-EG','active')`;
    await sql`insert into identity.patients(id,person_id,medical_record_number) values(${patientId}::uuid,${subjectPersonId}::uuid,${mrn})`;
    await sql`select set_config('shifaa.person_id','',true)`;
    await sql`insert into identity.care_relationships(id,subject_patient_id,actor_person_id,relationship_type,status,valid_from,created_by_person_id)
      values(${selfRelationshipId}::uuid,${patientId}::uuid,${subjectPersonId}::uuid,'self','active','2026-01-01',${subjectPersonId}::uuid)`;
    await sql`insert into identity.private_evidence_objects(
      id,bucket_code,object_key,owner_person_id,resource_patient_id,sha256,mime_type,size_bytes,scan_status,released_at
    ) values(
      ${evidenceId}::uuid,'guardianship-evidence',${`synthetic/transition/${evidenceId}`},${guardianPersonId}::uuid,
      ${patientId}::uuid,repeat('8',64),'application/pdf',512,'released',${now.toISOString()}::timestamptz
    )`;
    await sql`select set_config('shifaa.person_id',${guardianPersonId},true)`;
    await sql`insert into identity.care_relationships(
      id,subject_patient_id,actor_person_id,relationship_type,status,valid_from,created_by_person_id,purpose_code,evidence_object_id
    ) values(
      ${relationshipId}::uuid,${patientId}::uuid,${guardianPersonId}::uuid,'guardianship','pending','2026-01-01',
      ${guardianPersonId}::uuid,'dependent_care',${evidenceId}::uuid
    )`;
    await sql`insert into identity.care_relationship_permissions(relationship_id,permission_code,created_by_person_id)
      values(${relationshipId}::uuid,'record.view',${guardianPersonId}::uuid)`;
    await sql`select set_config('shifaa.person_id','50000000-0000-4000-8000-000000000008',true)`;
    await sql`insert into identity.admin_role_grants(id,person_id,role_code,status,valid_from,valid_until,proposed_by)
      values(${grantId}::uuid,${reviewerPersonId}::uuid,'support_admin','pending','2026-01-01','2027-01-01','50000000-0000-4000-8000-000000000008')`;
    await sql`select set_config('shifaa.person_id','50000000-0000-4000-8000-000000000009',true)`;
    await sql`update identity.admin_role_grants set status='active',decided_by='50000000-0000-4000-8000-000000000009',
      decision_reason='synthetic.transition.assignment' where id=${grantId}::uuid`;
    await sql`insert into identity.identities(
      id,person_id,identity_type,ciphertext,nonce,authentication_tag,key_version,blind_index,masked_value,
      issuing_country,expires_on,verification_status
    ) values(
      ${identityId}::uuid,${subjectPersonId}::uuid,'egyptian_national_id',decode('01','hex'),decode(repeat('02',12),'hex'),
      decode(repeat('03',16),'hex'),1,decode(${Buffer.from(randomUUID()).toString('hex').slice(0, 64).padEnd(64, '0')},'hex'),
      '••••007','EG','2030-01-01','verified'
    )`;
    await sql`insert into identity.verification_cases(
      id,identity_id,provider,state,assigned_reviewer_person_id,reviewer_person_id,reason_code,decided_at
    ) values(
      ${verificationCaseId}::uuid,${identityId}::uuid,'manual','verified',${reviewerPersonId}::uuid,
      ${reviewerPersonId}::uuid,'synthetic.transition.proof',${now.toISOString()}::timestamptz
    )`;
    await sql`select set_config('shifaa.person_id',${reviewerPersonId},true),
      set_config('shifaa.actor_role','ADM-SUPPORT',true),set_config('shifaa.aal','2',true),
      set_config('shifaa.purposes','guardianship_review',true)`;
    await sql`update identity.care_relationships set status='active',valid_until='2027-01-01',
      reviewed_by_person_id=${reviewerPersonId}::uuid,reviewed_at=${now.toISOString()}::timestamptz,
      decision_reason_code='synthetic.transition.guardianship' where id=${relationshipId}::uuid`;
  });
  const [snapshot] = await owner`
    select
      (select md5(row(p.*)::text) from identity.people p where p.id=${subjectPersonId}::uuid) person_hash,
      (select md5(row(p.*)::text) from identity.patients p where p.id=${patientId}::uuid) patient_hash`;
  return {
    subjectPersonId,
    subjectAuthUserId,
    guardianPersonId,
    reviewerPersonId,
    reviewerAuthUserId,
    patientId,
    relationshipId,
    verificationCaseId,
    mrn,
    personHash: String(snapshot?.['person_hash']),
    patientHash: String(snapshot?.['patient_hash']),
    subjectToken: `synthetic-transition-subject-${randomUUID()}`,
    reviewerToken: `synthetic-transition-reviewer-${randomUUID()}`,
  };
}
