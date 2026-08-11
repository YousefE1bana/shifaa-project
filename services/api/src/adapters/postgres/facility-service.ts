import { createCipheriv, createHash, createHmac, randomBytes, randomUUID } from 'node:crypto';

import type {
  AdminGrantProposalInput,
  DecisionInput,
  FacilityCreateInput,
  FacilityLicenseUploadInput,
  FacilityPatchInput,
  FacilityReviewInput,
  FacilityUploadMetadata,
  MembershipInviteInput,
  MembershipPatchInput,
  ProfessionalLicenseCreateInput,
  ProfessionalReviewInput,
  ReasonInput,
} from '@shifaa/contracts';

import {
  FacilityOnboardingService,
  type FacilityActor,
  type FacilityPageQuery,
} from '../../modules/facility-onboarding/index.js';
import { PostgresIdentityRepository } from './identity-repository.js';

type MethodName = Exclude<
  keyof FacilityOnboardingService,
  | 'facilities'
  | 'professionalLicenses'
  | 'facilityLicenses'
  | 'memberships'
  | 'grants'
  | 'revocations'
  | 'audit'
  | 'outbox'
>;

const roleCode = (actor: FacilityActor) =>
  actor.adminRole === 'super_admin'
    ? 'ADM-SUPER'
    : actor.adminRole === 'facility_approver'
      ? 'ADM-FACILITY'
      : actor.adminRole
        ? `ADM-${actor.adminRole.toUpperCase().replaceAll('_', '-')}`
        : 'PAT';

/**
 * Seeded-synthetic PostgreSQL adapter. It intentionally keeps the portable state
 * machine in FacilityOnboardingService and serializes an RLS-filtered snapshot
 * inside the active idempotency transaction. OPEN-SEC-001 still prevents this
 * adapter from constituting production approval.
 */
export class PostgresFacilityOnboardingService {
  private delegate: FacilityOnboardingService;

  public constructor(
    private readonly repository: PostgresIdentityRepository,
    private readonly encryptionKey: Uint8Array,
    private readonly blindIndexKey: Uint8Array,
    private readonly now?: () => Date,
  ) {
    this.delegate = new FacilityOnboardingService(now);
  }

  public get facilities() {
    return this.delegate.facilities;
  }
  public get professionalLicenses() {
    return this.delegate.professionalLicenses;
  }
  public get facilityLicenses() {
    return this.delegate.facilityLicenses;
  }
  public get memberships() {
    return this.delegate.memberships;
  }
  public get grants() {
    return this.delegate.grants;
  }
  public get revocations() {
    return this.delegate.revocations;
  }
  public get audit() {
    return this.delegate.audit;
  }
  public get outbox() {
    return this.delegate.outbox;
  }

  private async invoke<T>(
    method: MethodName,
    actor: FacilityActor,
    ...args: unknown[]
  ): Promise<T> {
    return this.repository.withRawTransaction(async (sql) => {
      await sql`select set_config('shifaa.person_id',${actor.personId},true),set_config('shifaa.actor_role',${roleCode(actor)},true),set_config('shifaa.aal',${String(actor.aal)},true),set_config('shifaa.purposes',${actor.purpose ?? ''},true)`;
      const delegate = new FacilityOnboardingService(this.now);
      await this.hydrate(sql, delegate, method, args);
      const existingFacilityIds = new Set<string>(delegate.facilities.keys());
      const existingEvidenceIds = new Set<string>((delegate as any).evidence.keys());
      const existingFacilityLicenseIds = new Set<string>(delegate.facilityLicenses.keys());
      const existingGrantIds = new Set<string>(delegate.grants.keys());
      const existingRevocationIds = new Set<string>(delegate.revocations.keys());
      const result = (await (delegate[method] as (...values: unknown[]) => unknown)(
        actor,
        ...args,
      )) as T;
      const professionalSecrets = new Map<string, string>();
      const facilityLicenses: Array<{
        id: string;
        facilityId: string;
        evidenceId: string;
        body: FacilityLicenseUploadInput;
      }> = [];
      if (method === 'createProfessionalLicense') {
        const created = result as { id: string };
        professionalSecrets.set(
          created.id,
          (args[0] as ProfessionalLicenseCreateInput).license_number,
        );
      }
      if (method === 'createFacilityLicenseUpload') {
        const created = result as { object_id: string };
        const body = args[1] as FacilityLicenseUploadInput;
        const createdLicense = [...delegate.facilityLicenses.values()].find(
          (value) => value.evidence_object_id === created.object_id,
        );
        if (!createdLicense) throw new Error('Facility license was not created with its evidence.');
        facilityLicenses.push({
          id: createdLicense.id,
          facilityId: args[0] as string,
          evidenceId: created.object_id,
          body,
        });
      }
      const readOnly = new Set<MethodName>([
        'getFacility',
        'listFacilityCases',
        'getProfessionalLicense',
        'listProfessionalCases',
        'listMemberships',
        'listGrants',
      ]).has(method);
      if (!readOnly)
        await this.persist(
          sql,
          actor,
          delegate,
          professionalSecrets,
          facilityLicenses,
          method,
          existingFacilityIds,
          existingEvidenceIds,
          existingFacilityLicenseIds,
          existingGrantIds,
          existingRevocationIds,
        );
      this.delegate = delegate;
      return result;
    });
  }

  private async hydrate(
    sql: any,
    delegate: FacilityOnboardingService,
    method: MethodName,
    args: unknown[],
  ) {
    const d = delegate as any;
    for (const map of [
      d.facilities,
      d.professionalLicenses,
      d.facilityLicenses,
      d.memberships,
      d.grants,
      d.revocations,
      d.evidence,
      d.facilityEvidence,
      d.professionalEvidence,
    ])
      map.clear();
    const facilities = await sql<
      any[]
    >`select f.*, (select e.scan_status from identity.private_evidence_objects e where e.facility_id=f.id order by e.created_at desc limit 1) evidence_scan_status from identity.facilities f for update`;
    for (const f of facilities)
      d.facilities.set(f.id, {
        id: f.id,
        facility_type: f.facility_type,
        name_ar: f.name_ar,
        name_en: f.name_en,
        governorate_code: f.governorate_code,
        city: f.city,
        district: f.district,
        address_line: f.address_line,
        facility_status: f.facility_status,
        created_by_person_id: f.created_by_person_id,
        evidence_scan_status: f.evidence_scan_status,
        decision_reason: f.decision_reason,
        version: f.version,
      });
    const evidence = await sql<any[]>`select * from identity.private_evidence_objects`;
    for (const e of evidence) {
      d.evidence.set(e.id, {
        objectId: e.id,
        sha256: e.sha256,
        scan: e.scan_status,
        ownerId: e.owner_person_id,
      });
      if (e.facility_id) d.facilityEvidence.set(e.facility_id, e.id);
    }
    const licenses = await sql<any[]>`select * from identity.professional_licenses for update`;
    for (const l of licenses) {
      d.professionalLicenses.set(l.id, {
        id: l.id,
        person_id: l.person_id,
        profession: l.profession,
        specialty_code: l.specialty_code,
        masked_license_number: l.masked_license_number,
        issuer: l.issuer,
        expires_on: l.expires_on.toISOString?.().slice(0, 10) ?? String(l.expires_on),
        status: l.status,
        evidence_scan_status: l.evidence_object_id
          ? (d.evidence.get(l.evidence_object_id)?.scan ?? null)
          : null,
        decision_reason: l.decision_reason,
        version: l.version,
      });
      if (l.evidence_object_id) d.professionalEvidence.set(l.id, l.evidence_object_id);
    }
    const facilityLicenses = await sql<any[]>`select * from identity.facility_licenses for update`;
    for (const l of facilityLicenses) {
      const evidence = d.evidence.get(l.evidence_object_id);
      d.facilityLicenses.set(l.id, {
        id: l.id,
        facility_id: l.facility_id,
        evidence_object_id: l.evidence_object_id,
        license_type: l.license_type,
        issuer: l.issuer,
        expires_on: l.expires_on.toISOString?.().slice(0, 10) ?? String(l.expires_on),
        licensed_activities: l.licensed_activities,
        mime_type: evidence?.mimeType ?? 'application/pdf',
        size_bytes: evidence?.sizeBytes ?? 1,
        sha256: evidence?.sha256 ?? '0'.repeat(64),
        status: l.status,
      });
    }
    const memberships = await sql<any[]>`select * from identity.facility_memberships for update`;
    const acceptToken = method === 'acceptMembership' ? (args[0] as string) : undefined;
    const acceptHash = acceptToken ? createHash('sha256').update(acceptToken).digest() : undefined;
    for (const m of memberships)
      d.memberships.set(m.id, {
        id: m.id,
        facility_id: m.facility_id,
        person_id: m.person_id,
        role_code: m.role_code,
        employment_license_id: m.employment_license_id,
        valid_from: m.valid_from.toISOString(),
        valid_until: m.valid_until?.toISOString() ?? null,
        status: m.membership_status,
        invite_expires_at: m.invite_expires_at?.toISOString() ?? null,
        version: m.version,
        ...(acceptHash &&
        m.invite_token_hash &&
        m.invite_expires_at &&
        m.invite_expires_at > (this.now?.() ?? new Date()) &&
        Buffer.compare(acceptHash, m.invite_token_hash) === 0
          ? { invite_token: acceptToken }
          : {}),
      });
    const grants = await sql<any[]>`select * from identity.admin_role_grants for update`;
    for (const g of grants)
      d.grants.set(g.id, {
        id: g.id,
        person_id: g.person_id,
        role_code: g.role_code,
        valid_from: g.valid_from.toISOString(),
        valid_until: g.valid_until?.toISOString() ?? null,
        status: g.status,
        proposed_by: g.proposed_by,
        decided_by: g.decided_by,
        decision_reason: g.decision_reason,
        version: g.version,
      });
    const revocations = await sql<
      any[]
    >`select * from identity.admin_role_revocation_requests for update`;
    for (const r of revocations)
      d.revocations.set(r.id, {
        id: r.id,
        grant_id: r.grant_id,
        status: r.status,
        reason: r.reason,
        proposed_by: r.proposed_by,
        decided_by: r.decided_by,
        version: r.version,
      });
  }

  private protect(value: string) {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.encryptionKey, iv);
    const ciphertext = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
    return {
      ciphertext: Buffer.concat([Buffer.from([1]), iv, cipher.getAuthTag(), ciphertext]),
      hash: createHmac('sha256', this.blindIndexKey).update(value.trim().toUpperCase()).digest(),
    };
  }

  private async persist(
    sql: any,
    actor: FacilityActor,
    delegate: FacilityOnboardingService,
    professionalSecrets: Map<string, string>,
    facilityLicenses: Array<{
      id: string;
      facilityId: string;
      evidenceId: string;
      body: FacilityLicenseUploadInput;
    }>,
    method: MethodName,
    existingFacilityIds: Set<string>,
    existingEvidenceIds: Set<string>,
    existingFacilityLicenseIds: Set<string>,
    existingGrantIds: Set<string>,
    existingRevocationIds: Set<string>,
  ) {
    const d = delegate as any;
    for (const f of d.facilities.values()) {
      if (existingFacilityIds.has(f.id))
        await sql`update identity.facilities set name_ar=${f.name_ar},name_en=${f.name_en},facility_status=${f.facility_status},governorate_code=${f.governorate_code},city=${f.city},district=${f.district},address_line=${f.address_line},decision_reason=${f.decision_reason},version=${f.version} where id=${f.id}::uuid and (name_ar,name_en,facility_status,governorate_code,city,district,address_line,decision_reason,version) is distinct from (${f.name_ar},${f.name_en},${f.facility_status},${f.governorate_code},${f.city},${f.district},${f.address_line},${f.decision_reason},${f.version})`;
      else
        await sql`insert into identity.facilities(id,facility_type,name_ar,name_en,facility_status,governorate_code,city,district,address_line,created_by_person_id,decision_reason,version) values(${f.id}::uuid,${f.facility_type},${f.name_ar},${f.name_en},${f.facility_status},${f.governorate_code},${f.city},${f.district},${f.address_line},${f.created_by_person_id}::uuid,${f.decision_reason},${f.version})`;
    }
    for (const e of method === 'createFacilityLicenseUpload' ||
    method === 'createProfessionalUpload'
      ? [...d.evidence.values()].filter((value: any) => !existingEvidenceIds.has(value.objectId))
      : []) {
      const facilityId =
        [...d.facilityEvidence.entries()].find((x: any) => x[1] === e.objectId)?.[0] ?? null;
      await sql`insert into identity.private_evidence_objects(id,bucket_code,object_key,owner_person_id,facility_id,sha256,mime_type,size_bytes,scan_status) values(${e.objectId}::uuid,${facilityId ? 'facility-license-evidence' : 'professional-license-evidence'},${`synthetic/${e.objectId}`},${e.ownerId}::uuid,${facilityId}::uuid,${e.sha256},'application/pdf',1,${e.scan}) on conflict(id) do update set scan_status=excluded.scan_status,released_at=case when excluded.scan_status='released' then now() else null end`;
    }
    for (const l of d.professionalLicenses.values()) {
      const secret = professionalSecrets.get(l.id);
      const protectedValue = this.protect(secret ?? l.id);
      const evidenceId = d.professionalEvidence.get(l.id) ?? null;
      await sql`insert into identity.professional_licenses(id,person_id,profession,specialty_code,number_ciphertext,number_hash,masked_license_number,issuer,expires_on,status,evidence_object_id,decision_reason,version) values(${l.id}::uuid,${l.person_id}::uuid,${l.profession},${l.specialty_code},${protectedValue.ciphertext},${protectedValue.hash},${l.masked_license_number},${l.issuer},${l.expires_on}::date,${l.status},${evidenceId}::uuid,${l.decision_reason},${l.version}) on conflict(id) do update set status=excluded.status,evidence_object_id=excluded.evidence_object_id,decision_reason=excluded.decision_reason,version=excluded.version`;
    }
    for (const m of d.memberships.values()) {
      const tokenHash = m.invite_token
        ? createHash('sha256').update(m.invite_token).digest()
        : null;
      await sql`insert into identity.facility_memberships(id,facility_id,person_id,role_code,employment_license_id,invite_token_hash,invite_expires_at,valid_from,valid_until,membership_status,created_by_person_id,version) values(${m.id}::uuid,${m.facility_id}::uuid,${m.person_id}::uuid,${m.role_code},${m.employment_license_id}::uuid,${tokenHash},${m.invite_expires_at}::timestamptz,${m.valid_from}::timestamptz,${m.valid_until}::timestamptz,${m.status},${actor.personId}::uuid,${m.version}) on conflict(id) do update set role_code=excluded.role_code,employment_license_id=excluded.employment_license_id,invite_token_hash=excluded.invite_token_hash,invite_expires_at=excluded.invite_expires_at,valid_from=excluded.valid_from,valid_until=excluded.valid_until,membership_status=excluded.membership_status,version=excluded.version`;
    }
    for (const r of d.revocations.values())
      if (existingRevocationIds.has(r.id))
        await sql`update identity.admin_role_revocation_requests set status=${r.status},decided_by=${r.decided_by}::uuid,version=${r.version} where id=${r.id}::uuid`;
      else
        await sql`insert into identity.admin_role_revocation_requests(id,grant_id,status,reason,proposed_by,decided_by,version) values(${r.id}::uuid,${r.grant_id}::uuid,${r.status},${r.reason},${r.proposed_by}::uuid,${r.decided_by}::uuid,${r.version})`;
    for (const g of d.grants.values())
      if (existingGrantIds.has(g.id))
        await sql`update identity.admin_role_grants set status=${g.status},decided_by=${g.decided_by}::uuid,decision_reason=${g.decision_reason},version=${g.version} where id=${g.id}::uuid`;
      else
        await sql`insert into identity.admin_role_grants(id,person_id,role_code,status,valid_from,valid_until,proposed_by,decided_by,decision_reason,version) values(${g.id}::uuid,${g.person_id}::uuid,${g.role_code},${g.status},${g.valid_from}::timestamptz,${g.valid_until}::timestamptz,${g.proposed_by}::uuid,${g.decided_by}::uuid,${g.decision_reason},${g.version})`;
    for (const fl of facilityLicenses) {
      const p = this.protect(fl.body.license_number);
      await sql`insert into identity.facility_licenses(id,facility_id,license_type,number_ciphertext,number_hash,issuer,expires_on,licensed_activities,status,evidence_object_id) values(${fl.id}::uuid,${fl.facilityId}::uuid,${fl.body.license_type},${p.ciphertext},${p.hash},${fl.body.issuer},${fl.body.expires_on}::date,${fl.body.licensed_activities},'pending',${fl.evidenceId}::uuid) on conflict(id) do nothing`;
    }
    for (const fl of d.facilityLicenses.values())
      if (existingFacilityLicenseIds.has(fl.id))
        await sql`update identity.facility_licenses set status=${fl.status} where id=${fl.id}::uuid and status is distinct from ${fl.status}`;
    for (const a of d.audit) {
      const digest = createHash('sha256').update(JSON.stringify(a)).digest('hex');
      await sql`insert into audit.events(event_hash,actor_person_id,facility_id,action,resource_type,resource_id,outcome,request_id,metadata) values(${digest},${actor.personId}::uuid,${a.facility_id ?? null}::uuid,${a.action},'facility-governance',${a.resource_id}::uuid,'success',${actor.requestId ?? randomUUID()}::uuid,${sql.json({ synthetic: true })})`;
      const type = String(a.action).startsWith('facility.')
        ? 'facility.changed'
        : String(a.action).startsWith('professional_license.')
          ? 'professional_license.changed'
          : String(a.action).startsWith('membership.')
            ? 'membership.changed'
            : 'admin_role.changed';
      await sql`insert into platform.outbox_events(aggregate_type,aggregate_id,event_type,payload) values('facility-governance',${a.resource_id}::uuid,${type},${sql.json({ resource_id: a.resource_id, facility_id: a.facility_id, status: 'changed' })})`;
    }
  }

  createFacility(a: FacilityActor, b: FacilityCreateInput) {
    return this.invoke('createFacility', a, b);
  }
  getFacility(a: FacilityActor, id: string) {
    return this.invoke('getFacility', a, id);
  }
  updateFacility(a: FacilityActor, id: string, b: FacilityPatchInput, v: number) {
    return this.invoke('updateFacility', a, id, b, v);
  }
  createFacilityLicenseUpload(a: FacilityActor, id: string, b: FacilityLicenseUploadInput) {
    return this.invoke('createFacilityLicenseUpload', a, id, b);
  }
  submitFacility(a: FacilityActor, id: string, v: number) {
    return this.invoke('submitFacility', a, id, v);
  }
  listFacilityCases(a: FacilityActor, q: FacilityPageQuery = {}) {
    return this.invoke('listFacilityCases', a, q);
  }
  reviewFacility(a: FacilityActor, id: string, b: FacilityReviewInput, v: number) {
    return this.invoke('reviewFacility', a, id, b, v);
  }
  createProfessionalLicense(a: FacilityActor, b: ProfessionalLicenseCreateInput) {
    return this.invoke('createProfessionalLicense', a, b);
  }
  createProfessionalUpload(a: FacilityActor, id: string, b: FacilityUploadMetadata) {
    return this.invoke('createProfessionalUpload', a, id, b);
  }
  getProfessionalLicense(a: FacilityActor, id: string) {
    return this.invoke('getProfessionalLicense', a, id);
  }
  listProfessionalCases(a: FacilityActor, q: FacilityPageQuery = {}) {
    return this.invoke('listProfessionalCases', a, q);
  }
  reviewProfessional(a: FacilityActor, id: string, b: ProfessionalReviewInput, v: number) {
    return this.invoke('reviewProfessional', a, id, b, v);
  }
  listMemberships(a: FacilityActor, id: string, q: FacilityPageQuery = {}) {
    return this.invoke('listMemberships', a, id, q);
  }
  inviteMember(a: FacilityActor, id: string, b: MembershipInviteInput) {
    return this.invoke('inviteMember', a, id, b);
  }
  acceptMembership(a: FacilityActor, t: string) {
    return this.invoke('acceptMembership', a, t);
  }
  updateMembership(a: FacilityActor, f: string, id: string, b: MembershipPatchInput, v: number) {
    return this.invoke('updateMembership', a, f, id, b, v);
  }
  endMembership(a: FacilityActor, f: string, id: string, b: ReasonInput, v: number) {
    return this.invoke('endMembership', a, f, id, b, v);
  }
  listGrants(a: FacilityActor, q: FacilityPageQuery = {}) {
    return this.invoke('listGrants', a, q);
  }
  proposeGrant(a: FacilityActor, b: AdminGrantProposalInput) {
    return this.invoke('proposeGrant', a, b);
  }
  decideGrant(a: FacilityActor, id: string, b: DecisionInput, v: number) {
    return this.invoke('decideGrant', a, id, b, v);
  }
  proposeRevocation(a: FacilityActor, id: string, b: ReasonInput, v: number) {
    return this.invoke('proposeRevocation', a, id, b, v);
  }
  decideRevocation(a: FacilityActor, id: string, b: DecisionInput, v: number) {
    return this.invoke('decideRevocation', a, id, b, v);
  }
}
