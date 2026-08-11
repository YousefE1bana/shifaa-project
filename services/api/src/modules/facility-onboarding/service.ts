import { randomBytes, randomUUID } from 'node:crypto';
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
  adminRoles,
  canTransitionFacility,
  canTransitionLicense,
  effectiveLicenseStatus,
  independentActors,
  type AdminRole,
  type FacilityStatus,
  type LicenseStatus,
} from '@shifaa/core';
import { ApiPolicyError } from '../identity-onboarding/errors.js';

export interface FacilityActor {
  personId: string;
  principal: string;
  requestId?: string;
  adminRole?: AdminRole;
  aal: 1 | 2;
  purpose?: string;
}
export interface FacilityPageQuery {
  cursor?: string;
  limit?: number;
}
type Facility = FacilityCreateInput & {
  id: string;
  facility_status: FacilityStatus;
  created_by_person_id: string;
  evidence_scan_status: 'quarantined' | 'released' | null;
  decision_reason: string | null;
  version: number;
};
type ProfessionalLicense = ProfessionalLicenseCreateInput & {
  id: string;
  person_id: string;
  masked_license_number: string;
  status: LicenseStatus;
  evidence_scan_status: 'quarantined' | 'released' | null;
  decision_reason: string | null;
  version: number;
};
type FacilityLicense = Omit<FacilityLicenseUploadInput, 'license_number'> & {
  id: string;
  facility_id: string;
  evidence_object_id: string;
  status: LicenseStatus;
};
type Membership = {
  id: string;
  facility_id: string;
  person_id: string;
  role_code: string;
  employment_license_id: string | null;
  valid_from: string;
  valid_until: string | null;
  status: 'invited' | 'active' | 'suspended' | 'ended' | 'expired' | 'rejected';
  invite_token?: string;
  invite_expires_at: string | null;
  version: number;
};
type Grant = {
  id: string;
  person_id: string;
  role_code: AdminRole;
  valid_from: string;
  valid_until: string | null;
  status: 'pending' | 'active' | 'rejected' | 'revoked' | 'expired';
  proposed_by: string;
  decided_by: string | null;
  decision_reason: string | null;
  version: number;
};
type Revocation = {
  id: string;
  grant_id: string;
  status: 'pending' | 'approved' | 'rejected';
  reason: string;
  proposed_by: string;
  decided_by: string | null;
  version: number;
};
type StoredEvidence = {
  objectId: string;
  sha256: string;
  scan: 'quarantined' | 'released';
  ownerId: string;
};

export class FacilityOnboardingService {
  readonly facilities = new Map<string, Facility>();
  readonly professionalLicenses = new Map<string, ProfessionalLicense>();
  readonly facilityLicenses = new Map<string, FacilityLicense>();
  readonly memberships = new Map<string, Membership>();
  readonly grants = new Map<string, Grant>();
  readonly revocations = new Map<string, Revocation>();
  readonly audit: Array<Record<string, unknown>> = [];
  readonly outbox: Array<Record<string, unknown>> = [];
  private readonly evidence = new Map<string, StoredEvidence>();
  private readonly facilityEvidence = new Map<string, string>();
  private readonly professionalEvidence = new Map<string, string>();
  constructor(private readonly now: () => Date = () => new Date()) {}
  private deny(code: string, status = 403, message = 'The action is not allowed.'): never {
    throw new ApiPolicyError(code, status, message);
  }
  private record(action: string, actor: FacilityActor, resourceId: string, facilityId?: string) {
    const base = {
      id: randomUUID(),
      action,
      actor_person_id: actor.personId,
      resource_id: resourceId,
      ...(facilityId ? { facility_id: facilityId } : {}),
    };
    this.audit.push(base);
    this.outbox.push({ ...base, type: `${action}.changed` });
  }
  private owner(actor: FacilityActor, facility: Facility) {
    if (facility.created_by_person_id !== actor.personId) this.deny('permission-denied');
  }
  private admin(actor: FacilityActor, role: AdminRole, purpose: string) {
    if (actor.adminRole !== role) this.deny('permission-denied');
    if (actor.aal !== 2) this.deny('aal2-required');
    if (actor.purpose !== purpose) this.deny('purpose-required');
  }
  private version(current: number, expected: number) {
    if (current !== expected) this.deny('version-conflict', 409, 'Refresh the current version.');
  }
  private validMembershipLicense(
    personId: string,
    roleCode: string,
    employmentLicenseId: string | null,
  ) {
    if (!['doctor', 'pharmacist', 'nurse', 'lab_professional'].includes(roleCode))
      this.deny('invalid-role', 400);
    const license = employmentLicenseId
      ? this.professionalLicenses.get(employmentLicenseId)
      : undefined;
    if (
      !license ||
      license.person_id !== personId ||
      license.profession !== roleCode ||
      effectiveLicenseStatus(license.status, license.expires_on, this.now()) !== 'verified'
    )
      this.deny('professional-license-invalid', 409);
  }
  private projection<T extends { version: number }>(value: T): T {
    return structuredClone(value);
  }
  private page<T extends { id: string }>(values: T[], query: FacilityPageQuery = {}) {
    const limit = query.limit ?? 25;
    let after = '';
    if (query.cursor) {
      after = Buffer.from(query.cursor, 'base64url').toString('utf8');
      if (!/^[0-9a-f-]{36}$/.test(after)) this.deny('cursor-invalid', 400);
    }
    const eligible = values
      .toSorted((a, b) => a.id.localeCompare(b.id))
      .filter((v) => v.id > after);
    const items = eligible.slice(0, limit);
    return {
      items,
      next_cursor:
        eligible.length > limit && items.length
          ? Buffer.from(items.at(-1)!.id).toString('base64url')
          : null,
    };
  }
  createFacility(actor: FacilityActor, body: FacilityCreateInput) {
    const id = randomUUID();
    const facility: Facility = {
      ...body,
      id,
      facility_status: 'draft',
      created_by_person_id: actor.personId,
      evidence_scan_status: null,
      decision_reason: null,
      version: 1,
    };
    this.facilities.set(id, facility);
    const membership: Membership = {
      id: randomUUID(),
      facility_id: id,
      person_id: actor.personId,
      role_code: 'owner',
      employment_license_id: null,
      valid_from: this.now().toISOString(),
      valid_until: null,
      status: 'active',
      invite_expires_at: null,
      version: 1,
    };
    this.memberships.set(membership.id, membership);
    this.record('facility.created', actor, id, id);
    return this.projection(facility);
  }
  getFacility(actor: FacilityActor, id: string) {
    const facility = this.facilities.get(id);
    if (!facility) this.deny('not-found', 404);
    const member = [...this.memberships.values()].some(
      (m) => m.facility_id === id && m.person_id === actor.personId && m.status === 'active',
    );
    if (facility.created_by_person_id !== actor.personId && !member)
      this.admin(actor, 'facility_approver', 'facility_approval');
    return this.projection(facility);
  }
  updateFacility(actor: FacilityActor, id: string, body: FacilityPatchInput, expected: number) {
    const facility = this.facilities.get(id);
    if (!facility) this.deny('not-found', 404);
    this.owner(actor, facility);
    this.version(facility.version, expected);
    if (!['draft', 'rejected'].includes(facility.facility_status)) this.deny('state-conflict', 409);
    Object.assign(facility, body, {
      facility_status: 'draft',
      decision_reason: null,
      version: facility.version + 1,
    });
    this.record('facility.updated', actor, id, id);
    return this.projection(facility);
  }
  createFacilityLicenseUpload(actor: FacilityActor, id: string, body: FacilityLicenseUploadInput) {
    const facility = this.facilities.get(id);
    if (!facility) this.deny('not-found', 404);
    this.owner(actor, facility);
    const objectId = randomUUID();
    this.evidence.set(objectId, {
      objectId,
      sha256: body.sha256,
      scan: 'quarantined',
      ownerId: actor.personId,
    });
    this.facilityEvidence.set(id, objectId);
    const licenseId = randomUUID();
    this.facilityLicenses.set(licenseId, {
      id: licenseId,
      facility_id: id,
      evidence_object_id: objectId,
      license_type: body.license_type,
      issuer: body.issuer,
      expires_on: body.expires_on,
      licensed_activities: body.licensed_activities,
      mime_type: body.mime_type,
      size_bytes: body.size_bytes,
      sha256: body.sha256,
      status: 'pending',
    });
    facility.evidence_scan_status = 'quarantined';
    facility.version++;
    this.record('facility.evidence_uploaded', actor, id, id);
    return {
      object_id: objectId,
      upload_url: `https://synthetic.invalid/private/${objectId}`,
      expires_at: new Date(this.now().getTime() + 300_000).toISOString(),
      scan_status: 'quarantined',
    };
  }
  submitFacility(actor: FacilityActor, id: string, expected: number) {
    const facility = this.facilities.get(id);
    if (!facility) this.deny('not-found', 404);
    this.owner(actor, facility);
    if (actor.aal !== 2) this.deny('aal2-required');
    this.version(facility.version, expected);
    const objectId = this.facilityEvidence.get(id);
    const evidence = objectId ? this.evidence.get(objectId) : undefined;
    const license = [...this.facilityLicenses.values()].find(
      (value) => value.facility_id === id && value.evidence_object_id === objectId,
    );
    if (!evidence) this.deny('evidence-required', 409);
    if (
      !license ||
      effectiveLicenseStatus(license.status, license.expires_on, this.now()) === 'expired'
    )
      this.deny('facility-license-invalid', 409);
    if (evidence.scan === 'quarantined') this.deny('evidence-quarantined', 409);
    if (!canTransitionFacility(facility.facility_status, 'pending_review'))
      this.deny('state-conflict', 409);
    facility.facility_status = 'pending_review';
    facility.version++;
    this.record('facility.submitted', actor, id, id);
    return this.projection(facility);
  }
  listFacilityCases(actor: FacilityActor, query: FacilityPageQuery = {}) {
    this.admin(actor, 'facility_approver', 'facility_approval');
    return this.page(
      [...this.facilities.values()]
        .filter((f) => ['pending_review', 'active', 'suspended'].includes(f.facility_status))
        .map((f) => ({
          id: f.id,
          facility_type: f.facility_type,
          name_ar: f.name_ar,
          name_en: f.name_en,
          facility_status: f.facility_status,
          evidence_scan_status: f.evidence_scan_status,
          version: f.version,
        })),
      query,
    );
  }
  reviewFacility(actor: FacilityActor, id: string, body: FacilityReviewInput, expected: number) {
    this.admin(actor, 'facility_approver', 'facility_approval');
    const facility = this.facilities.get(id);
    if (!facility) this.deny('not-found', 404);
    this.version(facility.version, expected);
    if (facility.created_by_person_id === actor.personId) this.deny('self-review-denied');
    if (facility.evidence_scan_status !== 'released') this.deny('evidence-quarantined', 409);
    const evidenceId = this.facilityEvidence.get(id);
    const license = [...this.facilityLicenses.values()].find(
      (value) => value.facility_id === id && value.evidence_object_id === evidenceId,
    );
    if (
      !license ||
      effectiveLicenseStatus(license.status, license.expires_on, this.now()) === 'expired'
    )
      this.deny('facility-license-invalid', 409);
    const target =
      body.decision === 'approve'
        ? 'active'
        : body.decision === 'reject'
          ? 'rejected'
          : 'suspended';
    if (!canTransitionFacility(facility.facility_status, target)) this.deny('state-conflict', 409);
    facility.facility_status = target;
    license.status =
      target === 'active' ? 'verified' : target === 'suspended' ? 'suspended' : 'rejected';
    facility.decision_reason = body.reason;
    facility.version++;
    this.record(`facility.${target}`, actor, id, id);
    return this.projection(facility);
  }
  createProfessionalLicense(actor: FacilityActor, body: ProfessionalLicenseCreateInput) {
    const id = randomUUID();
    const value: ProfessionalLicense = {
      ...body,
      id,
      person_id: actor.personId,
      masked_license_number: `••••${body.license_number.slice(-4)}`,
      status: 'pending',
      evidence_scan_status: null,
      decision_reason: null,
      version: 1,
    };
    delete (value as Partial<ProfessionalLicenseCreateInput>).license_number;
    this.professionalLicenses.set(id, value);
    this.record('professional_license.created', actor, id);
    return this.projection(value);
  }
  createProfessionalUpload(actor: FacilityActor, id: string, body: FacilityUploadMetadata) {
    const license = this.professionalLicenses.get(id);
    if (!license) this.deny('not-found', 404);
    if (license.person_id !== actor.personId) this.deny('permission-denied');
    const objectId = randomUUID();
    this.evidence.set(objectId, {
      objectId,
      sha256: body.sha256,
      scan: 'quarantined',
      ownerId: actor.personId,
    });
    this.professionalEvidence.set(id, objectId);
    license.evidence_scan_status = 'quarantined';
    license.version++;
    this.record('professional_license.evidence_uploaded', actor, id);
    return {
      object_id: objectId,
      upload_url: `https://synthetic.invalid/private/${objectId}`,
      expires_at: new Date(this.now().getTime() + 300_000).toISOString(),
      scan_status: 'quarantined',
    };
  }
  /** Seeded-synthetic scanner boundary. Deliberately not registered as an HTTP operation. */
  releaseEvidenceForSyntheticScanner(objectId: string) {
    const evidence = this.evidence.get(objectId);
    if (!evidence) this.deny('not-found', 404);
    evidence.scan = 'released';
    for (const [facilityId, evidenceId] of this.facilityEvidence)
      if (evidenceId === objectId) {
        const facility = this.facilities.get(facilityId);
        if (facility) facility.evidence_scan_status = 'released';
      }
    for (const [licenseId, evidenceId] of this.professionalEvidence)
      if (evidenceId === objectId) {
        const license = this.professionalLicenses.get(licenseId);
        if (license) license.evidence_scan_status = 'released';
      }
  }
  getProfessionalLicense(actor: FacilityActor, id: string) {
    const license = this.professionalLicenses.get(id);
    if (!license) this.deny('not-found', 404);
    if (license.person_id !== actor.personId && actor.adminRole !== 'facility_approver')
      this.deny('permission-denied');
    return this.projection({
      ...license,
      status: effectiveLicenseStatus(license.status, license.expires_on, this.now()),
    });
  }
  listProfessionalCases(actor: FacilityActor, query: FacilityPageQuery = {}) {
    this.admin(actor, 'facility_approver', 'professional_license_review');
    return this.page(
      [...this.professionalLicenses.values()].map((l) => ({
        id: l.id,
        profession: l.profession,
        masked_license_number: l.masked_license_number,
        status: effectiveLicenseStatus(l.status, l.expires_on, this.now()),
        expires_on: l.expires_on,
        evidence_scan_status: l.evidence_scan_status,
        version: l.version,
      })),
      query,
    );
  }
  reviewProfessional(
    actor: FacilityActor,
    id: string,
    body: ProfessionalReviewInput,
    expected: number,
  ) {
    this.admin(actor, 'facility_approver', 'professional_license_review');
    const license = this.professionalLicenses.get(id);
    if (!license) this.deny('not-found', 404);
    this.version(license.version, expected);
    if (license.person_id === actor.personId) this.deny('self-review-denied');
    const evidenceId = this.professionalEvidence.get(id);
    const evidence = evidenceId ? this.evidence.get(evidenceId) : undefined;
    if (!evidence || evidence.scan !== 'released') this.deny('evidence-quarantined', 409);
    const target: LicenseStatus =
      body.decision === 'verify'
        ? 'verified'
        : body.decision === 'reject'
          ? 'rejected'
          : 'suspended';
    if (!canTransitionLicense(license.status, target)) this.deny('state-conflict', 409);
    license.status = target;
    license.evidence_scan_status = 'released';
    license.decision_reason = body.reason;
    license.version++;
    this.record(`professional_license.${target}`, actor, id);
    return this.getProfessionalLicense(actor, id);
  }
  listMemberships(actor: FacilityActor, facilityId: string, query: FacilityPageQuery = {}) {
    const facility = this.facilities.get(facilityId);
    if (!facility) this.deny('not-found', 404);
    this.owner(actor, facility);
    return this.page(
      [...this.memberships.values()]
        .filter((m) => m.facility_id === facilityId)
        .map((m) => this.projection(m)),
      query,
    );
  }
  inviteMember(actor: FacilityActor, facilityId: string, body: MembershipInviteInput) {
    const facility = this.facilities.get(facilityId);
    if (!facility) this.deny('not-found', 404);
    this.owner(actor, facility);
    if (facility.facility_status !== 'active') this.deny('facility-inactive', 409);
    this.validMembershipLicense(body.person_id, body.role_code, body.employment_license_id ?? null);
    const token = randomBytes(24).toString('base64url');
    const membership: Membership = {
      id: randomUUID(),
      facility_id: facilityId,
      person_id: body.person_id,
      role_code: body.role_code,
      employment_license_id: body.employment_license_id ?? null,
      valid_from: body.valid_from,
      valid_until: body.valid_until ?? null,
      status: 'invited',
      invite_token: token,
      invite_expires_at: new Date(this.now().getTime() + 86_400_000).toISOString(),
      version: 1,
    };
    this.memberships.set(membership.id, membership);
    this.record('membership.invited', actor, membership.id, facilityId);
    return { ...this.projection(membership), invite_token: token };
  }
  acceptMembership(actor: FacilityActor, token: string) {
    const membership = [...this.memberships.values()].find((m) => m.invite_token === token);
    if (!membership) this.deny('not-found', 404);
    if (membership.person_id !== actor.personId) this.deny('permission-denied');
    if (membership.status !== 'invited') this.deny('state-conflict', 409);
    if (!membership.invite_expires_at || new Date(membership.invite_expires_at) <= this.now())
      this.deny('invite-expired', 409);
    const facility = this.facilities.get(membership.facility_id);
    if (!facility || facility.facility_status !== 'active') this.deny('facility-inactive', 409);
    if (new Date(membership.valid_from) > this.now()) this.deny('membership-not-yet-valid', 409);
    if (membership.valid_until && new Date(membership.valid_until) <= this.now())
      this.deny('membership-expired', 409);
    this.validMembershipLicense(
      membership.person_id,
      membership.role_code,
      membership.employment_license_id,
    );
    membership.status = 'active';
    delete membership.invite_token;
    membership.invite_expires_at = null;
    membership.version++;
    this.record('membership.accepted', actor, membership.id, membership.facility_id);
    return this.projection(membership);
  }
  updateMembership(
    actor: FacilityActor,
    facilityId: string,
    id: string,
    body: MembershipPatchInput,
    expected: number,
  ) {
    const facility = this.facilities.get(facilityId);
    const membership = this.memberships.get(id);
    if (!facility || !membership || membership.facility_id !== facilityId)
      this.deny('not-found', 404);
    this.owner(actor, facility);
    this.version(membership.version, expected);
    if (membership.role_code === 'owner') this.deny('owner-membership-required', 409);
    const next = { ...membership, ...body };
    this.validMembershipLicense(next.person_id, next.role_code, next.employment_license_id);
    if (new Date(next.valid_from) > this.now() && next.status === 'active')
      this.deny('membership-not-yet-valid', 409);
    if (next.valid_until && new Date(next.valid_until) <= this.now() && next.status === 'active')
      this.deny('membership-expired', 409);
    Object.assign(membership, body, { version: membership.version + 1 });
    this.record('membership.updated', actor, id, facilityId);
    return this.projection(membership);
  }
  endMembership(
    actor: FacilityActor,
    facilityId: string,
    id: string,
    _body: ReasonInput,
    expected: number,
  ) {
    const facility = this.facilities.get(facilityId);
    const membership = this.memberships.get(id);
    if (!facility || !membership || membership.facility_id !== facilityId)
      this.deny('not-found', 404);
    this.owner(actor, facility);
    this.version(membership.version, expected);
    if (membership.role_code === 'owner') this.deny('owner-membership-required', 409);
    membership.status = 'ended';
    membership.version++;
    this.record('membership.ended', actor, id, facilityId);
    return this.projection(membership);
  }
  listGrants(actor: FacilityActor, query: FacilityPageQuery = {}) {
    if (actor.adminRole !== 'super_admin') this.deny('permission-denied');
    return this.page(
      [...this.grants.values()].map((g) => this.projection(g)),
      query,
    );
  }
  proposeGrant(actor: FacilityActor, body: AdminGrantProposalInput) {
    this.admin(actor, 'super_admin', 'role_governance');
    if (!adminRoles.includes(body.role_code)) this.deny('invalid-role', 400);
    if (body.person_id === actor.personId) this.deny('separation-of-duties');
    const grant: Grant = {
      id: randomUUID(),
      person_id: body.person_id,
      role_code: body.role_code,
      valid_from: body.valid_from,
      valid_until: body.valid_until ?? null,
      status: 'pending',
      proposed_by: actor.personId,
      decided_by: null,
      decision_reason: body.reason,
      version: 1,
    };
    this.grants.set(grant.id, grant);
    this.record('admin_role.grant_proposed', actor, grant.id);
    return this.projection(grant);
  }
  decideGrant(actor: FacilityActor, id: string, body: DecisionInput, expected: number) {
    this.admin(actor, 'super_admin', 'role_governance');
    const grant = this.grants.get(id);
    if (!grant) this.deny('not-found', 404);
    this.version(grant.version, expected);
    if (
      grant.status !== 'pending' ||
      !independentActors({
        proposerId: grant.proposed_by,
        deciderId: actor.personId,
        targetId: grant.person_id,
      })
    )
      this.deny('separation-of-duties');
    grant.status = body.decision === 'approve' ? 'active' : 'rejected';
    grant.decided_by = actor.personId;
    grant.decision_reason = body.reason;
    grant.version++;
    this.record('admin_role.grant_decided', actor, id);
    return this.projection(grant);
  }
  proposeRevocation(actor: FacilityActor, id: string, body: ReasonInput, expected: number) {
    this.admin(actor, 'super_admin', 'role_governance');
    const grant = this.grants.get(id);
    if (!grant) this.deny('not-found', 404);
    this.version(grant.version, expected);
    if (grant.status !== 'active' || grant.person_id === actor.personId)
      this.deny('separation-of-duties');
    const request: Revocation = {
      id: randomUUID(),
      grant_id: id,
      status: 'pending',
      reason: body.reason,
      proposed_by: actor.personId,
      decided_by: null,
      version: 1,
    };
    this.revocations.set(request.id, request);
    this.record('admin_role.revocation_proposed', actor, request.id);
    return this.projection(request);
  }
  decideRevocation(actor: FacilityActor, id: string, body: DecisionInput, expected: number) {
    this.admin(actor, 'super_admin', 'role_governance');
    const request = this.revocations.get(id);
    if (!request) this.deny('not-found', 404);
    this.version(request.version, expected);
    const grant = this.grants.get(request.grant_id)!;
    if (
      request.status !== 'pending' ||
      !independentActors({
        proposerId: request.proposed_by,
        deciderId: actor.personId,
        targetId: grant.person_id,
      })
    )
      this.deny('separation-of-duties');
    request.status = body.decision === 'approve' ? 'approved' : 'rejected';
    request.decided_by = actor.personId;
    request.version++;
    if (request.status === 'approved') {
      grant.status = 'revoked';
      grant.version++;
    }
    this.record('admin_role.revocation_decided', actor, id);
    return this.projection(request);
  }
}
