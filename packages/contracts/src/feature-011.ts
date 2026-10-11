// @generated from specs/011-allergies-clinical-content-governance/contracts/openapi.yaml — DO NOT EDIT.

import { FormatRegistry, Type, type Static } from '@sinclair/typebox';

if (!FormatRegistry.Has('uuid')) {
  FormatRegistry.Set('uuid', (formatValue) =>
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(formatValue),
  );
}
if (!FormatRegistry.Has('date-time')) {
  FormatRegistry.Set('date-time', (formatValue) => Number.isFinite(Date.parse(formatValue)));
}
if (!FormatRegistry.Has('date')) {
  FormatRegistry.Set('date', (formatValue) => /^\d{4}-\d{2}-\d{2}$/.test(formatValue));
}
if (!FormatRegistry.Has('uri-reference')) {
  FormatRegistry.Set('uri-reference', (formatValue) => !/\s/.test(formatValue));
}

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

export const feature011Operations = [
  {
    operationId: 'listAllergies',
    method: 'GET',
    path: '/patients/{managedPatientId}/allergies',
    responseSchema: 'AllergyList',
    pathParameters: [
      {
        name: 'managedPatientId',
        required: true,
        schema: {
          type: 'string',
          format: 'uuid',
        },
      },
    ],
    queryParameters: [
      {
        name: 'cursor',
        required: false,
        schema: {
          type: 'string',
          minLength: 1,
        },
      },
      {
        name: 'limit',
        required: false,
        schema: {
          type: 'integer',
          minimum: 1,
          maximum: 100,
          default: 25,
        },
      },
      {
        name: 'view',
        required: false,
        schema: {
          type: 'string',
          enum: ['current', 'history'],
          default: 'current',
        },
      },
      {
        name: 'allergyId',
        required: false,
        schema: {
          type: 'string',
          format: 'uuid',
        },
      },
      {
        name: 'status',
        required: false,
        schema: {
          type: 'string',
          enum: ['self_reported', 'clinician_confirmed', 'refuted', 'entered_in_error'],
        },
      },
    ],
    headerParameters: [
      {
        name: 'Accept-Language',
        required: false,
        schema: {
          type: 'string',
          enum: ['ar-EG', 'en-EG'],
          default: 'ar-EG',
        },
      },
      {
        name: 'X-Request-Id',
        required: false,
        schema: {
          type: 'string',
          format: 'uuid',
        },
      },
      {
        name: 'X-Purpose',
        required: false,
        schema: {
          type: 'string',
          minLength: 1,
        },
      },
    ],
  },
  {
    operationId: 'createAllergy',
    method: 'POST',
    path: '/patients/{managedPatientId}/allergies',
    requestSchema: 'CreateAllergyRequest',
    responseSchema: 'AllergyRevision',
    pathParameters: [
      {
        name: 'managedPatientId',
        required: true,
        schema: {
          type: 'string',
          format: 'uuid',
        },
      },
    ],
    queryParameters: [],
    headerParameters: [
      {
        name: 'Accept-Language',
        required: false,
        schema: {
          type: 'string',
          enum: ['ar-EG', 'en-EG'],
          default: 'ar-EG',
        },
      },
      {
        name: 'X-Request-Id',
        required: false,
        schema: {
          type: 'string',
          format: 'uuid',
        },
      },
      {
        name: 'X-Purpose',
        required: false,
        schema: {
          type: 'string',
          minLength: 1,
        },
      },
      {
        name: 'Idempotency-Key',
        required: true,
        schema: {
          type: 'string',
          minLength: 1,
        },
      },
    ],
  },
  {
    operationId: 'verifyAllergy',
    method: 'POST',
    path: '/allergies/{allergyId}/verification',
    requestSchema: 'VerifyAllergyRequest',
    responseSchema: 'AllergyRevision',
    pathParameters: [
      {
        name: 'allergyId',
        required: true,
        schema: {
          type: 'string',
          format: 'uuid',
        },
      },
    ],
    queryParameters: [],
    headerParameters: [
      {
        name: 'Accept-Language',
        required: false,
        schema: {
          type: 'string',
          enum: ['ar-EG', 'en-EG'],
          default: 'ar-EG',
        },
      },
      {
        name: 'X-Request-Id',
        required: false,
        schema: {
          type: 'string',
          format: 'uuid',
        },
      },
      {
        name: 'X-Purpose',
        required: false,
        schema: {
          type: 'string',
          minLength: 1,
        },
      },
      {
        name: 'Idempotency-Key',
        required: true,
        schema: {
          type: 'string',
          minLength: 1,
        },
      },
      {
        name: 'If-Match',
        required: true,
        schema: {
          type: 'string',
          pattern: '^"[1-9][0-9]*"$',
        },
      },
    ],
  },
  {
    operationId: 'listClinicalContent',
    method: 'GET',
    path: '/admin/clinical-content/{contentType}',
    responseSchema: 'ClinicalContentList',
    pathParameters: [
      {
        name: 'contentType',
        required: true,
        schema: {
          type: 'string',
          minLength: 1,
        },
      },
    ],
    queryParameters: [
      {
        name: 'cursor',
        required: false,
        schema: {
          type: 'string',
          minLength: 1,
        },
      },
      {
        name: 'limit',
        required: false,
        schema: {
          type: 'integer',
          minimum: 1,
          maximum: 100,
          default: 25,
        },
      },
      {
        name: 'projection',
        required: true,
        schema: {
          type: 'string',
          enum: ['status', 'governance', 'assigned_review'],
        },
      },
      {
        name: 'releaseId',
        required: false,
        schema: {
          type: 'string',
          format: 'uuid',
        },
      },
      {
        name: 'governedContentKey',
        required: false,
        schema: {
          type: 'string',
          minLength: 1,
        },
      },
      {
        name: 'effectiveScopeKey',
        required: false,
        schema: {
          type: 'string',
          minLength: 1,
        },
      },
      {
        name: 'version',
        required: false,
        schema: {
          type: 'integer',
          minimum: 1,
        },
      },
      {
        name: 'status',
        required: false,
        schema: {
          type: 'string',
          enum: ['draft', 'published'],
        },
      },
    ],
    headerParameters: [
      {
        name: 'Accept-Language',
        required: false,
        schema: {
          type: 'string',
          enum: ['ar-EG', 'en-EG'],
          default: 'ar-EG',
        },
      },
      {
        name: 'X-Request-Id',
        required: false,
        schema: {
          type: 'string',
          format: 'uuid',
        },
      },
      {
        name: 'X-Purpose',
        required: false,
        schema: {
          type: 'string',
          minLength: 1,
        },
      },
    ],
  },
  {
    operationId: 'createClinicalContentRelease',
    method: 'POST',
    path: '/admin/clinical-content/{contentType}/releases',
    requestSchema: 'CreateReleaseRequest',
    responseSchema: 'GovernanceRelease',
    pathParameters: [
      {
        name: 'contentType',
        required: true,
        schema: {
          type: 'string',
          minLength: 1,
        },
      },
    ],
    queryParameters: [],
    headerParameters: [
      {
        name: 'Accept-Language',
        required: false,
        schema: {
          type: 'string',
          enum: ['ar-EG', 'en-EG'],
          default: 'ar-EG',
        },
      },
      {
        name: 'X-Request-Id',
        required: false,
        schema: {
          type: 'string',
          format: 'uuid',
        },
      },
      {
        name: 'X-Purpose',
        required: false,
        schema: {
          type: 'string',
          minLength: 1,
        },
      },
      {
        name: 'Idempotency-Key',
        required: true,
        schema: {
          type: 'string',
          minLength: 1,
        },
      },
    ],
  },
  {
    operationId: 'signClinicalContentRelease',
    method: 'POST',
    path: '/admin/clinical-content/releases/{releaseId}/signatures',
    requestSchema: 'SignReleaseRequest',
    responseSchema: 'SignReleaseResponse',
    pathParameters: [
      {
        name: 'releaseId',
        required: true,
        schema: {
          type: 'string',
          format: 'uuid',
        },
      },
    ],
    queryParameters: [],
    headerParameters: [
      {
        name: 'Accept-Language',
        required: false,
        schema: {
          type: 'string',
          enum: ['ar-EG', 'en-EG'],
          default: 'ar-EG',
        },
      },
      {
        name: 'X-Request-Id',
        required: false,
        schema: {
          type: 'string',
          format: 'uuid',
        },
      },
      {
        name: 'X-Purpose',
        required: false,
        schema: {
          type: 'string',
          minLength: 1,
        },
      },
      {
        name: 'Idempotency-Key',
        required: true,
        schema: {
          type: 'string',
          minLength: 1,
        },
      },
      {
        name: 'If-Match',
        required: true,
        schema: {
          type: 'string',
          pattern: '^"[1-9][0-9]*"$',
        },
      },
    ],
  },
  {
    operationId: 'publishClinicalContentRelease',
    method: 'POST',
    path: '/admin/clinical-content/releases/{releaseId}/publish',
    requestSchema: 'PublishReleaseRequest',
    responseSchema: 'GovernanceRelease',
    pathParameters: [
      {
        name: 'releaseId',
        required: true,
        schema: {
          type: 'string',
          format: 'uuid',
        },
      },
    ],
    queryParameters: [],
    headerParameters: [
      {
        name: 'Accept-Language',
        required: false,
        schema: {
          type: 'string',
          enum: ['ar-EG', 'en-EG'],
          default: 'ar-EG',
        },
      },
      {
        name: 'X-Request-Id',
        required: false,
        schema: {
          type: 'string',
          format: 'uuid',
        },
      },
      {
        name: 'X-Purpose',
        required: false,
        schema: {
          type: 'string',
          minLength: 1,
        },
      },
      {
        name: 'Idempotency-Key',
        required: true,
        schema: {
          type: 'string',
          minLength: 1,
        },
      },
      {
        name: 'If-Match',
        required: true,
        schema: {
          type: 'string',
          pattern: '^"[1-9][0-9]*"$',
        },
      },
    ],
  },
] as const;
export type Feature011OperationId = (typeof feature011Operations)[number]['operationId'];

export const Feature011UuidSchema = Type.String({ format: 'uuid' });
export const Feature011VersionSchema = Type.Integer({ minimum: 1 });
export const Feature011InstantSchema = Type.String({ format: 'date-time' });
export const Feature011ArtifactDigestSchema = Type.String({ pattern: '^[a-f0-9]{64}$' });
export const Feature011KnownUnknownTextSchema = Type.Union([
  Type.Object(
    { knowledge: Type.Literal('known'), value: Type.String({ minLength: 1 }) },
    { additionalProperties: false },
  ),
  Type.Object({ knowledge: Type.Literal('unknown') }, { additionalProperties: false }),
]);
export const Feature011KnownUnknownCodingSchema = Type.Union([
  Type.Object(
    {
      knowledge: Type.Literal('known'),
      value: Type.Object(
        {
          system: Type.String({ minLength: 1 }),
          code: Type.String({ minLength: 1 }),
          display: Type.Optional(Type.String({ minLength: 1 })),
        },
        { additionalProperties: false },
      ),
    },
    { additionalProperties: false },
  ),
  Type.Object({ knowledge: Type.Literal('unknown') }, { additionalProperties: false }),
]);
export const Feature011SubstanceSchema = Type.Object(
  { identity: Type.String({ minLength: 1 }), display: Type.String({ minLength: 1 }) },
  { additionalProperties: false },
);
export const Feature011SourceSchema = Type.Object(
  {
    display: Type.String({ minLength: 1 }),
    reference: Type.Optional(Type.String({ minLength: 1 })),
  },
  { additionalProperties: false },
);
export const Feature011AllergyStateSchema = Type.Union([
  Type.Literal('self_reported'),
  Type.Literal('clinician_confirmed'),
  Type.Literal('refuted'),
  Type.Literal('entered_in_error'),
]);
export const Feature011CreateAllergyRequestSchema = Type.Object(
  {
    substance: Feature011SubstanceSchema,
    source: Feature011SourceSchema,
    coding: Type.Optional(Feature011KnownUnknownCodingSchema),
    reaction: Type.Optional(Feature011KnownUnknownTextSchema),
    severity: Type.Optional(Feature011KnownUnknownTextSchema),
    onset: Type.Optional(Feature011KnownUnknownTextSchema),
    encounterId: Type.Optional(Type.String({ format: 'uuid' })),
    correctsAllergyId: Type.Optional(Type.String({ format: 'uuid' })),
  },
  { additionalProperties: false },
);
export const Feature011AllergyCorrectionsSchema = Type.Object(
  {
    substance: Type.Optional(Feature011SubstanceSchema),
    coding: Type.Optional(Feature011KnownUnknownCodingSchema),
    reaction: Type.Optional(Feature011KnownUnknownTextSchema),
    severity: Type.Optional(Feature011KnownUnknownTextSchema),
    onset: Type.Optional(Feature011KnownUnknownTextSchema),
  },
  { additionalProperties: false },
);
export const Feature011VerifyAllergyRequestSchema = Type.Object(
  {
    targetStatus: Type.Union([
      Type.Literal('clinician_confirmed'),
      Type.Literal('refuted'),
      Type.Literal('entered_in_error'),
    ]),
    reason: Type.String({ minLength: 1 }),
    verificationEvidenceRef: Type.String({ format: 'uuid' }),
    corrections: Type.Optional(Feature011AllergyCorrectionsSchema),
    encounterId: Type.Optional(Type.String({ format: 'uuid' })),
  },
  { additionalProperties: false },
);
export const Feature011AllergyRevisionSchema = Type.Object(
  {
    revisionId: Type.String({ format: 'uuid' }),
    allergyId: Type.String({ format: 'uuid' }),
    patientId: Type.String({ format: 'uuid' }),
    version: Type.Integer({ minimum: 1 }),
    previousRevisionId: Type.Union([Type.String({ format: 'uuid' }), Type.Null()]),
    status: Feature011AllergyStateSchema,
    substance: Feature011SubstanceSchema,
    source: Feature011SourceSchema,
    coding: Feature011KnownUnknownCodingSchema,
    reaction: Feature011KnownUnknownTextSchema,
    severity: Feature011KnownUnknownTextSchema,
    onset: Feature011KnownUnknownTextSchema,
    recorderPersonId: Type.String({ format: 'uuid' }),
    recordedAt: Type.String({ format: 'date-time' }),
    actionActorPersonId: Type.String({ format: 'uuid' }),
    actionAt: Type.String({ format: 'date-time' }),
    verification: Type.Union([
      Type.Object(
        {
          reason: Type.String({ minLength: 1 }),
          evidenceRef: Type.String({ format: 'uuid' }),
          verifierPersonId: Type.String({ format: 'uuid' }),
        },
        { additionalProperties: false },
      ),
      Type.Null(),
    ]),
    correctsAllergyId: Type.Union([Type.String({ format: 'uuid' }), Type.Null()]),
  },
  { additionalProperties: false },
);
export const Feature011ArtifactSchema = Type.Object(
  {
    contentEvidenceRef: Type.String({ format: 'uuid' }),
    codeEvidenceRef: Type.String({ format: 'uuid' }),
    testVectorEvidenceRef: Type.String({ format: 'uuid' }),
    declaredDigest: Type.Optional(Type.String({ pattern: '^[a-f0-9]{64}$' })),
  },
  { additionalProperties: false },
);
export const Feature011CreateReleaseRequestSchema = Type.Object(
  {
    governedContentKey: Type.String({ minLength: 1 }),
    effectiveScopeKey: Type.String({ minLength: 1 }),
    source: Feature011SourceSchema,
    effectiveAt: Type.String({ format: 'date-time' }),
    artifact: Feature011ArtifactSchema,
    predecessor: Type.Union([
      Type.Object(
        { initial: Type.Literal(true), supersedesReleaseId: Type.Null() },
        { additionalProperties: false },
      ),
      Type.Object(
        { initial: Type.Literal(false), supersedesReleaseId: Type.String({ format: 'uuid' }) },
        { additionalProperties: false },
      ),
    ]),
  },
  { additionalProperties: false },
);
export const Feature011SignReleaseRequestSchema = Type.Object(
  {
    capacity: Type.Union([Type.Literal('physician'), Type.Literal('pharmacist')]),
    decision: Type.Union([Type.Literal('approved'), Type.Literal('rejected')]),
    artifactVersion: Type.Integer({ minimum: 1 }),
    artifactDigest: Type.String({ pattern: '^[a-f0-9]{64}$' }),
    signingEvidenceRef: Type.String({ format: 'uuid' }),
    reason: Type.Optional(Type.String({ minLength: 1 })),
  },
  { additionalProperties: false },
);
export const Feature011PublishReleaseRequestSchema = Type.Object(
  {
    artifactVersion: Type.Integer({ minimum: 1 }),
    artifactDigest: Type.String({ pattern: '^[a-f0-9]{64}$' }),
    confirmPublication: Type.Literal(true),
  },
  { additionalProperties: false },
);
export const Feature011SignatureEvidenceSchema = Type.Object(
  {
    signatureId: Type.String({ format: 'uuid' }),
    capacity: Type.Union([Type.Literal('physician'), Type.Literal('pharmacist')]),
    decision: Type.Union([Type.Literal('approved'), Type.Literal('rejected')]),
    artifactVersion: Type.Integer({ minimum: 1 }),
    artifactDigest: Type.String({ pattern: '^[a-f0-9]{64}$' }),
    signerPersonId: Type.String({ format: 'uuid' }),
    signedAt: Type.String({ format: 'date-time' }),
    evidenceRef: Type.String({ format: 'uuid' }),
  },
  { additionalProperties: false },
);
export const Feature011SignatureStatusSchema = Type.Object(
  { physicianApproved: Type.Boolean(), pharmacistApproved: Type.Boolean() },
  { additionalProperties: false },
);
export const Feature011EligibilitySchema = Type.Union([
  Type.Literal('effective'),
  Type.Literal('future'),
  Type.Literal('superseded'),
  Type.Literal('unavailable'),
]);
export const Feature011StatusReleaseSchema = Type.Object(
  {
    releaseId: Type.String({ format: 'uuid' }),
    source: Feature011SourceSchema,
    artifactVersion: Type.Integer({ minimum: 1 }),
    effectiveAt: Type.String({ format: 'date-time' }),
    publicationState: Type.Literal('published'),
    eligibility: Feature011EligibilitySchema,
    supersedesReleaseId: Type.Union([Type.String({ format: 'uuid' }), Type.Null()]),
    initial: Type.Boolean(),
    signatureStatus: Feature011SignatureStatusSchema,
  },
  { additionalProperties: false },
);
export const Feature011ArtifactReviewSchema = Type.Object(
  { content: Type.String({}), code: Type.String({}), testVectors: Type.String({}) },
  { additionalProperties: false },
);
export const Feature011GovernanceReleaseSchema = Type.Object(
  {
    releaseId: Type.String({ format: 'uuid' }),
    contentType: Type.String({ minLength: 1 }),
    governedContentKey: Type.String({ minLength: 1 }),
    effectiveScopeKey: Type.String({ minLength: 1 }),
    source: Feature011SourceSchema,
    effectiveAt: Type.String({ format: 'date-time' }),
    artifactVersion: Type.Integer({ minimum: 1 }),
    artifactDigest: Type.String({ pattern: '^[a-f0-9]{64}$' }),
    workflowVersion: Type.Integer({ minimum: 1 }),
    publicationState: Type.Union([Type.Literal('draft'), Type.Literal('published')]),
    eligibility: Feature011EligibilitySchema,
    initial: Type.Boolean(),
    supersedesReleaseId: Type.Union([Type.String({ format: 'uuid' }), Type.Null()]),
    creatorPersonId: Type.String({ format: 'uuid' }),
    createdAt: Type.String({ format: 'date-time' }),
    publisherPersonId: Type.Union([Type.String({ format: 'uuid' }), Type.Null()]),
    publishedAt: Type.Union([Type.String({ format: 'date-time' }), Type.Null()]),
    artifact: Feature011ArtifactSchema,
    signatures: Type.Array(Feature011SignatureEvidenceSchema),
    syntheticOnly: Type.Boolean(),
    artifactReview: Feature011ArtifactReviewSchema,
  },
  { additionalProperties: false },
);
export const Feature011AssignedReviewReleaseSchema = Type.Object(
  {
    releaseId: Type.String({ format: 'uuid' }),
    source: Feature011SourceSchema,
    effectiveAt: Type.String({ format: 'date-time' }),
    artifactVersion: Type.Integer({ minimum: 1 }),
    artifactDigest: Type.String({ pattern: '^[a-f0-9]{64}$' }),
    workflowVersion: Type.Integer({ minimum: 1 }),
    publicationState: Type.Union([Type.Literal('draft'), Type.Literal('published')]),
    artifact: Feature011ArtifactSchema,
    initial: Type.Boolean(),
    supersedesReleaseId: Type.Union([Type.String({ format: 'uuid' }), Type.Null()]),
    signatureStatus: Feature011SignatureStatusSchema,
    syntheticOnly: Type.Boolean(),
    artifactReview: Feature011ArtifactReviewSchema,
  },
  { additionalProperties: false },
);
export const Feature011SignReleaseResponseSchema = Type.Object(
  {
    releaseId: Type.String({ format: 'uuid' }),
    workflowVersion: Type.Integer({ minimum: 1 }),
    signature: Feature011SignatureEvidenceSchema,
  },
  { additionalProperties: false },
);
export const Feature011ProblemSchema = Type.Object(
  {
    type: Type.String({ format: 'uri-reference' }),
    title: Type.String({}),
    status: Type.Integer({ minimum: 400, maximum: 599 }),
    detail: Type.String({}),
    instance: Type.String({ format: 'uri-reference' }),
    code: Type.String({}),
    request_id: Feature011UuidSchema,
    errors: Type.Optional(
      Type.Array(
        Type.Object(
          { pointer: Type.String({}), code: Type.String({}) },
          { additionalProperties: false },
        ),
      ),
    ),
    retry_after_seconds: Type.Optional(Type.Integer({ minimum: 0 })),
  },
  { additionalProperties: false },
);
export const Feature011PageMetaSchema = Type.Object(
  {
    nextCursor: Type.Union([Type.String({}), Type.Null()]),
    lastUpdatedAt: Feature011InstantSchema,
    stale: Type.Boolean(),
  },
  { additionalProperties: false },
);
export const Feature011AllergyListSchema = Type.Object(
  {
    view: Type.Union([Type.Literal('current'), Type.Literal('history')]),
    data: Type.Array(Feature011AllergyRevisionSchema),
    meta: Feature011PageMetaSchema,
  },
  { additionalProperties: false },
);
export const Feature011StatusListSchema = Type.Object(
  {
    projection: Type.Literal('status'),
    data: Type.Array(Feature011StatusReleaseSchema),
    meta: Feature011PageMetaSchema,
  },
  { additionalProperties: false },
);
export const Feature011GovernanceListSchema = Type.Object(
  {
    projection: Type.Literal('governance'),
    data: Type.Array(Feature011GovernanceReleaseSchema),
    meta: Feature011PageMetaSchema,
  },
  { additionalProperties: false },
);
export const Feature011AssignedReviewListSchema = Type.Object(
  {
    projection: Type.Literal('assigned_review'),
    data: Type.Array(Feature011AssignedReviewReleaseSchema),
    meta: Feature011PageMetaSchema,
  },
  { additionalProperties: false },
);
export const Feature011ClinicalContentListSchema = Type.Union([
  Feature011StatusListSchema,
  Feature011GovernanceListSchema,
  Feature011AssignedReviewListSchema,
]);

export const Feature011ListAllergiesQuerySchema = Type.Object(
  {
    cursor: Type.Optional(Type.String({ minLength: 1 })),
    limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 100, default: 25 })),
    view: Type.Optional(Type.Union([Type.Literal('current'), Type.Literal('history')])),
    allergyId: Type.Optional(Type.String({ format: 'uuid' })),
    status: Type.Optional(
      Type.Union([
        Type.Literal('self_reported'),
        Type.Literal('clinician_confirmed'),
        Type.Literal('refuted'),
        Type.Literal('entered_in_error'),
      ]),
    ),
  },
  { additionalProperties: false },
);
export const Feature011ListClinicalContentQuerySchema = Type.Object(
  {
    cursor: Type.Optional(Type.String({ minLength: 1 })),
    limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 100, default: 25 })),
    projection: Type.Union([
      Type.Literal('status'),
      Type.Literal('governance'),
      Type.Literal('assigned_review'),
    ]),
    releaseId: Type.Optional(Type.String({ format: 'uuid' })),
    governedContentKey: Type.Optional(Type.String({ minLength: 1 })),
    effectiveScopeKey: Type.Optional(Type.String({ minLength: 1 })),
    version: Type.Optional(Type.Integer({ minimum: 1 })),
    status: Type.Optional(Type.Union([Type.Literal('draft'), Type.Literal('published')])),
  },
  { additionalProperties: false },
);

export const feature011Schemas = {
  Uuid: Feature011UuidSchema,
  Version: Feature011VersionSchema,
  Instant: Feature011InstantSchema,
  ArtifactDigest: Feature011ArtifactDigestSchema,
  KnownUnknownText: Feature011KnownUnknownTextSchema,
  KnownUnknownCoding: Feature011KnownUnknownCodingSchema,
  Substance: Feature011SubstanceSchema,
  Source: Feature011SourceSchema,
  AllergyState: Feature011AllergyStateSchema,
  CreateAllergyRequest: Feature011CreateAllergyRequestSchema,
  AllergyCorrections: Feature011AllergyCorrectionsSchema,
  VerifyAllergyRequest: Feature011VerifyAllergyRequestSchema,
  AllergyRevision: Feature011AllergyRevisionSchema,
  Artifact: Feature011ArtifactSchema,
  CreateReleaseRequest: Feature011CreateReleaseRequestSchema,
  SignReleaseRequest: Feature011SignReleaseRequestSchema,
  PublishReleaseRequest: Feature011PublishReleaseRequestSchema,
  SignatureEvidence: Feature011SignatureEvidenceSchema,
  SignatureStatus: Feature011SignatureStatusSchema,
  Eligibility: Feature011EligibilitySchema,
  StatusRelease: Feature011StatusReleaseSchema,
  ArtifactReview: Feature011ArtifactReviewSchema,
  GovernanceRelease: Feature011GovernanceReleaseSchema,
  AssignedReviewRelease: Feature011AssignedReviewReleaseSchema,
  SignReleaseResponse: Feature011SignReleaseResponseSchema,
  Problem: Feature011ProblemSchema,
  PageMeta: Feature011PageMetaSchema,
  AllergyList: Feature011AllergyListSchema,
  StatusList: Feature011StatusListSchema,
  GovernanceList: Feature011GovernanceListSchema,
  AssignedReviewList: Feature011AssignedReviewListSchema,
  ClinicalContentList: Feature011ClinicalContentListSchema,
  listAllergiesQuery: Feature011ListAllergiesQuerySchema,
  listClinicalContentQuery: Feature011ListClinicalContentQuerySchema,
} as const;

export const feature011QuerySchemas = {
  listAllergies: Feature011ListAllergiesQuerySchema,
  listClinicalContent: Feature011ListClinicalContentQuerySchema,
} as const;

export const feature011RequestSchemas = {
  createAllergy: Feature011CreateAllergyRequestSchema,
  verifyAllergy: Feature011VerifyAllergyRequestSchema,
  createClinicalContentRelease: Feature011CreateReleaseRequestSchema,
  signClinicalContentRelease: Feature011SignReleaseRequestSchema,
  publishClinicalContentRelease: Feature011PublishReleaseRequestSchema,
} as const;

export const feature011ResponseSchemas = {
  listAllergies: Feature011AllergyListSchema,
  createAllergy: Feature011AllergyRevisionSchema,
  verifyAllergy: Feature011AllergyRevisionSchema,
  listClinicalContent: Feature011ClinicalContentListSchema,
  createClinicalContentRelease: Feature011GovernanceReleaseSchema,
  signClinicalContentRelease: Feature011SignReleaseResponseSchema,
  publishClinicalContentRelease: Feature011GovernanceReleaseSchema,
} as const;

export type Feature011Uuid = Static<typeof Feature011UuidSchema>;
export type Feature011Version = Static<typeof Feature011VersionSchema>;
export type Feature011Instant = Static<typeof Feature011InstantSchema>;
export type Feature011ArtifactDigest = Static<typeof Feature011ArtifactDigestSchema>;
export type Feature011KnownUnknownText = Static<typeof Feature011KnownUnknownTextSchema>;
export type Feature011KnownUnknownCoding = Static<typeof Feature011KnownUnknownCodingSchema>;
export type Feature011Substance = Static<typeof Feature011SubstanceSchema>;
export type Feature011Source = Static<typeof Feature011SourceSchema>;
export type Feature011AllergyState = Static<typeof Feature011AllergyStateSchema>;
export type Feature011CreateAllergyRequest = Static<typeof Feature011CreateAllergyRequestSchema>;
export type Feature011AllergyCorrections = Static<typeof Feature011AllergyCorrectionsSchema>;
export type Feature011VerifyAllergyRequest = Static<typeof Feature011VerifyAllergyRequestSchema>;
export type Feature011AllergyRevision = Static<typeof Feature011AllergyRevisionSchema>;
export type Feature011Artifact = Static<typeof Feature011ArtifactSchema>;
export type Feature011CreateReleaseRequest = Static<typeof Feature011CreateReleaseRequestSchema>;
export type Feature011SignReleaseRequest = Static<typeof Feature011SignReleaseRequestSchema>;
export type Feature011PublishReleaseRequest = Static<typeof Feature011PublishReleaseRequestSchema>;
export type Feature011SignatureEvidence = Static<typeof Feature011SignatureEvidenceSchema>;
export type Feature011SignatureStatus = Static<typeof Feature011SignatureStatusSchema>;
export type Feature011Eligibility = Static<typeof Feature011EligibilitySchema>;
export type Feature011StatusRelease = Static<typeof Feature011StatusReleaseSchema>;
export type Feature011ArtifactReview = Static<typeof Feature011ArtifactReviewSchema>;
export type Feature011GovernanceRelease = Static<typeof Feature011GovernanceReleaseSchema>;
export type Feature011AssignedReviewRelease = Static<typeof Feature011AssignedReviewReleaseSchema>;
export type Feature011SignReleaseResponse = Static<typeof Feature011SignReleaseResponseSchema>;
export type Feature011Problem = Static<typeof Feature011ProblemSchema>;
export type Feature011PageMeta = Static<typeof Feature011PageMetaSchema>;
export type Feature011AllergyList = Static<typeof Feature011AllergyListSchema>;
export type Feature011StatusList = Static<typeof Feature011StatusListSchema>;
export type Feature011GovernanceList = Static<typeof Feature011GovernanceListSchema>;
export type Feature011AssignedReviewList = Static<typeof Feature011AssignedReviewListSchema>;
export type Feature011ClinicalContentList = Static<typeof Feature011ClinicalContentListSchema>;
export type Feature011ListAllergiesQuery = Static<typeof Feature011ListAllergiesQuerySchema>;
export type Feature011ListClinicalContentQuery = Static<
  typeof Feature011ListClinicalContentQuerySchema
>;
