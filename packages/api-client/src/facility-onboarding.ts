// @generated from specs/003-facility-onboarding-rbac/contracts/openapi.yaml — DO NOT EDIT.
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

export const generatedFacilityOperationIds = [
  'createProfessionalLicense',
  'createProfessionalLicenseUpload',
  'getProfessionalLicense',
  'listProfessionalLicenseCases',
  'reviewProfessionalLicense',
  'createFacility',
  'getFacility',
  'updateFacility',
  'submitFacility',
  'createFacilityLicenseUpload',
  'listFacilityApprovalCases',
  'reviewFacility',
  'listFacilityMemberships',
  'inviteFacilityMember',
  'acceptFacilityMembership',
  'updateFacilityMembership',
  'endFacilityMembership',
  'listAdminRoleGrants',
  'proposeAdminRoleGrant',
  'decideAdminRoleGrant',
  'proposeAdminRoleRevocation',
  'decideAdminRoleRevocation',
] as const;
export interface FacilityClientOptions {
  baseUrl: string;
  accessToken: string;
  fetch?: typeof globalThis.fetch;
  acceptLanguage?: 'ar-EG' | 'en-EG';
  defaultHeaders?: Record<string, string>;
}
export interface FacilityPageQuery {
  cursor?: string;
  limit?: number;
}
export class FacilityApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly problem: unknown,
  ) {
    super(`SHIFAA facility API failed with status ${status}.`);
    this.name = 'FacilityApiError';
  }
}
export class FacilityOnboardingClient {
  private readonly fetcher: typeof globalThis.fetch;
  constructor(private readonly options: FacilityClientOptions) {
    this.fetcher = (options.fetch ?? globalThis.fetch).bind(globalThis);
  }
  createProfessionalLicense(body: ProfessionalLicenseCreateInput, key: string) {
    return this.request('POST', '/people/me/professional-licenses', { body, key });
  }
  createProfessionalLicenseUpload(id: string, body: FacilityUploadMetadata, key: string) {
    return this.request('POST', `/professional-licenses/${id}/upload-intent`, { body, key });
  }
  getProfessionalLicense(id: string) {
    return this.request('GET', `/professional-licenses/${id}`);
  }
  listProfessionalLicenseCases(query: FacilityPageQuery = {}) {
    return this.request('GET', this.page('/admin/professional-licenses', query));
  }
  reviewProfessionalLicense(
    id: string,
    body: ProfessionalReviewInput,
    version: number,
    key: string,
  ) {
    return this.request('POST', `/admin/professional-licenses/${id}/decision`, {
      body,
      version,
      key,
    });
  }
  createFacility(body: FacilityCreateInput, key: string) {
    return this.request('POST', '/facilities', { body, key });
  }
  getFacility(id: string) {
    return this.request('GET', `/facilities/${id}`);
  }
  updateFacility(id: string, body: FacilityPatchInput, version: number, key: string) {
    return this.request('PATCH', `/facilities/${id}`, { body, version, key });
  }
  submitFacility(id: string, version: number, key: string) {
    return this.request('POST', `/facilities/${id}/submit`, { body: {}, version, key });
  }
  createFacilityLicenseUpload(id: string, body: FacilityLicenseUploadInput, key: string) {
    return this.request('POST', `/facilities/${id}/licenses/upload-intent`, { body, key });
  }
  listFacilityApprovalCases(query: FacilityPageQuery = {}) {
    return this.request('GET', this.page('/admin/facilities', query));
  }
  reviewFacility(id: string, body: FacilityReviewInput, version: number, key: string) {
    return this.request('POST', `/admin/facilities/${id}/decision`, { body, version, key });
  }
  listFacilityMemberships(id: string, query: FacilityPageQuery = {}) {
    return this.request('GET', this.page(`/facilities/${id}/memberships`, query));
  }
  inviteFacilityMember(id: string, body: MembershipInviteInput, key: string) {
    return this.request('POST', `/facilities/${id}/memberships`, { body, key });
  }
  acceptFacilityMembership(token: string, key: string) {
    return this.request(
      'POST',
      `/facility-membership-invites/${encodeURIComponent(token)}/accept`,
      { body: {}, key },
    );
  }
  updateFacilityMembership(
    facilityId: string,
    membershipId: string,
    body: MembershipPatchInput,
    version: number,
    key: string,
  ) {
    return this.request('PATCH', `/facilities/${facilityId}/memberships/${membershipId}`, {
      body,
      version,
      key,
    });
  }
  endFacilityMembership(
    facilityId: string,
    membershipId: string,
    body: ReasonInput,
    version: number,
    key: string,
  ) {
    return this.request('POST', `/facilities/${facilityId}/memberships/${membershipId}/end`, {
      body,
      version,
      key,
    });
  }
  listAdminRoleGrants(query: FacilityPageQuery = {}) {
    return this.request('GET', this.page('/admin/role-grants', query));
  }
  proposeAdminRoleGrant(body: AdminGrantProposalInput, key: string) {
    return this.request('POST', '/admin/role-grants', { body, key });
  }
  decideAdminRoleGrant(id: string, body: DecisionInput, version: number, key: string) {
    return this.request('POST', `/admin/role-grants/${id}/decision`, { body, version, key });
  }
  proposeAdminRoleRevocation(id: string, body: ReasonInput, version: number, key: string) {
    return this.request('POST', `/admin/role-grants/${id}/revocation-requests`, {
      body,
      version,
      key,
    });
  }
  decideAdminRoleRevocation(id: string, body: DecisionInput, version: number, key: string) {
    return this.request('POST', `/admin/role-grant-revocations/${id}/decision`, {
      body,
      version,
      key,
    });
  }
  private page(path: string, query: FacilityPageQuery) {
    const parameters = new URLSearchParams();
    if (query.cursor) parameters.set('cursor', query.cursor);
    if (query.limit !== undefined) parameters.set('limit', String(query.limit));
    const suffix = parameters.toString();
    return suffix ? `${path}?${suffix}` : path;
  }
  private async request(
    method: 'GET' | 'POST' | 'PATCH',
    path: string,
    input: { body?: unknown; key?: string; version?: number } = {},
  ) {
    const headers = new Headers({
      Accept: 'application/json, application/problem+json',
      'Accept-Language': this.options.acceptLanguage ?? 'ar-EG',
      Authorization: `Bearer ${this.options.accessToken}`,
      ...(this.options.defaultHeaders ?? {}),
    });
    if (input.body !== undefined) headers.set('Content-Type', 'application/json');
    if (input.key) headers.set('Idempotency-Key', input.key);
    if (input.version !== undefined) headers.set('If-Match', `"${input.version}"`);
    const response = await this.fetcher(`${this.options.baseUrl.replace(/\/$/, '')}/v1${path}`, {
      method,
      headers,
      cache: 'no-store',
      ...(input.body !== undefined ? { body: JSON.stringify(input.body) } : {}),
    });
    const payload = response.status === 204 ? undefined : await response.json();
    if (!response.ok) throw new FacilityApiError(response.status, payload);
    return payload;
  }
}
