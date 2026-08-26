import { createHash } from 'node:crypto';

import type {
  ContinuityAuditInput,
  ContinuityOutboxInput,
  ContinuityRepository,
  ContinuityRestriction,
  PendingEnrollmentMarker,
} from '../../modules/identity-continuity/index.js';
import { TransientReplayCipher } from '../../modules/identity-continuity/security.js';
import { ApiPolicyError } from '../../modules/identity-onboarding/errors.js';
import { PostgresIdentityRepository } from './identity-repository.js';

const PENDING_MARKER_ROUTE = '/v1/auth/mfa/enroll#pending-marker';

type StoredSealedMarker = {
  encoding: string;
  nonce: string;
  tag: string;
  ciphertext: string;
  expiresAt?: unknown;
};

export class PostgresIdentityContinuityService implements ContinuityRepository {
  private readonly cipher: TransientReplayCipher;

  public constructor(
    private readonly repository: PostgresIdentityRepository,
    transientKey: Uint8Array,
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
      const [row] = await sql<{ restriction_scope: ContinuityRestriction }[]>`
        select restriction_scope
        from identity.continuity_cases
        where subject_person_id=${mapping.person_id}::uuid
          and bound_native_session_id=${sessionId}::uuid
          and status='restricted_enrollment'
        limit 1`;
      return row?.restriction_scope ?? null;
    });
  }

  public async withSerializedFactorState<T>(subjectId: string, work: () => Promise<T>): Promise<T> {
    return this.repository.withRawTransaction(async (sql) => {
      await sql`select pg_advisory_xact_lock(hashtextextended(${'identity-factor:' + subjectId},0))`;
      return work();
    });
  }

  public async appendAudit(input: ContinuityAuditInput): Promise<void> {
    await this.repository.withRawTransaction(async (sql) => {
      const digest = createHash('sha256').update(JSON.stringify(input)).digest('hex');
      await sql`
        insert into audit.events(
          event_hash,action,resource_type,outcome,request_id,occurred_at,metadata
        ) values(
          ${digest},${input.action},'native-session',${input.outcome},${input.requestId}::uuid,
          ${input.occurredAt}::timestamptz,${sql.json(input.metadata ?? {})}
        )`;
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
          where principal=${input.markerKey} and route=${PENDING_MARKER_ROUTE}
            and expires_at<=now()`;
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
      const [row] = await sql<{ mandatory: boolean }[]>`
        select platform.person_requires_mandatory_mfa(${personId}::uuid) mandatory`;
      return row?.mandatory ? 'workforce_mandatory_mfa' : 'patient_optional_mfa';
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
        set status='completed',completed_at=${input.occurredAt}::timestamptz
        where status='restricted_enrollment'
          and bound_native_session_id=${input.sessionId}::uuid
          and case_type='account_recovery'
        returning id`;
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
          event_hash,action,resource_type,resource_id,outcome,request_id,occurred_at,metadata
        ) values(
          ${digest},${audit.action},'continuity-case',${completed[0]?.['id']}::uuid,${audit.outcome},
          ${input.requestId}::uuid,${input.occurredAt}::timestamptz,${sql.json({})}
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

  public async commitTransitionDecision(input: {
    caseId: string;
    expectedVersion: number;
    actorPersonId: string;
    reasonCode: string;
    requestId: string;
    occurredAt: string;
  }): Promise<{ caseId: string; relationshipId: string; version: number }> {
    return this.repository.withRawTransaction(async (sql) => {
      await sql`
        select set_config('shifaa.person_id',${input.actorPersonId},true),
               set_config('shifaa.actor_role','ADM-SUPPORT',true),
               set_config('shifaa.aal','2',true),
               set_config('shifaa.purposes','guardianship_review',true),
               set_config('shifaa.action','transitionDependent',true),
               set_config('shifaa.test_now',${input.occurredAt},true)`;
      const [transition] = await sql<
        { id: string; relationship_id: string; version: number }[]
      >`select id,relationship_id,version from platform.approve_dependent_transition(
          ${input.caseId}::uuid,${input.expectedVersion},${input.reasonCode}
        )`;
      if (!transition)
        throw new ApiPolicyError('state-transition-invalid', 409, 'The transition is unavailable.');
      const audit = {
        requestId: input.requestId,
        action: 'identity.transition.decided',
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
          ${digest},${input.actorPersonId}::uuid,'identity.transition.decided','continuity-case',
          ${transition.id}::uuid,'succeeded',${input.requestId}::uuid,
          ${input.occurredAt}::timestamptz,${sql.json({ version: transition.version })}
        )`;
      await sql`
        insert into platform.outbox_events(
          aggregate_type,aggregate_id,event_type,payload,aggregate_version
        ) values(
          'identity-continuity',${transition.id}::uuid,'identity.transition.decided',
          ${sql.json({ case_status: 'approved', action_time: input.occurredAt })},
          ${transition.version}
        )`;
      return {
        caseId: transition.id,
        relationshipId: transition.relationship_id,
        version: transition.version,
      };
    });
  }
}
