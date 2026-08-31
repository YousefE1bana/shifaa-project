import { createCipheriv, createHash, createHmac, randomBytes } from 'node:crypto';

import type {
  CreateDelegationInput,
  CreateEmergencyContactInput,
  CreateGuardianshipInput,
  GuardianshipDecisionInput,
  DependentTransitionWorklistItem,
  PatientDependentTransitionSummary,
  DependentTransitionWorklistPage,
  RelationshipsPageWithTransition,
  RespondEmergencyContactInput,
  RevokeRelationshipInput,
  UpdateDelegationInput,
} from '@shifaa/contracts';

import { ApiPolicyError } from '../../modules/identity-onboarding/errors.js';
import {
  FamilyCareService,
  type FamilyActor,
  type FamilyPageQuery,
} from '../../modules/family-care/index.js';
import { PostgresIdentityRepository } from './identity-repository.js';

type MethodName = Exclude<
  keyof FamilyCareService,
  'relationships' | 'contacts' | 'evidence' | 'audit' | 'outbox' | 'invitationPrincipal'
>;

const roleCode = (actor: FamilyActor) => (actor.role === 'support_admin' ? 'ADM-SUPPORT' : 'PAT');
const iso = (value: unknown) =>
  value instanceof Date ? value.toISOString() : new Date(String(value)).toISOString();

/** Seeded-synthetic, short-transaction PostgreSQL adapter. */
export class PostgresFamilyCareService {
  public constructor(
    private readonly repository: PostgresIdentityRepository,
    private readonly encryptionKey: Uint8Array,
    private readonly blindIndexKey: Uint8Array,
    private readonly invitationHmacKey: Uint8Array,
    private readonly now?: () => Date,
  ) {}

  public invitationPrincipal(token: string) {
    return `invite:${createHmac('sha256', this.invitationHmacKey).update(token, 'utf8').digest('hex')}`;
  }

  private async context(sql: any, actor: FamilyActor) {
    await sql`select set_config('shifaa.person_id',${actor.personId},true),set_config('shifaa.actor_role',${roleCode(actor)},true),set_config('shifaa.aal',${String(actor.aal)},true),set_config('shifaa.purposes',${actor.purpose ?? ''},true),set_config('shifaa.principal',${actor.principal},true),set_config('shifaa.patient_context',${actor.selectedPatientId ?? ''},true)`;
  }

  private async invoke<T>(method: MethodName, actor: FamilyActor, ...args: unknown[]): Promise<T> {
    return this.repository.withRawTransaction(async (sql) => {
      await this.context(sql, actor);
      const delegate = new FamilyCareService(this.now, this.invitationHmacKey);
      await this.hydrate(sql, delegate, method, args);
      const relationshipIds = new Set(delegate.relationships.keys());
      const contactIds = new Set(delegate.contacts.keys());
      const relationshipVersions = new Map(
        [...delegate.relationships].map(([id, value]) => [id, (value as any).version]),
      );
      const contactVersions = new Map(
        [...delegate.contacts].map(([id, value]) => [id, (value as any).version]),
      );
      const currentPermissions = new Map<string, Set<string>>();
      for (const [id, value] of delegate.relationships)
        currentPermissions.set(id, new Set((value as any).permissions));
      const result = (await (delegate[method] as (...values: unknown[]) => unknown)(
        actor,
        ...args,
      )) as T;
      if (method === 'listRelationships')
        await this.recordAuthorizationUse(sql, delegate, actor, String(args[0]));
      const readOnly =
        method === 'listRelationships' ||
        method === 'listGuardianshipCases' ||
        method === 'listEmergencyContacts';
      if (!readOnly)
        await this.persist(
          sql,
          delegate,
          actor,
          method,
          args,
          relationshipIds,
          contactIds,
          relationshipVersions,
          contactVersions,
          currentPermissions,
        );
      return result;
    });
  }

  private async recordAuthorizationUse(
    sql: any,
    delegate: FamilyCareService,
    actor: FamilyActor,
    patientId: string,
  ) {
    const relationship = [...(delegate.relationships.values() as Iterable<any>)].find(
      (value) =>
        value.managed_patient_id === patientId &&
        value.actor_person_id === actor.personId &&
        value.status === 'active' &&
        new Date(value.valid_from) <= (this.now?.() ?? new Date()) &&
        (!value.valid_until || new Date(value.valid_until) > (this.now?.() ?? new Date())) &&
        (value.relationship_type === 'self' || value.purpose_code === actor.purpose),
    );
    if (!relationship) return;
    const permission =
      relationship.relationship_type === 'self'
        ? 'profile.view'
        : [...relationship.permissions].sort()[0];
    if (!permission) return;
    const purpose =
      relationship.relationship_type === 'self'
        ? (actor.purpose ?? 'self_care')
        : relationship.purpose_code;
    await sql`insert into identity.relationship_authorization_uses(relationship_id,subject_patient_id,actor_person_id,permission_code,purpose_code,outcome,relationship_version,request_id) values(${relationship.id}::uuid,${patientId}::uuid,${actor.personId}::uuid,${permission},${purpose},'allowed',${relationship.version},${actor.requestId})`;
    const digest = createHash('sha256')
      .update(`${relationship.id}:${relationship.version}:${permission}:${actor.requestId}`)
      .digest('hex');
    await sql`insert into audit.events(event_hash,actor_person_id,patient_id,action,resource_type,resource_id,outcome,request_id,metadata) values(${digest},${actor.personId}::uuid,${patientId}::uuid,${`relationship.${relationship.relationship_type}.used`},'family-care',${relationship.id}::uuid,'success',${actor.requestId}::uuid,${sql.json({ permission_code: permission, purpose_code: purpose, relationship_version: relationship.version })})`;
  }

  private async hydrate(
    sql: any,
    delegate: FamilyCareService,
    method: MethodName,
    args: unknown[],
  ) {
    delegate.relationships.clear();
    delegate.contacts.clear();
    delegate.evidence.clear();
    const relationshipIdMethods = new Set([
      'reviewGuardianship',
      'acceptDelegation',
      'updateDelegation',
      'revokeRelationship',
    ]);
    const patientMethods = new Set([
      'listRelationships',
      'createGuardianship',
      'createDelegation',
      'createEmergencyContact',
      'listEmergencyContacts',
    ]);
    const relationships =
      method === 'listRelationships'
        ? await sql<
            any[]
          >`select r.*,array(select rp.permission_code from identity.care_relationship_permissions rp where rp.relationship_id=r.id and rp.revoked_at is null order by rp.permission_code) permission_codes from identity.care_relationships r where r.subject_patient_id=${args[0]}::uuid`
        : method === 'listGuardianshipCases'
          ? await sql<
              any[]
            >`select r.*,array(select rp.permission_code from identity.care_relationship_permissions rp where rp.relationship_id=r.id and rp.revoked_at is null order by rp.permission_code) permission_codes from identity.care_relationships r where r.relationship_type='guardianship'`
          : relationshipIdMethods.has(method)
            ? await sql<
                any[]
              >`select r.*,array(select rp.permission_code from identity.care_relationship_permissions rp where rp.relationship_id=r.id and rp.revoked_at is null order by rp.permission_code) permission_codes from identity.care_relationships r where r.id=${args[0]}::uuid for update`
            : patientMethods.has(method)
              ? await sql<
                  any[]
                >`select r.*,array(select rp.permission_code from identity.care_relationship_permissions rp where rp.relationship_id=r.id and rp.revoked_at is null order by rp.permission_code) permission_codes from identity.care_relationships r where r.subject_patient_id=${args[0]}::uuid for update`
              : [];
    for (const row of relationships) {
      delegate.relationships.set(row.id, {
        id: row.id,
        managed_patient_id: row.subject_patient_id,
        actor_person_id: row.actor_person_id,
        created_by_person_id: row.created_by_person_id,
        relationship_type: row.relationship_type,
        status: row.status,
        purpose_code: row.purpose_code,
        permissions: row.permission_codes,
        valid_from: iso(row.valid_from),
        valid_until: row.valid_until ? iso(row.valid_until) : null,
        version: row.version,
        ...(row.evidence_object_id ? { evidence_object_id: row.evidence_object_id } : {}),
        ...(row.invite_token_digest
          ? { invite_digest: Buffer.from(row.invite_token_digest).toString('hex') }
          : {}),
        ...(row.invite_expires_at ? { invite_expires_at: iso(row.invite_expires_at) } : {}),
        ...(row.reviewed_by_person_id ? { reviewed_by_person_id: row.reviewed_by_person_id } : {}),
        ...(row.reviewed_at ? { reviewed_at: iso(row.reviewed_at) } : {}),
      } as any);
    }
    const evidenceId =
      method === 'createGuardianship'
        ? (args[1] as CreateGuardianshipInput | undefined)?.evidence_object_id
        : undefined;
    const evidence = evidenceId
      ? await sql<
          any[]
        >`select id,owner_person_id,resource_patient_id,scan_status from identity.private_evidence_objects where id=${evidenceId}::uuid and bucket_code='guardianship-evidence'`
      : [];
    for (const row of evidence)
      delegate.evidence.set(row.id, {
        owner: row.owner_person_id,
        patient: row.resource_patient_id,
        status: row.scan_status,
      } as any);
    const contacts =
      method === 'listEmergencyContacts'
        ? await sql<
            any[]
          >`select * from identity.emergency_contacts where subject_patient_id=${args[0]}::uuid`
        : method === 'createEmergencyContact'
          ? await sql<
              any[]
            >`select * from identity.emergency_contacts where subject_patient_id=${args[0]}::uuid for update`
          : method === 'revokeEmergencyContact'
            ? await sql<
                any[]
              >`select * from identity.emergency_contacts where id=${args[0]}::uuid for update`
            : method === 'respondEmergencyContact'
              ? await sql<
                  any[]
                >`select * from identity.emergency_contacts where invite_token_digest=${createHmac('sha256', this.invitationHmacKey).update(String(args[0]), 'utf8').digest()} for update`
              : [];
    for (const row of contacts)
      delegate.contacts.set(row.id, {
        id: row.id,
        managed_patient_id: row.subject_patient_id,
        created_by_person_id: row.created_by_person_id,
        masked_phone: row.masked_phone,
        preferred_locale: row.preferred_locale,
        location_precision: row.location_precision,
        status: row.status,
        invite_digest: Buffer.from(row.invite_token_digest).toString('hex'),
        invite_expires_at: iso(row.invite_expires_at),
        version: row.version,
      } as any);
  }

  private protect(value: string) {
    const nonce = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.encryptionKey, nonce);
    const ciphertext = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
    return { ciphertext, nonce, tag: cipher.getAuthTag() };
  }

  private async persist(
    sql: any,
    delegate: FamilyCareService,
    actor: FamilyActor,
    method: MethodName,
    args: unknown[],
    relationshipIds: Set<string>,
    contactIds: Set<string>,
    relationshipVersions: Map<string, number>,
    contactVersions: Map<string, number>,
    previousPermissions: Map<string, Set<string>>,
  ) {
    const reason = (args.at(-2) ?? args.at(-1)) as { reason_code?: string } | undefined;
    for (const value of delegate.relationships.values() as Iterable<any>) {
      if (!relationshipIds.has(value.id)) {
        await sql`insert into identity.care_relationships(id,subject_patient_id,actor_person_id,relationship_type,status,valid_from,valid_until,purpose_code,created_by_person_id,evidence_object_id,invite_token_digest,invite_key_version,invite_expires_at,version) values(${value.id}::uuid,${value.managed_patient_id}::uuid,${value.actor_person_id}::uuid,${value.relationship_type},${value.status},${value.valid_from}::timestamptz,${value.valid_until}::timestamptz,${value.purpose_code},${value.created_by_person_id}::uuid,${value.evidence_object_id ?? null}::uuid,${value.invite_digest ? Buffer.from(value.invite_digest, 'hex') : null},${value.invite_digest ? 1 : null},${value.invite_expires_at ?? null}::timestamptz,1)`;
      } else if (value.version > (relationshipVersions.get(value.id) ?? value.version)) {
        const revoked = value.status === 'revoked';
        const reviewed =
          ['active', 'rejected'].includes(value.status) &&
          value.relationship_type === 'guardianship';
        const [updated] = await sql<
          any[]
        >`update identity.care_relationships set status=${value.status},valid_until=${value.valid_until}::timestamptz,invite_token_digest=${value.invite_digest ? Buffer.from(value.invite_digest, 'hex') : null},invite_expires_at=${value.invite_expires_at ?? null}::timestamptz,invite_consumed_at=case when ${method === 'acceptDelegation'} then ${this.now?.() ?? new Date()}::timestamptz else invite_consumed_at end,reviewed_by_person_id=${reviewed ? actor.personId : (value.reviewed_by_person_id ?? null)}::uuid,reviewed_at=${reviewed ? (this.now?.() ?? new Date()) : (value.reviewed_at ?? null)}::timestamptz,decision_reason_code=coalesce(${reason?.reason_code ?? null},decision_reason_code),revoked_by_person_id=${revoked ? actor.personId : null}::uuid,revoked_at=${revoked ? (this.now?.() ?? new Date()) : null} where id=${value.id}::uuid and version=${value.version - 1} returning version`;
        if (!updated) throw new ApiPolicyError('version-conflict', 409, 'Refresh before retrying.');
      }
      const before = previousPermissions.get(value.id) ?? new Set<string>();
      const after = new Set<string>(value.permissions);
      for (const permission of before)
        if (!after.has(permission))
          await sql`update identity.care_relationship_permissions set revoked_at=now(),revoked_by_person_id=${actor.personId}::uuid where relationship_id=${value.id}::uuid and permission_code=${permission} and revoked_at is null`;
      for (const permission of after)
        if (!before.has(permission))
          await sql`insert into identity.care_relationship_permissions(relationship_id,permission_code,created_by_person_id) values(${value.id}::uuid,${permission},${actor.personId}::uuid)`;
    }
    for (const contact of delegate.contacts.values() as Iterable<any>) {
      if (!contactIds.has(contact.id)) {
        const input = args.at(-1) as CreateEmergencyContactInput;
        const name = this.protect(input.display_name);
        const phone = this.protect(input.phone_e164);
        const phoneBlind = createHmac('sha256', this.blindIndexKey)
          .update(input.phone_e164)
          .digest();
        await sql`insert into identity.emergency_contacts(id,subject_patient_id,created_by_person_id,display_name_ciphertext,display_name_nonce,display_name_authentication_tag,display_name_key_version,phone_ciphertext,phone_nonce,phone_authentication_tag,phone_key_version,masked_phone,phone_blind_index,preferred_locale,location_precision,status,invite_token_digest,invite_key_version,invite_expires_at,version) values(${contact.id}::uuid,${contact.managed_patient_id}::uuid,${contact.created_by_person_id}::uuid,${name.ciphertext},${name.nonce},${name.tag},1,${phone.ciphertext},${phone.nonce},${phone.tag},1,${contact.masked_phone},${phoneBlind},${contact.preferred_locale},${contact.location_precision},${contact.status},${Buffer.from(contact.invite_digest, 'hex')},1,${contact.invite_expires_at}::timestamptz,1)`;
      } else if (contact.version > (contactVersions.get(contact.id) ?? contact.version)) {
        const [updated] = await sql<
          any[]
        >`update identity.emergency_contacts set status='revoked',revoked_by_person_id=${actor.personId}::uuid,revoked_at=now(),decision_reason_code=${reason?.reason_code ?? 'owner_revoked'} where id=${contact.id}::uuid and version=${contact.version - 1} returning version`;
        if (!updated) throw new ApiPolicyError('version-conflict', 409, 'Refresh before retrying.');
      }
    }
    for (const effect of delegate.audit) {
      const digest = createHash('sha256').update(JSON.stringify(effect)).digest('hex');
      await sql`insert into audit.events(event_hash,actor_person_id,patient_id,action,resource_type,resource_id,outcome,request_id,metadata) values(${digest},${effect.actor_person_id}::uuid,${effect.patient_id}::uuid,${effect.action},'family-care',${effect.resource_id}::uuid,'success',${effect.request_id}::uuid,${sql.json({ synthetic: true })})`;
      await sql`insert into platform.outbox_events(aggregate_type,aggregate_id,event_type,payload) values('family-care',${effect.resource_id}::uuid,${effect.action},${sql.json(effect.payload)})`;
    }
  }

  public listRelationships(
    a: FamilyActor,
    id: string,
    q: FamilyPageQuery & { includeDependentTransition: true },
  ): Promise<RelationshipsPageWithTransition>;
  public listRelationships(a: FamilyActor, id: string, q?: FamilyPageQuery): Promise<unknown>;
  public listRelationships(a: FamilyActor, id: string, q: FamilyPageQuery = {}) {
    if (q.includeDependentTransition) return this.listRelationshipsWithTransition(a, id, q);
    return this.invoke('listRelationships', a, id, q);
  }
  public createGuardianship(a: FamilyActor, id: string, b: CreateGuardianshipInput) {
    return this.invoke('createGuardianship', a, id, b);
  }
  public listGuardianshipCases(
    a: FamilyActor,
    q: FamilyPageQuery & { mode: 'dependent_transition' },
  ): Promise<DependentTransitionWorklistPage>;
  public listGuardianshipCases(a: FamilyActor, q?: FamilyPageQuery): Promise<unknown>;
  public listGuardianshipCases(a: FamilyActor, q: FamilyPageQuery = {}) {
    if (q.mode === 'dependent_transition') return this.listTransitionWorklist(a, q);
    return this.invoke('listGuardianshipCases', a, q);
  }
  public reviewGuardianship(a: FamilyActor, id: string, b: GuardianshipDecisionInput, v: number) {
    return this.invoke('reviewGuardianship', a, id, b, v);
  }
  public createDelegation(a: FamilyActor, id: string, b: CreateDelegationInput) {
    return this.invoke('createDelegation', a, id, b);
  }
  public acceptDelegation(a: FamilyActor, id: string, token: string) {
    return this.invoke('acceptDelegation', a, id, token);
  }
  public updateDelegation(a: FamilyActor, id: string, b: UpdateDelegationInput, v: number) {
    return this.invoke('updateDelegation', a, id, b, v);
  }
  public revokeRelationship(a: FamilyActor, id: string, b: RevokeRelationshipInput, v: number) {
    return this.invoke('revokeRelationship', a, id, b, v);
  }
  public createEmergencyContact(a: FamilyActor, id: string, b: CreateEmergencyContactInput) {
    return this.invoke('createEmergencyContact', a, id, b);
  }
  public listEmergencyContacts(a: FamilyActor, id: string, q: FamilyPageQuery = {}) {
    return this.invoke('listEmergencyContacts', a, id, q);
  }
  public async respondEmergencyContact(
    token: string,
    b: Omit<RespondEmergencyContactInput, 'token'>,
    requestId: string,
  ) {
    const digest = createHmac('sha256', this.invitationHmacKey).update(token, 'utf8').digest();
    return this.repository.withRawTransaction(async (sql) => {
      try {
        const [row] = await sql<
          any[]
        >`select * from platform.respond_emergency_contact_invite(${digest},${b.decision})`;
        if (!row) throw new Error('unavailable');
        const action = `emergency_contact.${b.decision}`;
        const eventHash = createHash('sha256')
          .update(`${action}:${row.contact_id}:${requestId}`)
          .digest('hex');
        await sql`insert into audit.events(event_hash,actor_person_id,patient_id,action,resource_type,resource_id,outcome,request_id,metadata) values(${eventHash},null,${row.subject_patient_id}::uuid,${action},'family-care',${row.contact_id}::uuid,'success',${requestId}::uuid,${sql.json({ actor_type: 'invitation', synthetic: true })})`;
        await sql`insert into platform.outbox_events(aggregate_type,aggregate_id,event_type,payload) values('family-care',${row.contact_id}::uuid,${action},${sql.json({ contact_id: row.contact_id, subject_patient_id: row.subject_patient_id, status: b.decision, request_id: requestId })})`;
        return { status: b.decision };
      } catch (error: any) {
        if (error?.code === '22023' || error?.message === 'unavailable')
          throw new ApiPolicyError('invite-unavailable', 403, 'Invitation unavailable.');
        throw error;
      }
    });
  }
  public revokeEmergencyContact(a: FamilyActor, id: string, b: RevokeRelationshipInput, v: number) {
    return this.invoke('revokeEmergencyContact', a, id, b, v);
  }

  private async listTransitionWorklist(actor: FamilyActor, query: FamilyPageQuery) {
    if (actor.role !== 'support_admin' || actor.aal < 2)
      throw new ApiPolicyError('aal2-required', 403, 'AAL2 support review is required.');
    if (actor.purpose !== 'guardianship_review')
      throw new ApiPolicyError('purpose-required', 403, 'Guardianship review purpose is required.');
    return this.repository.withRawTransaction(async (sql) => {
      await this.context(sql, actor);
      const rows = await sql<TransitionWorklistRow[]>`
        select id,relationship_id,status,version,verification_case_id,
          review_required_reason_code,created_at,updated_at,decided_at
        from identity.continuity_cases
        where case_type='dependent_transition'
          and assigned_reviewer_person_id=${actor.personId}::uuid
          and (${query.status ?? null}::text is null or status=${query.status ?? null})
        order by id`;
      return pageReadModels(
        rows.map(transitionWorklistProjection),
        query,
        (row) => row.transitionCaseId,
      );
    });
  }

  private async listRelationshipsWithTransition(
    actor: FamilyActor,
    patientId: string,
    query: FamilyPageQuery,
  ) {
    const relationships = await this.invoke<{
      items: unknown[];
      next_cursor: string | null;
    }>('listRelationships', actor, patientId, { ...query, includeDependentTransition: false });
    const dependentTransition = await this.repository.withRawTransaction(async (sql) => {
      await this.context(sql, actor);
      const [self] = await sql<{ allowed: boolean }[]>`
        select platform.person_is_patient_self(${patientId}::uuid,${actor.personId}::uuid) allowed`;
      if (!self?.allowed)
        throw new ApiPolicyError(
          'permission-denied',
          403,
          'Only the patient subject can read the transition summary.',
        );
      const [transition] = await sql<PatientTransitionRow[]>`
        select id,relationship_id,status,version,updated_at
        from identity.continuity_cases
        where case_type='dependent_transition' and subject_patient_id=${patientId}::uuid
          and subject_person_id=${actor.personId}::uuid
        order by created_at desc,id desc limit 1`;
      if (transition) return patientTransitionProjection(transition);
      const [eligibility] = await sql<{ eligible: boolean; relationship_id: string | null }[]>`
        select
          identity.transition_eligible_on(
            p.birth_date,(platform.context_now() at time zone 'Africa/Cairo')::date
          ) and r.id is not null eligible,
          r.id relationship_id
        from identity.people p
        join identity.patients patient on patient.person_id=p.id and patient.id=${patientId}::uuid
        left join lateral(
          select relationship.id from identity.care_relationships relationship
          where relationship.subject_patient_id=patient.id
            and relationship.relationship_type='guardianship' and relationship.status='active'
          order by relationship.created_at desc,relationship.id desc limit 1
        ) r on true
        where p.id=${actor.personId}::uuid`;
      return noCaseTransitionProjection(eligibility);
    });
    return { ...relationships, dependentTransition };
  }
}

type TransitionWorklistRow = {
  id: string;
  relationship_id: string;
  status: DependentTransitionWorklistItem['status'];
  version: number;
  verification_case_id: string | null;
  review_required_reason_code: DependentTransitionWorklistItem['blockerState'] | null;
  created_at: string | Date;
  updated_at: string | Date;
  decided_at: string | Date | null;
};

type PatientTransitionRow = {
  id: string;
  relationship_id: string;
  status: 'proof_required' | 'review_required' | 'human_review_required' | 'approved' | 'rejected';
  version: number;
  updated_at: string | Date;
};

function transitionWorklistProjection(row: TransitionWorklistRow): DependentTransitionWorklistItem {
  return {
    relationshipId: row.relationship_id,
    transitionCaseId: row.id,
    caseType: 'dependent_transition',
    status: row.status,
    continuityCaseVersion: row.version,
    proofState: row.verification_case_id ? 'verified' : 'required',
    reviewState: row.status,
    blockerState: row.review_required_reason_code ?? 'none',
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
    decidedAt: row.decided_at ? iso(row.decided_at) : null,
  };
}

function patientTransitionProjection(row: PatientTransitionRow): PatientDependentTransitionSummary {
  const status = row.status === 'proof_required' ? 'verification_required' : row.status;
  return {
    relationshipId: row.relationship_id,
    transitionCaseId: row.id,
    status,
    continuityCaseVersion: row.version,
    updatedAt: iso(row.updated_at),
    recordConsequence:
      status === 'approved'
        ? 'same_patient_record_preserved'
        : status === 'rejected'
          ? 'unchanged_after_rejection'
          : 'unchanged_before_decision',
    priorAuthorityConsequence:
      status === 'approved'
        ? 'ended_after_approval'
        : status === 'rejected'
          ? 'evaluated_independently_after_rejection'
          : 'current_until_decision',
  };
}

function noCaseTransitionProjection(
  eligibility: { eligible: boolean; relationship_id: string | null } | undefined,
): PatientDependentTransitionSummary {
  return {
    relationshipId: eligibility?.relationship_id ?? null,
    transitionCaseId: null,
    status: eligibility?.eligible ? 'verification_required' : 'not_eligible',
    continuityCaseVersion: null,
    updatedAt: null,
    recordConsequence: 'unchanged_before_decision',
    priorAuthorityConsequence: 'current_until_decision',
  };
}

function pageReadModels<T>(
  rows: T[],
  query: FamilyPageQuery,
  id: (row: T) => string,
): { items: T[]; next_cursor: string | null } {
  const after = query.cursor ? Buffer.from(query.cursor, 'base64url').toString('utf8') : '';
  const eligible = rows.filter((row) => id(row) > after);
  const limit = query.limit ?? 25;
  const items = eligible.slice(0, limit);
  return {
    items,
    next_cursor:
      eligible.length > limit ? Buffer.from(id(items.at(-1)!)).toString('base64url') : null,
  };
}
