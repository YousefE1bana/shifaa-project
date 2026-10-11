// @generated from specs/011-allergies-clinical-content-governance/contracts/openapi.yaml — DO NOT EDIT.

import type {
  Feature011AllergyList,
  Feature011AllergyRevision,
  Feature011ClinicalContentList,
  Feature011CreateAllergyRequest,
  Feature011CreateReleaseRequest,
  Feature011GovernanceRelease,
  Feature011ListAllergiesQuery,
  Feature011ListClinicalContentQuery,
  Feature011PublishReleaseRequest,
  Feature011SignReleaseRequest,
  Feature011SignReleaseResponse,
  Feature011VerifyAllergyRequest,
} from '@shifaa/contracts';

export const feature011ArtifactCanonicalizationMetadata = {
  contractId: 'SHIFAA-F011-ARTIFACT/1',
  normativeInputDigests: {
    'specs/011-allergies-clinical-content-governance/contracts/artifact-canonicalization-v1.md':
      'f131fefe06a21ceac85b77349193c8c40b7965b8ef79dc6248b35e78144751a9',
    'specs/011-allergies-clinical-content-governance/contracts/artifact-canonicalization-v1.json':
      '88fc3961c18b868d38fda8b8f0d93c49e3cc8ccba64de4a63b66a2081c7f52f2',
    'specs/011-allergies-clinical-content-governance/contracts/artifact-canonicalization-v1-vectors.json':
      '7b0a99e183aba2d6e60f2effc7821124a8460b53f67c55c9466cdfddd5ec8133',
  },
  parityRegistrySha256: 'b382986544a607a930197d107d114ff5256486b1227a38c0e584ee544a0ec523',
} as const;

export const feature011ProtocolMetadata = {
  planManifestId: 'SHIFAA-F011-RECOVERED-PLAN-APPROVAL@1.0.0',
  planManifestSha256: '79b1eafe6dea7ab2a26edd805e2c83baf2d0f0d12b9b6c44d11164caa8ab4548',
  planApprovalSha256: '665824ab1180ef0ebb5d864584e4b58921428e0c172d3e97244fd5222bf9948c',
  normativeInputDigests: {
    '.specify/memory/constitution.md':
      '25419aa07eca0c7846a80acb9720e3f4041c0970cd78025fbf1107bae659c30a',
    'docs/design/SHIFAA-UI-Contract.md':
      'e020f25fd4f04163c298815d09c9994ca7d38768a1092696dce35901f289372e',
    'docs/governance/SHIFAA-Baseline-Amendment-v2.1.2-007-Readiness.md':
      '9feadc0b489857c66533d20f1829c9826d8ea7ae8ea7bf8e683968276e1cad04',
    'docs/governance/SHIFAA-Feature-011-Reconciliation-2026-10-01.md':
      '51fdac8ecd2710bc13a53c89f9d09d4d486ad36631056e7171521d5e16b6abd6',
    'docs/governance/SHIFAA-Remaining-Specs-Roadmap.md':
      '3e01011f8f916535bef267845266bc5c3a3a7b1652b39afa3501dda6c9452757',
    'packages/design-system/src/tokens.ts':
      '39fb80ef2c702aab3663b46dd98d92cc747c9ff694b4a8161005cc4ca317201d',
    'specs/011-allergies-clinical-content-governance/contracts/allergy-protection-v1-vectors.json':
      'b0f8d4ba2ad5f30bbdf6ec963a6dc4e16677236b3ed0fbc6aa263ee81a2ed6ed',
    'specs/011-allergies-clinical-content-governance/contracts/allergy-protection-v1.json':
      'f031aa09edddf8c60ebe4cc8165fa35afee7e3875551ca2f6136e68a31bf7f25',
    'specs/011-allergies-clinical-content-governance/contracts/allergy-protection-v1.md':
      '03dbaeccfc4342136c6f6623f8613157e51806ddf0f07fea85a8ecb3374da257',
    'specs/011-allergies-clinical-content-governance/contracts/artifact-canonicalization-parity-v1.json':
      'b382986544a607a930197d107d114ff5256486b1227a38c0e584ee544a0ec523',
    'specs/011-allergies-clinical-content-governance/contracts/artifact-canonicalization-v1-vectors.json':
      '7b0a99e183aba2d6e60f2effc7821124a8460b53f67c55c9466cdfddd5ec8133',
    'specs/011-allergies-clinical-content-governance/contracts/artifact-canonicalization-v1.json':
      '88fc3961c18b868d38fda8b8f0d93c49e3cc8ccba64de4a63b66a2081c7f52f2',
    'specs/011-allergies-clinical-content-governance/contracts/artifact-canonicalization-v1.md':
      'f131fefe06a21ceac85b77349193c8c40b7965b8ef79dc6248b35e78144751a9',
    'specs/011-allergies-clinical-content-governance/contracts/artifact-review-disclosure-v1.md':
      'b203e00aaf3e2cc689b2ccc60e0b846ca206942de9b660d1d185ba4006d0a57e',
    'specs/011-allergies-clinical-content-governance/contracts/governance-boundaries.md':
      'c053e28f529ecea784917ab38028b599f45f0a4b58e517970a644ed7e2a268b5',
    'specs/011-allergies-clinical-content-governance/contracts/mutation-receipt-v1-vectors.json':
      '4eff01a61b485f0616b69480a979f3024da21b464cf768771055bb2694e56050',
    'specs/011-allergies-clinical-content-governance/contracts/mutation-receipt-v1.json':
      '2bf23cae34648742f995edced1008f7988efdbaf9dd12d9e1c46aa83e10d68ec',
    'specs/011-allergies-clinical-content-governance/contracts/mutation-receipt-v1.md':
      '2bc44368ddf306a89c29332b922e46bdd5ab9387b6d6bf2ed78e237351261c49',
    'specs/011-allergies-clinical-content-governance/contracts/openapi.yaml':
      '2c20eef7029079e5f174d09f84b7c042b7c8347e125c05755a3bdf26dc45880e',
    'specs/011-allergies-clinical-content-governance/contracts/scope-manifest.json':
      '53e46fbbbf79526749e0786c1630a2c2b6ad515ec3ac33d8755d2730df0842ac',
    'specs/011-allergies-clinical-content-governance/contracts/trusted-release-handoff-parity-v1.json':
      '2948f78fd1fb92ee9d411092da30f577b9215c2543182c2e85f56b306da30291',
    'specs/011-allergies-clinical-content-governance/contracts/trusted-release-handoff-v1-vectors.json':
      'e8c85abed8d13096f180282dab439f2f6b7a29c7a6fa628af46141d163998709',
    'specs/011-allergies-clinical-content-governance/contracts/trusted-release-handoff-v1.json':
      '03945dbb8f323f480f1a93f09340936f5623f7c1feeea6f2fcce98211b4b3a11',
    'specs/011-allergies-clinical-content-governance/contracts/trusted-release-handoff-v1.md':
      'e8f43933311ba5430d758504675162aca86d0537205eda95febbf3d6ab0bc5db',
    'specs/011-allergies-clinical-content-governance/contracts/ui-state-contract.md':
      '5c47a0e08caf22cdfa5a195503bcc79c5642054168966ed1ce7dd5af4b822a59',
    'specs/011-allergies-clinical-content-governance/contracts/verified-evidence-binding-parity-v1.json':
      '9f3be0aa5f5b3aa62b3505ea40d8b142b31f25a228a6b0bb19f221b28748ffa9',
    'specs/011-allergies-clinical-content-governance/contracts/verified-evidence-binding-v1-vectors.json':
      '8326cde913c59e4c899b16ba73193d9a48a99191f5eb7dba66883d904b1523b0',
    'specs/011-allergies-clinical-content-governance/contracts/verified-evidence-binding-v1.json':
      '782b32e23764c7ecf9b5114f387be174591c0d0ef6b2eed04749520991eee6cc',
    'specs/011-allergies-clinical-content-governance/contracts/verified-evidence-binding-v1.md':
      'e75f95ea9daef89918083be8ea66b8fce896bf55c8d323a1bdffef07e37bd1eb',
    'specs/011-allergies-clinical-content-governance/data-model.md':
      'b09f410a1289ab3633338ee2aee2a2e43ba1bfae351c7dd9dd850642fb51078f',
    'specs/011-allergies-clinical-content-governance/decisions/feature-011-design-lead-2026-10-06.md':
      'b3dcef629ed2e3b80f1ef07a73369664314c4da4c623f1d80a78141942bba269',
    'specs/011-allergies-clinical-content-governance/decisions/feature-011-ux-plan-gate-2026-10-06.md':
      'a46d7f12480819c7649998729ba9149499cf66e33dcfcef335151d712710d817',
    'specs/011-allergies-clinical-content-governance/decisions/plan-recovery-2026-10-06.md':
      '4f8bf26bdfb43cd016b62cd572f21bc9f2a81477dcd2b1a067314cb95887ba3f',
    'specs/011-allergies-clinical-content-governance/decisions/plan-recovery-evidence-foundation-2026-10-06.md':
      '1fc278a00df5b46115374d1f435d1168f5de0977df3e21c9dabdb76b726c2989',
    'specs/011-allergies-clinical-content-governance/decisions/plan-recovery-r2-2026-10-06.md':
      'b9632b94dfb136b35d0b3bcef89a2cee47002836ed7db679a56cc4a000c0b48b',
    'specs/011-allergies-clinical-content-governance/decisions/trusted-handoff-design-2026-10-06.md':
      '8d3fe1ae977bb99e3d24d1cf1f5548dafc0ecdb350f7e681b89acb04488e0bab',
    'specs/011-allergies-clinical-content-governance/evidence/plan-recovery-evidence-foundation-matrix.md':
      '03eaf4a9ace7d26fbbf977309774728531e763f13dc1bf06f726957838092709',
    'specs/011-allergies-clinical-content-governance/plan.md':
      '038684b04879b0ff2b26a9a351768cfcf0185e7da86b855ad56df5c55c47a7ca',
    'specs/011-allergies-clinical-content-governance/quickstart.md':
      '71e377027f3aee5385e3c079e288498ea9e5597ae657dd07eecd5bf11e25ec5a',
    'specs/011-allergies-clinical-content-governance/research.md':
      'd862cfb3698f7651e0b63c80910107ee4c43e136bb417d079294f5e5451967c5',
    'specs/011-allergies-clinical-content-governance/spec.md':
      '96fb693f97f6905c4b34890319ed26e3f5b4250eb462e25e1e04b50c23cc0eb0',
    'specs/011-allergies-clinical-content-governance/visual-baselines/reference-manifest.json':
      '59ea1788edbae023533a9e08da97bc3884e0e098ec6e80721272822b6439c432',
  },
  documentationSuccessor: {
    bindingId: 'SHIFAA-F011-DOCUMENTATION-SUCCESSOR@1.0.0',
    binding: {
      path: 'specs/011-allergies-clinical-content-governance/decisions/documentation-successor-v1.json',
      sha256: 'cc8b2024129325404bf745e55f6ee3183922e9244fe11f7687699e18e2ed9e62',
    },
    decision: {
      path: 'specs/011-allergies-clinical-content-governance/decisions/k24-documentation-maintenance-approved-2026-10-09.md',
      sha256: '1a02dc567e2f989f69058c58068fa334f5c1c8fa13636b7cca9af1bf5ccb329f',
    },
    inputDigests: {
      'docs/TEAM-INSTALLATION-CHECKLIST.md':
        '84b99da5826547f584763adc1a472c1a18029960362fb1870aa1c5489359363c',
      'docs/governance/SHIFAA-Remaining-Specs-Roadmap.md':
        '3e01011f8f916535bef267845266bc5c3a3a7b1652b39afa3501dda6c9452757',
      'docs/traceability/SHIFAA-Traceability-Matrix.md':
        '1e86808e8825ebe3ba6563952b52de00a71be70b6bee9ae71e163702f511673e',
    },
  },
  evidenceProfiles: [
    'content_material',
    'code_material',
    'test_vector_material',
    'signing',
    'credential',
    'designation',
    'signing_authority',
    'admissibility',
    'allergy_verification',
  ],
  operationCount: 7,
  nfrCount: 19,
  retainedGate: 'OPEN-TECH-002',
  consumptionAllowed: false,
  supersededRegistries: [
    'specs/011-allergies-clinical-content-governance/contracts/plan-protection-parity-r2.json',
  ],
} as const;

export const generatedFeature011OperationIds = [
  'listAllergies',
  'createAllergy',
  'verifyAllergy',
  'listClinicalContent',
  'createClinicalContentRelease',
  'signClinicalContentRelease',
  'publishClinicalContentRelease',
] as const;

export interface Feature011ClientOptions {
  baseUrl: string;
  accessToken: () => string | undefined;
  purpose?: string;
  fetch?: typeof globalThis.fetch;
  acceptLanguage?: 'ar-EG' | 'en-EG';
  defaultHeaders?: Readonly<Record<string, string>>;
}

export interface Feature011RequestOptions {
  requestId?: string;
  signal?: AbortSignal;
}

interface Feature011RequestInput extends Feature011RequestOptions {
  body?: unknown;
  idempotencyKey?: string;
  version?: number;
}

export class Feature011ApiError extends Error {
  public constructor(
    public readonly status: number,
    public readonly problem: unknown,
  ) {
    super(`SHIFAA Feature 011 API request failed with status ${status}.`);
    this.name = 'Feature011ApiError';
  }
}

interface Feature011QueryParameter {
  name: string;
  explode: boolean;
}

export class Feature011Client {
  private readonly fetcher: typeof globalThis.fetch;

  public constructor(private readonly options: Feature011ClientOptions) {
    this.fetcher = (options.fetch ?? globalThis.fetch).bind(globalThis);
  }

  public listAllergies(
    managedPatientId: string,
    query: Feature011ListAllergiesQuery = {},
    options: Feature011RequestOptions = {},
  ): Promise<Feature011AllergyList> {
    return this.request<Feature011AllergyList>(
      'GET',
      this.queryPath(`/patients/${encodeURIComponent(managedPatientId)}/allergies`, query, [
        { name: 'cursor', explode: true },
        { name: 'limit', explode: true },
        { name: 'view', explode: true },
        { name: 'allergyId', explode: true },
        { name: 'status', explode: true },
      ]),
      options,
    );
  }

  public createAllergy(
    managedPatientId: string,
    body: Feature011CreateAllergyRequest,
    options: Feature011RequestOptions & { idempotencyKey: string },
  ): Promise<Feature011AllergyRevision> {
    return this.request<Feature011AllergyRevision>(
      'POST',
      `/patients/${encodeURIComponent(managedPatientId)}/allergies`,
      { ...options, body },
    );
  }

  public verifyAllergy(
    allergyId: string,
    body: Feature011VerifyAllergyRequest,
    options: Feature011RequestOptions & { idempotencyKey: string } & { version: number },
  ): Promise<Feature011AllergyRevision> {
    return this.request<Feature011AllergyRevision>(
      'POST',
      `/allergies/${encodeURIComponent(allergyId)}/verification`,
      { ...options, body },
    );
  }

  public listClinicalContent(
    contentType: string,
    query: Feature011ListClinicalContentQuery,
    options: Feature011RequestOptions = {},
  ): Promise<Feature011ClinicalContentList> {
    return this.request<Feature011ClinicalContentList>(
      'GET',
      this.queryPath(`/admin/clinical-content/${encodeURIComponent(contentType)}`, query, [
        { name: 'cursor', explode: true },
        { name: 'limit', explode: true },
        { name: 'projection', explode: true },
        { name: 'releaseId', explode: true },
        { name: 'governedContentKey', explode: true },
        { name: 'effectiveScopeKey', explode: true },
        { name: 'version', explode: true },
        { name: 'status', explode: true },
      ]),
      options,
    );
  }

  public createClinicalContentRelease(
    contentType: string,
    body: Feature011CreateReleaseRequest,
    options: Feature011RequestOptions & { idempotencyKey: string },
  ): Promise<Feature011GovernanceRelease> {
    return this.request<Feature011GovernanceRelease>(
      'POST',
      `/admin/clinical-content/${encodeURIComponent(contentType)}/releases`,
      { ...options, body },
    );
  }

  public signClinicalContentRelease(
    releaseId: string,
    body: Feature011SignReleaseRequest,
    options: Feature011RequestOptions & { idempotencyKey: string } & { version: number },
  ): Promise<Feature011SignReleaseResponse> {
    return this.request<Feature011SignReleaseResponse>(
      'POST',
      `/admin/clinical-content/releases/${encodeURIComponent(releaseId)}/signatures`,
      { ...options, body },
    );
  }

  public publishClinicalContentRelease(
    releaseId: string,
    body: Feature011PublishReleaseRequest,
    options: Feature011RequestOptions & { idempotencyKey: string } & { version: number },
  ): Promise<Feature011GovernanceRelease> {
    return this.request<Feature011GovernanceRelease>(
      'POST',
      `/admin/clinical-content/releases/${encodeURIComponent(releaseId)}/publish`,
      { ...options, body },
    );
  }

  private queryPath(
    path: string,
    query: object,
    parameters: readonly Feature011QueryParameter[],
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
    input: Feature011RequestInput,
  ): Promise<T> {
    const accessToken = this.options.accessToken();
    if (!accessToken) throw new Feature011ApiError(401, { code: 'authentication-required' });

    const headers = new Headers({
      Accept: 'application/json, application/problem+json',
      'Accept-Language': this.options.acceptLanguage ?? 'ar-EG',
      ...(this.options.defaultHeaders ?? {}),
    });
    // Mutation and identity bindings come from request/current session options.
    for (const name of [
      'Authorization',
      'Idempotency-Key',
      'If-Match',
      'X-AAL',
      'X-Actor-Id',
      'X-Purpose',
      'X-Request-Id',
      'Content-Type',
    ])
      headers.delete(name);
    if (this.options.purpose) headers.set('X-Purpose', this.options.purpose);
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
      throw new Feature011ApiError(502, { code: 'unsafe-cache-policy' });

    const payload: unknown = await response.json();
    if (!response.ok) throw new Feature011ApiError(response.status, payload);
    return payload as T;
  }
}

export const createFeature011Client = (options: Feature011ClientOptions) =>
  new Feature011Client(options);
