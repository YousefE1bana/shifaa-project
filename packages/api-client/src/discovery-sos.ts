// @generated from specs/006-discovery-sos-foundation/contracts/openapi.yaml — DO NOT EDIT.
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

export const generatedDiscoverySosOperationIds = [
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

export interface DiscoverySosClientOptions {
  baseUrl: string;
  accessToken?: string;
  fetch?: typeof globalThis.fetch;
  acceptLanguage?: 'ar-EG' | 'en-EG';
  defaultHeaders?: Record<string, string>;
}
export interface DiscoverySosRequestOptions {
  signal?: AbortSignal;
  patientId?: string;
  purpose?: string;
  aal?: 1 | 2;
}

export class DiscoverySosApiError extends Error {
  public constructor(
    public readonly status: number,
    public readonly problem: unknown,
  ) {
    super(`SHIFAA Discovery/SOS API failed with status ${status}.`);
    this.name = 'DiscoverySosApiError';
  }
}

type RequestInput = DiscoverySosRequestOptions & {
  body?: unknown;
  idempotencyKey?: string;
  version?: number;
  anonymous?: boolean;
  requirePrivateNoStore?: boolean;
  requireNoReferrer?: boolean;
};

export class DiscoverySosClient {
  private readonly fetcher: typeof globalThis.fetch;

  public constructor(private readonly options: DiscoverySosClientOptions) {
    this.fetcher = (options.fetch ?? globalThis.fetch).bind(globalThis);
  }

  public searchFacilities(
    query: DiscoverySearchQuery = {},
    options: DiscoverySosRequestOptions = {},
  ): Promise<FacilitySearchResponse> {
    return this.request('GET', this.queryPath('/discovery/facilities', query), {
      anonymous: !this.options.accessToken,
      ...options,
    });
  }

  public getFacilityCapacity(
    facilityId: string,
    options: DiscoverySosRequestOptions = {},
  ): Promise<CapacityResponse> {
    return this.request('GET', `/discovery/hospitals/${encodeURIComponent(facilityId)}/capacity`, {
      anonymous: !this.options.accessToken,
      ...options,
    });
  }

  public createSosIncident(
    body: CreateSosIncidentInput,
    idempotencyKey: string,
    options: DiscoverySosRequestOptions = {},
  ): Promise<CreateSosIncidentResponse> {
    return this.request('POST', '/sos/incidents', {
      body,
      idempotencyKey,
      patientId: body.managed_patient_id,
      requirePrivateNoStore: true,
      ...options,
    });
  }

  public getSosIncident(
    incidentId: string,
    options: DiscoverySosRequestOptions = {},
  ): Promise<SosIncidentResponse> {
    return this.request('GET', `/sos/incidents/${encodeURIComponent(incidentId)}`, {
      requirePrivateNoStore: true,
      ...options,
    });
  }

  public listSosPrearrivals(
    facilityId: string,
    query: SosPrearrivalQuery = {},
    options: DiscoverySosRequestOptions = {},
  ): Promise<SosPrearrivalListResponse> {
    return this.request(
      'GET',
      this.queryPath(`/hospitals/${encodeURIComponent(facilityId)}/sos-prearrivals`, query),
      { purpose: 'sos_prearrival', requirePrivateNoStore: true, ...options },
    );
  }

  public acceptSosPrearrival(
    facilityId: string,
    incidentId: string,
    body: AcceptSosPrearrivalInput,
    version: number,
    idempotencyKey: string,
    options: DiscoverySosRequestOptions = {},
  ): Promise<SosIncidentResponse> {
    return this.request(
      'POST',
      `/hospitals/${encodeURIComponent(facilityId)}/sos-incidents/${encodeURIComponent(incidentId)}/accept`,
      {
        body,
        version,
        idempotencyKey,
        aal: 2,
        purpose: 'sos_prearrival',
        requirePrivateNoStore: true,
        ...options,
      },
    );
  }

  public closeSosIncident(
    incidentId: string,
    body: CloseSosIncidentInput,
    version: number,
    idempotencyKey: string,
    options: DiscoverySosRequestOptions = {},
  ): Promise<SosIncidentResponse> {
    return this.request('POST', `/sos/incidents/${encodeURIComponent(incidentId)}/close`, {
      body,
      version,
      idempotencyKey,
      requirePrivateNoStore: true,
      ...options,
    });
  }

  public createEmergencyShare(
    incidentId: string,
    body: CreateEmergencyShareInput,
    idempotencyKey: string,
    options: DiscoverySosRequestOptions = {},
  ): Promise<CreateEmergencyShareResponse> {
    return this.request('POST', `/sos/incidents/${encodeURIComponent(incidentId)}/share-links`, {
      body,
      idempotencyKey,
      requirePrivateNoStore: true,
      requireNoReferrer: true,
      ...options,
    });
  }

  public revokeEmergencyShare(
    shareId: string,
    version: number,
    idempotencyKey: string,
    options: DiscoverySosRequestOptions = {},
  ): Promise<EmergencyShareSummary> {
    return this.request('POST', `/sos/share-links/${encodeURIComponent(shareId)}/revoke`, {
      version,
      idempotencyKey,
      requirePrivateNoStore: true,
      ...options,
    });
  }

  public viewEmergencyShare(
    token: string,
    options: Pick<DiscoverySosRequestOptions, 'signal'> = {},
  ): Promise<EmergencyShareViewResponse> {
    return this.request('GET', `/sos/share/${encodeURIComponent(token)}`, {
      anonymous: true,
      requirePrivateNoStore: true,
      requireNoReferrer: true,
      ...options,
    });
  }

  private queryPath(path: string, query: object): string {
    const values = new URLSearchParams();
    for (const [key, queryValue] of Object.entries(query)) {
      if (queryValue !== undefined && queryValue !== '') values.set(key, String(queryValue));
    }
    return values.size ? `${path}?${values}` : path;
  }

  private async request<T>(
    method: 'GET' | 'POST',
    path: string,
    input: RequestInput = {},
  ): Promise<T> {
    const headers = this.requestHeaders(input);
    const response = await this.fetcher(`${this.options.baseUrl.replace(/\/$/, '')}/v1${path}`, {
      method,
      headers,
      cache: 'no-store',
      referrerPolicy: 'no-referrer',
      ...(input.signal ? { signal: input.signal } : {}),
      ...(input.body === undefined ? {} : { body: JSON.stringify(input.body) }),
    });
    this.assertResponsePolicy(response, input);
    const payload = response.status === 204 ? undefined : await response.json();
    if (!response.ok) throw new DiscoverySosApiError(response.status, payload);
    return payload as T;
  }

  private requestHeaders(input: RequestInput): Headers {
    const headers = new Headers({
      Accept: 'application/json, application/problem+json',
      'Accept-Language': this.options.acceptLanguage ?? 'ar-EG',
      ...(this.options.defaultHeaders ?? {}),
    });
    if (input.anonymous) headers.delete('Authorization');
    else {
      if (!this.options.accessToken)
        throw new DiscoverySosApiError(401, { code: 'authentication-required' });
      headers.set('Authorization', `Bearer ${this.options.accessToken}`);
    }
    if (input.body !== undefined) headers.set('Content-Type', 'application/json');
    if (input.idempotencyKey) headers.set('Idempotency-Key', input.idempotencyKey);
    if (input.version !== undefined) headers.set('If-Match', `"${input.version}"`);
    if (input.patientId) headers.set('X-SHIFAA-Patient-Context', input.patientId);
    if (input.aal) headers.set('X-AAL', String(input.aal));
    if (input.purpose) headers.set('X-Purpose', input.purpose);
    return headers;
  }

  private assertResponsePolicy(response: Response, input: RequestInput): void {
    const cacheControl = response.headers.get('cache-control') ?? '';
    if (
      input.requirePrivateNoStore &&
      (!cacheControl.includes('private') || !cacheControl.includes('no-store'))
    ) {
      throw new DiscoverySosApiError(502, { code: 'unsafe-cache-policy' });
    }
    if (input.requireNoReferrer && response.headers.get('referrer-policy') !== 'no-referrer') {
      throw new DiscoverySosApiError(502, { code: 'unsafe-referrer-policy' });
    }
  }
}

export const createDiscoverySosClient = (options: DiscoverySosClientOptions) =>
  new DiscoverySosClient(options);
