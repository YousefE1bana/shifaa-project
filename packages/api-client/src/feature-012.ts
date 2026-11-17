// @generated from specs/012-prescription-safety-governed-overrides/contracts/openapi.yaml — DO NOT EDIT.

import {
  checkFeature012WireSchema,
  feature012HeaderSchemas,
  feature012QuerySchemas,
  feature012RequestSchemas,
  type Feature012AcknowledgeRequest,
  type Feature012Acknowledgement,
  type Feature012AssignmentRequest,
  type Feature012AssignmentResult,
  type Feature012CancelRequest,
  type Feature012CancelResult,
  type Feature012CreatePrescription,
  type Feature012DecisionRequest,
  type Feature012DecisionResult,
  type Feature012GetOverrideReviewCasesQuery,
  type Feature012ListPatientMedicationsQuery,
  type Feature012MedicationList,
  type Feature012OverrideRequest,
  type Feature012OverrideResult,
  type Feature012PrescriptionMutation,
  type Feature012PrescriptionRead,
  type Feature012ReviewResult,
  type Feature012SafetyCheckRequest,
  type Feature012SafetyResult,
  type Feature012SignRequest,
  type Feature012SignResult,
  type Feature012UpdatePrescription,
  type Feature012UpdatePrescriptionResult,
} from '@shifaa/contracts/feature-012';

export const generatedFeature012OperationIds = [
  'createPrescription',
  'updatePrescription',
  'getPrescription',
  'runPrescriptionSafety',
  'acknowledgeWarning',
  'requestContraindicatedOverride',
  'decideOverride',
  'signPrescription',
  'cancelPrescription',
  'listPatientMedications',
  'getOverrideReviewCases',
  'transitionOverrideReviewAssignment',
] as const;

export interface Feature012ClientOptions {
  baseUrl: string;
  accessToken: () => string | undefined;
  purpose: string;
  fetch?: typeof globalThis.fetch;
  acceptLanguage?: 'ar-EG' | 'en-EG';
}

export interface Feature012RequestOptions {
  requestId?: string;
  signal?: AbortSignal;
}

interface RequestInput {
  requestId?: string | undefined;
  signal?: AbortSignal | undefined;
  idempotencyKey?: string;
  ifMatch?: string;
  body?: unknown;
}

export class Feature012ApiError extends Error {
  public constructor(
    public readonly status: number,
    public readonly problem: unknown,
  ) {
    super('SHIFAA Feature 012 API request failed with status ' + status + '.');
    this.name = 'Feature012ApiError';
  }
}

const invalidInput = () => new Feature012ApiError(400, { code: 'validation-failed' });
type Schema = Parameters<typeof checkFeature012WireSchema>[0];

export class Feature012Client {
  private readonly fetcher: typeof globalThis.fetch;

  public constructor(private readonly options: Feature012ClientOptions) {
    this.fetcher = (options.fetch ?? globalThis.fetch).bind(globalThis);
  }

  public async createPrescription(
    encounterId: string,
    body: Feature012CreatePrescription,
    options: Feature012RequestOptions & { idempotencyKey: string },
  ): Promise<Feature012PrescriptionMutation> {
    this.requireInput(feature012RequestSchemas.createPrescription, body);
    this.requireInput(feature012HeaderSchemas.IdempotencyKey, options.idempotencyKey);
    return this.request<Feature012PrescriptionMutation>(
      'POST',
      `/encounters/${encodeURIComponent(encounterId)}/prescriptions`,
      {
        requestId: options.requestId,
        signal: options.signal,
        idempotencyKey: options.idempotencyKey,

        body,
      },
      feature012HeaderSchemas.ETag,
    );
  }

  public async updatePrescription(
    prescriptionId: string,
    body: Feature012UpdatePrescription,
    options: Feature012RequestOptions & { idempotencyKey: string } & { ifMatch: string },
  ): Promise<Feature012UpdatePrescriptionResult> {
    this.requireInput(feature012RequestSchemas.updatePrescription, body);
    this.requireInput(feature012HeaderSchemas.IdempotencyKey, options.idempotencyKey);
    const expected =
      'action' in body
        ? '"ppc:' +
          prescriptionId +
          ':' +
          body.expectedSignedRevisionRef +
          ':' +
          body.expectedProjectionControlVersion +
          '"'
        : undefined;
    this.requireInput(
      expected ? feature012HeaderSchemas.UpdateIfMatch : feature012HeaderSchemas.IfMatch,
      options.ifMatch,
    );
    if (expected && expected !== options.ifMatch) throw invalidInput();
    return this.request<Feature012UpdatePrescriptionResult>(
      'PATCH',
      `/prescriptions/${encodeURIComponent(prescriptionId)}`,
      {
        requestId: options.requestId,
        signal: options.signal,
        idempotencyKey: options.idempotencyKey,
        ifMatch: options.ifMatch,
        body,
      },
      expected ? feature012HeaderSchemas.UpdateETag : feature012HeaderSchemas.ETag,
      Boolean(expected),
    );
  }

  public async getPrescription(
    prescriptionId: string,
    options: Feature012RequestOptions = {},
  ): Promise<Feature012PrescriptionRead> {
    return this.request<Feature012PrescriptionRead>(
      'GET',
      `/prescriptions/${encodeURIComponent(prescriptionId)}`,
      {
        requestId: options.requestId,
        signal: options.signal,
      },
      feature012HeaderSchemas.ETag,
    );
  }

  public async runPrescriptionSafety(
    prescriptionId: string,
    body: Feature012SafetyCheckRequest,
    options: Feature012RequestOptions & { idempotencyKey: string } & { version: number },
  ): Promise<Feature012SafetyResult> {
    this.requireInput(feature012RequestSchemas.runPrescriptionSafety, body);
    this.requireInput(feature012HeaderSchemas.IdempotencyKey, options.idempotencyKey);
    if (!Number.isSafeInteger(options.version)) throw invalidInput();
    const ifMatch = '"' + options.version + '"';
    this.requireInput(feature012HeaderSchemas.IfMatch, ifMatch);
    return this.request<Feature012SafetyResult>(
      'POST',
      `/prescriptions/${encodeURIComponent(prescriptionId)}/safety-checks`,
      {
        requestId: options.requestId,
        signal: options.signal,
        idempotencyKey: options.idempotencyKey,
        ifMatch: ifMatch,
        body,
      },
      feature012HeaderSchemas.ETag,
    );
  }

  public async acknowledgeWarning(
    issueId: string,
    body: Feature012AcknowledgeRequest,
    options: Feature012RequestOptions & { idempotencyKey: string },
  ): Promise<Feature012Acknowledgement> {
    this.requireInput(feature012RequestSchemas.acknowledgeWarning, body);
    this.requireInput(feature012HeaderSchemas.IdempotencyKey, options.idempotencyKey);
    return this.request<Feature012Acknowledgement>(
      'POST',
      `/detected-issues/${encodeURIComponent(issueId)}/acknowledgements`,
      {
        requestId: options.requestId,
        signal: options.signal,
        idempotencyKey: options.idempotencyKey,

        body,
      },
      undefined,
    );
  }

  public async requestContraindicatedOverride(
    issueId: string,
    body: Feature012OverrideRequest,
    options: Feature012RequestOptions & { idempotencyKey: string },
  ): Promise<Feature012OverrideResult> {
    this.requireInput(feature012RequestSchemas.requestContraindicatedOverride, body);
    this.requireInput(feature012HeaderSchemas.IdempotencyKey, options.idempotencyKey);
    return this.request<Feature012OverrideResult>(
      'POST',
      `/detected-issues/${encodeURIComponent(issueId)}/override-requests`,
      {
        requestId: options.requestId,
        signal: options.signal,
        idempotencyKey: options.idempotencyKey,

        body,
      },
      undefined,
    );
  }

  public async decideOverride(
    overrideId: string,
    body: Feature012DecisionRequest,
    options: Feature012RequestOptions & { idempotencyKey: string } & { version: number },
  ): Promise<Feature012DecisionResult> {
    this.requireInput(feature012RequestSchemas.decideOverride, body);
    this.requireInput(feature012HeaderSchemas.IdempotencyKey, options.idempotencyKey);
    if (!Number.isSafeInteger(options.version)) throw invalidInput();
    const ifMatch = '"' + options.version + '"';
    this.requireInput(feature012HeaderSchemas.IfMatch, ifMatch);
    return this.request<Feature012DecisionResult>(
      'POST',
      `/override-requests/${encodeURIComponent(overrideId)}/decisions`,
      {
        requestId: options.requestId,
        signal: options.signal,
        idempotencyKey: options.idempotencyKey,
        ifMatch: ifMatch,
        body,
      },
      feature012HeaderSchemas.ETag,
    );
  }

  public async signPrescription(
    prescriptionId: string,
    body: Feature012SignRequest,
    options: Feature012RequestOptions & { idempotencyKey: string } & { version: number },
  ): Promise<Feature012SignResult> {
    this.requireInput(feature012RequestSchemas.signPrescription, body);
    this.requireInput(feature012HeaderSchemas.IdempotencyKey, options.idempotencyKey);
    if (!Number.isSafeInteger(options.version)) throw invalidInput();
    const ifMatch = '"' + options.version + '"';
    this.requireInput(feature012HeaderSchemas.IfMatch, ifMatch);
    return this.request<Feature012SignResult>(
      'POST',
      `/prescriptions/${encodeURIComponent(prescriptionId)}/sign`,
      {
        requestId: options.requestId,
        signal: options.signal,
        idempotencyKey: options.idempotencyKey,
        ifMatch: ifMatch,
        body,
      },
      feature012HeaderSchemas.ETag,
    );
  }

  public async cancelPrescription(
    prescriptionId: string,
    body: Feature012CancelRequest,
    options: Feature012RequestOptions & { idempotencyKey: string } & { version: number },
  ): Promise<Feature012CancelResult> {
    this.requireInput(feature012RequestSchemas.cancelPrescription, body);
    this.requireInput(feature012HeaderSchemas.IdempotencyKey, options.idempotencyKey);
    if (!Number.isSafeInteger(options.version)) throw invalidInput();
    const ifMatch = '"' + options.version + '"';
    this.requireInput(feature012HeaderSchemas.IfMatch, ifMatch);
    return this.request<Feature012CancelResult>(
      'POST',
      `/prescriptions/${encodeURIComponent(prescriptionId)}/cancel`,
      {
        requestId: options.requestId,
        signal: options.signal,
        idempotencyKey: options.idempotencyKey,
        ifMatch: ifMatch,
        body,
      },
      feature012HeaderSchemas.ETag,
    );
  }

  public async listPatientMedications(
    managedPatientId: string,
    query: Feature012ListPatientMedicationsQuery = {},
    options: Feature012RequestOptions = {},
  ): Promise<Feature012MedicationList> {
    this.requireInput(feature012QuerySchemas.listPatientMedications, query);
    return this.request<Feature012MedicationList>(
      'GET',
      this.queryPath(`/patients/${encodeURIComponent(managedPatientId)}/medications`, query),
      {
        requestId: options.requestId,
        signal: options.signal,
      },
      undefined,
    );
  }

  public async getOverrideReviewCases(
    query: Feature012GetOverrideReviewCasesQuery,
    options: Feature012RequestOptions = {},
  ): Promise<Feature012ReviewResult> {
    this.requireInput(feature012QuerySchemas.getOverrideReviewCases, query);
    return this.request<Feature012ReviewResult>(
      'GET',
      this.queryPath(`/override-review-cases`, query),
      {
        requestId: options.requestId,
        signal: options.signal,
      },
      undefined,
    );
  }

  public async transitionOverrideReviewAssignment(
    overrideId: string,
    body: Feature012AssignmentRequest,
    options: Feature012RequestOptions & { idempotencyKey: string } & { version: number },
  ): Promise<Feature012AssignmentResult> {
    this.requireInput(feature012RequestSchemas.transitionOverrideReviewAssignment, body);
    this.requireInput(feature012HeaderSchemas.IdempotencyKey, options.idempotencyKey);
    if (!Number.isSafeInteger(options.version)) throw invalidInput();
    const ifMatch = '"' + options.version + '"';
    this.requireInput(feature012HeaderSchemas.IfMatch, ifMatch);
    return this.request<Feature012AssignmentResult>(
      'POST',
      `/override-requests/${encodeURIComponent(overrideId)}/assignment-transitions`,
      {
        requestId: options.requestId,
        signal: options.signal,
        idempotencyKey: options.idempotencyKey,
        ifMatch: ifMatch,
        body,
      },
      feature012HeaderSchemas.ETag,
    );
  }

  private requireInput(schema: Schema, input: unknown) {
    if (!checkFeature012WireSchema(schema, input)) throw invalidInput();
  }

  private queryPath(path: string, query: object): string {
    const params = new URLSearchParams();
    for (const [name, value] of Object.entries(query)) {
      if (value !== undefined) params.set(name, String(value));
    }
    return params.size ? path + '?' + params : path;
  }

  private async request<T>(
    method: 'GET' | 'POST' | 'PATCH',
    path: string,
    input: RequestInput,
    etagSchema: Schema | undefined,
    projection = false,
  ): Promise<T> {
    const token = this.options.accessToken();
    if (!token) throw new Feature012ApiError(401, { code: 'authentication-required' });
    if (!this.options.purpose.trim()) throw invalidInput();

    const headers = new Headers({
      Accept: 'application/json, application/problem+json',
      'Accept-Language': this.options.acceptLanguage ?? 'ar-EG',
      Authorization: 'Bearer ' + token,
      'X-Purpose': this.options.purpose,
    });
    if (input.requestId !== undefined) {
      this.requireInput(feature012HeaderSchemas.RequestId, input.requestId);
      headers.set('X-Request-Id', input.requestId);
    }
    if (input.idempotencyKey !== undefined) headers.set('Idempotency-Key', input.idempotencyKey);
    if (input.ifMatch !== undefined) headers.set('If-Match', input.ifMatch);
    if (input.body !== undefined) headers.set('Content-Type', 'application/json');

    const base = this.options.baseUrl.replace(/\/$/, '');
    const response = await this.fetcher(base + '/v1' + path, {
      method,
      headers,
      cache: 'no-store',
      ...(input.signal ? { signal: input.signal } : {}),
      ...(input.body === undefined ? {} : { body: JSON.stringify(input.body) }),
    });
    const cache = new Set(
      (response.headers.get('cache-control') ?? '')
        .split(',')
        .map((value) => value.trim().toLowerCase()),
    );
    if (!cache.has('private') || !cache.has('no-store'))
      throw new Feature012ApiError(502, { code: 'unsafe-cache-policy' });

    const payload: unknown = await response.json();
    if (!response.ok) throw new Feature012ApiError(response.status, payload);
    const etag = response.headers.get('etag');
    if (
      etagSchema &&
      (!checkFeature012WireSchema(etagSchema, etag) || (projection && !etag?.startsWith('"ppc:')))
    )
      throw new Feature012ApiError(502, { code: 'invalid-response-etag' });
    return payload as T;
  }
}

export const createFeature012Client = (options: Feature012ClientOptions) =>
  new Feature012Client(options);
