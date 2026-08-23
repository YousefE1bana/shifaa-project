import { createHash, randomBytes, randomUUID } from 'node:crypto';

import type {
  CapacityResponse,
  CreateEmergencyShareInput,
  CreateEmergencyShareResponse,
  CreateSosIncidentInput,
  CreateSosIncidentResponse,
  DiscoverySearchQuery,
  EmergencyShareField,
  EmergencyShareSummary,
  EmergencyShareViewResponse,
  FacilityProjection,
  FacilitySearchResponse,
  SosIncident,
  SosIncidentResponse,
  SosPrearrivalListResponse,
  SosPrearrivalQuery,
} from '@shifaa/contracts/discovery-sos';
import {
  authorizeSosPermission,
  canTransitionEmergencyShare,
  canTransitionSosIncident,
  capacityCountBand,
  capacityFreshness,
  capacityQualifies,
  facilityMatchesDiscovery,
  projectEmergencyShare,
  rankFacilities,
  sosGuidance,
  type CapacityFact,
  type EmergencyShareStatus,
} from '@shifaa/core/discovery-sos';

import { ApiPolicyError } from '../identity-onboarding/errors.js';
import type { DiscoverySosActor, DiscoverySosServicePort } from './types.js';

type FacilityRecord = {
  projection: FacilityProjection;
  nameAr: string;
  nameEn: string;
  active: boolean;
  locationVerified: boolean;
  licenseVerified: boolean;
  licenseExpiresAt: Date | null;
  area: string;
  capacity?: CapacityFact;
};
type IncidentRecord = {
  incident: SosIncident;
  coordinates: { latitude: number; longitude: number };
  initiatedByPersonId: string;
  contactPreference: 'none' | 'all_confirmed';
  callbackSource: 'patient_verified_contact' | 'initiator_verified_contact';
  matchedDistanceM: number | null;
};
type ShareRecord = {
  summary: EmergencyShareSummary;
  tokenDigest: string;
  patientId: string;
  createdByPersonId: string;
};

export type DiscoverySosEffect = {
  action: string;
  actor_person_id?: string;
  patient_id?: string;
  facility_id?: string;
  resource_id?: string;
  request_id: string;
  outcome: string;
};

const syntheticIds = {
  selfPerson: '60000000-0000-4000-8000-000000000001',
  activateDelegate: '60000000-0000-4000-8000-000000000002',
  shareDelegate: '60000000-0000-4000-8000-000000000003',
  hospitalMember: '60000000-0000-4000-8000-000000000004',
  patient: '61000000-0000-4000-8000-000000000001',
  hospital: '63000000-0000-4000-8000-000000000001',
  staleHospital: '63000000-0000-4000-8000-000000000002',
} as const;

const projectedCapacity = (capacity: CapacityFact | undefined, now: Date) => ({
  signal: capacity?.signal ?? ('unknown' as const),
  count_band: capacityCountBand(capacity),
  freshness: capacityFreshness(capacity, now, 'synthetic_seed'),
  observed_at: capacity?.observedAt.toISOString() ?? null,
  fresh_until: capacity?.freshUntil.toISOString() ?? null,
});

export class DiscoverySosService implements DiscoverySosServicePort {
  public readonly facilities = new Map<string, FacilityRecord>();
  public readonly incidents = new Map<string, IncidentRecord>();
  public readonly shares = new Map<string, ShareRecord>();
  public readonly audit: DiscoverySosEffect[] = [];
  public readonly outbox: DiscoverySosEffect[] = [];

  public constructor(
    private readonly now = () => new Date(),
    private readonly publicAppUrl = 'http://127.0.0.1:8081',
  ) {
    this.seedFacilities();
  }

  public async searchFacilities(
    query: DiscoverySearchQuery,
    locale: 'ar-EG' | 'en-EG' = 'ar-EG',
  ): Promise<FacilitySearchResponse> {
    const now = this.now();
    const facilities = [...this.facilities.values()].filter((record) =>
      facilityMatchesDiscovery(
        {
          active: record.active,
          locationVerified: record.locationVerified,
          licenseVerified: record.licenseVerified,
          licenseExpiresAt: record.licenseExpiresAt,
          facilityType: record.projection.facility_type,
          services: record.projection.services,
        },
        {
          ...(query.type ? { facilityType: query.type } : {}),
          ...(query.service ? { service: query.service } : {}),
          now,
        },
      ),
    );
    const areaFiltered = query.area
      ? facilities.filter((record) => record.area.toLowerCase() === query.area!.toLowerCase())
      : facilities;
    const ranked = rankFacilities(
      areaFiltered.map(({ projection }) => ({
        facilityId: projection.facility_id,
        distanceM: query.near ? projection.distance_m : null,
      })),
    );
    const ordered = ranked.map(({ facilityId, distanceM }) => {
      const record = this.facilities.get(facilityId)!;
      return {
        ...record.projection,
        name: locale === 'en-EG' ? record.nameEn : record.nameAr,
        distance_m: distanceM,
        operational_signal: projectedCapacity(record.capacity, now),
      };
    });
    const limit = query.limit ?? 25;
    return { data: ordered.slice(0, limit), meta: { next_cursor: null } };
  }

  public async getFacilityCapacity(facilityId: string): Promise<CapacityResponse> {
    const facility = this.facilities.get(facilityId);
    if (!facility || !facility.active || facility.projection.facility_type !== 'hospital') {
      this.deny('not-found', 404);
    }
    return { facility_id: facilityId, capacity: projectedCapacity(facility.capacity, this.now()) };
  }

  public async createSosIncident(
    actor: DiscoverySosActor,
    input: CreateSosIncidentInput,
  ): Promise<CreateSosIncidentResponse> {
    this.requirePatientContext(actor, input.managed_patient_id);
    this.requirePermission(actor, input.managed_patient_id, 'sos.activate');
    if (!input.explicit_activation) this.deny('validation-failed', 422);
    if (
      [...this.incidents.values()].some(
        ({ incident }) =>
          incident.managed_patient_id === input.managed_patient_id && incident.status !== 'closed',
      )
    ) {
      this.deny('state-transition-invalid', 409);
    }
    const nearbyHospitals = await this.matchableHospitals(actor.locale);
    const matched = nearbyHospitals[0] ?? null;
    const incidentId = randomUUID();
    const incident: SosIncident = {
      incident_id: incidentId,
      managed_patient_id: input.managed_patient_id,
      status: matched ? 'matched' : 'active_unmatched',
      qualifying_reason_code: input.qualifying_reason_code,
      matched_facility: matched,
      initiated_at: this.now().toISOString(),
      accepted_at: null,
      closed_at: null,
      contact_delivery: input.contact_preference === 'all_confirmed' ? 'pending' : 'not_requested',
      version: 1,
    };
    this.incidents.set(incidentId, {
      incident,
      coordinates: input.coordinates,
      initiatedByPersonId: actor.personId,
      contactPreference: input.contact_preference,
      callbackSource: input.callback_source,
      matchedDistanceM: matched?.distance_m ?? null,
    });
    this.recordMutation(actor, input.managed_patient_id, incidentId, 'sos.incident.created');
    if (input.contact_preference === 'all_confirmed') {
      this.outbox.push({
        action: 'sos.emergency_contact.requested',
        actor_person_id: actor.personId,
        patient_id: input.managed_patient_id,
        resource_id: incidentId,
        request_id: actor.requestId,
        outcome: 'pending',
      });
    }
    return { incident, nearby_hospitals: nearbyHospitals, guidance: sosGuidance };
  }

  public async getSosIncident(
    actor: DiscoverySosActor,
    incidentId: string,
  ): Promise<SosIncidentResponse> {
    const record = this.incidentRecord(incidentId);
    this.requireIncidentRead(actor, record);
    return { incident: record.incident, guidance: sosGuidance };
  }

  public async listSosPrearrivals(
    actor: DiscoverySosActor,
    facilityId: string,
    query: SosPrearrivalQuery,
  ): Promise<SosPrearrivalListResponse> {
    this.requireHospital(actor, facilityId, 'sos_prearrival', 1);
    const records = [...this.incidents.values()]
      .filter(({ incident }) => incident.matched_facility?.facility_id === facilityId)
      .filter(({ incident }) => ['matched', 'accepted'].includes(incident.status))
      .filter(({ incident }) => !query.status || incident.status === query.status)
      .sort((left, right) => right.incident.initiated_at.localeCompare(left.incident.initiated_at));
    const limit = query.limit ?? 25;
    return {
      data: records.slice(0, limit).map((record) => ({
        incident_id: record.incident.incident_id,
        status: record.incident.status as 'matched' | 'accepted',
        qualifying_reason_code: record.incident.qualifying_reason_code,
        distance_m: record.matchedDistanceM ?? 0,
        initiated_at: record.incident.initiated_at,
        capacity_freshness: projectedCapacity(this.facilities.get(facilityId)?.capacity, this.now())
          .freshness,
        version: record.incident.version,
      })),
      meta: { next_cursor: null },
    };
  }

  public async acceptSosPrearrival(
    actor: DiscoverySosActor,
    facilityId: string,
    incidentId: string,
    _input: { acknowledgement: true; capacity_note_code: string },
    version: number,
  ): Promise<SosIncidentResponse> {
    this.requireHospital(actor, facilityId, 'sos_prearrival', 2);
    const record = this.incidentRecord(incidentId);
    this.requireVersion(record.incident.version, version);
    if (record.incident.matched_facility?.facility_id !== facilityId) this.deny('not-found', 404);
    if (!canTransitionSosIncident(record.incident.status, 'accepted'))
      this.deny('version-conflict', 409);
    const capacity = this.facilities.get(facilityId)?.capacity;
    if (!capacityQualifies(capacity, this.now(), 'synthetic_seed'))
      this.deny('capacity-stale', 409);
    record.incident = {
      ...record.incident,
      status: 'accepted',
      accepted_at: this.now().toISOString(),
      version: record.incident.version + 1,
    };
    this.recordMutation(
      actor,
      record.incident.managed_patient_id,
      incidentId,
      'sos.prearrival.accepted',
      facilityId,
    );
    return { incident: record.incident, guidance: sosGuidance };
  }

  public async closeSosIncident(
    actor: DiscoverySosActor,
    incidentId: string,
    _input: { outcome_code: string },
    version: number,
  ): Promise<SosIncidentResponse> {
    const record = this.incidentRecord(incidentId);
    this.requireClose(actor, record);
    this.requireVersion(record.incident.version, version);
    if (!canTransitionSosIncident(record.incident.status, 'closed'))
      this.deny('sos-incident-terminal', 409);
    record.incident = {
      ...record.incident,
      status: 'closed',
      closed_at: this.now().toISOString(),
      version: record.incident.version + 1,
    };
    this.recordMutation(
      actor,
      record.incident.managed_patient_id,
      incidentId,
      'sos.incident.closed',
      actor.selectedPatientId ? undefined : record.incident.matched_facility?.facility_id,
    );
    return { incident: record.incident, guidance: sosGuidance };
  }

  public async createEmergencyShare(
    actor: DiscoverySosActor,
    incidentId: string,
    input: CreateEmergencyShareInput,
  ): Promise<CreateEmergencyShareResponse> {
    const incident = this.incidentRecord(incidentId);
    this.requirePatientContext(actor, incident.incident.managed_patient_id);
    this.requirePermission(actor, incident.incident.managed_patient_id, 'sos.share');
    if (incident.incident.status === 'closed') this.deny('sos-incident-terminal', 409);
    const token = randomBytes(32).toString('base64url');
    const shareId = randomUUID();
    const summary: EmergencyShareSummary = {
      share_id: shareId,
      incident_id: incidentId,
      status: 'active',
      allowed_fields: [...input.allowed_fields],
      expires_at: new Date(this.now().getTime() + 30 * 60_000).toISOString(),
      access_limit: 1,
      access_count: 0,
      version: 1,
    };
    this.shares.set(shareId, {
      summary,
      tokenDigest: this.tokenDigest(token),
      patientId: incident.incident.managed_patient_id,
      createdByPersonId: actor.personId,
    });
    this.recordMutation(actor, incident.incident.managed_patient_id, shareId, 'sos.share.created');
    return {
      share: summary,
      share_url: `${this.publicAppUrl.replace(/\/$/, '')}/sos/share#token=${token}`,
    };
  }

  public async revokeEmergencyShare(
    actor: DiscoverySosActor,
    shareId: string,
    version: number,
  ): Promise<EmergencyShareSummary> {
    const share = this.shareRecord(shareId);
    this.requirePatientContext(actor, share.patientId);
    this.requirePermission(actor, share.patientId, 'sos.share');
    this.requireVersion(share.summary.version, version);
    if (!canTransitionEmergencyShare(share.summary.status, 'revoked'))
      this.deny('version-conflict', 409);
    share.summary = { ...share.summary, status: 'revoked', version: share.summary.version + 1 };
    this.recordMutation(actor, share.patientId, shareId, 'sos.share.revoked');
    return share.summary;
  }

  public async viewEmergencyShare(
    token: string,
    requestId: string,
  ): Promise<EmergencyShareViewResponse> {
    const digest = this.tokenDigest(token);
    const share = [...this.shares.values()].find((candidate) => candidate.tokenDigest === digest);
    if (
      !share ||
      share.summary.status !== 'active' ||
      new Date(share.summary.expires_at) <= this.now()
    ) {
      this.deny('emergency-share-expired', 410);
    }
    share.summary = { ...share.summary, status: 'used', access_count: 1 };
    this.audit.push({
      action: 'sos.share.viewed',
      resource_id: share.summary.share_id,
      request_id: requestId,
      outcome: 'success',
    });
    const projection = projectEmergencyShare(
      share.summary.allowed_fields as EmergencyShareField[],
      { blood_group: share.patientId === syntheticIds.patient ? 'O+' : null },
    );
    return { ...projection, expires_at: share.summary.expires_at } as EmergencyShareViewResponse;
  }

  private async matchableHospitals(locale: 'ar-EG' | 'en-EG'): Promise<FacilityProjection[]> {
    const now = this.now();
    const candidates = [...this.facilities.values()].filter(
      (record) =>
        record.projection.facility_type === 'hospital' &&
        record.active &&
        record.locationVerified &&
        record.licenseVerified &&
        capacityQualifies(record.capacity, now, 'synthetic_seed'),
    );
    return rankFacilities(
      candidates.map(({ projection }) => ({
        facilityId: projection.facility_id,
        distanceM: projection.distance_m,
      })),
    ).map(({ facilityId }) => {
      const record = this.facilities.get(facilityId)!;
      return {
        ...record.projection,
        name: locale === 'en-EG' ? record.nameEn : record.nameAr,
      };
    });
  }

  private requirePermission(
    actor: DiscoverySosActor,
    patientId: string,
    permission: 'sos.activate' | 'sos.share',
  ): void {
    const permissions =
      actor.personId === syntheticIds.activateDelegate
        ? ['sos.activate']
        : actor.personId === syntheticIds.shareDelegate
          ? ['sos.share']
          : [];
    const allowed = authorizeSosPermission({
      isSelf: actor.personId === syntheticIds.selfPerson && patientId === syntheticIds.patient,
      relationshipActive: permissions.length > 0,
      relationshipValidNow: true,
      permissions,
      requestedPermission: permission,
    });
    if (!allowed) this.deny('sos-permission-required', 403);
  }

  private requirePatientContext(actor: DiscoverySosActor, patientId: string): void {
    if (!actor.selectedPatientId) this.deny('patient-context-required', 400);
    if (actor.selectedPatientId !== patientId) this.deny('patient-context-mismatch', 403);
  }

  private requireHospital(
    actor: DiscoverySosActor,
    facilityId: string,
    purpose: string,
    minimumAal: 1 | 2,
  ): void {
    if (actor.personId !== syntheticIds.hospitalMember || facilityId !== syntheticIds.hospital) {
      this.deny('not-found', 404);
    }
    if (actor.purpose !== purpose) this.deny('purpose-required', 403);
    if (actor.aal < minimumAal) this.deny('mfa-required', 403);
  }

  private requireIncidentRead(actor: DiscoverySosActor, record: IncidentRecord): void {
    if (actor.selectedPatientId === record.incident.managed_patient_id) {
      this.requirePermission(actor, record.incident.managed_patient_id, 'sos.activate');
      return;
    }
    const facilityId = record.incident.matched_facility?.facility_id;
    if (facilityId) {
      this.requireHospital(actor, facilityId, 'sos_prearrival', 1);
      return;
    }
    this.deny('not-found', 404);
  }

  private requireClose(actor: DiscoverySosActor, record: IncidentRecord): void {
    if (actor.selectedPatientId === record.incident.managed_patient_id) {
      this.requirePermission(actor, record.incident.managed_patient_id, 'sos.activate');
      return;
    }
    const facilityId = record.incident.matched_facility?.facility_id;
    if (facilityId) {
      this.requireHospital(actor, facilityId, 'sos_prearrival', 2);
      return;
    }
    this.deny('not-found', 404);
  }

  private incidentRecord(incidentId: string): IncidentRecord {
    const record = this.incidents.get(incidentId);
    if (!record) this.deny('not-found', 404);
    return record;
  }

  private shareRecord(shareId: string): ShareRecord {
    const record = this.shares.get(shareId);
    if (!record) this.deny('not-found', 404);
    return record;
  }

  private requireVersion(actual: number, expected: number): void {
    if (actual !== expected) this.deny('version-conflict', 409);
  }

  private tokenDigest(token: string): string {
    return createHash('sha256').update(token, 'utf8').digest('hex');
  }

  private recordMutation(
    actor: DiscoverySosActor,
    patientId: string,
    resourceId: string,
    action: string,
    facilityId?: string,
  ): void {
    this.audit.push({
      action,
      actor_person_id: actor.personId,
      patient_id: patientId,
      ...(facilityId ? { facility_id: facilityId } : {}),
      resource_id: resourceId,
      request_id: actor.requestId,
      outcome: 'success',
    });
  }

  private deny(code: string, status: number): never {
    throw new ApiPolicyError(code, status, code);
  }

  private seedFacilities(): void {
    const referenceTime = this.now().getTime();
    const freshCapacity: CapacityFact = {
      signal: 'available',
      availableCount: 3,
      observedAt: new Date(referenceTime - 5 * 60_000),
      freshUntil: new Date(referenceTime + 5 * 60_000),
      sourceCode: 'synthetic_seed',
    };
    const staleCapacity: CapacityFact = {
      ...freshCapacity,
      signal: 'limited',
      availableCount: 1,
      freshUntil: new Date(referenceTime - 1),
    };
    this.facilities.set(
      syntheticIds.hospital,
      this.facilityRecord(syntheticIds.hospital, 'Synthetic Cairo Hospital', 850, freshCapacity),
    );
    this.facilities.set(
      syntheticIds.staleHospital,
      this.facilityRecord(
        syntheticIds.staleHospital,
        'Synthetic Giza Hospital',
        1_600,
        staleCapacity,
      ),
    );
  }

  private facilityRecord(
    facilityId: string,
    name: string,
    distanceM: number,
    capacity: CapacityFact,
  ): FacilityRecord {
    return {
      projection: {
        facility_id: facilityId,
        facility_type: 'hospital',
        name,
        address: 'Synthetic Cairo area',
        services: ['emergency'],
        coordinates: { latitude: 30.0444, longitude: 31.2357 },
        distance_m: distanceM,
        rating_summary: { state: 'unavailable', count: 0, average: null },
        operational_signal: projectedCapacity(capacity, this.now()),
      },
      nameAr:
        facilityId === syntheticIds.hospital ? 'مستشفى القاهرة التجريبي' : 'مستشفى الجيزة التجريبي',
      nameEn: name,
      active: true,
      locationVerified: true,
      licenseVerified: true,
      licenseExpiresAt: new Date('2027-01-01T00:00:00.000Z'),
      area: 'Cairo',
      capacity,
    };
  }
}
