// @generated from specs/010-encounters-referrals-contextual-chat/contracts/openapi.yaml — DO NOT EDIT.

import type {
  AcceptReferralRequest,
  CareTeamNoteProjection,
  CompleteEncounterRequest,
  CreateEncounterRequest,
  CreateReferralRequest,
  EncounterCompleteResult,
  EncounterProjection,
  EncounterStartResult,
  Feature010Uuid,
  GetEncounterQuery,
  ListContextMessagesQuery,
  ListReferralsQuery,
  MessagePage,
  MessageProjection,
  PendingSourceReferralProjection,
  ReferralAcceptanceResult,
  ReferralPage,
  SendContextMessageRequest,
  SignEncounterNoteRequest,
  UpdateEncounterRequest,
} from '@shifaa/contracts';

export const generatedFeature010OperationIds = [
  'createEncounter',
  'getEncounter',
  'updateEncounter',
  'signEncounterNote',
  'completeEncounter',
  'createReferral',
  'listReferrals',
  'acceptReferral',
  'listContextMessages',
  'sendContextMessage',
] as const;

export interface Feature010ClientOptions {
  baseUrl: string;
  accessToken: () => string | undefined;
  fetch?: typeof globalThis.fetch;
  acceptLanguage?: 'ar-EG' | 'en-EG';
  defaultHeaders?: Readonly<Record<string, string>>;
}

export interface Feature010RequestOptions {
  requestId?: string;
  signal?: AbortSignal;
}

interface Feature010RequestInput extends Feature010RequestOptions {
  body?: unknown;
  idempotencyKey?: string;
  version?: number;
}

export class Feature010ApiError extends Error {
  public constructor(
    public readonly status: number,
    public readonly problem: unknown,
  ) {
    super(`SHIFAA Feature 010 API request failed with status ${status}.`);
    this.name = 'Feature010ApiError';
  }
}

interface Feature010QueryParameter {
  name: string;
  explode: boolean;
}

export class Feature010Client {
  private readonly fetcher: typeof globalThis.fetch;

  public constructor(private readonly options: Feature010ClientOptions) {
    this.fetcher = (options.fetch ?? globalThis.fetch).bind(globalThis);
  }

  public createEncounter(
    body: CreateEncounterRequest,
    options: Feature010RequestOptions & { idempotencyKey: string },
  ): Promise<EncounterStartResult> {
    return this.request<EncounterStartResult>('POST', '/encounters', { ...options, body });
  }

  public getEncounter(
    encounterId: Feature010Uuid,
    query: GetEncounterQuery = {},
    options: Feature010RequestOptions = {},
  ): Promise<EncounterProjection> {
    return this.request<EncounterProjection>(
      'GET',
      this.queryPath(`/encounters/${encodeURIComponent(encounterId)}`, query, [
        { name: 'fields', explode: false },
      ]),
      options,
    );
  }

  public updateEncounter(
    encounterId: Feature010Uuid,
    body: UpdateEncounterRequest,
    options: Feature010RequestOptions & { idempotencyKey: string } & { version: number },
  ): Promise<EncounterProjection> {
    return this.request<EncounterProjection>(
      'PATCH',
      `/encounters/${encodeURIComponent(encounterId)}`,
      { ...options, body },
    );
  }

  public signEncounterNote(
    encounterId: Feature010Uuid,
    body: SignEncounterNoteRequest,
    options: Feature010RequestOptions & { idempotencyKey: string },
  ): Promise<CareTeamNoteProjection> {
    return this.request<CareTeamNoteProjection>(
      'POST',
      `/encounters/${encodeURIComponent(encounterId)}/notes`,
      { ...options, body },
    );
  }

  public completeEncounter(
    encounterId: Feature010Uuid,
    body: CompleteEncounterRequest,
    options: Feature010RequestOptions & { idempotencyKey: string } & { version: number },
  ): Promise<EncounterCompleteResult> {
    return this.request<EncounterCompleteResult>(
      'POST',
      `/encounters/${encodeURIComponent(encounterId)}/complete`,
      { ...options, body },
    );
  }

  public createReferral(
    encounterId: Feature010Uuid,
    body: CreateReferralRequest,
    options: Feature010RequestOptions & { idempotencyKey: string },
  ): Promise<PendingSourceReferralProjection> {
    return this.request<PendingSourceReferralProjection>(
      'POST',
      `/encounters/${encodeURIComponent(encounterId)}/referrals`,
      { ...options, body },
    );
  }

  public listReferrals(
    query: ListReferralsQuery = {},
    options: Feature010RequestOptions = {},
  ): Promise<ReferralPage> {
    return this.request<ReferralPage>(
      'GET',
      this.queryPath('/referrals', query, [
        { name: 'cursor', explode: true },
        { name: 'limit', explode: true },
        { name: 'patientId', explode: true },
        { name: 'facilityId', explode: true },
        { name: 'specialty', explode: true },
        { name: 'status', explode: true },
        { name: 'date', explode: true },
      ]),
      options,
    );
  }

  public acceptReferral(
    referralId: Feature010Uuid,
    body: AcceptReferralRequest,
    options: Feature010RequestOptions & { idempotencyKey: string } & { version: number },
  ): Promise<ReferralAcceptanceResult> {
    return this.request<ReferralAcceptanceResult>(
      'POST',
      `/referrals/${encodeURIComponent(referralId)}/accept`,
      { ...options, body },
    );
  }

  public listContextMessages(
    contextType: 'appointment',
    contextId: Feature010Uuid,
    query: ListContextMessagesQuery = {},
    options: Feature010RequestOptions = {},
  ): Promise<MessagePage> {
    return this.request<MessagePage>(
      'GET',
      this.queryPath(
        `/contexts/${encodeURIComponent(contextType)}/${encodeURIComponent(contextId)}/messages`,
        query,
        [
          { name: 'cursor', explode: true },
          { name: 'limit', explode: true },
        ],
      ),
      options,
    );
  }

  public sendContextMessage(
    contextType: 'appointment',
    contextId: Feature010Uuid,
    body: SendContextMessageRequest,
    options: Feature010RequestOptions & { idempotencyKey: string },
  ): Promise<MessageProjection> {
    return this.request<MessageProjection>(
      'POST',
      `/contexts/${encodeURIComponent(contextType)}/${encodeURIComponent(contextId)}/messages`,
      { ...options, body },
    );
  }

  private queryPath(
    path: string,
    query: object,
    parameters: readonly Feature010QueryParameter[],
  ): string {
    const values = new URLSearchParams();
    const record = query as Record<string, unknown>;
    for (const parameter of parameters) {
      const value = record[parameter.name];
      if (value === undefined || value === null || value === '') continue;
      if (Array.isArray(value)) {
        if (parameter.explode)
          for (const item of value) values.append(parameter.name, String(item));
        else values.set(parameter.name, value.map(String).join(','));
      } else values.set(parameter.name, String(value));
    }
    return values.size ? `${path}?${values}` : path;
  }

  private async request<T>(
    method: 'GET' | 'POST' | 'PATCH',
    path: string,
    input: Feature010RequestInput,
  ): Promise<T> {
    const accessToken = this.options.accessToken();
    if (!accessToken) throw new Feature010ApiError(401, { code: 'authentication-required' });

    const headers = new Headers({
      Accept: 'application/json, application/problem+json',
      'Accept-Language': this.options.acceptLanguage ?? 'ar-EG',
      ...(this.options.defaultHeaders ?? {}),
    });
    headers.set('Authorization', `Bearer ${accessToken}`);
    if (input.body !== undefined) headers.set('Content-Type', 'application/json');
    if (input.requestId) headers.set('X-Request-Id', input.requestId);
    if (input.idempotencyKey) headers.set('Idempotency-Key', input.idempotencyKey);
    if (input.version !== undefined) headers.set('If-Match', `"${input.version}"`);

    const response = await this.fetcher(`${this.options.baseUrl.replace(/\/$/, '')}/v1${path}`, {
      method,
      headers,
      cache: 'no-store',
      ...(input.signal ? { signal: input.signal } : {}),
      ...(input.body === undefined ? {} : { body: JSON.stringify(input.body) }),
    });
    const cacheDirectives = new Set(
      (response.headers.get('cache-control') ?? '')
        .split(',')
        .map((directive) => directive.trim().toLowerCase()),
    );
    if (!cacheDirectives.has('private') || !cacheDirectives.has('no-store'))
      throw new Feature010ApiError(502, { code: 'unsafe-cache-policy' });

    const payload: unknown = await response.json();
    if (!response.ok) throw new Feature010ApiError(response.status, payload);
    return payload as T;
  }
}

export const createFeature010Client = (options: Feature010ClientOptions) =>
  new Feature010Client(options);
