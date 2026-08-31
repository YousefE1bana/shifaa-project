import { createHash, timingSafeEqual } from 'node:crypto';

import type {
  ContinuityAuditInput,
  FactorChangedEvidence,
  ContinuityOutboxInput,
  ContinuityRepository,
  ContinuityRestriction,
  PendingEnrollmentMarker,
  FactorRemovalMarker,
  RefreshRotationMarker,
  RecoveryResumeMarker,
  TransitionMutationInput,
} from '../../modules/identity-continuity/index.js';
import type { TransitionResult } from '@shifaa/contracts/identity-continuity';
import { TransientReplayCipher } from '../../modules/identity-continuity/security.js';
import { ApiPolicyError } from '../../modules/identity-onboarding/errors.js';
import type { AuthSession, SessionAuthority } from '../../modules/identity-onboarding/ports.js';
import type { TransactionSql } from 'postgres';
import { PostgresIdentityRepository } from './identity-repository.js';

const PENDING_MARKER_ROUTE = '/v1/auth/mfa/enroll#pending-marker';
const RECOVERY_RESUME_ROUTE = '/v1/auth/recovery#resume-marker';
const REFRESH_RESUME_ROUTE = '/v1/auth/session/refresh#rotation-marker';
const FACTOR_REMOVAL_RESUME_ROUTE = '/v1/auth/mfa/factors/:factorId#removal-marker';
const TRANSITION_ROUTE = '/v1/guardianships/:relationshipId/transition';
const TRANSITION_RETENTION_MS = 24 * 60 * 60_000;

type StoredSealedMarker = {
  encoding: string;
  nonce: string;
  tag: string;
  ciphertext: string;
  expiresAt?: unknown;
};

export class PostgresIdentityContinuityService implements ContinuityRepository, SessionAuthority {
  private readonly cipher: TransientReplayCipher;

  public constructor(
    private readonly repository: PostgresIdentityRepository,
    transientKey: Uint8Array,
    private readonly environment: 'local' | 'ci' | 'production',
  ) {
    this.cipher = new TransientReplayCipher(transientKey);
  }

  public async isNativeSessionCurrent(
    sessionId: string,
    subjectId: string,
    claimedAal: 1 | 2,
  ): Promise<boolean> {
    try {
      return await this.repository.withRawTransaction(async (sql) => {
        await sql`select set_config('shifaa.claimed_aal',${`aal${claimedAal}`},true)`;
        const [row] = await sql<{ current: boolean }[]>`
          select platform.auth_session_is_current(${sessionId}::uuid,${subjectId}::uuid) current`;
        return row?.current === true;
      });
    } catch {
      throw new ApiPolicyError(
        'vendor-unavailable',
        503,
        'Native session validation is unavailable.',
      );
    }
  }

  public async restrictionForSession(
    sessionId: string,
    subjectId: string,
  ): Promise<ContinuityRestriction> {
    return this.repository.withRawTransaction(async (sql) => {
      const [mapping] = await sql<{ person_id: string | null }[]>`
        select platform.resolve_person_id(${subjectId}::uuid)::text person_id`;
      if (!mapping?.person_id) return null;
      await sql`
        select set_config('shifaa.person_id',${mapping.person_id},true),
               set_config('shifaa.actor_role','PAT',true),
               set_config('shifaa.aal','1',true),
               set_config('shifaa.purposes','',true),
               set_config('shifaa.session_id',${sessionId},true),
               set_config('shifaa.action','refreshSession',true)`;
      const [row] = await sql<{ restriction: ContinuityRestriction }[]>`
        select case when status='expired' then 'recovery_expired' else restriction_scope end restriction
        from identity.continuity_cases
        where subject_person_id=${mapping.person_id}::uuid
          and restriction_scope='mfa_enrollment_only'
          and (
            (status='proof_required' and bound_native_session_id is null)
            or (status='restricted_enrollment' and bound_native_session_id=${sessionId}::uuid)
            or (status='expired' and bound_native_session_id=${sessionId}::uuid)
          )
        limit 1`;
      return row?.restriction ?? null;
    });
  }

  public async authorize(session: AuthSession): Promise<'allowed' | 'revoked' | 'restricted'> {
    if (!session.sessionId) return 'revoked';
    const current = await this.isNativeSessionCurrent(
      session.sessionId,
      session.subjectId,
      session.aal,
    );
    if (!current) return 'revoked';
    const restriction = await this.restrictionForSession(session.sessionId, session.subjectId);
    return restriction ? 'restricted' : 'allowed';
  }

  public async withSerializedFactorState<T>(subjectId: string, work: () => Promise<T>): Promise<T> {
    return this.repository.withRawTransaction(async (sql) => {
      await sql`select pg_advisory_xact_lock(hashtextextended(${'identity-factor:' + subjectId},0))`;
      return work();
    });
  }

  public async withDurableSerializedFactorState<T>(
    subjectId: string,
    work: () => Promise<T>,
  ): Promise<T> {
    return this.repository.withSessionAdvisoryLock(`identity-factor:${subjectId}`, work);
  }

  public async appendAudit(input: ContinuityAuditInput): Promise<void> {
    await this.repository.withRawTransaction(async (sql) => {
      const digest = createHash('sha256').update(JSON.stringify(input)).digest('hex');
      await sql`
        insert into audit.events(
          event_hash,actor_person_id,action,resource_type,outcome,request_id,occurred_at,metadata
        ) values(
          ${digest},${input.actorPersonId}::uuid,${input.action},'native-session',${input.outcome},${input.requestId}::uuid,
          ${input.occurredAt}::timestamptz,${sql.json(input.metadata ?? {})}
        )`;
    });
  }

  public async appendFactorChangedEvidence(input: FactorChangedEvidence): Promise<void> {
    const prohibited = /secret|token|handle|code|password|proof|otp|credential|email|phone/i;
    const payloadKeys = Object.keys(input.event.payload).toSorted();
    if (
      payloadKeys.join(',') !== 'action_time,recipientPersonId,support_action' ||
      payloadKeys.some((key) => prohibited.test(key)) ||
      !/^[0-9a-f-]{36}$/i.test(input.event.payload.recipientPersonId) ||
      !Number.isFinite(Date.parse(input.event.payload.action_time))
    )
      throw new ApiPolicyError('event-payload-prohibited', 500, 'Prohibited event payload field.');
    await this.repository.withRawTransaction(async (sql) => {
      const digest = createHash('sha256').update(JSON.stringify(input.audit)).digest('hex');
      await sql`
        insert into audit.events(
          event_hash,actor_person_id,action,resource_type,outcome,request_id,occurred_at,metadata
        ) values(
          ${digest},${input.audit.actorPersonId}::uuid,${input.audit.action},'native-session',${input.audit.outcome},
          ${input.audit.requestId}::uuid,${input.audit.occurredAt}::timestamptz,
          ${sql.json(input.audit.metadata ?? {})}
        )`;
      await sql`
        insert into platform.outbox_events(
          aggregate_type,aggregate_id,event_type,payload,aggregate_version
        ) values(
          'identity-continuity',${input.event.aggregateId}::uuid,${input.event.eventType},
          ${sql.json(input.event.payload)},${input.event.aggregateVersion}
        )`;
    });
  }

  public findRefreshRotationMarker(markerKey: string): Promise<RefreshRotationMarker | undefined> {
    return this.findTransientMarker(REFRESH_RESUME_ROUTE, markerKey);
  }

  public saveRefreshRotationMarker(
    markerKey: string,
    marker: RefreshRotationMarker,
  ): Promise<void> {
    return this.saveTransientMarker(REFRESH_RESUME_ROUTE, markerKey, marker);
  }

  public async commitRefreshRotationEvidence(input: {
    markerKey: string;
    marker: RefreshRotationMarker;
    audit: ContinuityAuditInput;
  }): Promise<void> {
    await this.repository.withRawTransaction(async (sql) => {
      const digest = createHash('sha256').update(JSON.stringify(input.audit)).digest('hex');
      await sql`
        insert into audit.events(
          event_hash,actor_person_id,action,resource_type,outcome,request_id,occurred_at,metadata
        ) values(
          ${digest},${input.audit.actorPersonId}::uuid,${input.audit.action},'native-session',${input.audit.outcome},
          ${input.audit.requestId}::uuid,${input.audit.occurredAt}::timestamptz,
          ${sql.json(input.audit.metadata ?? {})}
        )`;
      await this.upsertTransientMarker(sql, REFRESH_RESUME_ROUTE, input.markerKey, input.marker);
    });
  }

  public findFactorRemovalMarker(markerKey: string): Promise<FactorRemovalMarker | undefined> {
    return this.findTransientMarker(FACTOR_REMOVAL_RESUME_ROUTE, markerKey);
  }

  public saveFactorRemovalMarker(markerKey: string, marker: FactorRemovalMarker): Promise<void> {
    return this.saveTransientMarker(FACTOR_REMOVAL_RESUME_ROUTE, markerKey, marker);
  }

  public async commitFactorRemoval(input: {
    markerKey: string;
    marker: FactorRemovalMarker & { result: NonNullable<FactorRemovalMarker['result']> };
    evidence: FactorChangedEvidence;
  }): Promise<void> {
    const prohibited = /secret|token|handle|code|password|proof|otp|credential|email|phone/i;
    const payloadKeys = Object.keys(input.evidence.event.payload).toSorted();
    if (
      payloadKeys.join(',') !== 'action_time,recipientPersonId,support_action' ||
      payloadKeys.some((key) => prohibited.test(key)) ||
      !/^[0-9a-f-]{36}$/i.test(input.evidence.event.payload.recipientPersonId) ||
      !Number.isFinite(Date.parse(input.evidence.event.payload.action_time))
    )
      throw new ApiPolicyError('event-payload-prohibited', 500, 'Prohibited event payload field.');
    await this.repository.withRawTransaction(async (sql) => {
      const auditDigest = createHash('sha256')
        .update(JSON.stringify(input.evidence.audit))
        .digest('hex');
      await sql`
        insert into audit.events(
          event_hash,actor_person_id,action,resource_type,outcome,request_id,occurred_at,metadata
        ) values(
          ${auditDigest},${input.evidence.audit.actorPersonId}::uuid,${input.evidence.audit.action},'native-factor',${input.evidence.audit.outcome},
          ${input.evidence.audit.requestId}::uuid,${input.evidence.audit.occurredAt}::timestamptz,
          ${sql.json(input.evidence.audit.metadata ?? {})}
        )`;
      await sql`
        insert into platform.outbox_events(
          aggregate_type,aggregate_id,event_type,payload,aggregate_version
        ) values(
          'identity-continuity',${input.evidence.event.aggregateId}::uuid,
          ${input.evidence.event.eventType},${sql.json(input.evidence.event.payload)},
          ${input.evidence.event.aggregateVersion}
        )`;
      await this.upsertTransientMarker(
        sql,
        FACTOR_REMOVAL_RESUME_ROUTE,
        input.markerKey,
        input.marker,
      );
    });
  }

  public async findPendingEnrollmentMarker(input: {
    markerKey: string;
    liveOnly: boolean;
  }): Promise<PendingEnrollmentMarker | undefined> {
    return this.repository.withRawTransaction(async (sql) => {
      const [{ principal: previousPrincipal } = { principal: '' }] = await sql<
        { principal: string }[]
      >`select coalesce(current_setting('shifaa.principal',true),'') principal`;
      await sql`select set_config('shifaa.principal',${input.markerKey},true)`;
      try {
        const rows = input.liveOnly
          ? await sql<
              { response_body: StoredSealedMarker; expires_at: string }[]
            >`select response_body,expires_at from platform.idempotency_records
              where principal=${input.markerKey} and route=${PENDING_MARKER_ROUTE}
                and state='completed' and expires_at>now()
              order by created_at desc limit 1`
          : await sql<
              { response_body: StoredSealedMarker; expires_at: string }[]
            >`select response_body,expires_at from platform.idempotency_records
              where principal=${input.markerKey} and route=${PENDING_MARKER_ROUTE}
                and state='completed'
              order by created_at desc limit 1`;
        const row = rows[0];
        if (!row?.response_body?.nonce || !row?.response_body?.ciphertext) return undefined;
        try {
          // Authenticity-only open: the row's expires_at governs liveness so the caller can
          // distinguish an expired enrollment (410) from a foreign or replayed id (422).
          const envelope = this.cipher.open(
            {
              encoding: 'aes-256-gcm-v1',
              nonce: String(row.response_body.nonce),
              tag: String(row.response_body.tag),
              ciphertext: String(row.response_body.ciphertext),
              expiresAt: String(row.response_body.expiresAt ?? ''),
            },
            new Date(0),
          ) as { enrollmentId?: unknown };
          if (typeof envelope.enrollmentId !== 'string') return undefined;
          return { enrollmentId: envelope.enrollmentId, expiresAtMs: Date.parse(row.expires_at) };
        } catch {
          return undefined;
        }
      } finally {
        await sql`select set_config('shifaa.principal',${previousPrincipal},true)`;
      }
    });
  }

  public async savePendingEnrollmentMarker(input: {
    markerKey: string;
    enrollmentId: string;
    expiresAt: string;
  }): Promise<void> {
    await this.repository.withRawTransaction(async (sql) => {
      const [{ principal: previousPrincipal } = { principal: '' }] = await sql<
        { principal: string }[]
      >`select coalesce(current_setting('shifaa.principal',true),'') principal`;
      await sql`select set_config('shifaa.principal',${input.markerKey},true)`;
      try {
        await sql`delete from platform.idempotency_records
          where principal=${input.markerKey} and route=${PENDING_MARKER_ROUTE}`;
        const sealed = this.cipher.seal(
          { enrollmentId: input.enrollmentId },
          new Date(input.expiresAt),
        );
        const sealedJson = sealed as unknown as Record<string, string>;
        const requestHash = createHash('sha256').update(input.enrollmentId).digest('hex');
        await sql`
          insert into platform.idempotency_records(
            principal,method,route,idempotency_key,request_hash,state,response_status,
            response_body,expires_at
          ) values(
            ${input.markerKey},'POST',${PENDING_MARKER_ROUTE},${input.enrollmentId},
            ${requestHash},'completed',200,${sql.json(sealedJson)},${input.expiresAt}::timestamptz
          )
          on conflict(principal,method,route,idempotency_key) do update
            set state='completed',response_status=200,response_body=${sql.json(sealedJson)},
                expires_at=${input.expiresAt}::timestamptz,updated_at=now()`;
      } finally {
        await sql`select set_config('shifaa.principal',${previousPrincipal},true)`;
      }
    });
  }

  public async consumePendingEnrollmentMarker(input: { markerKey: string }): Promise<void> {
    await this.repository.withRawTransaction(async (sql) => {
      const [{ principal: previousPrincipal } = { principal: '' }] = await sql<
        { principal: string }[]
      >`select coalesce(current_setting('shifaa.principal',true),'') principal`;
      await sql`select set_config('shifaa.principal',${input.markerKey},true)`;
      try {
        await sql`delete from platform.idempotency_records
          where principal=${input.markerKey} and route=${PENDING_MARKER_ROUTE}`;
      } finally {
        await sql`select set_config('shifaa.principal',${previousPrincipal},true)`;
      }
    });
  }

  public async resolveSubjectPerson(subjectId: string): Promise<string | undefined> {
    return this.repository.withRawTransaction(async (sql) => {
      const [mapping] = await sql<{ person_id: string | null }[]>`
        select platform.resolve_person_id(${subjectId}::uuid)::text person_id`;
      return mapping?.person_id ?? undefined;
    });
  }

  public async accountClassForPerson(
    personId: string,
  ): Promise<'patient_optional_mfa' | 'workforce_mandatory_mfa'> {
    return this.repository.withRawTransaction(async (sql) => {
      await sql`select set_config('shifaa.person_id',${personId},true)`;
      const [row] = await sql<{ mandatory: boolean }[]>`
        select platform.person_requires_mandatory_mfa(${personId}::uuid) mandatory`;
      return row?.mandatory ? 'workforce_mandatory_mfa' : 'patient_optional_mfa';
    });
  }

  public async factorRemovalProofIsApproved(input: {
    personId: string;
    verificationCaseId: string;
  }): Promise<boolean> {
    return this.repository.withRawTransaction(async (sql) => {
      await sql`select set_config('shifaa.person_id',${input.personId},true),
                       set_config('shifaa.actor_role','PAT',true),
                       set_config('shifaa.aal','2',true),
                       set_config('shifaa.purposes','account_security',true),
                       set_config('shifaa.action','removeMfaFactor',true)`;
      const [row] = await sql<{ approved: boolean }[]>`
        select exists(
          select 1 from identity.verification_cases c
          join identity.identities i on i.id=c.identity_id
          where c.id=${input.verificationCaseId}::uuid and i.person_id=${input.personId}::uuid
            and c.state='verified' and c.decided_at is not null
            and i.verification_status='verified'
            and (i.expires_on is null or i.expires_on>=(platform.context_now() at time zone 'Africa/Cairo')::date)
        ) approved`;
      return row?.approved === true;
    });
  }

  public async completeRestrictedEnrollmentCase(input: {
    sessionId: string;
    subjectId: string;
    requestId: string;
    occurredAt: string;
  }): Promise<void> {
    await this.repository.withRawTransaction(async (sql) => {
      const [mapping] = await sql<{ person_id: string | null }[]>`
        select platform.resolve_person_id(${input.subjectId}::uuid)::text person_id`;
      if (!mapping?.person_id)
        throw new ApiPolicyError(
          'state-transition-invalid',
          409,
          'The recovery case is unavailable.',
        );
      await sql`
        select set_config('shifaa.person_id',${mapping.person_id},true),
               set_config('shifaa.actor_role','PAT',true),
               set_config('shifaa.aal','2',true),
               set_config('shifaa.purposes','',true),
               set_config('shifaa.session_id',${input.sessionId},true),
               set_config('shifaa.action','verifyMfaEnrollment',true)`;
      const completed = await sql`
        update identity.continuity_cases
        set status='completed',restriction_scope=NULL,bound_native_session_id=NULL,
            completed_at=${input.occurredAt}::timestamptz,updated_at=${input.occurredAt}::timestamptz
        where status='restricted_enrollment'
          and bound_native_session_id=${input.sessionId}::uuid
          and case_type='account_recovery'
        returning id,version`;
      if (completed.length !== 1)
        throw new ApiPolicyError(
          'state-transition-invalid',
          409,
          'The restricted enrollment case could not be completed.',
        );
      const audit = {
        requestId: input.requestId,
        action: 'identity.recovery.enrollment_completed',
        outcome: 'succeeded',
        occurredAt: input.occurredAt,
      };
      const digest = createHash('sha256').update(JSON.stringify(audit)).digest('hex');
      await sql`
        insert into audit.events(
          event_hash,actor_person_id,action,resource_type,resource_id,outcome,request_id,occurred_at,metadata
        ) values(
          ${digest},${mapping.person_id}::uuid,${audit.action},'continuity-case',${completed[0]?.['id']}::uuid,${audit.outcome},
          ${input.requestId}::uuid,${input.occurredAt}::timestamptz,${sql.json({})}
        )`;
      await sql`
        insert into platform.outbox_events(aggregate_type,aggregate_id,event_type,payload,aggregate_version)
        values(
          'identity-continuity',${completed[0]?.['id']}::uuid,'identity.recovery.completed',
          ${sql.json({ support_action: 'completed', action_time: input.occurredAt })},${completed[0]?.['version']}
        )`;
    });
  }

  public async appendOutboxEvent(input: ContinuityOutboxInput): Promise<void> {
    const prohibited = ['secret', 'token', 'handle', 'code', 'password', 'proof'];
    if (Object.keys(input.payload).some((key) => prohibited.includes(key.toLowerCase())))
      throw new ApiPolicyError('event-payload-prohibited', 500, 'Prohibited event payload field.');
    await this.repository.withRawTransaction(async (sql) => {
      await sql`
        insert into platform.outbox_events(aggregate_type,aggregate_id,event_type,payload,aggregate_version)
        values(
          'identity-continuity',${input.aggregateId}::uuid,${input.eventType},
          ${sql.json(input.payload)},${input.aggregateVersion}
        )`;
    });
  }

  public async createRecoveryIntake(input: {
    caseId: string;
    handleDigest: Uint8Array;
    caseTokenDigest: Uint8Array;
    expiresAt: string;
  }): Promise<void> {
    await this.repository.withRawTransaction(async (sql) => {
      await sql`select set_config('shifaa.action','startRecovery',true)`;
      await sql`
        insert into identity.continuity_cases(
          id,case_type,status,public_token_digest,recovery_handle_digest,token_key_version,expires_at
        ) values(
          ${input.caseId}::uuid,'account_recovery','requested',${Buffer.from(input.caseTokenDigest)},
          ${Buffer.from(input.handleDigest)},1,${input.expiresAt}::timestamptz
        )`;
    });
  }

  public async bindRecoveryIntake(input: {
    caseId: string;
    subjectId: string;
    handleDigest: Uint8Array;
    caseTokenDigest: Uint8Array;
  }): Promise<{ personId: string }> {
    return this.repository.withRawTransaction(async (sql) => {
      await sql`
        select set_config('shifaa.action','completeRecovery',true),
               set_config('shifaa.case_id',${input.caseId},true)`;
      const [recoveryCase] = await sql<
        {
          id: string;
          status: string;
          expires_at: string;
          public_token_digest: Uint8Array;
          recovery_handle_digest: Uint8Array;
          subject_person_id: string | null;
        }[]
      >`
        select id,status,expires_at,public_token_digest,recovery_handle_digest,subject_person_id::text
        from identity.continuity_cases where id=${input.caseId}::uuid for update`;
      if (
        !recoveryCase ||
        !['requested', 'proof_required'].includes(recoveryCase.status) ||
        new Date(recoveryCase.expires_at) <= new Date()
      )
        throw new ApiPolicyError(
          'recovery-challenge-invalid',
          401,
          'The recovery case is invalid or expired.',
        );
      const tokenMatches = timingSafeEqual(
        Buffer.from(recoveryCase.public_token_digest),
        Buffer.from(input.caseTokenDigest),
      );
      const handleMatches = timingSafeEqual(
        Buffer.from(recoveryCase.recovery_handle_digest),
        Buffer.from(input.handleDigest),
      );
      if (!tokenMatches || !handleMatches)
        throw new ApiPolicyError(
          'recovery-challenge-invalid',
          401,
          'The recovery case is invalid or expired.',
        );
      const [mapping] = await sql<{ person_id: string | null }[]>`
        select platform.resolve_person_id(${input.subjectId}::uuid)::text person_id`;
      if (!mapping?.person_id)
        throw new ApiPolicyError(
          'recovery-challenge-invalid',
          401,
          'The recovery case is invalid or expired.',
        );
      if (recoveryCase.status === 'proof_required') {
        if (recoveryCase.subject_person_id !== mapping.person_id)
          throw new ApiPolicyError(
            'recovery-challenge-invalid',
            401,
            'The recovery case is invalid or expired.',
          );
        return { personId: mapping.person_id };
      }
      const updated = await sql`
        update identity.continuity_cases
        set subject_person_id=${mapping.person_id}::uuid,status='proof_required',version=version+1,updated_at=now()
        where id=${input.caseId}::uuid and status='requested'
        returning id`;
      if (updated.length !== 1)
        throw new ApiPolicyError(
          'state-transition-invalid',
          409,
          'The recovery case is unavailable.',
        );
      return { personId: mapping.person_id };
    });
  }

  public async findRecoveryResumeMarker(caseId: string): Promise<RecoveryResumeMarker | undefined> {
    return this.repository.withRawTransaction(async (sql) => {
      const principal = `recovery-resume:${caseId}`;
      const [{ principal: previousPrincipal } = { principal: '' }] = await sql<
        { principal: string }[]
      >`select coalesce(current_setting('shifaa.principal',true),'') principal`;
      await sql`select set_config('shifaa.principal',${principal},true)`;
      try {
        const [row] = await sql<{ response_body: StoredSealedMarker; expires_at: string }[]>`
          select response_body,expires_at from platform.idempotency_records
          where principal=${principal} and route=${RECOVERY_RESUME_ROUTE}
            and idempotency_key=${caseId} and state='completed' and expires_at>now()`;
        if (!row?.response_body) return undefined;
        return this.cipher.open<RecoveryResumeMarker>(
          {
            encoding: 'aes-256-gcm-v1',
            nonce: String(row.response_body.nonce),
            tag: String(row.response_body.tag),
            ciphertext: String(row.response_body.ciphertext),
            expiresAt: String(row.response_body.expiresAt ?? row.expires_at),
          },
          new Date(),
        );
      } catch (error) {
        if (error instanceof ApiPolicyError && error.code === 'idempotency-replay-expired')
          return undefined;
        throw error;
      } finally {
        await sql`select set_config('shifaa.principal',${previousPrincipal},true)`;
      }
    });
  }

  public async saveRecoveryResumeMarker(
    caseId: string,
    marker: RecoveryResumeMarker,
  ): Promise<void> {
    await this.repository.withRawTransaction(async (sql) => {
      const principal = `recovery-resume:${caseId}`;
      const [{ principal: previousPrincipal } = { principal: '' }] = await sql<
        { principal: string }[]
      >`select coalesce(current_setting('shifaa.principal',true),'') principal`;
      await sql`select set_config('shifaa.principal',${principal},true)`;
      try {
        const sealed = this.cipher.seal(marker, new Date(marker.expiresAt));
        const sealedJson = sealed as unknown as Record<string, string>;
        const requestHash = createHash('sha256').update(caseId).digest('hex');
        await sql`
          insert into platform.idempotency_records(
            principal,method,route,idempotency_key,request_hash,state,response_status,
            response_body,resource_type,expires_at
          ) values(
            ${principal},'POST',${RECOVERY_RESUME_ROUTE},${caseId},${requestHash},'completed',200,
            ${sql.json(sealedJson)},'recovery-resume-marker',${marker.expiresAt}::timestamptz
          )
          on conflict(principal,method,route,idempotency_key) do update
            set state='completed',response_status=200,response_body=${sql.json(sealedJson)},
                resource_type='recovery-resume-marker',expires_at=${marker.expiresAt}::timestamptz,
                updated_at=now()`;
      } finally {
        await sql`select set_config('shifaa.principal',${previousPrincipal},true)`;
      }
    });
  }

  public async recoveryProofIsApproved(input: {
    recoveryCaseId: string;
    personId: string;
    verificationCaseId: string;
  }): Promise<boolean> {
    return this.repository.withRawTransaction(async (sql) => {
      await sql`
        select set_config('shifaa.person_id',${input.personId},true),
               set_config('shifaa.actor_role','PAT',true),
               set_config('shifaa.aal','1',true),
               set_config('shifaa.purposes','',true),
               set_config('shifaa.action','completeRecovery',true)`;
      const [proof] = await sql<{ approved: boolean }[]>`
        select exists(
          select 1 from identity.verification_cases c
          join identity.identities i on i.id=c.identity_id
          join identity.continuity_cases r on r.id=${input.recoveryCaseId}::uuid
          where c.id=${input.verificationCaseId}::uuid
            and i.person_id=${input.personId}::uuid
            and r.case_type='account_recovery' and r.subject_person_id=${input.personId}::uuid
            and r.status='proof_required' and r.verification_case_id=c.id
            and r.recovery_proof_purpose_code='account_recovery_reproof'
            and c.created_at>=r.created_at
            and c.state='verified' and c.decided_at is not null
            and i.verification_status='verified'
            and (i.expires_on is null or i.expires_on>=(platform.context_now() at time zone 'Africa/Cairo')::date)
        ) approved`;
      return proof?.approved === true;
    });
  }

  public async installRecoveryProofGrant(input: {
    recoveryCaseId: string;
    personId: string;
    grantDigest: Uint8Array;
    expiresAt: string;
  }): Promise<void> {
    await this.repository.withRawTransaction(async (sql) => {
      await sql`select set_config('shifaa.person_id',${input.personId},true),
                       set_config('shifaa.actor_role','PAT',true),
                       set_config('shifaa.aal','1',true),
                       set_config('shifaa.purposes','account_recovery_reproof',true),
                       set_config('shifaa.action','completeRecovery',true)`;
      const rows = await sql`
        update identity.continuity_cases
        set recovery_proof_grant_digest=${Buffer.from(input.grantDigest)},
            recovery_proof_grant_expires_at=${input.expiresAt}::timestamptz,
            recovery_proof_grant_consumed_at=null,
            recovery_proof_purpose_code='account_recovery_reproof',updated_at=now()
        where id=${input.recoveryCaseId}::uuid and subject_person_id=${input.personId}::uuid
          and case_type='account_recovery' and status='proof_required' and expires_at>now()
          and verification_case_id is null and recovery_proof_grant_consumed_at is null
          and (recovery_proof_grant_digest is null or recovery_proof_grant_expires_at<=now())
        returning id`;
      if (rows.length === 1) return;
      const [existing] = await sql`
        select id from identity.continuity_cases
        where id=${input.recoveryCaseId}::uuid and subject_person_id=${input.personId}::uuid
          and case_type='account_recovery' and status='proof_required' and expires_at>now()
          and verification_case_id is null and recovery_proof_grant_consumed_at is null
          and recovery_proof_grant_digest=${Buffer.from(input.grantDigest)}
          and recovery_proof_purpose_code='account_recovery_reproof'
          and recovery_proof_grant_expires_at=${input.expiresAt}::timestamptz`;
      if (!existing) throw this.invalidRecoveryProofGrant();
    });
  }

  public async authorizeRecoveryProofGrant(input: { grantDigest: Uint8Array }): Promise<{
    recoveryCaseId: string;
    personId: string;
    principal: string;
  }> {
    return this.repository.withRawTransaction(async (sql) => {
      const [row] = await sql<{ recovery_case_id: string; person_id: string }[]>`
        select * from platform.authorize_recovery_proof_grant(${Buffer.from(input.grantDigest)})`;
      if (!row) throw this.invalidRecoveryProofGrant();
      return {
        recoveryCaseId: row.recovery_case_id,
        personId: row.person_id,
        principal: `recovery-proof:${Buffer.from(input.grantDigest).toString('hex')}`,
      };
    });
  }

  public async lockRecoveryProofGrant(input: {
    grantDigest: Uint8Array;
    recoveryCaseId: string;
    personId: string;
  }): Promise<void> {
    await this.repository.withRawTransaction(async (sql) => {
      await sql`select set_config('shifaa.person_id',${input.personId},true),
                       set_config('shifaa.actor_role','PAT',true),
                       set_config('shifaa.aal','1',true),
                       set_config('shifaa.purposes','account_recovery_reproof',true),
                       set_config('shifaa.action','completeRecovery',true),
                       set_config('shifaa.case_id',${input.recoveryCaseId},true)`;
      const [row] = await sql<{ digest: Uint8Array }[]>`
        select recovery_proof_grant_digest digest from identity.continuity_cases
        where id=${input.recoveryCaseId}::uuid and subject_person_id=${input.personId}::uuid
          and case_type='account_recovery' and status='proof_required'
          and verification_case_id is null and recovery_proof_grant_consumed_at is null
          and recovery_proof_grant_expires_at>now() and expires_at>now() for update`;
      if (!row || !timingSafeEqual(Buffer.from(row.digest), Buffer.from(input.grantDigest)))
        throw this.invalidRecoveryProofGrant();
    });
  }

  public async consumeRecoveryProofGrant(input: {
    recoveryCaseId: string;
    personId: string;
    verificationCaseId: string;
  }): Promise<void> {
    await this.repository.withRawTransaction(async (sql) => {
      await sql`select set_config('shifaa.person_id',${input.personId},true),
                       set_config('shifaa.actor_role','PAT',true),
                       set_config('shifaa.aal','1',true),
                       set_config('shifaa.purposes','account_recovery_reproof',true),
                       set_config('shifaa.action','completeRecovery',true),
                       set_config('shifaa.case_id',${input.recoveryCaseId},true)`;
      const rows = await sql`
        update identity.continuity_cases
        set verification_case_id=${input.verificationCaseId}::uuid,
            recovery_proof_grant_consumed_at=now(),updated_at=now()
        where id=${input.recoveryCaseId}::uuid and subject_person_id=${input.personId}::uuid
          and case_type='account_recovery' and status='proof_required'
          and verification_case_id is null and recovery_proof_grant_consumed_at is null
        returning id`;
      if (rows.length !== 1) throw this.invalidRecoveryProofGrant();
    });
  }

  private invalidRecoveryProofGrant(): ApiPolicyError {
    return new ApiPolicyError(
      'identity-proof-required',
      403,
      'A repeated identity proof is required.',
    );
  }

  public async stageRecoveryRestriction(input: {
    caseId: string;
    personId: string;
  }): Promise<void> {
    await this.repository.withRawTransaction(async (sql) => {
      await sql`
        select set_config('shifaa.person_id',${input.personId},true),
               set_config('shifaa.actor_role','PAT',true),
               set_config('shifaa.aal','1',true),
               set_config('shifaa.purposes','',true),
               set_config('shifaa.action','completeRecovery',true),
               set_config('shifaa.case_id',${input.caseId},true)`;
      const staged = await sql`
        update identity.continuity_cases
        set restriction_scope='mfa_enrollment_only',version=version+1,updated_at=now()
        where id=${input.caseId}::uuid and subject_person_id=${input.personId}::uuid
          and status='proof_required'
        returning id`;
      if (staged.length !== 1)
        throw new ApiPolicyError(
          'state-transition-invalid',
          409,
          'The recovery restriction could not be staged.',
        );
    });
  }

  public async finalizeRecovery(input: {
    caseId: string;
    personId: string;
    sessionId: string;
    restricted: boolean;
    requestId: string;
    occurredAt: string;
  }): Promise<void> {
    await this.repository.withRawTransaction(async (sql) => {
      await sql`
        select set_config('shifaa.person_id',${input.personId},true),
               set_config('shifaa.actor_role','PAT',true),
               set_config('shifaa.aal','1',true),
               set_config('shifaa.purposes','',true),
               set_config('shifaa.action','completeRecovery',true),
               set_config('shifaa.case_id',${input.caseId},true)`;
      const completed = await sql`
        update identity.continuity_cases
        set status=${input.restricted ? 'restricted_enrollment' : 'completed'},
            restriction_scope=${input.restricted ? 'mfa_enrollment_only' : null},
            bound_native_session_id=${input.restricted ? input.sessionId : null}::uuid,
            completed_at=${input.restricted ? null : input.occurredAt}::timestamptz,
            recovery_proof_grant_digest=null,recovery_proof_grant_expires_at=null,
            recovery_proof_grant_consumed_at=null,
            version=version+1,updated_at=now()
        where id=${input.caseId}::uuid and subject_person_id=${input.personId}::uuid
          and status='proof_required'
        returning id,version`;
      if (completed.length !== 1)
        throw new ApiPolicyError(
          'state-transition-invalid',
          409,
          'The recovery case is unavailable.',
        );
      const audit = {
        requestId: input.requestId,
        action: 'identity.recovery.completed',
        outcome: 'succeeded',
        occurredAt: input.occurredAt,
      };
      const digest = createHash('sha256').update(JSON.stringify(audit)).digest('hex');
      await sql`
        insert into audit.events(
          event_hash,actor_person_id,action,resource_type,resource_id,outcome,request_id,occurred_at,metadata
        ) values(
          ${digest},${input.personId}::uuid,${audit.action},'continuity-case',${input.caseId}::uuid,
          ${audit.outcome},${input.requestId}::uuid,${input.occurredAt}::timestamptz,
          ${sql.json({ restricted: input.restricted })}
        )`;
      if (!input.restricted) {
        await sql`
          insert into platform.outbox_events(aggregate_type,aggregate_id,event_type,payload,aggregate_version)
          values(
            'identity-continuity',${input.caseId}::uuid,'identity.recovery.completed',
            ${sql.json({ support_action: 'completed', action_time: input.occurredAt })},${completed[0]!['version']}
          )`;
      }
      const markerPrincipal = `recovery-resume:${input.caseId}`;
      const [{ principal: previousPrincipal } = { principal: '' }] = await sql<
        { principal: string }[]
      >`select coalesce(current_setting('shifaa.principal',true),'') principal`;
      await sql`select set_config('shifaa.principal',${markerPrincipal},true)`;
      try {
        await sql`delete from platform.idempotency_records
          where principal=${markerPrincipal} and route=${RECOVERY_RESUME_ROUTE}
            and idempotency_key=${input.caseId}`;
      } finally {
        await sql`select set_config('shifaa.principal',${previousPrincipal},true)`;
      }
    });
  }

  public async submitTransitionProof(
    input: TransitionMutationInput & { verificationCaseId: string },
  ): Promise<TransitionResult> {
    return this.transitionTransaction(input, 'submit_proof');
  }

  public async decideTransition(
    input: TransitionMutationInput & {
      decision: 'approve' | 'reject' | 'defer';
      reasonCode: string;
    },
  ): Promise<TransitionResult> {
    return this.transitionTransaction(input, 'decide');
  }

  private async transitionTransaction(
    input: TransitionMutationInput,
    action: 'submit_proof' | 'decide',
  ): Promise<TransitionResult> {
    try {
      return await this.repository.withRawTransaction(async (sql) => {
        const role = action === 'decide' ? 'ADM-SUPPORT' : 'PAT';
        const requestHash = createHash('sha256')
          .update(
            JSON.stringify({
              action,
              relationshipId: input.relationshipId,
              expectedVersion: input.expectedVersion,
              verificationCaseId: input.verificationCaseId ?? null,
              decision: input.decision ?? null,
              reasonCode: input.reasonCode ?? null,
              reviewRequiredReason: input.reviewRequiredReason ?? null,
            }),
          )
          .digest('hex');
        const expiresAt = new Date(
          Date.parse(input.occurredAt) + TRANSITION_RETENTION_MS,
        ).toISOString();
        await sql`
          select set_config('shifaa.person_id',${input.actorPersonId},true),
                 set_config('shifaa.environment',${this.environment},true),
                 set_config('shifaa.actor_role',${role},true),
                 set_config('shifaa.aal',${String(input.aal ?? 1)},true),
                 set_config('shifaa.purposes',${input.purpose ?? ''},true),
                 set_config('shifaa.action','transitionDependent',true),
                 set_config('shifaa.factor_amr_at',${input.factorAmrAt ?? ''},true),
                 set_config('shifaa.test_now',${input.occurredAt},true),
                 set_config('shifaa.principal',${input.idempotencyPrincipal},true)`;
        await sql`
          delete from platform.idempotency_records
          where principal=${input.idempotencyPrincipal} and method='POST'
            and route=${TRANSITION_ROUTE} and expires_at<=${input.occurredAt}::timestamptz`;
        await sql`
          insert into platform.idempotency_records(
            principal,method,route,idempotency_key,request_hash,state,expires_at
          ) values(
            ${input.idempotencyPrincipal},'POST',${TRANSITION_ROUTE},${input.idempotencyKey},
            ${requestHash},'processing',${expiresAt}::timestamptz
          ) on conflict(principal,method,route,idempotency_key) do nothing`;
        const [idempotency] = await sql<TransitionIdempotencyRow[]>`
          select id,request_hash,state,response_body from platform.idempotency_records
          where principal=${input.idempotencyPrincipal} and method='POST' and route=${TRANSITION_ROUTE}
            and idempotency_key=${input.idempotencyKey} for update`;
        if (!idempotency) throw new Error('Transition idempotency record could not be locked.');
        if (idempotency.request_hash !== requestHash)
          throw new ApiPolicyError(
            'idempotency-key-reused',
            409,
            'Use a new Idempotency-Key when the transition request changes.',
          );
        if (idempotency.state === 'completed')
          return this.cipher.open(
            idempotency.response_body as Parameters<TransientReplayCipher['open']>[0],
            new Date(input.occurredAt),
          ) as TransitionResult;
        const rows =
          action === 'submit_proof'
            ? await sql<TransitionRow[]>`
              select id,relationship_id,subject_patient_id,subject_person_id,status,version,updated_at
              from platform.submit_dependent_transition(
                ${input.relationshipId}::uuid,${input.verificationCaseId!}::uuid,${input.expectedVersion}
              )`
            : await sql<TransitionRow[]>`
              select id,relationship_id,subject_patient_id,subject_person_id,status,version,updated_at
              from platform.decide_dependent_transition(
                ${input.relationshipId}::uuid,${input.expectedVersion},${input.decision!},
                ${input.reasonCode!},${input.reviewRequiredReason ?? null}
              )`;
        const transition = rows[0];
        if (!transition)
          throw new ApiPolicyError(
            'state-transition-invalid',
            409,
            'The transition is unavailable.',
          );
        const eventType =
          action === 'submit_proof'
            ? 'identity.transition.submitted'
            : 'identity.transition.decided';
        const audit = {
          requestId: input.requestId,
          action: eventType,
          outcome: 'succeeded',
          occurredAt: input.occurredAt,
          caseId: transition.id,
          version: transition.version,
        };
        const digest = createHash('sha256').update(JSON.stringify(audit)).digest('hex');
        await sql`
          insert into audit.events(
            event_hash,actor_person_id,action,resource_type,resource_id,outcome,request_id,
            occurred_at,metadata
          ) values(
            ${digest},${input.actorPersonId}::uuid,${eventType},'continuity-case',
            ${transition.id}::uuid,'succeeded',${input.requestId}::uuid,
            ${input.occurredAt}::timestamptz,${sql.json({ version: transition.version })}
          )`;
        await sql`
          insert into platform.outbox_events(
            aggregate_type,aggregate_id,event_type,payload,aggregate_version
          ) values(
            'identity-continuity',${transition.id}::uuid,${eventType},
            ${sql.json({ case_status: transition.status, action_time: input.occurredAt })},
            ${transition.version}
          )`;
        const result: TransitionResult = {
          caseId: transition.id,
          relationshipId: transition.relationship_id,
          patientId: transition.subject_patient_id,
          personId: transition.subject_person_id,
          status: transition.status,
          version: transition.version,
          updatedAt: new Date(transition.updated_at).toISOString(),
        };
        const protectedResult = this.cipher.seal(result, new Date(expiresAt)) as unknown as Record<
          string,
          string
        >;
        await sql`
          update platform.idempotency_records set state='completed',response_status=200,
            response_headers=${sql.json({ 'cache-control': 'private, no-store' })},
            response_body=${sql.json(protectedResult)},updated_at=now()
          where id=${idempotency.id}::uuid`;
        return result;
      });
    } catch (error) {
      if (error instanceof ApiPolicyError) throw error;
      const code = postgresErrorCode(error);
      if (code === '40001')
        throw new ApiPolicyError(
          'version-conflict',
          409,
          'Refresh the transition before deciding.',
        );
      if (code === '42501')
        throw new ApiPolicyError(
          'forbidden',
          403,
          'The transition actor or evidence is not authorized.',
        );
      if (code === '23514' || code === 'P0002')
        throw new ApiPolicyError(
          'state-transition-invalid',
          409,
          'The transition state is unavailable.',
        );
      throw error;
    }
  }

  private async findTransientMarker<T extends { expiresAt: string }>(
    route: string,
    markerKey: string,
  ): Promise<T | undefined> {
    return this.repository.withRawTransaction(async (sql) => {
      const principal = `continuity-resume:${markerKey}`;
      const [{ principal: previousPrincipal } = { principal: '' }] = await sql<
        { principal: string }[]
      >`select coalesce(current_setting('shifaa.principal',true),'') principal`;
      await sql`select set_config('shifaa.principal',${principal},true)`;
      try {
        const [row] = await sql<{ response_body: StoredSealedMarker; expires_at: string }[]>`
          select response_body,expires_at from platform.idempotency_records
          where principal=${principal} and route=${route} and idempotency_key=${markerKey}
            and state='completed' and expires_at>now()`;
        if (!row?.response_body) return undefined;
        return this.cipher.open<T>(
          {
            encoding: 'aes-256-gcm-v1',
            nonce: String(row.response_body.nonce),
            tag: String(row.response_body.tag),
            ciphertext: String(row.response_body.ciphertext),
            expiresAt: String(row.response_body.expiresAt ?? row.expires_at),
          },
          new Date(),
        );
      } catch (error) {
        if (error instanceof ApiPolicyError && error.code === 'idempotency-replay-expired')
          return undefined;
        throw error;
      } finally {
        await sql`select set_config('shifaa.principal',${previousPrincipal},true)`;
      }
    });
  }

  private async saveTransientMarker<T extends { expiresAt: string }>(
    route: string,
    markerKey: string,
    marker: T,
  ): Promise<void> {
    await this.repository.withRawTransaction((sql) =>
      this.upsertTransientMarker(sql, route, markerKey, marker),
    );
  }

  private async upsertTransientMarker<T extends { expiresAt: string }>(
    sql: TransactionSql,
    route: string,
    markerKey: string,
    marker: T,
  ): Promise<void> {
    const principal = `continuity-resume:${markerKey}`;
    const [{ principal: previousPrincipal } = { principal: '' }] = await sql<
      { principal: string }[]
    >`select coalesce(current_setting('shifaa.principal',true),'') principal`;
    await sql`select set_config('shifaa.principal',${principal},true)`;
    try {
      const sealed = this.cipher.seal(marker, new Date(marker.expiresAt));
      const requestHash = createHash('sha256').update(markerKey).digest('hex');
      await sql`
        insert into platform.idempotency_records(
          principal,method,route,idempotency_key,request_hash,state,response_status,
          response_body,resource_type,expires_at
        ) values(
          ${principal},'POST',${route},${markerKey},${requestHash},'completed',200,
          ${sql.json(sealed as unknown as Record<string, string>)},'continuity-resume-marker',
          ${marker.expiresAt}::timestamptz
        )
        on conflict(principal,method,route,idempotency_key) do update
          set state='completed',response_status=200,response_body=excluded.response_body,
              resource_type='continuity-resume-marker',expires_at=excluded.expires_at,
              updated_at=now()`;
    } finally {
      await sql`select set_config('shifaa.principal',${previousPrincipal},true)`;
    }
  }
}

type TransitionRow = {
  id: string;
  relationship_id: string;
  subject_patient_id: string;
  subject_person_id: string;
  status: TransitionResult['status'];
  version: number;
  updated_at: string | Date;
};

type TransitionIdempotencyRow = {
  id: string;
  request_hash: string;
  state: 'processing' | 'completed';
  response_body: unknown;
};

function postgresErrorCode(error: unknown): string | undefined {
  return typeof error === 'object' && error !== null && 'code' in error
    ? String((error as { code?: unknown }).code)
    : undefined;
}
