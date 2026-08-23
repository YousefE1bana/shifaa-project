import { createHash, randomBytes, randomUUID } from 'node:crypto';

import type {
  AcceptSosPrearrivalInput,
  CapacityResponse,
  CloseSosIncidentInput,
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
import { sosGuidance } from '@shifaa/core/discovery-sos';
import type { TransactionSql } from 'postgres';

import type {
  DiscoverySosActor,
  DiscoverySosServicePort,
} from '../../modules/discovery-sos/index.js';
import { ApiPolicyError } from '../../modules/identity-onboarding/errors.js';
import { PostgresIdentityRepository } from './identity-repository.js';

type Locale = 'ar-EG' | 'en-EG';
type Cursor = { distanceM: number | null; facilityId: string };
type PrearrivalCursor = { initiatedAt: string; incidentId: string };
type DiscoveryRow = {
  facility_id: string;
  facility_type: FacilityProjection['facility_type'];
  name_ar: string;
  name_en: string;
  services: string[];
  longitude: number;
  latitude: number;
  distance_m: number | null;
  capacity_signal: FacilityProjection['operational_signal']['signal'];
  capacity_count_band: FacilityProjection['operational_signal']['count_band'];
  capacity_freshness: FacilityProjection['operational_signal']['freshness'];
  capacity_observed_at: Date | null;
  capacity_fresh_until: Date | null;
};
type IncidentRow = {
  id: string;
  patient_id: string;
  qualifying_reason_code: SosIncident['qualifying_reason_code'];
  status: SosIncident['status'];
  matched_facility_id: string | null;
  initiated_at: Date;
  accepted_at: Date | null;
  closed_at: Date | null;
  contact_preference: 'none' | 'all_confirmed';
  version: number;
};
type ShareRow = {
  id: string;
  incident_id: string;
  scope_fields: EmergencyShareField[];
  expires_at: Date;
  access_count: number;
  used_at: Date | null;
  revoked_at: Date | null;
  version: number;
};

export interface PostgresDiscoverySosConfig {
  discoveryRadiusM: number;
  sosMatchRadiusM: number;
  capacitySourceCode: string;
  publicAppUrl: string;
  environment: 'local' | 'ci';
}

export class PostgresDiscoverySosService implements DiscoverySosServicePort {
  public constructor(
    private readonly repository: PostgresIdentityRepository,
    private readonly config: PostgresDiscoverySosConfig,
  ) {}

  public searchFacilities(
    query: DiscoverySearchQuery,
    locale: Locale = 'ar-EG',
  ): Promise<FacilitySearchResponse> {
    return this.repository.withRawTransaction(async (sql) => {
      await this.publicContext(sql);
      const cursor = this.cursor(query.cursor);
      const point = this.point(query.near);
      const limit = query.limit ?? 25;
      const rows = await sql<DiscoveryRow[]>`
        select * from platform.search_discovery_facilities(
          ${point?.longitude ?? null},${point?.latitude ?? null},${query.radius ?? this.config.discoveryRadiusM},
          ${query.type ?? null},${query.service ?? null},${query.area ?? null},
          ${cursor?.distanceM ?? null},${cursor?.facilityId ?? null}::uuid,${limit + 1})`;
      const page = rows.slice(0, limit);
      return {
        data: page.map((row) => this.facilityProjection(row, locale)),
        meta: { next_cursor: rows.length > limit ? this.nextCursor(page.at(-1)!) : null },
      };
    });
  }

  public getFacilityCapacity(facilityId: string): Promise<CapacityResponse> {
    return this.repository.withRawTransaction(async (sql) => {
      await this.publicContext(sql);
      const [row] = await sql<
        {
          facility_id: string;
          signal: CapacityResponse['capacity']['signal'];
          count_band: CapacityResponse['capacity']['count_band'];
          freshness: CapacityResponse['capacity']['freshness'];
          observed_at: Date | null;
          fresh_until: Date | null;
        }[]
      >`select * from platform.get_discovery_capacity(${facilityId}::uuid)`;
      if (!row) this.deny('not-found', 404);
      return {
        facility_id: row.facility_id,
        capacity: {
          signal: row.signal,
          count_band: row.count_band,
          freshness: row.freshness,
          observed_at: this.iso(row.observed_at),
          fresh_until: this.iso(row.fresh_until),
        },
      };
    });
  }

  public createSosIncident(
    actor: DiscoverySosActor,
    input: CreateSosIncidentInput,
  ): Promise<CreateSosIncidentResponse> {
    return this.repository.withRawTransaction(async (sql) => {
      await this.actorContext(sql, actor, 'PAT');
      const incidentId = randomUUID();
      const [row] = await sql<IncidentRow[]>`
        select * from platform.create_sos_incident_record(
          ${incidentId}::uuid,${input.managed_patient_id}::uuid,${input.coordinates.longitude},
          ${input.coordinates.latitude},${input.qualifying_reason_code},${input.contact_preference},
          ${input.callback_source},${this.config.sosMatchRadiusM},${this.config.capacitySourceCode})`;
      if (!row) throw new Error('SOS incident creation returned no row.');
      await this.appendEffect(sql, actor, row, 'sos.incident.created');
      if (input.contact_preference === 'all_confirmed') {
        await sql`
          insert into platform.outbox_events(aggregate_type,aggregate_id,aggregate_version,event_type,payload)
          values('sos-contact',${row.id}::uuid,1,'sos.emergency_contact.requested',
            ${sql.json({ incident_id: row.id, request_id: actor.requestId })})`;
      }
      const nearby = await this.nearbyHospitals(
        sql,
        input.coordinates.longitude,
        input.coordinates.latitude,
        actor.locale,
      );
      return {
        incident: await this.incidentProjection(sql, row, actor.locale, true),
        nearby_hospitals: nearby,
        guidance: sosGuidance,
      };
    });
  }

  public getSosIncident(
    actor: DiscoverySosActor,
    incidentId: string,
  ): Promise<SosIncidentResponse> {
    return this.repository.withRawTransaction(async (sql) => {
      await this.actorContext(sql, actor, actor.selectedPatientId ? 'PAT' : 'HSP');
      const row = await this.incidentById(sql, incidentId);
      return {
        incident: await this.incidentProjection(
          sql,
          row,
          actor.locale,
          Boolean(actor.selectedPatientId),
        ),
        guidance: sosGuidance,
      };
    });
  }

  public listSosPrearrivals(
    actor: DiscoverySosActor,
    facilityId: string,
    query: SosPrearrivalQuery,
  ): Promise<SosPrearrivalListResponse> {
    return this.repository.withRawTransaction(async (sql) => {
      await this.actorContext(sql, actor, 'HSP');
      const [authorization] = await sql<{ allowed: boolean }[]>`
        select platform.hospital_member_authorized(${facilityId}::uuid,${actor.personId}::uuid,false) allowed`;
      if (!authorization?.allowed) this.deny('forbidden', 403);
      const limit = query.limit ?? 25;
      const cursor = this.prearrivalCursor(query.cursor);
      const rows = await sql<
        (IncidentRow & { distance_m: number; capacity_freshness: 'fresh' | 'stale' | 'unknown' })[]
      >`
        select i.*,public.ST_Distance(i.coordinates,f.location)::double precision distance_m,
          coalesce(cp.freshness,'unknown') capacity_freshness
        from platform.sos_incidents i
        join identity.facilities f on f.id=i.matched_facility_id
        left join lateral platform.get_discovery_capacity(i.matched_facility_id) cp on true
        where i.matched_facility_id=${facilityId}::uuid and i.status in ('matched','accepted')
          and (${query.status ?? null}::text is null or i.status=${query.status ?? null})
          and (${cursor?.initiatedAt ?? null}::timestamptz is null
            or (i.initiated_at,i.id)<(${cursor?.initiatedAt ?? null}::timestamptz,${cursor?.incidentId ?? null}::uuid))
        order by i.initiated_at desc,i.id desc limit ${limit + 1}`;
      const page = rows.slice(0, limit);
      return {
        data: page.map((row) => ({
          incident_id: row.id,
          status: row.status as 'matched' | 'accepted',
          qualifying_reason_code: row.qualifying_reason_code,
          distance_m: row.distance_m,
          initiated_at: row.initiated_at.toISOString(),
          capacity_freshness: row.capacity_freshness,
          version: row.version,
        })),
        meta: {
          next_cursor:
            rows.length > limit && page.length > 0
              ? Buffer.from(
                  JSON.stringify({
                    initiatedAt: page.at(-1)!.initiated_at.toISOString(),
                    incidentId: page.at(-1)!.id,
                  } satisfies PrearrivalCursor),
                ).toString('base64url')
              : null,
        },
      };
    });
  }

  public acceptSosPrearrival(
    actor: DiscoverySosActor,
    facilityId: string,
    incidentId: string,
    input: AcceptSosPrearrivalInput,
    version: number,
  ): Promise<SosIncidentResponse> {
    return this.repository.withRawTransaction(async (sql) => {
      await this.actorContext(sql, actor, 'HSP');
      const [row] = await sql<IncidentRow[]>`
        select * from platform.accept_sos_prearrival(
          ${incidentId}::uuid,${facilityId}::uuid,${version},${input.capacity_note_code})`;
      if (!row) throw new Error('SOS acceptance returned no row.');
      await this.appendEffect(sql, actor, row, 'sos.incident.accepted', facilityId);
      return {
        incident: await this.incidentProjection(sql, row, actor.locale, false),
        guidance: sosGuidance,
      };
    });
  }

  public closeSosIncident(
    actor: DiscoverySosActor,
    incidentId: string,
    input: CloseSosIncidentInput,
    version: number,
  ): Promise<SosIncidentResponse> {
    return this.repository.withRawTransaction(async (sql) => {
      await this.actorContext(sql, actor, actor.selectedPatientId ? 'PAT' : 'HSP');
      const [row] = await sql<IncidentRow[]>`
        select * from platform.close_sos_incident(${incidentId}::uuid,${version},${input.outcome_code})`;
      if (!row) throw new Error('SOS closure returned no row.');
      await this.appendEffect(
        sql,
        actor,
        row,
        'sos.incident.closed',
        actor.selectedPatientId ? undefined : (row.matched_facility_id ?? undefined),
      );
      return {
        incident: await this.incidentProjection(
          sql,
          row,
          actor.locale,
          Boolean(actor.selectedPatientId),
        ),
        guidance: sosGuidance,
      };
    });
  }

  public createEmergencyShare(
    actor: DiscoverySosActor,
    incidentId: string,
    input: CreateEmergencyShareInput,
  ): Promise<CreateEmergencyShareResponse> {
    return this.repository.withRawTransaction(async (sql) => {
      if (!actor.selectedPatientId) this.deny('patient-context-required', 400);
      await this.actorContext(sql, actor);
      const token = randomBytes(32).toString('base64url');
      const digest = createHash('sha256').update(token, 'utf8').digest();
      const shareId = randomUUID();
      const [clock] = await sql<{ expires_at: Date }[]>`
        select statement_timestamp()+interval '29 minutes 59 seconds' expires_at`;
      if (!clock) throw new Error('Database clock returned no emergency-share expiry.');
      const [row] = await sql<ShareRow[]>`
        select * from platform.create_emergency_share_record(
          ${shareId}::uuid,${incidentId}::uuid,${digest},${input.allowed_fields},${clock.expires_at})`;
      if (!row) throw new Error('Emergency-share creation returned no row.');
      await this.appendEffect(
        sql,
        actor,
        { id: incidentId, patient_id: actor.selectedPatientId, version: row.version },
        'sos.share.created',
        undefined,
        shareId,
        row.version,
      );
      return {
        share: this.shareSummary(row),
        share_url: `${this.config.publicAppUrl.replace(/\/$/, '')}/sos/share#token=${token}`,
      };
    });
  }

  public revokeEmergencyShare(
    actor: DiscoverySosActor,
    shareId: string,
    version: number,
  ): Promise<EmergencyShareSummary> {
    return this.repository.withRawTransaction(async (sql) => {
      if (!actor.selectedPatientId) this.deny('patient-context-required', 400);
      await this.actorContext(sql, actor);
      const [row] = await sql<ShareRow[]>`
        select * from platform.revoke_emergency_share(${shareId}::uuid,${version})`;
      if (!row) throw new Error('Emergency-share revocation returned no row.');
      await this.appendEffect(
        sql,
        actor,
        { id: row.incident_id, patient_id: actor.selectedPatientId, version: row.version },
        'sos.share.revoked',
        undefined,
        shareId,
        row.version,
      );
      return this.shareSummary(row);
    });
  }

  public async viewEmergencyShare(
    token: string,
    requestId: string,
  ): Promise<EmergencyShareViewResponse> {
    const consumed = await this.repository.withRawTransaction(async (sql) => {
      await this.publicContext(sql);
      const digest = createHash('sha256').update(token, 'utf8').digest();
      const [row] = await sql<
        {
          outcome: 'success' | 'denied';
          denial_code: string | null;
          scope_fields: EmergencyShareField[];
          blood_group: string | null;
          unavailable_fields: EmergencyShareField[];
          expires_at: Date | null;
        }[]
      >`select * from platform.consume_emergency_share(${digest},${requestId}::uuid)`;
      if (!row) throw new Error('Emergency-share consumption returned no outcome.');
      return row;
    });
    if (consumed.outcome === 'denied') {
      this.deny(consumed.denial_code ?? 'emergency-share-expired', 410);
    }
    if (!consumed.expires_at) throw new Error('Emergency-share success omitted expiry.');
    return {
      available_fields: consumed.blood_group ? { blood_group: consumed.blood_group as 'O+' } : {},
      unavailable_fields: consumed.unavailable_fields,
      expires_at: consumed.expires_at.toISOString(),
    };
  }

  private async actorContext(
    sql: TransactionSql,
    actor: DiscoverySosActor,
    role: 'PAT' | 'HSP' = 'PAT',
  ): Promise<void> {
    await sql`
      select set_config('shifaa.person_id',${actor.personId},true),
        set_config('shifaa.patient_context',${actor.selectedPatientId ?? ''},true),
        set_config('shifaa.aal',${String(actor.aal)},true),
        set_config('shifaa.actor_role',${role},true),
        set_config('shifaa.purposes',${actor.purpose ?? ''},true),
        set_config('shifaa.principal',${actor.principal},true),
        set_config('shifaa.environment',${this.config.environment},true),
        set_config('statement_timeout','5000',true),set_config('lock_timeout','2000',true)`;
  }

  private async publicContext(sql: TransactionSql): Promise<void> {
    await sql`
      select set_config('shifaa.person_id','',true),set_config('shifaa.patient_context','',true),
        set_config('shifaa.aal','0',true),set_config('shifaa.actor_role','',true),set_config('shifaa.purposes','',true),
        set_config('shifaa.principal','public',true),set_config('shifaa.environment',${this.config.environment},true),
        set_config('statement_timeout','5000',true),set_config('lock_timeout','2000',true)`;
  }

  private point(near: string | undefined): { latitude: number; longitude: number } | undefined {
    if (!near) return undefined;
    const [latitude, longitude] = near.split(',').map(Number);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude))
      this.deny('validation-failed', 400);
    return { latitude: latitude!, longitude: longitude! };
  }

  private cursor(encoded: string | undefined): Cursor | undefined {
    if (!encoded) return undefined;
    try {
      const parsed = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')) as Cursor;
      if (!parsed.facilityId || (parsed.distanceM !== null && !Number.isFinite(parsed.distanceM))) {
        this.deny('validation-failed', 400);
      }
      return parsed;
    } catch (error) {
      if (error instanceof ApiPolicyError) throw error;
      this.deny('validation-failed', 400);
    }
  }

  private prearrivalCursor(encoded: string | undefined): PrearrivalCursor | undefined {
    if (!encoded) return undefined;
    try {
      const parsed = JSON.parse(
        Buffer.from(encoded, 'base64url').toString('utf8'),
      ) as PrearrivalCursor;
      if (
        !parsed.incidentId ||
        !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
          parsed.incidentId,
        ) ||
        !Number.isFinite(Date.parse(parsed.initiatedAt))
      ) {
        this.deny('validation-failed', 400);
      }
      return parsed;
    } catch (error) {
      if (error instanceof ApiPolicyError) throw error;
      this.deny('validation-failed', 400);
    }
  }

  private nextCursor(row: DiscoveryRow): string {
    return Buffer.from(
      JSON.stringify({ distanceM: row.distance_m, facilityId: row.facility_id } satisfies Cursor),
    ).toString('base64url');
  }

  private facilityProjection(row: DiscoveryRow, locale: Locale): FacilityProjection {
    return {
      facility_id: row.facility_id,
      facility_type: row.facility_type,
      name: locale === 'en-EG' ? row.name_en : row.name_ar,
      services: row.services,
      coordinates: { latitude: row.latitude, longitude: row.longitude },
      distance_m: row.distance_m,
      rating_summary: { state: 'unavailable', count: 0, average: null },
      operational_signal: {
        signal: row.capacity_signal,
        count_band: row.capacity_count_band,
        freshness: row.capacity_freshness,
        observed_at: this.iso(row.capacity_observed_at),
        fresh_until: this.iso(row.capacity_fresh_until),
      },
    };
  }

  private async incidentProjection(
    sql: TransactionSql,
    row: IncidentRow,
    locale: Locale,
    includeContactDelivery: boolean,
  ): Promise<SosIncident> {
    const matched = row.matched_facility_id
      ? await this.facilityById(sql, row.matched_facility_id, locale)
      : null;
    const delivery = includeContactDelivery
      ? (
          await sql<{ status: NonNullable<SosIncident['contact_delivery']> }[]>`
            select platform.sos_contact_delivery_status(${row.id}::uuid) status`
        )[0]
      : undefined;
    if (includeContactDelivery && !delivery) {
      throw new Error('SOS contact-delivery projection returned no status.');
    }
    return {
      incident_id: row.id,
      managed_patient_id: row.patient_id,
      status: row.status,
      qualifying_reason_code: row.qualifying_reason_code,
      matched_facility: matched,
      initiated_at: row.initiated_at.toISOString(),
      accepted_at: this.iso(row.accepted_at),
      closed_at: this.iso(row.closed_at),
      ...(delivery ? { contact_delivery: delivery.status } : {}),
      version: row.version,
    };
  }

  private async facilityById(
    sql: TransactionSql,
    facilityId: string,
    locale: Locale,
  ): Promise<FacilityProjection | null> {
    const [row] = await sql<DiscoveryRow[]>`
      select * from platform.get_discovery_facility(${facilityId}::uuid)`;
    return row ? this.facilityProjection(row, locale) : null;
  }

  private async nearbyHospitals(
    sql: TransactionSql,
    longitude: number,
    latitude: number,
    locale: Locale,
  ): Promise<FacilityProjection[]> {
    const rows = await sql<DiscoveryRow[]>`
      select * from platform.search_discovery_facilities(
        ${longitude},${latitude},${this.config.sosMatchRadiusM},'hospital',null,null,null,null,25)`;
    return rows.map((row) => this.facilityProjection(row, locale));
  }

  private async incidentById(sql: TransactionSql, incidentId: string): Promise<IncidentRow> {
    const [row] = await sql<IncidentRow[]>`
      select id,patient_id,qualifying_reason_code,status,matched_facility_id,initiated_at,
        accepted_at,closed_at,contact_preference,version
      from platform.sos_incidents where id=${incidentId}::uuid`;
    if (!row) this.deny('not-found', 404);
    return row;
  }

  private async appendEffect(
    sql: TransactionSql,
    actor: DiscoverySosActor,
    incident: Pick<IncidentRow, 'id' | 'patient_id' | 'version'>,
    action: string,
    facilityId?: string,
    resourceId = incident.id,
    effectVersion = incident.version,
  ): Promise<void> {
    const eventHash = createHash('sha256')
      .update(`${action}:${resourceId}:${effectVersion}:${actor.requestId}`)
      .digest('hex');
    await sql`
      insert into audit.events(event_hash,actor_person_id,patient_id,facility_id,purpose_code,action,resource_type,
        resource_id,outcome,request_id,metadata)
      values(${eventHash},${actor.personId}::uuid,${incident.patient_id}::uuid,${facilityId ?? null}::uuid,${actor.purpose ?? null},
        ${action},'discovery-sos',${resourceId}::uuid,'success',${actor.requestId}::uuid,
        ${sql.json({ purpose_code: actor.purpose ?? null, version: effectVersion })})`;
    await sql`
      insert into platform.outbox_events(aggregate_type,aggregate_id,aggregate_version,event_type,payload)
      values('discovery-sos',${resourceId}::uuid,${effectVersion},${action},
        ${sql.json({ resource_id: resourceId, request_id: actor.requestId })})`;
  }

  private shareSummary(row: ShareRow): EmergencyShareSummary {
    const status = row.used_at
      ? 'used'
      : row.revoked_at
        ? 'revoked'
        : row.expires_at <= new Date()
          ? 'expired'
          : 'active';
    return {
      share_id: row.id,
      incident_id: row.incident_id,
      status,
      allowed_fields: row.scope_fields,
      expires_at: row.expires_at.toISOString(),
      access_limit: 1,
      access_count: row.access_count,
      version: row.version,
    };
  }

  private iso(date: Date | null): string | null {
    return date?.toISOString() ?? null;
  }

  private deny(code: string, status: number): never {
    throw new ApiPolicyError(code, status, code);
  }
}
