import { createHash } from 'node:crypto';

import type {
  ContinuityAuditInput,
  ContinuityRepository,
  ContinuityRestriction,
} from '../../modules/identity-continuity/index.js';
import { ApiPolicyError } from '../../modules/identity-onboarding/errors.js';
import { PostgresIdentityRepository } from './identity-repository.js';

export class PostgresIdentityContinuityService implements ContinuityRepository {
  public constructor(private readonly repository: PostgresIdentityRepository) {}

  public async isNativeSessionCurrent(sessionId: string, subjectId: string): Promise<boolean> {
    try {
      return await this.repository.withRawTransaction(async (sql) => {
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
