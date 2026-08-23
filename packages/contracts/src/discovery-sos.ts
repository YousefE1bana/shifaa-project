import { Type, type Static, type TSchema } from '@sinclair/typebox';

export const DISCOVERY_SOS_FEATURE_ID = '006-discovery-sos-foundation' as const;
export const discoverySosOperationIds = [
  'searchFacilities',
  'getFacilityCapacity',
  'createSosIncident',
  'getSosIncident',
  'listSosPrearrivals',
  'acceptSosPrearrival',
  'closeSosIncident',
  'createEmergencyShare',
  'revokeEmergencyShare',
  'viewEmergencyShare',
] as const;
export type DiscoverySosOperationId = (typeof discoverySosOperationIds)[number];

export const discoverySosOperations = {
  searchFacilities: ['GET', '/discovery/facilities', ['FR-DISC-001']],
  getFacilityCapacity: [
    'GET',
    '/discovery/hospitals/{facilityId}/capacity',
    ['FR-HOSP-007', 'FR-DISC-001'],
  ],
  createSosIncident: [
    'POST',
    '/sos/incidents',
    ['FR-SOS-001', 'FR-SOS-002', 'FR-SOS-004', 'FR-FAM-006'],
  ],
  getSosIncident: ['GET', '/sos/incidents/{incidentId}', ['FR-SOS-001', 'FR-SOS-002']],
  listSosPrearrivals: [
    'GET',
    '/hospitals/{facilityId}/sos-prearrivals',
    ['FR-SOS-002', 'FR-HOSP-001'],
  ],
  acceptSosPrearrival: [
    'POST',
    '/hospitals/{facilityId}/sos-incidents/{incidentId}/accept',
    ['FR-SOS-002'],
  ],
  closeSosIncident: ['POST', '/sos/incidents/{incidentId}/close', ['FR-SOS-001']],
  createEmergencyShare: ['POST', '/sos/incidents/{incidentId}/share-links', ['FR-SOS-003']],
  revokeEmergencyShare: ['POST', '/sos/share-links/{shareId}/revoke', ['FR-SOS-003']],
  viewEmergencyShare: ['GET', '/sos/share/{token}', ['FR-SOS-003']],
} as const satisfies Record<
  DiscoverySosOperationId,
  readonly ['GET' | 'POST', string, readonly string[]]
>;

const Uuid = Type.String({ format: 'uuid' });
const DateTime = Type.String({ format: 'date-time' });
const NullableDateTime = Type.Union([DateTime, Type.Null()]);
const closedObject = <T extends Record<string, TSchema>>(
  properties: T,
  required?: readonly string[],
) =>
  Type.Object(properties, {
    additionalProperties: false,
    ...(required ? { required: [...required] } : {}),
  });

export const GeoPointSchema = closedObject({
  latitude: Type.Number({ minimum: -90, maximum: 90 }),
  longitude: Type.Number({ minimum: -180, maximum: 180 }),
});
export const DiscoveryFacilityTypeSchema = Type.Union([
  Type.Literal('clinic'),
  Type.Literal('pharmacy'),
  Type.Literal('hospital'),
  Type.Literal('laboratory'),
]);
export const CapacitySignalSchema = Type.Union([
  Type.Literal('available'),
  Type.Literal('limited'),
  Type.Literal('unavailable'),
  Type.Literal('unknown'),
]);
export const CapacityFreshnessSchema = Type.Union([
  Type.Literal('fresh'),
  Type.Literal('stale'),
  Type.Literal('unknown'),
]);
export const CapacityCountBandSchema = Type.Union([
  Type.Literal('none'),
  Type.Literal('one_to_four'),
  Type.Literal('five_to_nine'),
  Type.Literal('ten_or_more'),
  Type.Literal('unknown'),
]);
export const CapacityProjectionSchema = closedObject({
  signal: CapacitySignalSchema,
  count_band: CapacityCountBandSchema,
  freshness: CapacityFreshnessSchema,
  observed_at: NullableDateTime,
  fresh_until: NullableDateTime,
});
export const RatingSummarySchema = closedObject({
  state: Type.Union([Type.Literal('available'), Type.Literal('unavailable')]),
  count: Type.Integer({ minimum: 0 }),
  average: Type.Union([Type.Number({ minimum: 1, maximum: 5 }), Type.Null()]),
});
export const FacilityProjectionSchema = closedObject({
  facility_id: Uuid,
  facility_type: DiscoveryFacilityTypeSchema,
  name: Type.String({ minLength: 1, maxLength: 160 }),
  address: Type.Optional(Type.String({ maxLength: 300 })),
  services: Type.Array(Type.String({ minLength: 1, maxLength: 64 }), { uniqueItems: true }),
  coordinates: GeoPointSchema,
  distance_m: Type.Union([Type.Number({ minimum: 0 }), Type.Null()]),
  rating_summary: RatingSummarySchema,
  operational_signal: CapacityProjectionSchema,
});
export const PageMetaSchema = closedObject({
  next_cursor: Type.Union([Type.String(), Type.Null()]),
});
export const FacilitySearchResponseSchema = closedObject({
  data: Type.Array(FacilityProjectionSchema),
  meta: PageMetaSchema,
});
export const CapacityResponseSchema = closedObject({
  facility_id: Uuid,
  capacity: CapacityProjectionSchema,
});

export const SosReasonCodeSchema = Type.Union([
  Type.Literal('medical_emergency'),
  Type.Literal('accident_or_injury'),
  Type.Literal('other_life_safety'),
]);
export const CreateSosIncidentRequestSchema = closedObject({
  managed_patient_id: Uuid,
  coordinates: GeoPointSchema,
  qualifying_reason_code: SosReasonCodeSchema,
  contact_preference: Type.Union([Type.Literal('none'), Type.Literal('all_confirmed')]),
  callback_source: Type.Union([
    Type.Literal('patient_verified_contact'),
    Type.Literal('initiator_verified_contact'),
  ]),
  explicit_activation: Type.Literal(true),
});
export const SosGuidanceSchema = closedObject({
  call_ambulance_123: Type.Boolean(),
  ambulance_dispatched: Type.Literal(false),
  bed_reserved: Type.Literal(false),
});
export const SosIncidentSchema = closedObject({
  incident_id: Uuid,
  managed_patient_id: Uuid,
  status: Type.Union([
    Type.Literal('active_unmatched'),
    Type.Literal('matched'),
    Type.Literal('accepted'),
    Type.Literal('closed'),
  ]),
  qualifying_reason_code: SosReasonCodeSchema,
  matched_facility: Type.Union([FacilityProjectionSchema, Type.Null()]),
  initiated_at: DateTime,
  accepted_at: Type.Optional(NullableDateTime),
  closed_at: Type.Optional(NullableDateTime),
  contact_delivery: Type.Optional(
    Type.Union([
      Type.Literal('not_requested'),
      Type.Literal('pending'),
      Type.Literal('delayed'),
      Type.Literal('delivered'),
      Type.Literal('failed'),
    ]),
  ),
  version: Type.Integer({ minimum: 1 }),
});
export const CreateSosIncidentResponseSchema = closedObject({
  incident: SosIncidentSchema,
  nearby_hospitals: Type.Array(FacilityProjectionSchema),
  guidance: SosGuidanceSchema,
});
export const SosIncidentResponseSchema = closedObject({
  incident: SosIncidentSchema,
  guidance: SosGuidanceSchema,
});
export const SosPrearrivalSchema = closedObject({
  incident_id: Uuid,
  status: Type.Union([Type.Literal('matched'), Type.Literal('accepted')]),
  qualifying_reason_code: SosReasonCodeSchema,
  distance_m: Type.Number({ minimum: 0 }),
  initiated_at: DateTime,
  capacity_freshness: CapacityFreshnessSchema,
  version: Type.Integer({ minimum: 1 }),
});
export const SosPrearrivalListResponseSchema = closedObject({
  data: Type.Array(SosPrearrivalSchema),
  meta: PageMetaSchema,
});
export const AcceptSosPrearrivalRequestSchema = closedObject({
  acknowledgement: Type.Literal(true),
  capacity_note_code: Type.Union([
    Type.Literal('capacity_acknowledged'),
    Type.Literal('manual_coordination_required'),
  ]),
});
export const CloseSosIncidentRequestSchema = closedObject({
  outcome_code: Type.Union([
    Type.Literal('help_received'),
    Type.Literal('no_longer_needed'),
    Type.Literal('hospital_follow_up'),
    Type.Literal('created_in_error'),
  ]),
});

export const EmergencyShareFieldSchema = Type.Union([
  Type.Literal('blood_group'),
  Type.Literal('confirmed_allergies'),
  Type.Literal('active_dispensed_medicines'),
  Type.Literal('chronic_conditions'),
  Type.Literal('emergency_notes'),
]);
export const CreateEmergencyShareRequestSchema = closedObject({
  allowed_fields: Type.Array(EmergencyShareFieldSchema, {
    minItems: 1,
    maxItems: 5,
    uniqueItems: true,
  }),
});
export const EmergencyShareSummarySchema = closedObject({
  share_id: Uuid,
  incident_id: Uuid,
  status: Type.Union([
    Type.Literal('active'),
    Type.Literal('used'),
    Type.Literal('revoked'),
    Type.Literal('expired'),
  ]),
  allowed_fields: Type.Array(EmergencyShareFieldSchema, { uniqueItems: true }),
  expires_at: DateTime,
  access_limit: Type.Literal(1),
  access_count: Type.Integer({ minimum: 0, maximum: 1 }),
  version: Type.Integer({ minimum: 1 }),
});
export const CreateEmergencyShareResponseSchema = closedObject({
  share: EmergencyShareSummarySchema,
  share_url: Type.String({ format: 'uri' }),
});
export const AllergyProjectionSchema = closedObject({
  substance: Type.String({ minLength: 1, maxLength: 160 }),
  reaction: Type.String({ minLength: 1, maxLength: 200 }),
  severity: Type.Union([
    Type.Literal('mild'),
    Type.Literal('moderate'),
    Type.Literal('severe'),
    Type.Literal('unknown'),
  ]),
});
export const MedicineProjectionSchema = closedObject({
  name: Type.String({ minLength: 1, maxLength: 200 }),
  status: Type.Union([Type.Literal('active'), Type.Literal('dispensed')]),
});
export const ConditionProjectionSchema = closedObject({
  name: Type.String({ minLength: 1, maxLength: 200 }),
});
export const EmergencyProfileAvailableFieldsSchema = closedObject({
  blood_group: Type.Optional(
    Type.Union([
      Type.Literal('A+'),
      Type.Literal('A-'),
      Type.Literal('B+'),
      Type.Literal('B-'),
      Type.Literal('AB+'),
      Type.Literal('AB-'),
      Type.Literal('O+'),
      Type.Literal('O-'),
      Type.Literal('unknown'),
    ]),
  ),
  confirmed_allergies: Type.Optional(Type.Array(AllergyProjectionSchema)),
  active_dispensed_medicines: Type.Optional(Type.Array(MedicineProjectionSchema)),
  chronic_conditions: Type.Optional(Type.Array(ConditionProjectionSchema)),
  emergency_notes: Type.Optional(Type.Array(Type.String({ minLength: 1, maxLength: 500 }))),
});
export const EmergencyShareViewResponseSchema = closedObject({
  available_fields: EmergencyProfileAvailableFieldsSchema,
  unavailable_fields: Type.Array(EmergencyShareFieldSchema, { uniqueItems: true }),
  expires_at: DateTime,
});

export const DiscoverySearchQuerySchema = closedObject({
  type: Type.Optional(DiscoveryFacilityTypeSchema),
  service: Type.Optional(Type.String({ minLength: 1, maxLength: 64, pattern: '^[a-z0-9._-]+$' })),
  near: Type.Optional(
    Type.String({
      pattern:
        '^-?(?:[0-8]?[0-9](?:\\.[0-9]{1,6})?|90(?:\\.0{1,6})?),-?(?:1[0-7][0-9](?:\\.[0-9]{1,6})?|[0-9]?[0-9](?:\\.[0-9]{1,6})?|180(?:\\.0{1,6})?)$',
    }),
  ),
  area: Type.Optional(Type.String({ minLength: 2, maxLength: 100 })),
  radius: Type.Optional(Type.Integer({ minimum: 100, maximum: 100000 })),
  limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 100 })),
  cursor: Type.Optional(Type.String({ minLength: 16, maxLength: 512 })),
});
export const SosPrearrivalQuerySchema = closedObject({
  status: Type.Optional(Type.Union([Type.Literal('matched'), Type.Literal('accepted')])),
  limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 100 })),
  cursor: Type.Optional(Type.String({ minLength: 16, maxLength: 512 })),
});

export const discoverySosRequestSchemas = {
  searchFacilities: DiscoverySearchQuerySchema,
  createSosIncident: CreateSosIncidentRequestSchema,
  listSosPrearrivals: SosPrearrivalQuerySchema,
  acceptSosPrearrival: AcceptSosPrearrivalRequestSchema,
  closeSosIncident: CloseSosIncidentRequestSchema,
  createEmergencyShare: CreateEmergencyShareRequestSchema,
} as const;

export const discoverySosResponseSchemas = {
  searchFacilities: FacilitySearchResponseSchema,
  getFacilityCapacity: CapacityResponseSchema,
  createSosIncident: CreateSosIncidentResponseSchema,
  getSosIncident: SosIncidentResponseSchema,
  listSosPrearrivals: SosPrearrivalListResponseSchema,
  acceptSosPrearrival: SosIncidentResponseSchema,
  closeSosIncident: SosIncidentResponseSchema,
  createEmergencyShare: CreateEmergencyShareResponseSchema,
  revokeEmergencyShare: EmergencyShareSummarySchema,
  viewEmergencyShare: EmergencyShareViewResponseSchema,
} as const satisfies Record<DiscoverySosOperationId, TSchema>;

export const discoverySosSensitiveFields = [
  'near',
  'coordinates',
  'token',
  'share_url',
  'available_fields',
] as const;

export type DiscoverySearchQuery = Static<typeof DiscoverySearchQuerySchema>;
export type SosPrearrivalQuery = Static<typeof SosPrearrivalQuerySchema>;
export type CreateSosIncidentInput = Static<typeof CreateSosIncidentRequestSchema>;
export type AcceptSosPrearrivalInput = Static<typeof AcceptSosPrearrivalRequestSchema>;
export type CloseSosIncidentInput = Static<typeof CloseSosIncidentRequestSchema>;
export type CreateEmergencyShareInput = Static<typeof CreateEmergencyShareRequestSchema>;
export type EmergencyShareField = Static<typeof EmergencyShareFieldSchema>;
export type FacilityProjection = Static<typeof FacilityProjectionSchema>;
export type FacilitySearchResponse = Static<typeof FacilitySearchResponseSchema>;
export type CapacityResponse = Static<typeof CapacityResponseSchema>;
export type SosIncident = Static<typeof SosIncidentSchema>;
export type CreateSosIncidentResponse = Static<typeof CreateSosIncidentResponseSchema>;
export type SosIncidentResponse = Static<typeof SosIncidentResponseSchema>;
export type SosPrearrivalListResponse = Static<typeof SosPrearrivalListResponseSchema>;
export type EmergencyShareSummary = Static<typeof EmergencyShareSummarySchema>;
export type CreateEmergencyShareResponse = Static<typeof CreateEmergencyShareResponseSchema>;
export type EmergencyShareViewResponse = Static<typeof EmergencyShareViewResponseSchema>;
