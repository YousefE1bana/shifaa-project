import { AsyncLocalStorage } from 'node:async_hooks';
import { createHash, randomUUID } from 'node:crypto';

import type { ConsentRecord, Locale, PersonAggregate } from '@shifaa/core';
import postgres, { type Sql } from 'postgres';

import { ApiPolicyError } from '../../modules/identity-onboarding/errors.js';
import type {
  AuditOutcome,
  IdentityRepository,
  OutboxOutcome,
  ProfileRecord,
  RepositoryContext,
  StoredIdentity,
  StoredVerificationCase,
} from '../../modules/identity-onboarding/ports.js';

type TxState = { sql: any; context?: RepositoryContext };

export class PostgresIdentityRepository implements IdentityRepository {
  private readonly sql: Sql;
  private readonly scope = new AsyncLocalStorage<TxState>();

  public constructor(databaseUrl: string) {
    this.sql = postgres(databaseUrl, {
      max: 10,
      idle_timeout: 20,
      connect_timeout: 10,
      prepare: true,
      onnotice: () => undefined,
    });
  }

  public get audits(): readonly AuditOutcome[] {
    return [];
  }
  public get outbox(): readonly OutboxOutcome[] {
    return [];
  }

  public async close(): Promise<void> {
    await this.sql.end({ timeout: 5 });
  }
  public async ready(): Promise<void> {
    await this.sql`select 1`;
  }

  public async transaction<T>(work: () => Promise<T> | T, context?: RepositoryContext): Promise<T> {
    const active = this.scope.getStore();
    if (active) {
      if (context) await this.setContext(active.sql, context);
      return work();
    }
    return this.sql.begin(async (tx) => {
      await tx`select set_config('statement_timeout', '5000', true), set_config('lock_timeout', '2000', true)`;
      if (context) await this.setContext(tx, context);
      return this.scope.run({ sql: tx, ...(context ? { context } : {}) }, work);
    }) as Promise<T>;
  }

  public async withRawTransaction<T>(work: (sql: any) => Promise<T>): Promise<T> {
    const active = this.scope.getStore();
    if (active) return work(active.sql);
    return this.sql.begin(async (tx) => this.scope.run({ sql: tx }, () => work(tx))) as Promise<T>;
  }

  public async createRegistration(
    authSubjectId: string,
    handle: string,
    locale: Locale,
  ): Promise<PersonAggregate> {
    return this.use(async (sql) => {
      const [row] = await sql<
        { person_id: string; patient_id: string; relationship_id: string; version: number }[]
      >`
        select * from platform.register_identity_onboarding(${authSubjectId}::uuid, ${handle}, ${locale})`;
      if (!row)
        throw new ApiPolicyError(
          'registration-failed',
          500,
          'Could not create the patient profile.',
        );
      return {
        authSubjectId,
        personId: row.person_id,
        patientId: row.patient_id,
        selfRelationshipId: row.relationship_id,
        preferredLocale: locale,
        version: row.version,
      };
    });
  }

  public async profileByAuthSubject(authSubjectId: string): Promise<ProfileRecord | undefined> {
    return this.use(async (sql) => {
      const [mapping] = await sql<
        { person_id: string | null }[]
      >`select platform.resolve_person_id(${authSubjectId}::uuid) as person_id`;
      if (!mapping?.person_id) return undefined;
      await this.setContext(sql, {
        personId: mapping.person_id,
        role: 'PAT',
        aal: 1,
        purposes: [],
        principal: authSubjectId,
      });
      const [row] = await sql<any[]>`
        select p.id, p.user_id, p.display_name, p.birth_date::text, p.nationality_code,
               p.preferred_locale, p.version,
               coalesce((select i.verification_status from identity.identities i where i.person_id=p.id order by i.created_at desc limit 1), 'unverified') verification_status
        from identity.people p where p.id=${mapping.person_id}::uuid`;
      return row ? this.profile(row) : undefined;
    });
  }

  public async updateProfile(
    personId: string,
    expectedVersion: number,
    patch: Partial<
      Pick<ProfileRecord, 'displayName' | 'birthDate' | 'nationalityCode' | 'preferredLocale'>
    >,
  ): Promise<ProfileRecord> {
    const sql = this.current();
    const [row] = await sql<any[]>`
      update identity.people set
        display_name=coalesce(${patch.displayName ?? null}, display_name),
        birth_date=case when ${patch.birthDate === undefined} then birth_date else ${patch.birthDate ?? null}::date end,
        nationality_code=coalesce(${patch.nationalityCode ?? null}, nationality_code),
        preferred_locale=coalesce(${patch.preferredLocale ?? null}, preferred_locale),
        version=version+1, updated_at=now()
      where id=${personId}::uuid and version=${expectedVersion}
      returning id,user_id,display_name,birth_date::text,nationality_code,preferred_locale,version`;
    if (!row)
      throw new ApiPolicyError('version-conflict', 409, 'Refresh the profile before saving again.');
    return this.profile({ ...row, verification_status: 'unverified' });
  }

  public async hasActiveInventory(purposeCode: string): Promise<boolean> {
    return this.use(async (sql) => {
      const [row] = await sql<{ active: boolean }[]>`
        select exists(select 1 from consent.processing_inventory where status='active' and ${purposeCode}=any(purposes)) active`;
      return row?.active ?? false;
    });
  }
  public async setInventory(purposeCode: string, enabled: boolean): Promise<void> {
    await this.use(async (sql) => {
      await sql`update consent.processing_inventory set status=${enabled ? 'active' : 'suspended'},updated_at=now(),version=version+1 where ${purposeCode}=any(purposes)`;
    });
  }

  public async createIdentity(
    input: Omit<StoredIdentity, 'id' | 'version'>,
  ): Promise<StoredIdentity> {
    const sql = this.current();
    try {
      const [row] = await sql<{ id: string; version: number }[]>`
        insert into identity.identities(person_id,identity_type,ciphertext,nonce,authentication_tag,key_version,blind_index,masked_value,issuing_country,expires_on,verification_status)
        values(${input.personId}::uuid,${input.identityType},${Buffer.from(input.encrypted.ciphertext)},${Buffer.from(input.encrypted.nonce)},${Buffer.from(input.encrypted.authenticationTag)},${input.encrypted.keyVersion},${Buffer.from(input.encrypted.blindIndex)},${input.maskedValue},${input.issuingCountry},${input.expiresOn ?? null}::date,${input.verificationStatus})
        returning id,version`;
      if (!row) throw new Error('identity insert returned no row');
      return { ...input, id: row.id, version: row.version };
    } catch (error: any) {
      if (error?.code === '23505')
        throw new ApiPolicyError(
          'identity-already-registered',
          409,
          'This identity already exists.',
        );
      throw error;
    }
  }

  public async identitiesForPerson(personId: string): Promise<readonly StoredIdentity[]> {
    const rows = await this.current()<any[]>`
      select * from identity.identities where person_id=${personId}::uuid order by created_at`;
    return rows.map((row: any) => this.identity(row));
  }

  public async createVerificationCase(
    input: Omit<StoredVerificationCase, 'id' | 'version'>,
  ): Promise<StoredVerificationCase> {
    const [row] = await this.current()<any[]>`
      insert into identity.verification_cases(identity_id,provider,provider_transaction_id,state,assigned_reviewer_person_id,evidence)
      values(${input.identityId}::uuid,${input.provider},${input.providerTransactionId ?? null},${input.status},${input.assignedReviewerPersonId ?? null}::uuid,'{}'::jsonb)
      returning id,version`;
    if (!row) throw new Error('case insert returned no row');
    return { ...input, id: row.id, version: row.version };
  }

  public async verificationCase(caseId: string): Promise<StoredVerificationCase | undefined> {
    const [row] = await this.current()<any[]>`
      select c.*,i.person_id owner_person_id,i.identity_type,i.masked_value
      from identity.verification_cases c join identity.identities i on i.id=c.identity_id where c.id=${caseId}::uuid`;
    return row ? this.case(row) : undefined;
  }

  public async verificationCases(): Promise<readonly StoredVerificationCase[]> {
    const rows = await this.current()<any[]>`
      select c.*,i.person_id owner_person_id,i.identity_type,i.masked_value
      from identity.verification_cases c join identity.identities i on i.id=c.identity_id order by c.created_at`;
    return rows.map((row: any) => this.case(row));
  }

  public async replaceVerificationCase(value: StoredVerificationCase): Promise<void> {
    const sql = this.current();
    const [row] = await sql`
      update identity.verification_cases set state=${value.status},reviewer_person_id=${value.reviewerPersonId ?? null}::uuid,
        reason_code=${value.reasonCode ?? null},evidence=${value.evidenceObjectId ? sql.json({ object_id: value.evidenceObjectId }) : sql.json({})},
        decided_at=${['verified', 'rejected'].includes(value.status) ? new Date() : null}
      where id=${value.id}::uuid and version=${value.version - 1} returning id`;
    if (!row)
      throw new ApiPolicyError('version-conflict', 409, 'Refresh this review before saving again.');
    await sql`update identity.identities set verification_status=${value.status},version=version+1,updated_at=now() where id=${value.identityId}::uuid`;
  }

  public async currentNotice(locale: Locale) {
    return this.use(async (sql) => {
      const [notice] = await sql<
        any[]
      >`select notice_code,version,locale,content from consent.notice_versions where locale=${locale} and retired_at is null order by effective_at desc limit 1`;
      if (!notice) throw new ApiPolicyError('notice-not-found', 404, 'Privacy notice not found.');
      const purposes = await sql<
        any[]
      >`select purpose_code,version,label_ar,label_en,optional from consent.purpose_versions where retired_at is null order by optional,purpose_code`;
      return {
        noticeCode: notice.notice_code,
        version: notice.version,
        locale: notice.locale as Locale,
        content: notice.content,
        purposes: purposes.map((p: any) => ({
          purposeCode: p.purpose_code,
          version: p.version,
          label: locale === 'ar-EG' ? p.label_ar : p.label_en,
          optional: p.optional,
        })),
      };
    });
  }

  public async consentsForPerson(personId: string): Promise<readonly ConsentRecord[]> {
    const rows = await this.current()<
      any[]
    >`select * from consent.records where person_id=${personId}::uuid order by occurred_at`;
    return rows.map((r: any) => this.consentRecord(r));
  }
  public async appendConsent(record: ConsentRecord): Promise<void> {
    await this.current()`insert into consent.records(id,person_id,purpose_code,purpose_version,decision,capture_channel,notice_version,occurred_at,supersedes_id,version) values(${record.id}::uuid,${record.personId}::uuid,${record.purposeCode},${record.purposeVersion},${record.decision},'patient_app',${record.noticeVersion},${record.occurredAt}::timestamptz,${record.supersedesId ?? null}::uuid,${record.version})`;
  }
  public async consent(consentId: string): Promise<ConsentRecord | undefined> {
    const [row] = await this.current()<
      any[]
    >`select * from consent.records where id=${consentId}::uuid`;
    return row ? this.consentRecord(row) : undefined;
  }
  public async appendAudit(value: AuditOutcome): Promise<void> {
    await this.use(async (sql) => {
      const digest = createHash('sha256').update(JSON.stringify(value)).digest('hex');
      await sql`insert into audit.events(event_hash,actor_person_id,action,resource_type,resource_id,outcome,request_id,metadata) values(${digest},${value.actorPersonId ?? null}::uuid,${value.action},${value.resourceType},${value.resourceId ?? null}::uuid,${value.outcome},${value.requestId}::uuid,${sql.json(value.metadata ?? {})})`;
    });
  }
  public async appendOutbox(value: OutboxOutcome): Promise<void> {
    const prohibited = ['value', 'handle', 'password', 'otp', 'token', 'document'];
    if (Object.keys(value.payload).some((key) => prohibited.includes(key.toLowerCase())))
      throw new ApiPolicyError('event-payload-prohibited', 500, 'Prohibited event payload field.');
    await this.current()`insert into platform.outbox_events(aggregate_type,aggregate_id,event_type,payload) values('identity-onboarding',${value.aggregateId}::uuid,${value.eventType},${this.current().json(value.payload)})`;
  }

  private current(): any {
    const state = this.scope.getStore();
    if (!state) throw new Error('Persistent repository access requires a transaction.');
    return state.sql;
  }
  private async use<T>(work: (sql: any) => Promise<T>): Promise<T> {
    const active = this.scope.getStore();
    return active ? work(active.sql) : this.transaction(() => work(this.current()));
  }
  private async setContext(sql: any, context: RepositoryContext): Promise<void> {
    await sql`select set_config('shifaa.person_id',${context.personId},true),set_config('shifaa.actor_role',${context.role},true),set_config('shifaa.aal',${String(context.aal)},true),set_config('shifaa.purposes',${context.purposes.join(',')},true),set_config('shifaa.principal',${context.principal},true)`;
  }
  private profile(r: any): ProfileRecord {
    return {
      id: r.id,
      authSubjectId: r.user_id,
      displayName: r.display_name,
      birthDate: r.birth_date ?? null,
      nationalityCode: r.nationality_code,
      preferredLocale: r.preferred_locale,
      verificationStatus: r.verification_status,
      version: r.version,
    };
  }
  private identity(r: any): StoredIdentity {
    return {
      id: r.id,
      personId: r.person_id,
      identityType: r.identity_type,
      encrypted: {
        ciphertext: r.ciphertext,
        nonce: r.nonce,
        authenticationTag: r.authentication_tag,
        blindIndex: r.blind_index,
        keyVersion: r.key_version,
      },
      issuingCountry: r.issuing_country,
      expiresOn: r.expires_on,
      maskedValue: r.masked_value,
      verificationStatus: r.verification_status,
      version: r.version,
    };
  }
  private case(r: any): StoredVerificationCase {
    return {
      id: r.id,
      identityId: r.identity_id,
      identityType: r.identity_type,
      maskedValue: r.masked_value,
      ownerPersonId: r.owner_person_id,
      provider: r.provider,
      providerTransactionId: r.provider_transaction_id ?? undefined,
      status: r.state,
      assignedReviewerPersonId: r.assigned_reviewer_person_id ?? undefined,
      reviewerPersonId: r.reviewer_person_id ?? undefined,
      reasonCode: r.reason_code ?? undefined,
      evidenceObjectId: r.evidence?.object_id,
      version: r.version,
    };
  }
  private consentRecord(r: any): ConsentRecord {
    return {
      id: r.id,
      personId: r.person_id,
      purposeCode: r.purpose_code,
      purposeVersion: r.purpose_version,
      noticeVersion: r.notice_version,
      decision: r.decision,
      occurredAt: new Date(r.occurred_at).toISOString(),
      supersedesId: r.supersedes_id ?? undefined,
      version: r.version,
    };
  }
}
