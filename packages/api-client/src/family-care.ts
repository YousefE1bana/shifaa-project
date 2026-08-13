// @generated from specs/004-family-care-relationships/contracts/openapi.yaml — DO NOT EDIT.
import type {
  AcceptDelegationInput,
  CreateDelegationInput,
  CreateEmergencyContactInput,
  CreateGuardianshipInput,
  GuardianshipDecisionInput,
  RespondEmergencyContactInput,
  RevokeRelationshipInput,
  UpdateDelegationInput,
} from '@shifaa/contracts';

export const generatedFamilyCareOperationIds = [
  'listRelationships',
  'createGuardianship',
  'listGuardianshipCases',
  'reviewGuardianship',
  'createDelegation',
  'acceptDelegation',
  'updateDelegation',
  'revokeRelationship',
  'createEmergencyContact',
  'listEmergencyContacts',
  'respondEmergencyContact',
  'revokeEmergencyContact',
] as const;
export interface FamilyCareClientOptions {
  baseUrl: string;
  accessToken?: string;
  fetch?: typeof globalThis.fetch;
  acceptLanguage?: 'ar-EG' | 'en-EG';
  defaultHeaders?: Record<string, string>;
}
export interface FamilyPageQuery {
  cursor?: string;
  limit?: number;
  status?: string;
}
export class FamilyCareApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly problem: unknown,
  ) {
    super(`SHIFAA Family Care API failed with status ${status}.`);
    this.name = 'FamilyCareApiError';
  }
}

export class FamilyCareClient {
  private readonly fetcher: typeof globalThis.fetch;
  public constructor(private readonly options: FamilyCareClientOptions) {
    this.fetcher = (options.fetch ?? globalThis.fetch).bind(globalThis);
  }
  listRelationships(patientId: string, query: FamilyPageQuery = {}) {
    return this.request('GET', this.page(`/patients/${patientId}/relationships`, query));
  }
  createGuardianship(patientId: string, body: CreateGuardianshipInput, key: string) {
    return this.request('POST', `/patients/${patientId}/guardianships`, { body, key, patientId });
  }
  listGuardianshipCases(query: FamilyPageQuery = {}) {
    return this.request('GET', this.page('/admin/guardianships', query));
  }
  reviewGuardianship(id: string, body: GuardianshipDecisionInput, version: number, key: string) {
    return this.request('POST', `/admin/guardianships/${id}/decision`, { body, key, version });
  }
  createDelegation(patientId: string, body: CreateDelegationInput, key: string) {
    return this.request('POST', `/patients/${patientId}/delegations`, { body, key, patientId });
  }
  acceptDelegation(id: string, body: AcceptDelegationInput, key: string) {
    return this.request('POST', `/delegations/${id}/accept`, { body, key });
  }
  updateDelegation(
    id: string,
    patientId: string,
    body: UpdateDelegationInput,
    version: number,
    key: string,
  ) {
    return this.request('PATCH', `/delegations/${id}`, { body, key, version, patientId });
  }
  revokeRelationship(
    id: string,
    patientId: string,
    body: RevokeRelationshipInput,
    version: number,
    key: string,
  ) {
    return this.request('POST', `/relationships/${id}/revoke`, { body, key, version, patientId });
  }
  createEmergencyContact(patientId: string, body: CreateEmergencyContactInput, key: string) {
    return this.request('POST', `/patients/${patientId}/emergency-contacts`, {
      body,
      key,
      patientId,
    });
  }
  listEmergencyContacts(patientId: string, query: FamilyPageQuery = {}) {
    return this.request('GET', this.page(`/patients/${patientId}/emergency-contacts`, query));
  }
  respondEmergencyContact(
    token: string,
    body: Omit<RespondEmergencyContactInput, 'token'>,
    key: string,
  ) {
    return this.request('POST', '/emergency-contact-invites/response', {
      body: { ...body, token },
      key,
      anonymous: true,
    });
  }
  revokeEmergencyContact(
    id: string,
    patientId: string,
    body: RevokeRelationshipInput,
    version: number,
    key: string,
  ) {
    return this.request('POST', `/emergency-contacts/${id}/revoke`, {
      body,
      key,
      version,
      patientId,
    });
  }
  private page(path: string, query: FamilyPageQuery) {
    const values = new URLSearchParams();
    if (query.cursor) values.set('cursor', query.cursor);
    if (query.limit !== undefined) values.set('limit', String(query.limit));
    if (query.status) values.set('status', query.status);
    return values.size ? `${path}?${values}` : path;
  }
  private async request(
    method: 'GET' | 'POST' | 'PATCH',
    path: string,
    input: {
      body?: unknown;
      key?: string;
      version?: number;
      patientId?: string;
      anonymous?: boolean;
    } = {},
  ) {
    const headers = new Headers({
      Accept: 'application/json, application/problem+json',
      'Accept-Language': this.options.acceptLanguage ?? 'ar-EG',
      ...(this.options.defaultHeaders ?? {}),
    });
    if (input.anonymous) headers.delete('Authorization');
    else {
      if (!this.options.accessToken)
        throw new FamilyCareApiError(401, { code: 'authentication-required' });
      headers.set('Authorization', `Bearer ${this.options.accessToken}`);
    }
    if (input.body !== undefined) headers.set('Content-Type', 'application/json');
    if (input.key) headers.set('Idempotency-Key', input.key);
    if (input.version !== undefined) headers.set('If-Match', `"${input.version}"`);
    if (input.patientId) headers.set('X-SHIFAA-Patient-Context', input.patientId);
    const response = await this.fetcher(`${this.options.baseUrl.replace(/\/$/, '')}/v1${path}`, {
      method,
      headers,
      cache: 'no-store',
      ...(input.body !== undefined ? { body: JSON.stringify(input.body) } : {}),
    });
    const payload = response.status === 204 ? undefined : await response.json();
    if (!response.ok) throw new FamilyCareApiError(response.status, payload);
    return payload;
  }
}
