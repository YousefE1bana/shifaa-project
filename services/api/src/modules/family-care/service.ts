import { createHmac, randomBytes, randomUUID } from 'node:crypto';
import type {
  CreateDelegationInput,
  CreateEmergencyContactInput,
  CreateGuardianshipInput,
  GuardianshipDecisionInput,
  RespondEmergencyContactInput,
  RevokeRelationshipInput,
  UpdateDelegationInput,
} from '@shifaa/contracts';
import {
  canTransitionEmergencyContact,
  canTransitionRelationship,
  validatePermissionSet,
  type EmergencyContactStatus,
  type FamilyPermissionCode,
  type RelationshipStatus,
  type RelationshipType,
} from '@shifaa/core';
import { ApiPolicyError } from '../identity-onboarding/errors.js';

export interface FamilyActor {
  personId: string;
  principal: string;
  requestId: string;
  role?: 'support_admin';
  aal: 1 | 2;
  purpose?: string;
  selectedPatientId?: string;
}
export interface FamilyPageQuery {
  cursor?: string;
  limit?: number;
  status?: string;
}
type Relationship = {
  id: string;
  managed_patient_id: string;
  actor_person_id: string;
  created_by_person_id: string;
  relationship_type: RelationshipType;
  status: RelationshipStatus;
  purpose_code: string | null;
  permissions: FamilyPermissionCode[];
  valid_from: string;
  valid_until: string | null;
  version: number;
  evidence_object_id?: string;
  invite_digest?: string;
  invite_expires_at?: string;
  reviewed_by_person_id?: string;
  reviewed_at?: string;
};
type Contact = {
  id: string;
  managed_patient_id: string;
  created_by_person_id: string;
  masked_phone: string;
  preferred_locale: 'ar-EG' | 'en-EG';
  location_precision: 'none' | 'coarse' | 'exact';
  status: EmergencyContactStatus;
  invite_digest: string;
  invite_expires_at: string;
  version: number;
};
type Evidence = { owner: string; patient: string; status: 'released' | 'quarantined' };
export type FamilyEffect = {
  action: string;
  actor_person_id: string;
  patient_id: string;
  resource_id: string;
  request_id: string;
  payload: Record<string, unknown>;
};

const ids = {
  selfPerson: '40000000-0000-4000-8000-000000000001',
  dependentPerson: '40000000-0000-4000-8000-000000000002',
  guardian: '40000000-0000-4000-8000-000000000003',
  delegate: '40000000-0000-4000-8000-000000000004',
  selfPatient: '41000000-0000-4000-8000-000000000001',
  dependentPatient: '41000000-0000-4000-8000-000000000002',
  releasedEvidence: '42000000-0000-4000-8000-000000000001',
  quarantinedEvidence: '42000000-0000-4000-8000-000000000002',
} as const;

export class FamilyCareService {
  public readonly relationships = new Map<string, Relationship>();
  public readonly contacts = new Map<string, Contact>();
  public readonly evidence = new Map<string, Evidence>();
  public readonly audit: FamilyEffect[] = [];
  public readonly outbox: FamilyEffect[] = [];

  public constructor(
    private readonly now = () => new Date(),
    private readonly invitationHmacKey: Uint8Array = Buffer.alloc(32, 2),
  ) {
    this.relationships.set('43000000-0000-4000-8000-000000000001', {
      id: '43000000-0000-4000-8000-000000000001',
      managed_patient_id: ids.selfPatient,
      actor_person_id: ids.selfPerson,
      created_by_person_id: ids.selfPerson,
      relationship_type: 'self',
      status: 'active',
      purpose_code: null,
      permissions: [],
      valid_from: '2026-01-01T00:00:00.000Z',
      valid_until: null,
      version: 1,
    });
    this.relationships.set('43000000-0000-4000-8000-000000000010', {
      id: '43000000-0000-4000-8000-000000000010',
      managed_patient_id: ids.dependentPatient,
      actor_person_id: ids.dependentPerson,
      created_by_person_id: ids.dependentPerson,
      relationship_type: 'self',
      status: 'active',
      purpose_code: null,
      permissions: [],
      valid_from: '2026-01-01T00:00:00.000Z',
      valid_until: null,
      version: 1,
    });
    this.evidence.set(ids.releasedEvidence, {
      owner: ids.guardian,
      patient: ids.dependentPatient,
      status: 'released',
    });
    this.evidence.set(ids.quarantinedEvidence, {
      owner: ids.guardian,
      patient: ids.dependentPatient,
      status: 'quarantined',
    });
  }

  private deny(code: string, status = 403): never {
    throw new ApiPolicyError(code, status, code);
  }
  private ensureContext(actor: FamilyActor, patientId: string) {
    if (!actor.selectedPatientId) this.deny('patient-context-required', 400);
    if (actor.selectedPatientId !== patientId) this.deny('patient-context-mismatch', 403);
  }
  private isSelf(personId: string, patientId: string) {
    return [...this.relationships.values()].some(
      (r) =>
        r.relationship_type === 'self' &&
        r.status === 'active' &&
        r.actor_person_id === personId &&
        r.managed_patient_id === patientId,
    );
  }
  private purposeBoundAuthority(actor: FamilyActor, patientId: string) {
    return [...this.relationships.values()].some(
      (r) =>
        r.actor_person_id === actor.personId &&
        r.managed_patient_id === patientId &&
        r.status === 'active' &&
        new Date(r.valid_from) <= this.now() &&
        (!r.valid_until || new Date(r.valid_until) > this.now()) &&
        (r.relationship_type === 'self' || r.purpose_code === actor.purpose),
    );
  }
  private canManageEmergencyContacts(actor: FamilyActor, patientId: string) {
    return [...this.relationships.values()].some(
      (r) =>
        r.actor_person_id === actor.personId &&
        r.managed_patient_id === patientId &&
        ['self', 'guardianship'].includes(r.relationship_type) &&
        r.status === 'active' &&
        new Date(r.valid_from) <= this.now() &&
        (!r.valid_until || new Date(r.valid_until) > this.now()) &&
        (r.relationship_type === 'self' || r.purpose_code === actor.purpose),
    );
  }
  private support(actor: FamilyActor) {
    if (actor.role !== 'support_admin' || actor.aal < 2) this.deny('aal2-required');
    if (actor.purpose !== 'guardianship_review') this.deny('purpose-required');
  }
  private version(actual: number, expected: number) {
    if (actual !== expected) this.deny('version-conflict', 409);
  }
  private effect(
    action: string,
    actor: FamilyActor,
    patientId: string,
    resourceId: string,
    payload: Record<string, unknown>,
  ) {
    const item = {
      action,
      actor_person_id: actor.personId,
      patient_id: patientId,
      resource_id: resourceId,
      request_id: actor.requestId,
      payload,
    };
    this.audit.push(structuredClone(item));
    this.outbox.push(structuredClone(item));
  }
  private projection(value: Relationship) {
    const {
      evidence_object_id: _e,
      invite_digest: _d,
      invite_expires_at: _x,
      reviewed_by_person_id: _r,
      reviewed_at: _reviewedAt,
      created_by_person_id: _c,
      ...safe
    } = value;
    return structuredClone(safe);
  }
  private page<T extends { id: string }>(values: T[], query: FamilyPageQuery = {}) {
    const limit = query.limit ?? 25;
    let after = '';
    if (query.cursor) {
      try {
        after = Buffer.from(query.cursor, 'base64url').toString('utf8');
      } catch {
        this.deny('cursor-invalid', 400);
      }
    }
    const eligible = values
      .toSorted((a, b) => a.id.localeCompare(b.id))
      .filter((v) => v.id > after);
    const items = eligible.slice(0, limit);
    return {
      items,
      next_cursor:
        eligible.length > limit ? Buffer.from(items.at(-1)!.id).toString('base64url') : null,
    };
  }
  private digest(token: string) {
    return createHmac('sha256', this.invitationHmacKey).update(token, 'utf8').digest('hex');
  }

  public invitationPrincipal(token: string) {
    return `invite:${this.digest(token)}`;
  }

  listRelationships(actor: FamilyActor, patientId: string, query: FamilyPageQuery = {}) {
    if (!this.purposeBoundAuthority(actor, patientId)) this.deny('permission-denied');
    return this.page(
      [...this.relationships.values()]
        .filter((r) => r.managed_patient_id === patientId)
        .map((r) => this.projection(r)),
      query,
    );
  }
  createGuardianship(actor: FamilyActor, patientId: string, body: CreateGuardianshipInput) {
    this.ensureContext(actor, patientId);
    const evidence = this.evidence.get(body.evidence_object_id);
    if (
      !evidence ||
      evidence.owner !== actor.personId ||
      evidence.patient !== patientId ||
      evidence.status !== 'released'
    )
      this.deny('evidence-not-released', 409);
    if (!validatePermissionSet('guardianship', body.requested_permissions))
      this.deny('permission-invalid', 422);
    const value: Relationship = {
      id: randomUUID(),
      managed_patient_id: patientId,
      actor_person_id: actor.personId,
      created_by_person_id: actor.personId,
      relationship_type: 'guardianship',
      status: 'pending',
      purpose_code: body.purpose_code,
      permissions: [...body.requested_permissions],
      valid_from: this.now().toISOString(),
      valid_until: null,
      version: 1,
      evidence_object_id: body.evidence_object_id,
    };
    this.relationships.set(value.id, value);
    this.effect('relationship.guardianship.created', actor, patientId, value.id, {
      status: value.status,
      permissions: value.permissions,
    });
    return this.projection(value);
  }
  listGuardianshipCases(actor: FamilyActor, query: FamilyPageQuery = {}) {
    this.support(actor);
    return this.page(
      [...this.relationships.values()]
        .filter(
          (r) =>
            r.relationship_type === 'guardianship' && (!query.status || r.status === query.status),
        )
        .map((r) => ({
          id: r.id,
          relationship: this.projection(r),
          evidence_status: 'released' as const,
          evidence_type: 'guardianship-evidence' as const,
          submitted_at: r.valid_from,
        })),
      query,
    );
  }
  reviewGuardianship(
    actor: FamilyActor,
    id: string,
    body: GuardianshipDecisionInput,
    expected: number,
  ) {
    this.support(actor);
    const value = this.relationships.get(id);
    if (!value || value.relationship_type !== 'guardianship') this.deny('not-found', 404);
    this.version(value.version, expected);
    if (actor.personId === value.actor_person_id || actor.personId === value.created_by_person_id)
      this.deny('self-review-denied');
    const target = body.decision === 'approved' ? 'active' : 'rejected';
    if (!canTransitionRelationship('guardianship', value.status, target))
      this.deny('state-conflict', 409);
    if (target === 'active' && (!body.valid_until || !body.approved_permissions?.length))
      this.deny('decision-incomplete', 422);
    if (
      body.approved_permissions &&
      (!validatePermissionSet('guardianship', body.approved_permissions) ||
        body.approved_permissions.some((permission) => !value.permissions.includes(permission)))
    )
      this.deny('permission-inflation-denied', 422);
    value.status = target;
    value.valid_until = body.valid_until ?? null;
    value.permissions = [...(body.approved_permissions ?? value.permissions)];
    value.reviewed_by_person_id = actor.personId;
    value.version++;
    this.effect(`relationship.guardianship.${target}`, actor, value.managed_patient_id, id, {
      status: target,
      permissions: value.permissions,
      valid_until: value.valid_until,
    });
    return this.projection(value);
  }
  createDelegation(actor: FamilyActor, patientId: string, body: CreateDelegationInput) {
    this.ensureContext(actor, patientId);
    if (!this.isSelf(actor.personId, patientId)) this.deny('permission-denied');
    if (!validatePermissionSet('delegation', body.permissions))
      this.deny('permission-invalid', 422);
    if (body.delegate_person_id === actor.personId || new Date(body.valid_until) <= this.now())
      this.deny('delegation-invalid', 422);
    const token = randomBytes(32).toString('base64url');
    const value: Relationship = {
      id: randomUUID(),
      managed_patient_id: patientId,
      actor_person_id: body.delegate_person_id,
      created_by_person_id: actor.personId,
      relationship_type: 'delegation',
      status: 'pending',
      purpose_code: body.purpose_code,
      permissions: [...body.permissions],
      valid_from: this.now().toISOString(),
      valid_until: body.valid_until,
      version: 1,
      invite_digest: this.digest(token),
      invite_expires_at: new Date(this.now().getTime() + 86_400_000).toISOString(),
    };
    this.relationships.set(value.id, value);
    this.effect('relationship.delegation.created', actor, patientId, value.id, {
      status: 'pending',
      permissions: value.permissions,
    });
    return {
      relationship: this.projection(value),
      invitation_token: token,
      invitation_expires_at: value.invite_expires_at,
    };
  }
  acceptDelegation(actor: FamilyActor, id: string, token: string) {
    const value = this.relationships.get(id);
    if (!value || value.relationship_type !== 'delegation') this.deny('invite-unavailable');
    if (
      value.actor_person_id !== actor.personId ||
      value.invite_digest !== this.digest(token) ||
      !value.invite_expires_at ||
      new Date(value.invite_expires_at) <= this.now()
    )
      this.deny('invite-unavailable');
    if (!canTransitionRelationship('delegation', value.status, 'active'))
      this.deny('invite-unavailable', 409);
    value.status = 'active';
    delete value.invite_digest;
    delete value.invite_expires_at;
    value.version++;
    this.effect('relationship.delegation.accepted', actor, value.managed_patient_id, id, {
      status: 'active',
      permissions: value.permissions,
    });
    return this.projection(value);
  }
  updateDelegation(actor: FamilyActor, id: string, body: UpdateDelegationInput, expected: number) {
    const value = this.relationships.get(id);
    if (!value || value.relationship_type !== 'delegation') this.deny('not-found', 404);
    this.ensureContext(actor, value.managed_patient_id);
    if (
      value.created_by_person_id !== actor.personId ||
      !['pending', 'active'].includes(value.status)
    )
      this.deny('permission-denied');
    this.version(value.version, expected);
    if (body.permissions && !validatePermissionSet('delegation', body.permissions))
      this.deny('permission-invalid', 422);
    if (body.valid_until && new Date(body.valid_until) <= this.now())
      this.deny('validity-invalid', 422);
    if (body.permissions) value.permissions = [...body.permissions];
    if (body.valid_until) value.valid_until = body.valid_until;
    value.version++;
    this.effect('relationship.delegation.updated', actor, value.managed_patient_id, id, {
      status: value.status,
      permissions: value.permissions,
      valid_until: value.valid_until,
    });
    return this.projection(value);
  }
  revokeRelationship(
    actor: FamilyActor,
    id: string,
    _body: RevokeRelationshipInput,
    expected: number,
  ) {
    const value = this.relationships.get(id);
    if (!value || value.relationship_type === 'self') this.deny('not-found', 404);
    this.ensureContext(actor, value.managed_patient_id);
    this.version(value.version, expected);
    if (value.relationship_type === 'guardianship') this.support(actor);
    else if (value.created_by_person_id !== actor.personId) this.deny('permission-denied');
    if (!canTransitionRelationship(value.relationship_type, value.status, 'revoked'))
      this.deny('state-conflict', 409);
    value.status = 'revoked';
    value.version++;
    this.effect(
      `relationship.${value.relationship_type}.revoked`,
      actor,
      value.managed_patient_id,
      id,
      { status: 'revoked' },
    );
    return this.projection(value);
  }
  createEmergencyContact(actor: FamilyActor, patientId: string, body: CreateEmergencyContactInput) {
    this.ensureContext(actor, patientId);
    if (!this.canManageEmergencyContacts(actor, patientId)) this.deny('permission-denied');
    const token = randomBytes(32).toString('base64url');
    const contact: Contact = {
      id: randomUUID(),
      managed_patient_id: patientId,
      created_by_person_id: actor.personId,
      masked_phone: `${body.phone_e164.slice(0, 4)}••••${body.phone_e164.slice(-4)}`,
      preferred_locale: body.preferred_locale,
      location_precision: body.location_precision,
      status: 'pending',
      invite_digest: this.digest(token),
      invite_expires_at: new Date(this.now().getTime() + 86_400_000).toISOString(),
      version: 1,
    };
    this.contacts.set(contact.id, contact);
    this.effect('emergency_contact.created', actor, patientId, contact.id, {
      status: 'pending',
      locale: contact.preferred_locale,
      location_precision: contact.location_precision,
    });
    return { contact: this.contactProjection(contact), invitation_token: token };
  }
  listEmergencyContacts(actor: FamilyActor, patientId: string, query: FamilyPageQuery = {}) {
    if (!this.canManageEmergencyContacts(actor, patientId)) this.deny('permission-denied');
    return this.page(
      [...this.contacts.values()]
        .filter((c) => c.managed_patient_id === patientId)
        .map((c) => this.contactProjection(c)),
      query,
    );
  }
  respondEmergencyContact(
    token: string,
    body: Omit<RespondEmergencyContactInput, 'token'>,
    requestId: string,
  ) {
    const contact = [...this.contacts.values()].find((c) => c.invite_digest === this.digest(token));
    if (
      !contact ||
      contact.status !== 'pending' ||
      new Date(contact.invite_expires_at) <= this.now()
    )
      this.deny('invite-unavailable');
    if (!canTransitionEmergencyContact(contact.status, body.decision))
      this.deny('invite-unavailable', 409);
    contact.status = body.decision;
    contact.version++;
    const actor: FamilyActor = {
      personId: '00000000-0000-4000-8000-000000000000',
      principal: `invite:${contact.invite_digest}`,
      requestId,
      aal: 1,
    };
    this.effect(
      `emergency_contact.${body.decision}`,
      actor,
      contact.managed_patient_id,
      contact.id,
      { status: body.decision },
    );
    return { status: body.decision };
  }
  revokeEmergencyContact(
    actor: FamilyActor,
    id: string,
    _body: RevokeRelationshipInput,
    expected: number,
  ) {
    const contact = this.contacts.get(id);
    if (!contact) this.deny('not-found', 404);
    this.ensureContext(actor, contact.managed_patient_id);
    if (!this.canManageEmergencyContacts(actor, contact.managed_patient_id))
      this.deny('permission-denied');
    this.version(contact.version, expected);
    if (!canTransitionEmergencyContact(contact.status, 'revoked')) this.deny('state-conflict', 409);
    contact.status = 'revoked';
    contact.version++;
    this.effect('emergency_contact.revoked', actor, contact.managed_patient_id, id, {
      status: 'revoked',
    });
    return this.contactProjection(contact);
  }
  private contactProjection(contact: Contact) {
    const { invite_digest: _d, created_by_person_id: _c, ...safe } = contact;
    return structuredClone(safe);
  }
}

type ServiceResult = unknown | Promise<unknown>;
export interface FamilyCareServicePort {
  invitationPrincipal(token: string): string;
  listRelationships(actor: FamilyActor, patientId: string, query?: FamilyPageQuery): ServiceResult;
  createGuardianship(
    actor: FamilyActor,
    patientId: string,
    body: CreateGuardianshipInput,
  ): ServiceResult;
  listGuardianshipCases(actor: FamilyActor, query?: FamilyPageQuery): ServiceResult;
  reviewGuardianship(
    actor: FamilyActor,
    id: string,
    body: GuardianshipDecisionInput,
    version: number,
  ): ServiceResult;
  createDelegation(
    actor: FamilyActor,
    patientId: string,
    body: CreateDelegationInput,
  ): ServiceResult;
  acceptDelegation(actor: FamilyActor, id: string, token: string): ServiceResult;
  updateDelegation(
    actor: FamilyActor,
    id: string,
    body: UpdateDelegationInput,
    version: number,
  ): ServiceResult;
  revokeRelationship(
    actor: FamilyActor,
    id: string,
    body: RevokeRelationshipInput,
    version: number,
  ): ServiceResult;
  createEmergencyContact(
    actor: FamilyActor,
    patientId: string,
    body: CreateEmergencyContactInput,
  ): ServiceResult;
  listEmergencyContacts(
    actor: FamilyActor,
    patientId: string,
    query?: FamilyPageQuery,
  ): ServiceResult;
  respondEmergencyContact(
    token: string,
    body: Omit<RespondEmergencyContactInput, 'token'>,
    requestId: string,
  ): ServiceResult;
  revokeEmergencyContact(
    actor: FamilyActor,
    id: string,
    body: RevokeRelationshipInput,
    version: number,
  ): ServiceResult;
}
