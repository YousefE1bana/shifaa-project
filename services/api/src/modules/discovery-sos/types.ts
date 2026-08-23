import type {
  AcceptSosPrearrivalInput,
  CapacityResponse,
  CloseSosIncidentInput,
  CreateEmergencyShareInput,
  CreateEmergencyShareResponse,
  CreateSosIncidentInput,
  CreateSosIncidentResponse,
  DiscoverySearchQuery,
  EmergencyShareSummary,
  EmergencyShareViewResponse,
  FacilitySearchResponse,
  SosIncidentResponse,
  SosPrearrivalListResponse,
  SosPrearrivalQuery,
} from '@shifaa/contracts/discovery-sos';

export interface DiscoverySosActor {
  personId: string;
  principal: string;
  requestId: string;
  selectedPatientId?: string;
  purpose?: string;
  aal: 1 | 2;
  locale: 'ar-EG' | 'en-EG';
}

export interface DiscoverySosServicePort {
  searchFacilities(
    query: DiscoverySearchQuery,
    locale?: 'ar-EG' | 'en-EG',
  ): Promise<FacilitySearchResponse>;
  getFacilityCapacity(facilityId: string): Promise<CapacityResponse>;
  createSosIncident(
    actor: DiscoverySosActor,
    input: CreateSosIncidentInput,
  ): Promise<CreateSosIncidentResponse>;
  getSosIncident(actor: DiscoverySosActor, incidentId: string): Promise<SosIncidentResponse>;
  listSosPrearrivals(
    actor: DiscoverySosActor,
    facilityId: string,
    query: SosPrearrivalQuery,
  ): Promise<SosPrearrivalListResponse>;
  acceptSosPrearrival(
    actor: DiscoverySosActor,
    facilityId: string,
    incidentId: string,
    input: AcceptSosPrearrivalInput,
    version: number,
  ): Promise<SosIncidentResponse>;
  closeSosIncident(
    actor: DiscoverySosActor,
    incidentId: string,
    input: CloseSosIncidentInput,
    version: number,
  ): Promise<SosIncidentResponse>;
  createEmergencyShare(
    actor: DiscoverySosActor,
    incidentId: string,
    input: CreateEmergencyShareInput,
  ): Promise<CreateEmergencyShareResponse>;
  revokeEmergencyShare(
    actor: DiscoverySosActor,
    shareId: string,
    version: number,
  ): Promise<EmergencyShareSummary>;
  viewEmergencyShare(token: string, requestId: string): Promise<EmergencyShareViewResponse>;
}
