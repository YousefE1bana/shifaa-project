// @generated from specs/012-prescription-safety-governed-overrides/contracts/openapi.yaml — DO NOT EDIT.

import { FormatRegistry, Type, type Static, type TSchema } from '@sinclair/typebox';
import { Value } from '@sinclair/typebox/value';

export const checkFeature012WireSchema = (schema: TSchema, value: unknown) =>
  Value.Check(schema, value);

if (!FormatRegistry.Has('uuid'))
  FormatRegistry.Set('uuid', (value) =>
    /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(value),
  );
if (!FormatRegistry.Has('date-time'))
  FormatRegistry.Set(
    'date-time',
    (value) =>
      /^\d{4}-\d{2}-\d{2}[Tt]\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:[Zz]|[+-]\d{2}:\d{2})$/.test(value) &&
      Number.isFinite(Date.parse(value)),
  );
if (!FormatRegistry.Has('uri-reference'))
  FormatRegistry.Set('uri-reference', (value) => !/\s/.test(value));

export const feature012OpenApiSha256 =
  'c135c26a4e897a86d6d37ea756e46904a83c5fcc55387003ceeb71c97635fb9d';
export const feature012Operations = [
  {
    operationId: 'createPrescription',
    method: 'POST',
    path: '/encounters/{encounterId}/prescriptions',
    pathParameters: [
      {
        location: 'path',
        name: 'encounterId',
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
        location: 'header',
        name: 'Accept-Language',
        required: false,
        schema: {
          type: 'string',
          enum: ['ar-EG', 'en-EG'],
        },
      },
      {
        location: 'header',
        name: 'X-Request-Id',
        required: false,
        schema: {
          type: 'string',
          format: 'uuid',
        },
      },
      {
        location: 'header',
        name: 'X-Purpose',
        required: true,
        schema: {
          type: 'string',
          minLength: 1,
        },
      },
      {
        location: 'header',
        name: 'Idempotency-Key',
        required: true,
        schema: {
          type: 'string',
          minLength: 16,
          maxLength: 128,
        },
      },
    ],
    requestSchema: 'CreatePrescription',
    responseSchema: 'PrescriptionMutation',
    successStatus: 201,
    etag: 'ETag',
    problems: {
      '400': 'Problem400',
      '401': 'Problem401',
      '403': 'Problem403',
      '404': 'Problem404',
      '409': 'Problem409',
      '422': 'Problem422',
      '429': 'Problem429',
      '503': 'Problem503',
    },
  },
  {
    operationId: 'updatePrescription',
    method: 'PATCH',
    path: '/prescriptions/{prescriptionId}',
    pathParameters: [
      {
        location: 'path',
        name: 'prescriptionId',
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
        location: 'header',
        name: 'Accept-Language',
        required: false,
        schema: {
          type: 'string',
          enum: ['ar-EG', 'en-EG'],
        },
      },
      {
        location: 'header',
        name: 'X-Request-Id',
        required: false,
        schema: {
          type: 'string',
          format: 'uuid',
        },
      },
      {
        location: 'header',
        name: 'X-Purpose',
        required: true,
        schema: {
          type: 'string',
          minLength: 1,
        },
      },
      {
        location: 'header',
        name: 'Idempotency-Key',
        required: true,
        schema: {
          type: 'string',
          minLength: 16,
          maxLength: 128,
        },
      },
      {
        location: 'header',
        name: 'If-Match',
        required: true,
        schema: {
          oneOf: [
            {
              type: 'string',
              pattern: '^"[1-9][0-9]*"$',
            },
            {
              type: 'string',
              pattern:
                '^"ppc:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}:[1-9][0-9]*"$',
            },
          ],
        },
      },
    ],
    requestSchema: 'UpdatePrescription',
    responseSchema: 'UpdatePrescriptionResult',
    successStatus: 200,
    etag: 'UpdateETag',
    problems: {
      '400': 'Problem400',
      '401': 'Problem401',
      '403': 'Problem403',
      '404': 'Problem404',
      '409': 'Problem409',
      '422': 'Problem422',
      '429': 'Problem429',
      '503': 'Problem503',
    },
  },
  {
    operationId: 'getPrescription',
    method: 'GET',
    path: '/prescriptions/{prescriptionId}',
    pathParameters: [
      {
        location: 'path',
        name: 'prescriptionId',
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
        location: 'header',
        name: 'Accept-Language',
        required: false,
        schema: {
          type: 'string',
          enum: ['ar-EG', 'en-EG'],
        },
      },
      {
        location: 'header',
        name: 'X-Request-Id',
        required: false,
        schema: {
          type: 'string',
          format: 'uuid',
        },
      },
      {
        location: 'header',
        name: 'X-Purpose',
        required: true,
        schema: {
          type: 'string',
          minLength: 1,
        },
      },
    ],
    responseSchema: 'PrescriptionRead',
    successStatus: 200,
    etag: 'ETag',
    problems: {
      '400': 'Problem400',
      '401': 'Problem401',
      '403': 'Problem403',
      '404': 'Problem404',
      '409': 'Problem409',
      '422': 'Problem422',
      '429': 'Problem429',
      '503': 'Problem503',
    },
  },
  {
    operationId: 'runPrescriptionSafety',
    method: 'POST',
    path: '/prescriptions/{prescriptionId}/safety-checks',
    pathParameters: [
      {
        location: 'path',
        name: 'prescriptionId',
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
        location: 'header',
        name: 'Accept-Language',
        required: false,
        schema: {
          type: 'string',
          enum: ['ar-EG', 'en-EG'],
        },
      },
      {
        location: 'header',
        name: 'X-Request-Id',
        required: false,
        schema: {
          type: 'string',
          format: 'uuid',
        },
      },
      {
        location: 'header',
        name: 'X-Purpose',
        required: true,
        schema: {
          type: 'string',
          minLength: 1,
        },
      },
      {
        location: 'header',
        name: 'Idempotency-Key',
        required: true,
        schema: {
          type: 'string',
          minLength: 16,
          maxLength: 128,
        },
      },
      {
        location: 'header',
        name: 'If-Match',
        required: true,
        schema: {
          type: 'string',
          pattern: '^"[1-9][0-9]*"$',
        },
      },
    ],
    requestSchema: 'SafetyCheckRequest',
    responseSchema: 'SafetyResult',
    successStatus: 200,
    etag: 'ETag',
    problems: {
      '400': 'Problem400',
      '401': 'Problem401',
      '403': 'Problem403',
      '404': 'Problem404',
      '409': 'Problem409',
      '422': 'Problem422',
      '429': 'Problem429',
      '503': 'Problem503',
    },
  },
  {
    operationId: 'acknowledgeWarning',
    method: 'POST',
    path: '/detected-issues/{issueId}/acknowledgements',
    pathParameters: [
      {
        location: 'path',
        name: 'issueId',
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
        location: 'header',
        name: 'Accept-Language',
        required: false,
        schema: {
          type: 'string',
          enum: ['ar-EG', 'en-EG'],
        },
      },
      {
        location: 'header',
        name: 'X-Request-Id',
        required: false,
        schema: {
          type: 'string',
          format: 'uuid',
        },
      },
      {
        location: 'header',
        name: 'X-Purpose',
        required: true,
        schema: {
          type: 'string',
          minLength: 1,
        },
      },
      {
        location: 'header',
        name: 'Idempotency-Key',
        required: true,
        schema: {
          type: 'string',
          minLength: 16,
          maxLength: 128,
        },
      },
    ],
    requestSchema: 'AcknowledgeRequest',
    responseSchema: 'Acknowledgement',
    successStatus: 201,
    etag: null,
    problems: {
      '400': 'Problem400',
      '401': 'Problem401',
      '403': 'Problem403',
      '404': 'Problem404',
      '409': 'Problem409',
      '422': 'Problem422',
      '429': 'Problem429',
      '503': 'Problem503',
    },
  },
  {
    operationId: 'requestContraindicatedOverride',
    method: 'POST',
    path: '/detected-issues/{issueId}/override-requests',
    pathParameters: [
      {
        location: 'path',
        name: 'issueId',
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
        location: 'header',
        name: 'Accept-Language',
        required: false,
        schema: {
          type: 'string',
          enum: ['ar-EG', 'en-EG'],
        },
      },
      {
        location: 'header',
        name: 'X-Request-Id',
        required: false,
        schema: {
          type: 'string',
          format: 'uuid',
        },
      },
      {
        location: 'header',
        name: 'X-Purpose',
        required: true,
        schema: {
          type: 'string',
          minLength: 1,
        },
      },
      {
        location: 'header',
        name: 'Idempotency-Key',
        required: true,
        schema: {
          type: 'string',
          minLength: 16,
          maxLength: 128,
        },
      },
    ],
    requestSchema: 'OverrideRequest',
    responseSchema: 'OverrideResult',
    successStatus: 201,
    etag: null,
    problems: {
      '400': 'Problem400',
      '401': 'Problem401',
      '403': 'Problem403',
      '404': 'Problem404',
      '409': 'Problem409',
      '422': 'Problem422',
      '429': 'Problem429',
      '503': 'Problem503',
    },
  },
  {
    operationId: 'decideOverride',
    method: 'POST',
    path: '/override-requests/{overrideId}/decisions',
    pathParameters: [
      {
        location: 'path',
        name: 'overrideId',
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
        location: 'header',
        name: 'Accept-Language',
        required: false,
        schema: {
          type: 'string',
          enum: ['ar-EG', 'en-EG'],
        },
      },
      {
        location: 'header',
        name: 'X-Request-Id',
        required: false,
        schema: {
          type: 'string',
          format: 'uuid',
        },
      },
      {
        location: 'header',
        name: 'X-Purpose',
        required: true,
        schema: {
          type: 'string',
          minLength: 1,
        },
      },
      {
        location: 'header',
        name: 'Idempotency-Key',
        required: true,
        schema: {
          type: 'string',
          minLength: 16,
          maxLength: 128,
        },
      },
      {
        location: 'header',
        name: 'If-Match',
        required: true,
        schema: {
          type: 'string',
          pattern: '^"[1-9][0-9]*"$',
        },
      },
    ],
    requestSchema: 'DecisionRequest',
    responseSchema: 'DecisionResult',
    successStatus: 200,
    etag: 'ETag',
    problems: {
      '400': 'Problem400',
      '401': 'Problem401',
      '403': 'Problem403',
      '404': 'Problem404',
      '409': 'Problem409',
      '422': 'Problem422',
      '429': 'Problem429',
      '503': 'Problem503',
    },
  },
  {
    operationId: 'signPrescription',
    method: 'POST',
    path: '/prescriptions/{prescriptionId}/sign',
    pathParameters: [
      {
        location: 'path',
        name: 'prescriptionId',
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
        location: 'header',
        name: 'Accept-Language',
        required: false,
        schema: {
          type: 'string',
          enum: ['ar-EG', 'en-EG'],
        },
      },
      {
        location: 'header',
        name: 'X-Request-Id',
        required: false,
        schema: {
          type: 'string',
          format: 'uuid',
        },
      },
      {
        location: 'header',
        name: 'X-Purpose',
        required: true,
        schema: {
          type: 'string',
          minLength: 1,
        },
      },
      {
        location: 'header',
        name: 'Idempotency-Key',
        required: true,
        schema: {
          type: 'string',
          minLength: 16,
          maxLength: 128,
        },
      },
      {
        location: 'header',
        name: 'If-Match',
        required: true,
        schema: {
          type: 'string',
          pattern: '^"[1-9][0-9]*"$',
        },
      },
    ],
    requestSchema: 'SignRequest',
    responseSchema: 'SignResult',
    successStatus: 200,
    etag: 'ETag',
    problems: {
      '400': 'Problem400',
      '401': 'Problem401',
      '403': 'Problem403',
      '404': 'Problem404',
      '409': 'Problem409',
      '422': 'Problem422',
      '429': 'Problem429',
      '503': 'Problem503',
    },
  },
  {
    operationId: 'cancelPrescription',
    method: 'POST',
    path: '/prescriptions/{prescriptionId}/cancel',
    pathParameters: [
      {
        location: 'path',
        name: 'prescriptionId',
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
        location: 'header',
        name: 'Accept-Language',
        required: false,
        schema: {
          type: 'string',
          enum: ['ar-EG', 'en-EG'],
        },
      },
      {
        location: 'header',
        name: 'X-Request-Id',
        required: false,
        schema: {
          type: 'string',
          format: 'uuid',
        },
      },
      {
        location: 'header',
        name: 'X-Purpose',
        required: true,
        schema: {
          type: 'string',
          minLength: 1,
        },
      },
      {
        location: 'header',
        name: 'Idempotency-Key',
        required: true,
        schema: {
          type: 'string',
          minLength: 16,
          maxLength: 128,
        },
      },
      {
        location: 'header',
        name: 'If-Match',
        required: true,
        schema: {
          type: 'string',
          pattern: '^"[1-9][0-9]*"$',
        },
      },
    ],
    requestSchema: 'CancelRequest',
    responseSchema: 'CancelResult',
    successStatus: 200,
    etag: 'ETag',
    problems: {
      '400': 'Problem400',
      '401': 'Problem401',
      '403': 'Problem403',
      '404': 'Problem404',
      '409': 'Problem409',
      '422': 'Problem422',
      '429': 'Problem429',
      '503': 'Problem503',
    },
  },
  {
    operationId: 'listPatientMedications',
    method: 'GET',
    path: '/patients/{managedPatientId}/medications',
    pathParameters: [
      {
        location: 'path',
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
        location: 'query',
        name: 'status',
        required: false,
        schema: {
          type: 'string',
          enum: [
            'prescribed',
            'dispensed',
            'active',
            'completed',
            'discontinued',
            'expired',
            'entered_in_error',
          ],
        },
      },
      {
        location: 'query',
        name: 'cursor',
        required: false,
        schema: {
          type: 'string',
          minLength: 1,
          maxLength: 4096,
        },
      },
      {
        location: 'query',
        name: 'limit',
        required: false,
        schema: {
          type: 'integer',
          minimum: 1,
          maximum: 100,
          default: 25,
        },
      },
    ],
    headerParameters: [
      {
        location: 'header',
        name: 'Accept-Language',
        required: false,
        schema: {
          type: 'string',
          enum: ['ar-EG', 'en-EG'],
        },
      },
      {
        location: 'header',
        name: 'X-Request-Id',
        required: false,
        schema: {
          type: 'string',
          format: 'uuid',
        },
      },
      {
        location: 'header',
        name: 'X-Purpose',
        required: true,
        schema: {
          type: 'string',
          minLength: 1,
        },
      },
    ],
    responseSchema: 'MedicationList',
    successStatus: 200,
    etag: null,
    problems: {
      '400': 'Problem400',
      '401': 'Problem401',
      '403': 'Problem403',
      '404': 'Problem404',
      '409': 'Problem409',
      '422': 'Problem422',
      '429': 'Problem429',
      '503': 'Problem503',
    },
  },
  {
    operationId: 'getOverrideReviewCases',
    method: 'GET',
    path: '/override-review-cases',
    pathParameters: [],
    queryParameters: [
      {
        location: 'query',
        name: 'view',
        required: true,
        schema: {
          type: 'string',
          enum: ['discover', 'detail'],
        },
      },
      {
        location: 'query',
        name: 'lane',
        required: true,
        schema: {
          type: 'string',
          enum: ['pharmacist', 'second_physician'],
        },
      },
      {
        location: 'query',
        name: 'scope',
        required: false,
        schema: {
          type: 'string',
          enum: ['eligible', 'own'],
        },
      },
      {
        location: 'query',
        name: 'cursor',
        required: false,
        schema: {
          type: 'string',
          minLength: 1,
          maxLength: 4096,
        },
      },
      {
        location: 'query',
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
        location: 'query',
        name: 'overrideId',
        required: false,
        schema: {
          type: 'string',
          format: 'uuid',
        },
      },
      {
        location: 'query',
        name: 'requestVersion',
        required: false,
        schema: {
          type: 'integer',
          minimum: 1,
          maximum: 2147483647,
        },
      },
      {
        location: 'query',
        name: 'assignmentVersion',
        required: false,
        schema: {
          type: 'integer',
          minimum: 1,
          maximum: 2147483647,
        },
      },
      {
        location: 'query',
        name: 'evidenceRevision',
        required: false,
        schema: {
          type: 'string',
          pattern: '^[a-f0-9]{64}$',
        },
      },
    ],
    headerParameters: [
      {
        location: 'header',
        name: 'Accept-Language',
        required: false,
        schema: {
          type: 'string',
          enum: ['ar-EG', 'en-EG'],
        },
      },
      {
        location: 'header',
        name: 'X-Request-Id',
        required: false,
        schema: {
          type: 'string',
          format: 'uuid',
        },
      },
      {
        location: 'header',
        name: 'X-Purpose',
        required: true,
        schema: {
          type: 'string',
          minLength: 1,
        },
      },
    ],
    querySchema: 'ReviewQuery',
    responseSchema: 'ReviewResult',
    successStatus: 200,
    etag: null,
    problems: {
      '400': 'Problem400',
      '401': 'Problem401',
      '403': 'Problem403',
      '404': 'Problem404',
      '409': 'Problem409',
      '422': 'Problem422',
      '429': 'Problem429',
      '503': 'Problem503',
    },
  },
  {
    operationId: 'transitionOverrideReviewAssignment',
    method: 'POST',
    path: '/override-requests/{overrideId}/assignment-transitions',
    pathParameters: [
      {
        location: 'path',
        name: 'overrideId',
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
        location: 'header',
        name: 'Accept-Language',
        required: false,
        schema: {
          type: 'string',
          enum: ['ar-EG', 'en-EG'],
        },
      },
      {
        location: 'header',
        name: 'X-Request-Id',
        required: false,
        schema: {
          type: 'string',
          format: 'uuid',
        },
      },
      {
        location: 'header',
        name: 'X-Purpose',
        required: true,
        schema: {
          type: 'string',
          minLength: 1,
        },
      },
      {
        location: 'header',
        name: 'Idempotency-Key',
        required: true,
        schema: {
          type: 'string',
          minLength: 16,
          maxLength: 128,
        },
      },
      {
        location: 'header',
        name: 'If-Match',
        required: true,
        schema: {
          type: 'string',
          pattern: '^"[1-9][0-9]*"$',
        },
      },
    ],
    requestSchema: 'AssignmentRequest',
    responseSchema: 'AssignmentResult',
    successStatus: 200,
    etag: 'ETag',
    problems: {
      '400': 'Problem400',
      '401': 'Problem401',
      '403': 'Problem403',
      '404': 'Problem404',
      '409': 'Problem409',
      '422': 'Problem422',
      '429': 'Problem429',
      '503': 'Problem503',
    },
  },
] as const;
export type Feature012OperationId = (typeof feature012Operations)[number]['operationId'];

export const Feature012FixtureItemSchema = Type.Object(
  {
    itemId: Type.String({ format: 'uuid', pattern: '^00000000-0000-4000-8000-[0-9]{12}$' }),
    prescriptionId: Type.String({ format: 'uuid', pattern: '^00000000-0000-4000-8000-[0-9]{12}$' }),
    productCoding: Type.Object(
      {
        system: Type.Literal('urn:shifaa:engineering:f012'),
        code: Type.String({ pattern: '^SYNTHETIC_[A-Z0-9_]+$' }),
        version: Type.Literal('1.0.0-proposed'),
      },
      { additionalProperties: false },
    ),
    ingredientCoding: Type.Object(
      {
        system: Type.Literal('urn:shifaa:engineering:f012'),
        code: Type.String({ pattern: '^SYNTHETIC_[A-Z0-9_]+$' }),
        version: Type.Literal('1.0.0-proposed'),
      },
      { additionalProperties: false },
    ),
    strength: Type.Intersect([
      Type.Object(
        {
          value: Type.String({ pattern: '^(0|[1-9][0-9]*)(\\.[0-9]+)?$' }),
          unitCode: Type.Union([
            Type.Literal('SYNTHETIC_STRENGTH_UNIT'),
            Type.Literal('SYNTHETIC_DOSE_UNIT'),
            Type.Literal('SYNTHETIC_FREQUENCY_UNIT'),
            Type.Literal('SYNTHETIC_DURATION_UNIT'),
            Type.Literal('SYNTHETIC_QUANTITY_UNIT'),
          ]),
        },
        { additionalProperties: false },
      ),
      Type.Object({ unitCode: Type.Optional(Type.Literal('SYNTHETIC_STRENGTH_UNIT')) }, {}),
    ]),
    formCoding: Type.Object(
      {
        system: Type.Literal('urn:shifaa:engineering:f012'),
        code: Type.String({ pattern: '^SYNTHETIC_[A-Z0-9_]+$' }),
        version: Type.Literal('1.0.0-proposed'),
      },
      { additionalProperties: false },
    ),
    routeCoding: Type.Object(
      {
        system: Type.Literal('urn:shifaa:engineering:f012'),
        code: Type.String({ pattern: '^SYNTHETIC_[A-Z0-9_]+$' }),
        version: Type.Literal('1.0.0-proposed'),
      },
      { additionalProperties: false },
    ),
    dose: Type.Intersect([
      Type.Object(
        {
          value: Type.String({ pattern: '^(0|[1-9][0-9]*)(\\.[0-9]+)?$' }),
          unitCode: Type.Union([
            Type.Literal('SYNTHETIC_STRENGTH_UNIT'),
            Type.Literal('SYNTHETIC_DOSE_UNIT'),
            Type.Literal('SYNTHETIC_FREQUENCY_UNIT'),
            Type.Literal('SYNTHETIC_DURATION_UNIT'),
            Type.Literal('SYNTHETIC_QUANTITY_UNIT'),
          ]),
        },
        { additionalProperties: false },
      ),
      Type.Object({ unitCode: Type.Optional(Type.Literal('SYNTHETIC_DOSE_UNIT')) }, {}),
    ]),
    frequency: Type.Intersect([
      Type.Object(
        {
          value: Type.String({ pattern: '^(0|[1-9][0-9]*)(\\.[0-9]+)?$' }),
          unitCode: Type.Union([
            Type.Literal('SYNTHETIC_STRENGTH_UNIT'),
            Type.Literal('SYNTHETIC_DOSE_UNIT'),
            Type.Literal('SYNTHETIC_FREQUENCY_UNIT'),
            Type.Literal('SYNTHETIC_DURATION_UNIT'),
            Type.Literal('SYNTHETIC_QUANTITY_UNIT'),
          ]),
        },
        { additionalProperties: false },
      ),
      Type.Object({ unitCode: Type.Optional(Type.Literal('SYNTHETIC_FREQUENCY_UNIT')) }, {}),
    ]),
    duration: Type.Intersect([
      Type.Object(
        {
          value: Type.String({ pattern: '^(0|[1-9][0-9]*)(\\.[0-9]+)?$' }),
          unitCode: Type.Union([
            Type.Literal('SYNTHETIC_STRENGTH_UNIT'),
            Type.Literal('SYNTHETIC_DOSE_UNIT'),
            Type.Literal('SYNTHETIC_FREQUENCY_UNIT'),
            Type.Literal('SYNTHETIC_DURATION_UNIT'),
            Type.Literal('SYNTHETIC_QUANTITY_UNIT'),
          ]),
        },
        { additionalProperties: false },
      ),
      Type.Object({ unitCode: Type.Optional(Type.Literal('SYNTHETIC_DURATION_UNIT')) }, {}),
    ]),
    quantity: Type.Intersect([
      Type.Object(
        {
          value: Type.String({ pattern: '^(0|[1-9][0-9]*)(\\.[0-9]+)?$' }),
          unitCode: Type.Union([
            Type.Literal('SYNTHETIC_STRENGTH_UNIT'),
            Type.Literal('SYNTHETIC_DOSE_UNIT'),
            Type.Literal('SYNTHETIC_FREQUENCY_UNIT'),
            Type.Literal('SYNTHETIC_DURATION_UNIT'),
            Type.Literal('SYNTHETIC_QUANTITY_UNIT'),
          ]),
        },
        { additionalProperties: false },
      ),
      Type.Object({ unitCode: Type.Optional(Type.Literal('SYNTHETIC_QUANTITY_UNIT')) }, {}),
    ]),
    indicationCoding: Type.Object(
      {
        system: Type.Literal('urn:shifaa:engineering:f012'),
        code: Type.String({ pattern: '^SYNTHETIC_[A-Z0-9_]+$' }),
        version: Type.Literal('1.0.0-proposed'),
      },
      { additionalProperties: false },
    ),
    classificationEvidence: Type.Object(
      {
        contentVersion: Type.String({ pattern: '^SYNTHETIC_CONTENT_MECHANISM_ONLY_[0-9]+$' }),
        controlled: Type.Boolean({}),
        nti: Type.Boolean({}),
      },
      { additionalProperties: false },
    ),
    itemStatus: Type.Literal('SYNTHETIC_ITEM_STATUS'),
  },
  { additionalProperties: false },
);

export const Feature012VersionSchema = Type.Integer({ minimum: 1, maximum: 2147483647 });

export const Feature012DigestSchema = Type.String({ pattern: '^[a-f0-9]{64}$' });

export const Feature012OpaqueReferenceSchema = Type.String({ format: 'uuid' });

export const Feature012CodingSchema = Type.Object(
  {
    system: Type.String({ minLength: 1, maxLength: 200 }),
    code: Type.String({ minLength: 1, maxLength: 200 }),
    display: Type.Optional(Type.String({ minLength: 1, maxLength: 250 })),
    version: Type.String({ minLength: 1, maxLength: 100 }),
  },
  { additionalProperties: false },
);

export const Feature012QuantitySchema = Type.Object(
  {
    value: Type.String({ pattern: '^(?:0|[1-9][0-9]*)(?:\\.[0-9]+)?$' }),
    unitCode: Type.String({ minLength: 1, maxLength: 100 }),
  },
  { additionalProperties: false },
);

export const Feature012SourceSchema = Type.Object(
  {
    sourceId: Type.String({ minLength: 1, maxLength: 200 }),
    sourceRevision: Type.Optional(Type.String({ minLength: 1, maxLength: 200 })),
    sourceState: Type.Union([
      Type.Literal('present'),
      Type.Literal('verified_empty'),
      Type.Literal('missing'),
      Type.Literal('unavailable'),
      Type.Literal('stale'),
      Type.Literal('partial'),
    ]),
    freshness: Type.Union([
      Type.Literal('current'),
      Type.Literal('stale'),
      Type.Literal('unknown'),
    ]),
    completeness: Type.Union([
      Type.Literal('complete_within_declared_scope'),
      Type.Literal('partial'),
      Type.Literal('unknown'),
    ]),
    knownScope: Type.String({ minLength: 1, maxLength: 300 }),
    sourceUpdatedAt: Type.Optional(Type.String({ format: 'date-time' })),
    capturedAt: Type.String({ format: 'date-time' }),
    missingScope: Type.Optional(Type.Array(Type.String({ minLength: 1, maxLength: 200 }), {})),
    overallAssessment: Type.Literal('not_fully_checked'),
  },
  { additionalProperties: false },
);

export const Feature012ReceiptSchema = Type.Object(
  {
    receiptId: Type.String({ format: 'uuid' }),
    requestId: Type.String({ format: 'uuid' }),
    committedAt: Type.String({ format: 'date-time' }),
    resourceVersion: Type.Integer({ minimum: 1, maximum: 2147483647 }),
    simulationOnly: Type.Literal(true),
  },
  { additionalProperties: false },
);

export const Feature012ItemPSchema = Type.Object(
  {
    itemRef: Type.String({ format: 'uuid' }),
    productCoding: Feature012CodingSchema,
    ingredientCoding: Type.Optional(Feature012CodingSchema),
    strength: Type.Optional(Feature012QuantitySchema),
    formCoding: Type.Optional(Feature012CodingSchema),
    routeCoding: Type.Optional(Feature012CodingSchema),
    dose: Type.Optional(Feature012QuantitySchema),
    frequency: Type.Optional(Feature012QuantitySchema),
    duration: Type.Optional(Feature012QuantitySchema),
    quantity: Type.Optional(Feature012QuantitySchema),
  },
  { additionalProperties: false },
);

export const Feature012PatientSourceSchema = Type.Object(
  {
    sourceId: Type.Union([
      Type.Literal('prescription'),
      Type.Literal('prescribed_statement'),
      Type.Literal('dispensing_history'),
      Type.Literal('other_medication_history'),
    ]),
    sourceRevision: Type.Optional(Type.String({ pattern: '^[A-Za-z0-9._:-]{1,200}$' })),
    sourceState: Type.Union([
      Type.Literal('present'),
      Type.Literal('verified_empty'),
      Type.Literal('missing'),
      Type.Literal('unavailable'),
      Type.Literal('stale'),
      Type.Literal('partial'),
    ]),
    freshness: Type.Union([
      Type.Literal('current'),
      Type.Literal('stale'),
      Type.Literal('unknown'),
    ]),
    completeness: Type.Union([
      Type.Literal('complete_within_declared_scope'),
      Type.Literal('partial'),
      Type.Literal('unknown'),
    ]),
    knownScope: Type.Union([
      Type.Literal('released_prescription'),
      Type.Literal('released_prescribed_statements'),
      Type.Literal('dispensing_records'),
      Type.Literal('other_medication_history'),
    ]),
    sourceUpdatedAt: Type.Optional(Type.String({ format: 'date-time' })),
    capturedAt: Type.String({ format: 'date-time' }),
    missingScope: Type.Optional(
      Type.Array(
        Type.Union([Type.Literal('dispensing_records'), Type.Literal('other_medication_history')]),
        { uniqueItems: true },
      ),
    ),
    overallAssessment: Type.Literal('not_fully_checked'),
  },
  { additionalProperties: false },
);

export const Feature012PrescriptionPSchema = Type.Intersect([
  Type.Object(
    {
      prescriptionRef: Type.String({ format: 'uuid' }),
      status: Type.Union([
        Type.Literal('signed'),
        Type.Literal('cancelled'),
        Type.Literal('superseded'),
        Type.Literal('expired'),
      ]),
      version: Type.Integer({ minimum: 1, maximum: 2147483647 }),
      items: Type.Array(Feature012ItemPSchema, { minItems: 1 }),
      source: Feature012PatientSourceSchema,
      signedAt: Type.Optional(Type.String({ format: 'date-time' })),
      expiresAt: Type.Optional(Type.String({ format: 'date-time' })),
      sourceUpdatedAt: Type.Optional(Type.String({ format: 'date-time' })),
    },
    { additionalProperties: false },
  ),
  Type.Not(Type.Object({ substitutionAllowed: Type.Unknown() }, {})),
]);

export const Feature012CareIssueSchema = Type.Object(
  {
    issueRef: Type.String({ format: 'uuid' }),
    category: Type.Union([
      Type.Literal('informational'),
      Type.Literal('warning'),
      Type.Literal('contraindicated'),
    ]),
    status: Type.Union([
      Type.Literal('open'),
      Type.Literal('acknowledged'),
      Type.Literal('invalidated'),
      Type.Literal('resolved_as_history'),
    ]),
    sourceVersion: Type.String({ minLength: 1, maxLength: 200 }),
    evidenceRevision: Type.String({ pattern: '^[a-f0-9]{64}$' }),
    checkCompleteness: Type.Union([
      Type.Literal('mechanism_complete'),
      Type.Literal('not_fully_checked'),
    ]),
  },
  { additionalProperties: false },
);

export const Feature012OwnCareBindingSchema = Type.Object(
  {
    issueRef: Type.String({ format: 'uuid' }),
    acknowledgementRef: Type.Optional(Type.String({ format: 'uuid' })),
    overrideRef: Type.Optional(Type.String({ format: 'uuid' })),
    structuredReason: Type.Optional(Type.String({ minLength: 1, maxLength: 200 })),
    justification: Type.Optional(Type.String({ minLength: 1, maxLength: 4000 })),
    rationale: Type.Optional(Type.String({ minLength: 1, maxLength: 4000 })),
    alternativesConsidered: Type.Optional(
      Type.Array(Type.String({ minLength: 1, maxLength: 4000 }), { minItems: 1 }),
    ),
    monitoringPlan: Type.Optional(Type.String({ minLength: 1, maxLength: 4000 })),
    expiresAt: Type.Optional(Type.String({ format: 'date-time' })),
    receiptRef: Type.Optional(Type.String({ format: 'uuid' })),
  },
  { additionalProperties: false },
);

export const Feature012ProjectionTargetControlSchema = Type.Intersect([
  Type.Object(
    {
      state: Type.Union([
        Type.Literal('unreleased'),
        Type.Literal('released'),
        Type.Literal('withdrawn'),
      ]),
      releaseRef: Type.Optional(Type.String({ format: 'uuid' })),
    },
    { additionalProperties: false },
  ),
  Type.Union([
    Type.Intersect([
      Type.Object({ state: Type.Union([Type.Literal('released'), Type.Literal('withdrawn')]) }, {}),
      Type.Object({ releaseRef: Type.Unknown() }, {}),
    ]),
    Type.Intersect([
      Type.Not(
        Type.Object(
          { state: Type.Union([Type.Literal('released'), Type.Literal('withdrawn')]) },
          {},
        ),
      ),
      Type.Not(Type.Object({ releaseRef: Type.Unknown() }, {})),
    ]),
  ]),
]);

export const Feature012ProjectionControlReadSchema = Type.Object(
  {
    signedRevisionRef: Type.String({ format: 'uuid' }),
    version: Type.Integer({ minimum: 1, maximum: 2147483647 }),
    etag: Type.String({
      pattern:
        '^"ppc:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}:[1-9][0-9]*"$',
    }),
    prescription: Feature012ProjectionTargetControlSchema,
    medications: Type.Array(
      Type.Object(
        {
          statementRef: Type.String({ format: 'uuid' }),
          control: Feature012ProjectionTargetControlSchema,
        },
        { additionalProperties: false },
      ),
      { maxItems: 100 },
    ),
  },
  { additionalProperties: false },
);

export const Feature012PrescriptionCSchema = Type.Object(
  {
    prescriptionRef: Type.String({ format: 'uuid' }),
    status: Type.Union([
      Type.Literal('draft'),
      Type.Literal('safety_review'),
      Type.Literal('signature_pending'),
      Type.Literal('signed'),
      Type.Literal('cancelled'),
      Type.Literal('expired'),
      Type.Literal('superseded'),
    ]),
    version: Type.Integer({ minimum: 1, maximum: 2147483647 }),
    items: Type.Array(Feature012ItemPSchema, { minItems: 1 }),
    source: Feature012SourceSchema,
    signedAt: Type.Optional(Type.String({ format: 'date-time' })),
    expiresAt: Type.Optional(Type.String({ format: 'date-time' })),
    sourceUpdatedAt: Type.Optional(Type.String({ format: 'date-time' })),
    issues: Type.Array(Feature012CareIssueSchema, {}),
    itemIndications: Type.Optional(
      Type.Array(
        Type.Object(
          { itemRef: Type.String({ format: 'uuid' }), indication: Feature012CodingSchema },
          { additionalProperties: false },
        ),
        {},
      ),
    ),
    itemStates: Type.Optional(
      Type.Array(
        Type.Object(
          {
            itemRef: Type.String({ format: 'uuid' }),
            itemStatus: Type.String({ minLength: 1, maxLength: 80 }),
          },
          { additionalProperties: false },
        ),
        {},
      ),
    ),
    syntheticClassifications: Type.Optional(
      Type.Array(
        Type.Object(
          {
            itemRef: Type.String({ format: 'uuid' }),
            controlled: Type.Boolean({}),
            nti: Type.Boolean({}),
            fixtureVersion: Type.String({ minLength: 1, maxLength: 80 }),
          },
          { additionalProperties: false },
        ),
        {},
      ),
    ),
    ownBindings: Type.Optional(Type.Array(Feature012OwnCareBindingSchema, {})),
    predecessorRef: Type.Optional(Type.String({ format: 'uuid' })),
    successorRef: Type.Optional(Type.String({ format: 'uuid' })),
    projectionControl: Type.Optional(Feature012ProjectionControlReadSchema),
  },
  { additionalProperties: false },
);

export const Feature012PrescriptionReadSchema = Type.Intersect([
  Type.Union([Feature012PrescriptionPSchema, Feature012PrescriptionCSchema]),
  Type.Not(
    Type.Union([Type.Intersect([Feature012PrescriptionPSchema, Feature012PrescriptionCSchema])]),
  ),
]);

export const Feature012MedicationSchema = Type.Object(
  {
    statementRef: Type.String({ format: 'uuid' }),
    productCoding: Feature012CodingSchema,
    status: Type.Union([Type.Literal('prescribed')]),
    startsAt: Type.Optional(Type.String({ format: 'date-time' })),
    endsAt: Type.Optional(Type.String({ format: 'date-time' })),
    source: Feature012PatientSourceSchema,
    prescriptionItemRef: Type.Optional(Type.String({ format: 'uuid' })),
  },
  { additionalProperties: false },
);

export const Feature012MedicationListSchema = Type.Object(
  {
    data: Type.Array(Feature012MedicationSchema, {}),
    meta: Type.Object(
      {
        nextCursor: Type.Optional(Type.String({ minLength: 1, maxLength: 4096 })),
        sourceStates: Type.Array(Feature012PatientSourceSchema, {}),
        requestId: Type.String({ format: 'uuid' }),
      },
      { additionalProperties: false },
    ),
  },
  { additionalProperties: false },
);

export const Feature012FixtureInputSchema = Type.Object(
  {
    caseId: Type.Union([
      Type.Literal('SYNTHETIC_CASE_0001'),
      Type.Literal('SYNTHETIC_CASE_0002'),
      Type.Literal('SYNTHETIC_CASE_0003'),
    ]),
    inputSha256: Type.String({ pattern: '^[a-f0-9]{64}$' }),
    item: Feature012FixtureItemSchema,
  },
  { additionalProperties: false },
);

export const Feature012ReplacementIntentSchema = Type.Object(
  {
    predecessorPrescriptionRef: Type.String({ format: 'uuid' }),
    expectedPredecessorVersion: Type.Integer({ minimum: 1, maximum: 2147483647 }),
  },
  { additionalProperties: false },
);

export const Feature012CreatePrescriptionSchema = Type.Object(
  {
    items: Type.Array(Feature012FixtureInputSchema, { minItems: 1, maxItems: 100 }),
    substitutionAllowed: Type.Boolean({}),
    expiresAt: Type.String({ format: 'date-time' }),
    mechanismScenarioRef: Type.Optional(Type.String({ format: 'uuid' })),
    replacementIntent: Type.Optional(Feature012ReplacementIntentSchema),
  },
  { additionalProperties: false },
);

export const Feature012UpdatePrescriptionDraftSchema = Type.Object(
  {
    items: Type.Array(Feature012FixtureInputSchema, { minItems: 1, maxItems: 100 }),
    substitutionAllowed: Type.Boolean({}),
    expiresAt: Type.String({ format: 'date-time' }),
    mechanismScenarioRef: Type.Optional(Type.String({ format: 'uuid' })),
  },
  { additionalProperties: false },
);

export const Feature012ProjectionReleaseTargetsSchema = Type.Intersect([
  Type.Object(
    {
      prescription: Type.Optional(Type.Literal(true)),
      medicationStatementRefs: Type.Optional(
        Type.Array(Type.String({ format: 'uuid' }), {
          minItems: 1,
          maxItems: 100,
          uniqueItems: true,
        }),
      ),
    },
    { additionalProperties: false },
  ),
  Type.Union([
    Type.Object({ prescription: Type.Unknown() }, {}),
    Type.Object({ medicationStatementRefs: Type.Unknown() }, {}),
  ]),
]);

export const Feature012PostSignProjectionReleaseSchema = Type.Object(
  {
    action: Type.Literal('release_patient_projection'),
    policyVersion: Type.Literal('F012-VP-2/0.2.0'),
    audience: Type.Literal('subject'),
    expectedSignedRevisionRef: Type.String({ format: 'uuid' }),
    expectedPrescriptionVersion: Type.Integer({ minimum: 1, maximum: 2147483647 }),
    expectedProjectionControlVersion: Type.Integer({ minimum: 1, maximum: 2147483647 }),
    confirmation: Type.Literal(true),
    targets: Feature012ProjectionReleaseTargetsSchema,
  },
  { additionalProperties: false },
);

export const Feature012PostSignProjectionWithdrawalSchema = Type.Object(
  {
    action: Type.Literal('withdraw_patient_projection'),
    policyVersion: Type.Literal('F012-VP-2/0.2.0'),
    audience: Type.Literal('subject'),
    expectedSignedRevisionRef: Type.String({ format: 'uuid' }),
    expectedPrescriptionVersion: Type.Integer({ minimum: 1, maximum: 2147483647 }),
    expectedProjectionControlVersion: Type.Integer({ minimum: 1, maximum: 2147483647 }),
    confirmation: Type.Literal(true),
    releaseRefs: Type.Array(Type.String({ format: 'uuid' }), {
      minItems: 1,
      maxItems: 101,
      uniqueItems: true,
    }),
    reasonCategory: Type.Union([
      Type.Literal('patient_request'),
      Type.Literal('correction'),
      Type.Literal('privacy_restriction'),
      Type.Literal('synthetic_policy'),
    ]),
  },
  { additionalProperties: false },
);

export const Feature012UpdatePrescriptionSchema = Type.Intersect([
  Type.Union([
    Feature012UpdatePrescriptionDraftSchema,
    Feature012PostSignProjectionReleaseSchema,
    Feature012PostSignProjectionWithdrawalSchema,
  ]),
  Type.Not(
    Type.Union([
      Type.Intersect([
        Feature012UpdatePrescriptionDraftSchema,
        Feature012PostSignProjectionReleaseSchema,
      ]),
      Type.Intersect([
        Feature012UpdatePrescriptionDraftSchema,
        Feature012PostSignProjectionWithdrawalSchema,
      ]),
      Type.Intersect([
        Feature012PostSignProjectionReleaseSchema,
        Feature012PostSignProjectionWithdrawalSchema,
      ]),
    ]),
  ),
]);

export const Feature012SafetyCheckRequestSchema = Type.Object(
  {
    contentVersion: Type.Optional(Type.String({ minLength: 1, maxLength: 200 })),
    mechanismScenarioRef: Type.Optional(Type.String({ format: 'uuid' })),
  },
  { additionalProperties: false },
);

export const Feature012SafetyResultSchema = Type.Object(
  {
    checkRef: Type.String({ format: 'uuid' }),
    prescriptionVersion: Type.Integer({ minimum: 1, maximum: 2147483647 }),
    evidenceRevision: Type.String({ pattern: '^[a-f0-9]{64}$' }),
    checkDigest: Type.String({ pattern: '^[a-f0-9]{64}$' }),
    mechanismOutcome: Type.Union([
      Type.Literal('mechanism_complete'),
      Type.Literal('not_fully_checked'),
    ]),
    overallAssessment: Type.Literal('not_fully_checked'),
    sources: Type.Array(Feature012SourceSchema, {}),
    issues: Type.Array(Feature012CareIssueSchema, {}),
    receipt: Feature012ReceiptSchema,
  },
  { additionalProperties: false },
);

export const Feature012PrescriptionMutationSchema = Type.Object(
  {
    prescription: Feature012PrescriptionCSchema,
    safetyResult: Feature012SafetyResultSchema,
    receipt: Feature012ReceiptSchema,
  },
  { additionalProperties: false },
);

export const Feature012AcknowledgeWMSchema = Type.Object(
  {
    context: Type.Literal('W-M'),
    evidenceRevision: Type.String({ pattern: '^[a-f0-9]{64}$' }),
    structuredReason: Type.String({ minLength: 1, maxLength: 200 }),
    justification: Type.String({ minLength: 1, maxLength: 4000 }),
    monitoringPlan: Type.String({ minLength: 1, maxLength: 4000 }),
  },
  { additionalProperties: false },
);

export const Feature012AcknowledgeWNASchema = Type.Object(
  {
    context: Type.Literal('W-NA'),
    evidenceRevision: Type.String({ pattern: '^[a-f0-9]{64}$' }),
    structuredReason: Type.String({ minLength: 1, maxLength: 200 }),
    justification: Type.String({ minLength: 1, maxLength: 4000 }),
    monitoringPlan: Type.Optional(Type.String({ minLength: 1, maxLength: 4000 })),
  },
  { additionalProperties: false },
);

export const Feature012AcknowledgeRequestSchema = Type.Intersect([
  Type.Union([Feature012AcknowledgeWMSchema, Feature012AcknowledgeWNASchema]),
  Type.Not(
    Type.Union([Type.Intersect([Feature012AcknowledgeWMSchema, Feature012AcknowledgeWNASchema])]),
  ),
]);

export const Feature012AcknowledgementSchema = Type.Object(
  {
    acknowledgementRef: Type.String({ format: 'uuid' }),
    issueRef: Type.String({ format: 'uuid' }),
    evidenceRevision: Type.String({ pattern: '^[a-f0-9]{64}$' }),
    acknowledgedAt: Type.String({ format: 'date-time' }),
    receipt: Feature012ReceiptSchema,
  },
  { additionalProperties: false },
);

export const Feature012NormalOverrideRequestSchema = Type.Object(
  {
    evidenceRevision: Type.String({ pattern: '^[a-f0-9]{64}$' }),
    rationale: Type.String({ minLength: 1, maxLength: 4000 }),
    alternativesConsidered: Type.Array(Type.String({ minLength: 1, maxLength: 4000 }), {
      minItems: 1,
      maxItems: 20,
    }),
    monitoringPlan: Type.String({ minLength: 1, maxLength: 4000 }),
    expiresAt: Type.String({ format: 'date-time' }),
    predecessorRequestRef: Type.Optional(Type.String({ format: 'uuid' })),
    context: Type.Literal('N'),
    emergency: Type.Literal(false),
  },
  { additionalProperties: false },
);

export const Feature012EmergencyOverrideRequestSchema = Type.Object(
  {
    evidenceRevision: Type.String({ pattern: '^[a-f0-9]{64}$' }),
    rationale: Type.String({ minLength: 1, maxLength: 4000 }),
    alternativesConsidered: Type.Array(Type.String({ minLength: 1, maxLength: 4000 }), {
      minItems: 1,
      maxItems: 20,
    }),
    monitoringPlan: Type.String({ minLength: 1, maxLength: 4000 }),
    expiresAt: Type.String({ format: 'date-time' }),
    predecessorRequestRef: Type.Optional(Type.String({ format: 'uuid' })),
    context: Type.Literal('E'),
    emergency: Type.Literal(true),
    syntheticPathwayConfirmation: Type.Literal(true),
  },
  { additionalProperties: false },
);

export const Feature012OverrideRequestSchema = Type.Intersect([
  Type.Union([Feature012NormalOverrideRequestSchema, Feature012EmergencyOverrideRequestSchema]),
  Type.Not(
    Type.Union([
      Type.Intersect([
        Feature012NormalOverrideRequestSchema,
        Feature012EmergencyOverrideRequestSchema,
      ]),
    ]),
  ),
]);

export const Feature012LaneStateSchema = Type.Object(
  {
    lane: Type.Union([Type.Literal('pharmacist'), Type.Literal('second_physician')]),
    assignmentVersion: Type.Integer({ minimum: 1, maximum: 2147483647 }),
    decisionState: Type.Union([
      Type.Literal('pending'),
      Type.Literal('approved'),
      Type.Literal('rejected'),
    ]),
    assignmentRef: Type.Optional(Type.String({ format: 'uuid' })),
    assignmentExpiresAt: Type.Optional(Type.String({ format: 'date-time' })),
  },
  { additionalProperties: false },
);

export const Feature012OverrideResultSchema = Type.Object(
  {
    overrideRef: Type.String({ format: 'uuid' }),
    requestVersion: Type.Integer({ minimum: 1, maximum: 2147483647 }),
    evidenceRevision: Type.String({ pattern: '^[a-f0-9]{64}$' }),
    pathway: Type.Union([Type.Literal('normal'), Type.Literal('emergency')]),
    state: Type.Union([
      Type.Literal('live'),
      Type.Literal('rejected'),
      Type.Literal('expired'),
      Type.Literal('cancelled'),
      Type.Literal('invalidated'),
    ]),
    expiresAt: Type.String({ format: 'date-time' }),
    lanes: Type.Array(Feature012LaneStateSchema, { minItems: 1, maxItems: 2 }),
    pharmacistObligationRef: Type.Optional(Type.String({ format: 'uuid' })),
    receipt: Feature012ReceiptSchema,
  },
  { additionalProperties: false },
);

export const Feature012DecisionRequestSchema = Type.Object(
  {
    lane: Type.Union([Type.Literal('pharmacist'), Type.Literal('second_physician')]),
    decision: Type.Union([Type.Literal('approve'), Type.Literal('reject')]),
    comment: Type.String({ minLength: 1, maxLength: 4000 }),
    signatureDigest: Type.String({ pattern: '^[a-f0-9]{64}$' }),
    requestVersion: Type.Integer({ minimum: 1, maximum: 2147483647 }),
    assignmentVersion: Type.Integer({ minimum: 1, maximum: 2147483647 }),
    rosterRevision: Type.Integer({ minimum: 1, maximum: 2147483647 }),
    evidenceRevision: Type.String({ pattern: '^[a-f0-9]{64}$' }),
    simulationConfirmation: Type.Literal(true),
  },
  { additionalProperties: false },
);

export const Feature012DecisionResultSchema = Type.Object(
  {
    decisionRef: Type.String({ format: 'uuid' }),
    overrideRef: Type.String({ format: 'uuid' }),
    lane: Type.Union([Type.Literal('pharmacist'), Type.Literal('second_physician')]),
    decision: Type.Union([Type.Literal('approve'), Type.Literal('reject')]),
    requestVersion: Type.Integer({ minimum: 1, maximum: 2147483647 }),
    assignmentVersion: Type.Integer({ minimum: 1, maximum: 2147483647 }),
    evidenceRevision: Type.String({ pattern: '^[a-f0-9]{64}$' }),
    decidedAt: Type.String({ format: 'date-time' }),
    virtualWindowStartedAt: Type.Optional(Type.String({ format: 'date-time' })),
    virtualWindowEndsAt: Type.Optional(Type.String({ format: 'date-time' })),
    clockVersion: Type.Optional(Type.Integer({ minimum: 1, maximum: 2147483647 })),
    pharmacistObligationState: Type.Optional(
      Type.Union([
        Type.Literal('pending'),
        Type.Literal('reviewed'),
        Type.Literal('blocked_unreviewed'),
      ]),
    ),
    receipt: Feature012ReceiptSchema,
  },
  { additionalProperties: false },
);

export const Feature012PatientProjectionReleaseIntentSchema = Type.Object(
  {
    policyVersion: Type.Literal('F012-VP-2/0.2.0'),
    audience: Type.Literal('subject'),
    projections: Type.Array(Type.Union([Type.Literal('P'), Type.Literal('M')]), {
      minItems: 1,
      maxItems: 2,
      uniqueItems: true,
    }),
    confirmation: Type.Literal(true),
  },
  { additionalProperties: false },
);

export const Feature012SignRequestSchema = Type.Object(
  {
    evidenceRevision: Type.String({ pattern: '^[a-f0-9]{64}$' }),
    signatureConfirmation: Type.Literal(true),
    simulationConfirmation: Type.Literal(true),
    patientProjectionReleaseIntent: Type.Optional(Feature012PatientProjectionReleaseIntentSchema),
  },
  { additionalProperties: false },
);

export const Feature012SignResultSchema = Type.Object(
  {
    prescription: Feature012PrescriptionCSchema,
    signedRevisionRef: Type.String({ format: 'uuid' }),
    signatureReceiptRef: Type.String({ format: 'uuid' }),
    receipt: Feature012ReceiptSchema,
  },
  { additionalProperties: false },
);

export const Feature012CancelRequestSchema = Type.Object(
  { reason: Type.String({ minLength: 1, maxLength: 4000 }) },
  { additionalProperties: false },
);

export const Feature012CancelResultSchema = Type.Object(
  {
    prescription: Feature012PrescriptionCSchema,
    cancellationRef: Type.String({ format: 'uuid' }),
    receipt: Feature012ReceiptSchema,
  },
  { additionalProperties: false },
);

export const Feature012DiscoverQuerySchema = Type.Object(
  {
    view: Type.Literal('discover'),
    lane: Type.Union([Type.Literal('pharmacist'), Type.Literal('second_physician')]),
    scope: Type.Union([Type.Literal('eligible'), Type.Literal('own')]),
    cursor: Type.Optional(Type.String({ minLength: 1, maxLength: 4096 })),
    limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 100, default: 25 })),
  },
  { additionalProperties: false },
);

export const Feature012DetailQuerySchema = Type.Object(
  {
    view: Type.Literal('detail'),
    overrideId: Type.String({ format: 'uuid' }),
    lane: Type.Union([Type.Literal('pharmacist'), Type.Literal('second_physician')]),
    requestVersion: Type.Integer({ minimum: 1, maximum: 2147483647 }),
    assignmentVersion: Type.Integer({ minimum: 1, maximum: 2147483647 }),
    evidenceRevision: Type.String({ pattern: '^[a-f0-9]{64}$' }),
  },
  { additionalProperties: false },
);

export const Feature012ReviewQuerySchema = Type.Intersect([
  Type.Union([Feature012DiscoverQuerySchema, Feature012DetailQuerySchema]),
  Type.Not(
    Type.Union([Type.Intersect([Feature012DiscoverQuerySchema, Feature012DetailQuerySchema])]),
  ),
]);

export const Feature012DiscoverCaseSchema = Type.Object(
  {
    overrideRef: Type.String({ format: 'uuid' }),
    originatingFacilityRef: Type.String({ format: 'uuid' }),
    lane: Type.Union([Type.Literal('pharmacist'), Type.Literal('second_physician')]),
    pathway: Type.Union([Type.Literal('normal'), Type.Literal('emergency')]),
    requestVersion: Type.Integer({ minimum: 1, maximum: 2147483647 }),
    assignmentVersion: Type.Integer({ minimum: 1, maximum: 2147483647 }),
    evidenceRevision: Type.String({ pattern: '^[a-f0-9]{64}$' }),
    state: Type.Union([
      Type.Literal('eligible'),
      Type.Literal('held_own'),
      Type.Literal('held_other'),
      Type.Literal('released'),
      Type.Literal('expired'),
      Type.Literal('rejected'),
      Type.Literal('cancelled'),
      Type.Literal('invalidated'),
      Type.Literal('blocked_unreviewed'),
      Type.Literal('approved_own'),
    ]),
    createdAt: Type.String({ format: 'date-time' }),
    expiresAt: Type.String({ format: 'date-time' }),
    assignmentExpiresAt: Type.Optional(Type.String({ format: 'date-time' })),
    allowedActions: Type.Array(
      Type.Union([
        Type.Literal('claim'),
        Type.Literal('release_own'),
        Type.Literal('takeover_invalid'),
        Type.Literal('detail'),
        Type.Literal('approve'),
        Type.Literal('reject'),
      ]),
      {},
    ),
  },
  { additionalProperties: false },
);

export const Feature012DiscoverResultSchema = Type.Object(
  {
    data: Type.Array(Feature012DiscoverCaseSchema, {}),
    meta: Type.Object(
      {
        rosterRevision: Type.Integer({ minimum: 1, maximum: 2147483647 }),
        nextCursor: Type.Optional(Type.String({ minLength: 1, maxLength: 4096 })),
        requestId: Type.String({ format: 'uuid' }),
      },
      { additionalProperties: false },
    ),
  },
  { additionalProperties: false },
);

export const Feature012AllergyEvidenceMemberSchema = Type.Intersect([
  Type.Object(
    {
      sourceKind: Type.Literal('allergy'),
      source: Type.Intersect([
        Feature012SourceSchema,
        Type.Object(
          {
            sourceState: Type.Optional(
              Type.Union([Type.Literal('present'), Type.Literal('stale'), Type.Literal('partial')]),
            ),
          },
          {},
        ),
      ]),
      assertionRef: Type.String({ format: 'uuid' }),
      revisionRef: Type.String({ format: 'uuid' }),
      version: Feature012VersionSchema,
      status: Type.Union([
        Type.Literal('self_reported'),
        Type.Literal('clinician_confirmed'),
        Type.Literal('refuted'),
        Type.Literal('entered_in_error'),
      ]),
      codingState: Type.Union([Type.Literal('known'), Type.Literal('unknown')]),
      substanceCoding: Type.Optional(Feature012CodingSchema),
    },
    { additionalProperties: false },
  ),
  Type.Union([
    Type.Intersect([
      Type.Object({ codingState: Type.Optional(Type.Literal('known')) }, {}),
      Type.Object({ substanceCoding: Type.Unknown() }, {}),
    ]),
    Type.Intersect([
      Type.Not(Type.Object({ codingState: Type.Optional(Type.Literal('known')) }, {})),
      Type.Not(Type.Object({ substanceCoding: Type.Unknown() }, {})),
    ]),
  ]),
]);

export const Feature012MedicationEvidenceMemberSchema = Type.Object(
  {
    sourceKind: Type.Literal('medication'),
    source: Type.Intersect([
      Feature012SourceSchema,
      Type.Object(
        {
          sourceState: Type.Optional(
            Type.Union([Type.Literal('present'), Type.Literal('stale'), Type.Literal('partial')]),
          ),
        },
        {},
      ),
    ]),
    assertionRef: Type.String({ format: 'uuid' }),
    revisionRef: Type.String({ format: 'uuid' }),
    version: Feature012VersionSchema,
    status: Type.Union([Type.Literal('prescribed')]),
    productCoding: Feature012CodingSchema,
  },
  { additionalProperties: false },
);

export const Feature012MechanismEvidenceMemberSchema = Type.Object(
  {
    sourceKind: Type.Literal('mechanism'),
    source: Type.Intersect([
      Feature012SourceSchema,
      Type.Object(
        {
          sourceState: Type.Optional(
            Type.Union([Type.Literal('present'), Type.Literal('stale'), Type.Literal('partial')]),
          ),
        },
        {},
      ),
    ]),
    context: Type.Union([
      Type.Literal('W-M'),
      Type.Literal('W-NA'),
      Type.Literal('N'),
      Type.Literal('E'),
    ]),
    scenarioApprovalRef: Type.String({ format: 'uuid' }),
    mechanismManifestDigest: Feature012DigestSchema,
  },
  { additionalProperties: false },
);

export const Feature012MissingEvidenceMemberSchema = Type.Object(
  {
    sourceKind: Type.Union([
      Type.Literal('allergy'),
      Type.Literal('medication'),
      Type.Literal('mechanism'),
    ]),
    source: Type.Intersect([
      Feature012SourceSchema,
      Type.Object(
        {
          sourceState: Type.Optional(
            Type.Union([
              Type.Literal('missing'),
              Type.Literal('unavailable'),
              Type.Literal('verified_empty'),
            ]),
          ),
        },
        {},
      ),
    ]),
  },
  { additionalProperties: false },
);

export const Feature012ReviewEvidenceMemberSchema = Type.Intersect([
  Type.Union([
    Feature012AllergyEvidenceMemberSchema,
    Feature012MedicationEvidenceMemberSchema,
    Feature012MechanismEvidenceMemberSchema,
    Feature012MissingEvidenceMemberSchema,
  ]),
  Type.Not(
    Type.Union([
      Type.Intersect([
        Feature012AllergyEvidenceMemberSchema,
        Feature012MedicationEvidenceMemberSchema,
      ]),
      Type.Intersect([
        Feature012AllergyEvidenceMemberSchema,
        Feature012MechanismEvidenceMemberSchema,
      ]),
      Type.Intersect([
        Feature012AllergyEvidenceMemberSchema,
        Feature012MissingEvidenceMemberSchema,
      ]),
      Type.Intersect([
        Feature012MedicationEvidenceMemberSchema,
        Feature012MechanismEvidenceMemberSchema,
      ]),
      Type.Intersect([
        Feature012MedicationEvidenceMemberSchema,
        Feature012MissingEvidenceMemberSchema,
      ]),
      Type.Intersect([
        Feature012MechanismEvidenceMemberSchema,
        Feature012MissingEvidenceMemberSchema,
      ]),
    ]),
  ),
]);

export const Feature012DetailResultSchema = Type.Object(
  {
    case: Feature012DiscoverCaseSchema,
    syntheticPatientRef: Type.String({ format: 'uuid' }),
    prescriptionRef: Type.String({ format: 'uuid' }),
    prescriptionVersion: Type.Integer({ minimum: 1, maximum: 2147483647 }),
    items: Type.Array(Feature012ItemPSchema, { minItems: 1 }),
    evidence: Type.Array(Feature012ReviewEvidenceMemberSchema, {}),
    issue: Feature012CareIssueSchema,
    rationale: Type.String({ minLength: 1, maxLength: 4000 }),
    alternativesConsidered: Type.Array(Type.String({ minLength: 1, maxLength: 4000 }), {
      minItems: 1,
    }),
    monitoringPlan: Type.String({ minLength: 1, maxLength: 4000 }),
    requesterPersonRef: Type.String({ format: 'uuid' }),
    reviewerPersonRef: Type.String({ format: 'uuid' }),
    decisionProvenance: Type.Array(
      Type.Object(
        {
          decisionRef: Type.String({ format: 'uuid' }),
          lane: Type.Union([Type.Literal('pharmacist'), Type.Literal('second_physician')]),
          decidedAt: Type.String({ format: 'date-time' }),
          decision: Type.Union([Type.Literal('approve'), Type.Literal('reject')]),
          evidenceRevision: Type.String({ pattern: '^[a-f0-9]{64}$' }),
        },
        { additionalProperties: false },
      ),
      {},
    ),
    overallAssessment: Type.Literal('not_fully_checked'),
    rosterRevision: Feature012VersionSchema,
  },
  { additionalProperties: false },
);

export const Feature012ReviewResultSchema = Type.Intersect([
  Type.Union([Feature012DiscoverResultSchema, Feature012DetailResultSchema]),
  Type.Not(
    Type.Union([Type.Intersect([Feature012DiscoverResultSchema, Feature012DetailResultSchema])]),
  ),
]);

export const Feature012AssignmentRequestSchema = Type.Object(
  {
    action: Type.Union([
      Type.Literal('claim'),
      Type.Literal('release_own'),
      Type.Literal('takeover_invalid'),
    ]),
    lane: Type.Union([Type.Literal('pharmacist'), Type.Literal('second_physician')]),
    requestVersion: Type.Integer({ minimum: 1, maximum: 2147483647 }),
    assignmentVersion: Type.Integer({ minimum: 1, maximum: 2147483647 }),
    rosterRevision: Type.Integer({ minimum: 1, maximum: 2147483647 }),
    evidenceRevision: Type.String({ pattern: '^[a-f0-9]{64}$' }),
  },
  { additionalProperties: false },
);

export const Feature012AssignmentResultSchema = Type.Object(
  {
    assignmentRef: Type.String({ format: 'uuid' }),
    requestVersion: Type.Integer({ minimum: 1, maximum: 2147483647 }),
    assignmentVersion: Type.Integer({ minimum: 1, maximum: 2147483647 }),
    evidenceRevision: Type.String({ pattern: '^[a-f0-9]{64}$' }),
    expiresAt: Type.String({ format: 'date-time' }),
    transition: Type.Union([
      Type.Literal('claim'),
      Type.Literal('release_own'),
      Type.Literal('takeover_invalid'),
    ]),
    allowedActions: Type.Array(
      Type.Union([
        Type.Literal('claim'),
        Type.Literal('release_own'),
        Type.Literal('takeover_invalid'),
        Type.Literal('detail'),
        Type.Literal('approve'),
        Type.Literal('reject'),
      ]),
      {},
    ),
    receipt: Feature012ReceiptSchema,
  },
  { additionalProperties: false },
);

export const Feature012ProblemSchema = Type.Object(
  {
    type: Type.String({ format: 'uri-reference' }),
    title: Type.String({}),
    status: Type.Integer({ minimum: 400, maximum: 599 }),
    detail: Type.String({}),
    instance: Type.String({ format: 'uri-reference' }),
    code: Type.Union([
      Type.Literal('authentication-required'),
      Type.Literal('mfa-required'),
      Type.Literal('forbidden'),
      Type.Literal('purpose-required'),
      Type.Literal('not-found'),
      Type.Literal('validation-failed'),
      Type.Literal('state-transition-invalid'),
      Type.Literal('version-conflict'),
      Type.Literal('idempotency-key-reused'),
      Type.Literal('idempotency-in-progress'),
      Type.Literal('rate-limited'),
      Type.Literal('vendor-unavailable'),
      Type.Literal('legal-gate-disabled'),
      Type.Literal('clinical-gate-disabled'),
    ]),
    request_id: Type.String({ format: 'uuid' }),
    errors: Type.Array(
      Type.Object(
        { field: Type.String({}), code: Type.String({}), message: Type.String({}) },
        { additionalProperties: false },
      ),
      {},
    ),
    retry_after_seconds: Type.Optional(Type.Integer({ minimum: 0 })),
  },
  { additionalProperties: false },
);

export const Feature012Problem400Schema = Type.Object(
  {
    type: Type.String({ format: 'uri-reference' }),
    title: Type.String({}),
    status: Type.Literal(400),
    detail: Type.String({}),
    instance: Type.String({ format: 'uri-reference' }),
    code: Type.Union([Type.Literal('validation-failed')]),
    request_id: Type.String({ format: 'uuid' }),
    errors: Type.Array(
      Type.Object(
        { field: Type.String({}), code: Type.String({}), message: Type.String({}) },
        { additionalProperties: false },
      ),
      {},
    ),
    retry_after_seconds: Type.Optional(Type.Integer({ minimum: 0 })),
  },
  { additionalProperties: false },
);

export const Feature012Problem401Schema = Type.Object(
  {
    type: Type.String({ format: 'uri-reference' }),
    title: Type.String({}),
    status: Type.Literal(401),
    detail: Type.String({}),
    instance: Type.String({ format: 'uri-reference' }),
    code: Type.Union([Type.Literal('authentication-required')]),
    request_id: Type.String({ format: 'uuid' }),
    errors: Type.Array(
      Type.Object(
        { field: Type.String({}), code: Type.String({}), message: Type.String({}) },
        { additionalProperties: false },
      ),
      {},
    ),
    retry_after_seconds: Type.Optional(Type.Integer({ minimum: 0 })),
  },
  { additionalProperties: false },
);

export const Feature012Problem403Schema = Type.Object(
  {
    type: Type.String({ format: 'uri-reference' }),
    title: Type.String({}),
    status: Type.Literal(403),
    detail: Type.String({}),
    instance: Type.String({ format: 'uri-reference' }),
    code: Type.Union([
      Type.Literal('forbidden'),
      Type.Literal('purpose-required'),
      Type.Literal('mfa-required'),
    ]),
    request_id: Type.String({ format: 'uuid' }),
    errors: Type.Array(
      Type.Object(
        { field: Type.String({}), code: Type.String({}), message: Type.String({}) },
        { additionalProperties: false },
      ),
      {},
    ),
    retry_after_seconds: Type.Optional(Type.Integer({ minimum: 0 })),
  },
  { additionalProperties: false },
);

export const Feature012Problem404Schema = Type.Object(
  {
    type: Type.String({ format: 'uri-reference' }),
    title: Type.String({}),
    status: Type.Literal(404),
    detail: Type.String({}),
    instance: Type.String({ format: 'uri-reference' }),
    code: Type.Union([Type.Literal('not-found')]),
    request_id: Type.String({ format: 'uuid' }),
    errors: Type.Array(
      Type.Object(
        { field: Type.String({}), code: Type.String({}), message: Type.String({}) },
        { additionalProperties: false },
      ),
      {},
    ),
    retry_after_seconds: Type.Optional(Type.Integer({ minimum: 0 })),
  },
  { additionalProperties: false },
);

export const Feature012Problem409Schema = Type.Object(
  {
    type: Type.String({ format: 'uri-reference' }),
    title: Type.String({}),
    status: Type.Literal(409),
    detail: Type.String({}),
    instance: Type.String({ format: 'uri-reference' }),
    code: Type.Union([
      Type.Literal('version-conflict'),
      Type.Literal('state-transition-invalid'),
      Type.Literal('idempotency-key-reused'),
      Type.Literal('idempotency-in-progress'),
    ]),
    request_id: Type.String({ format: 'uuid' }),
    errors: Type.Array(
      Type.Object(
        { field: Type.String({}), code: Type.String({}), message: Type.String({}) },
        { additionalProperties: false },
      ),
      {},
    ),
    retry_after_seconds: Type.Optional(Type.Integer({ minimum: 0 })),
  },
  { additionalProperties: false },
);

export const Feature012Problem422Schema = Type.Object(
  {
    type: Type.String({ format: 'uri-reference' }),
    title: Type.String({}),
    status: Type.Literal(422),
    detail: Type.String({}),
    instance: Type.String({ format: 'uri-reference' }),
    code: Type.Union([
      Type.Literal('validation-failed'),
      Type.Literal('state-transition-invalid'),
      Type.Literal('clinical-gate-disabled'),
      Type.Literal('legal-gate-disabled'),
    ]),
    request_id: Type.String({ format: 'uuid' }),
    errors: Type.Array(
      Type.Object(
        { field: Type.String({}), code: Type.String({}), message: Type.String({}) },
        { additionalProperties: false },
      ),
      {},
    ),
    retry_after_seconds: Type.Optional(Type.Integer({ minimum: 0 })),
  },
  { additionalProperties: false },
);

export const Feature012Problem429Schema = Type.Object(
  {
    type: Type.String({ format: 'uri-reference' }),
    title: Type.String({}),
    status: Type.Literal(429),
    detail: Type.String({}),
    instance: Type.String({ format: 'uri-reference' }),
    code: Type.Union([Type.Literal('rate-limited')]),
    request_id: Type.String({ format: 'uuid' }),
    errors: Type.Array(
      Type.Object(
        { field: Type.String({}), code: Type.String({}), message: Type.String({}) },
        { additionalProperties: false },
      ),
      {},
    ),
    retry_after_seconds: Type.Optional(Type.Integer({ minimum: 0 })),
  },
  { additionalProperties: false },
);

export const Feature012Problem503Schema = Type.Object(
  {
    type: Type.String({ format: 'uri-reference' }),
    title: Type.String({}),
    status: Type.Literal(503),
    detail: Type.String({}),
    instance: Type.String({ format: 'uri-reference' }),
    code: Type.Union([Type.Literal('vendor-unavailable')]),
    request_id: Type.String({ format: 'uuid' }),
    errors: Type.Array(
      Type.Object(
        { field: Type.String({}), code: Type.String({}), message: Type.String({}) },
        { additionalProperties: false },
      ),
      {},
    ),
    retry_after_seconds: Type.Optional(Type.Integer({ minimum: 0 })),
  },
  { additionalProperties: false },
);

export const Feature012ProjectionControlResultSchema = Type.Object(
  {
    kind: Type.Literal('projection_control'),
    action: Type.Union([
      Type.Literal('release_patient_projection'),
      Type.Literal('withdraw_patient_projection'),
    ]),
    prescriptionRef: Type.String({ format: 'uuid' }),
    signedRevisionRef: Type.String({ format: 'uuid' }),
    prescriptionVersion: Type.Integer({ minimum: 1, maximum: 2147483647 }),
    projectionControlVersion: Type.Integer({ minimum: 1, maximum: 2147483647 }),
    changedReleaseRefs: Type.Array(Type.String({ format: 'uuid' }), {
      minItems: 1,
      maxItems: 101,
      uniqueItems: true,
    }),
    receipt: Feature012ReceiptSchema,
  },
  { additionalProperties: false },
);

export const Feature012UpdatePrescriptionResultSchema = Type.Intersect([
  Type.Union([Feature012PrescriptionMutationSchema, Feature012ProjectionControlResultSchema]),
  Type.Not(
    Type.Union([
      Type.Intersect([
        Feature012PrescriptionMutationSchema,
        Feature012ProjectionControlResultSchema,
      ]),
    ]),
  ),
]);

export const Feature012ListPatientMedicationsQuerySchema = Type.Object(
  {
    status: Type.Optional(
      Type.Union([
        Type.Literal('prescribed'),
        Type.Literal('dispensed'),
        Type.Literal('active'),
        Type.Literal('completed'),
        Type.Literal('discontinued'),
        Type.Literal('expired'),
        Type.Literal('entered_in_error'),
      ]),
    ),
    cursor: Type.Optional(Type.String({ minLength: 1, maxLength: 4096 })),
    limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 100, default: 25 })),
  },
  { additionalProperties: false },
);

export const Feature012GetOverrideReviewCasesQuerySchema = Feature012ReviewQuerySchema;

export const feature012Schemas = {
  FixtureItem: Feature012FixtureItemSchema,
  Version: Feature012VersionSchema,
  Digest: Feature012DigestSchema,
  OpaqueReference: Feature012OpaqueReferenceSchema,
  Coding: Feature012CodingSchema,
  Quantity: Feature012QuantitySchema,
  Source: Feature012SourceSchema,
  Receipt: Feature012ReceiptSchema,
  ItemP: Feature012ItemPSchema,
  PrescriptionP: Feature012PrescriptionPSchema,
  CareIssue: Feature012CareIssueSchema,
  OwnCareBinding: Feature012OwnCareBindingSchema,
  PrescriptionC: Feature012PrescriptionCSchema,
  PrescriptionRead: Feature012PrescriptionReadSchema,
  Medication: Feature012MedicationSchema,
  MedicationList: Feature012MedicationListSchema,
  FixtureInput: Feature012FixtureInputSchema,
  CreatePrescription: Feature012CreatePrescriptionSchema,
  ReplacementIntent: Feature012ReplacementIntentSchema,
  UpdatePrescription: Feature012UpdatePrescriptionSchema,
  SafetyCheckRequest: Feature012SafetyCheckRequestSchema,
  SafetyResult: Feature012SafetyResultSchema,
  PrescriptionMutation: Feature012PrescriptionMutationSchema,
  AcknowledgeWM: Feature012AcknowledgeWMSchema,
  AcknowledgeWNA: Feature012AcknowledgeWNASchema,
  AcknowledgeRequest: Feature012AcknowledgeRequestSchema,
  Acknowledgement: Feature012AcknowledgementSchema,
  NormalOverrideRequest: Feature012NormalOverrideRequestSchema,
  EmergencyOverrideRequest: Feature012EmergencyOverrideRequestSchema,
  OverrideRequest: Feature012OverrideRequestSchema,
  LaneState: Feature012LaneStateSchema,
  OverrideResult: Feature012OverrideResultSchema,
  DecisionRequest: Feature012DecisionRequestSchema,
  DecisionResult: Feature012DecisionResultSchema,
  SignRequest: Feature012SignRequestSchema,
  SignResult: Feature012SignResultSchema,
  CancelRequest: Feature012CancelRequestSchema,
  CancelResult: Feature012CancelResultSchema,
  DiscoverQuery: Feature012DiscoverQuerySchema,
  DetailQuery: Feature012DetailQuerySchema,
  ReviewQuery: Feature012ReviewQuerySchema,
  DiscoverCase: Feature012DiscoverCaseSchema,
  DiscoverResult: Feature012DiscoverResultSchema,
  ReviewEvidenceMember: Feature012ReviewEvidenceMemberSchema,
  DetailResult: Feature012DetailResultSchema,
  ReviewResult: Feature012ReviewResultSchema,
  AssignmentRequest: Feature012AssignmentRequestSchema,
  AssignmentResult: Feature012AssignmentResultSchema,
  Problem: Feature012ProblemSchema,
  Problem400: Feature012Problem400Schema,
  Problem401: Feature012Problem401Schema,
  Problem403: Feature012Problem403Schema,
  Problem404: Feature012Problem404Schema,
  Problem409: Feature012Problem409Schema,
  Problem422: Feature012Problem422Schema,
  Problem429: Feature012Problem429Schema,
  Problem503: Feature012Problem503Schema,
  AllergyEvidenceMember: Feature012AllergyEvidenceMemberSchema,
  MedicationEvidenceMember: Feature012MedicationEvidenceMemberSchema,
  MechanismEvidenceMember: Feature012MechanismEvidenceMemberSchema,
  MissingEvidenceMember: Feature012MissingEvidenceMemberSchema,
  PatientSource: Feature012PatientSourceSchema,
  PatientProjectionReleaseIntent: Feature012PatientProjectionReleaseIntentSchema,
  UpdatePrescriptionDraft: Feature012UpdatePrescriptionDraftSchema,
  ProjectionReleaseTargets: Feature012ProjectionReleaseTargetsSchema,
  PostSignProjectionRelease: Feature012PostSignProjectionReleaseSchema,
  PostSignProjectionWithdrawal: Feature012PostSignProjectionWithdrawalSchema,
  ProjectionControlResult: Feature012ProjectionControlResultSchema,
  UpdatePrescriptionResult: Feature012UpdatePrescriptionResultSchema,
  ProjectionControlRead: Feature012ProjectionControlReadSchema,
  ProjectionTargetControl: Feature012ProjectionTargetControlSchema,
  ListPatientMedicationsQuery: Feature012ListPatientMedicationsQuerySchema,
  GetOverrideReviewCasesQuery: Feature012GetOverrideReviewCasesQuerySchema,
} as const;
export const feature012QuerySchemas = {
  listPatientMedications: Feature012ListPatientMedicationsQuerySchema,
  getOverrideReviewCases: Feature012GetOverrideReviewCasesQuerySchema,
} as const;
export const feature012RequestSchemas = {
  createPrescription: Feature012CreatePrescriptionSchema,
  updatePrescription: Feature012UpdatePrescriptionSchema,
  runPrescriptionSafety: Feature012SafetyCheckRequestSchema,
  acknowledgeWarning: Feature012AcknowledgeRequestSchema,
  requestContraindicatedOverride: Feature012OverrideRequestSchema,
  decideOverride: Feature012DecisionRequestSchema,
  signPrescription: Feature012SignRequestSchema,
  cancelPrescription: Feature012CancelRequestSchema,
  transitionOverrideReviewAssignment: Feature012AssignmentRequestSchema,
} as const;
export const feature012ResponseSchemas = {
  createPrescription: Feature012PrescriptionMutationSchema,
  updatePrescription: Feature012UpdatePrescriptionResultSchema,
  getPrescription: Feature012PrescriptionReadSchema,
  runPrescriptionSafety: Feature012SafetyResultSchema,
  acknowledgeWarning: Feature012AcknowledgementSchema,
  requestContraindicatedOverride: Feature012OverrideResultSchema,
  decideOverride: Feature012DecisionResultSchema,
  signPrescription: Feature012SignResultSchema,
  cancelPrescription: Feature012CancelResultSchema,
  listPatientMedications: Feature012MedicationListSchema,
  getOverrideReviewCases: Feature012ReviewResultSchema,
  transitionOverrideReviewAssignment: Feature012AssignmentResultSchema,
} as const;
export const feature012HeaderSchemas = {
  RequestId: Type.String({ format: 'uuid' }),
  CacheControl: Type.Literal('private, no-store'),
  ContentLanguage: Type.Union([Type.Literal('ar-EG'), Type.Literal('en-EG')]),
  ETag: Type.String({ pattern: '^"[1-9][0-9]*"$' }),
  UpdateETag: Type.Intersect([
    Type.Union([
      Type.String({ pattern: '^"[1-9][0-9]*"$' }),
      Type.String({
        pattern:
          '^"ppc:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}:[1-9][0-9]*"$',
      }),
    ]),
    Type.Not(
      Type.Union([
        Type.Intersect([
          Type.String({ pattern: '^"[1-9][0-9]*"$' }),
          Type.String({
            pattern:
              '^"ppc:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}:[1-9][0-9]*"$',
          }),
        ]),
      ]),
    ),
  ]),
  IfMatch: Type.String({ pattern: '^"[1-9][0-9]*"$' }),
  UpdateIfMatch: Type.Intersect([
    Type.Union([
      Type.String({ pattern: '^"[1-9][0-9]*"$' }),
      Type.String({
        pattern:
          '^"ppc:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}:[1-9][0-9]*"$',
      }),
    ]),
    Type.Not(
      Type.Union([
        Type.Intersect([
          Type.String({ pattern: '^"[1-9][0-9]*"$' }),
          Type.String({
            pattern:
              '^"ppc:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}:[1-9][0-9]*"$',
          }),
        ]),
      ]),
    ),
  ]),
  IdempotencyKey: Type.String({ minLength: 16, maxLength: 128 }),
} as const;

export type Feature012FixtureItem = Static<typeof Feature012FixtureItemSchema>;
export type Feature012Version = Static<typeof Feature012VersionSchema>;
export type Feature012Digest = Static<typeof Feature012DigestSchema>;
export type Feature012OpaqueReference = Static<typeof Feature012OpaqueReferenceSchema>;
export type Feature012Coding = Static<typeof Feature012CodingSchema>;
export type Feature012Quantity = Static<typeof Feature012QuantitySchema>;
export type Feature012Source = Static<typeof Feature012SourceSchema>;
export type Feature012Receipt = Static<typeof Feature012ReceiptSchema>;
export type Feature012ItemP = Static<typeof Feature012ItemPSchema>;
export type Feature012PatientSource = Static<typeof Feature012PatientSourceSchema>;
export type Feature012PrescriptionP = Static<typeof Feature012PrescriptionPSchema>;
export type Feature012CareIssue = Static<typeof Feature012CareIssueSchema>;
export type Feature012OwnCareBinding = Static<typeof Feature012OwnCareBindingSchema>;
export type Feature012ProjectionTargetControl = Static<
  typeof Feature012ProjectionTargetControlSchema
>;
export type Feature012ProjectionControlRead = Static<typeof Feature012ProjectionControlReadSchema>;
export type Feature012PrescriptionC = Static<typeof Feature012PrescriptionCSchema>;
export type Feature012PrescriptionRead = Static<typeof Feature012PrescriptionReadSchema>;
export type Feature012Medication = Static<typeof Feature012MedicationSchema>;
export type Feature012MedicationList = Static<typeof Feature012MedicationListSchema>;
export type Feature012FixtureInput = Static<typeof Feature012FixtureInputSchema>;
export type Feature012ReplacementIntent = Static<typeof Feature012ReplacementIntentSchema>;
export type Feature012CreatePrescription = Static<typeof Feature012CreatePrescriptionSchema>;
export type Feature012UpdatePrescriptionDraft = Static<
  typeof Feature012UpdatePrescriptionDraftSchema
>;
export type Feature012ProjectionReleaseTargets = Static<
  typeof Feature012ProjectionReleaseTargetsSchema
>;
export type Feature012PostSignProjectionRelease = Static<
  typeof Feature012PostSignProjectionReleaseSchema
>;
export type Feature012PostSignProjectionWithdrawal = Static<
  typeof Feature012PostSignProjectionWithdrawalSchema
>;
export type Feature012UpdatePrescription = Static<typeof Feature012UpdatePrescriptionSchema>;
export type Feature012SafetyCheckRequest = Static<typeof Feature012SafetyCheckRequestSchema>;
export type Feature012SafetyResult = Static<typeof Feature012SafetyResultSchema>;
export type Feature012PrescriptionMutation = Static<typeof Feature012PrescriptionMutationSchema>;
export type Feature012AcknowledgeWM = Static<typeof Feature012AcknowledgeWMSchema>;
export type Feature012AcknowledgeWNA = Static<typeof Feature012AcknowledgeWNASchema>;
export type Feature012AcknowledgeRequest = Static<typeof Feature012AcknowledgeRequestSchema>;
export type Feature012Acknowledgement = Static<typeof Feature012AcknowledgementSchema>;
export type Feature012NormalOverrideRequest = Static<typeof Feature012NormalOverrideRequestSchema>;
export type Feature012EmergencyOverrideRequest = Static<
  typeof Feature012EmergencyOverrideRequestSchema
>;
export type Feature012OverrideRequest = Static<typeof Feature012OverrideRequestSchema>;
export type Feature012LaneState = Static<typeof Feature012LaneStateSchema>;
export type Feature012OverrideResult = Static<typeof Feature012OverrideResultSchema>;
export type Feature012DecisionRequest = Static<typeof Feature012DecisionRequestSchema>;
export type Feature012DecisionResult = Static<typeof Feature012DecisionResultSchema>;
export type Feature012PatientProjectionReleaseIntent = Static<
  typeof Feature012PatientProjectionReleaseIntentSchema
>;
export type Feature012SignRequest = Static<typeof Feature012SignRequestSchema>;
export type Feature012SignResult = Static<typeof Feature012SignResultSchema>;
export type Feature012CancelRequest = Static<typeof Feature012CancelRequestSchema>;
export type Feature012CancelResult = Static<typeof Feature012CancelResultSchema>;
export type Feature012DiscoverQuery = Static<typeof Feature012DiscoverQuerySchema>;
export type Feature012DetailQuery = Static<typeof Feature012DetailQuerySchema>;
export type Feature012ReviewQuery = Static<typeof Feature012ReviewQuerySchema>;
export type Feature012DiscoverCase = Static<typeof Feature012DiscoverCaseSchema>;
export type Feature012DiscoverResult = Static<typeof Feature012DiscoverResultSchema>;
export type Feature012AllergyEvidenceMember = Static<typeof Feature012AllergyEvidenceMemberSchema>;
export type Feature012MedicationEvidenceMember = Static<
  typeof Feature012MedicationEvidenceMemberSchema
>;
export type Feature012MechanismEvidenceMember = Static<
  typeof Feature012MechanismEvidenceMemberSchema
>;
export type Feature012MissingEvidenceMember = Static<typeof Feature012MissingEvidenceMemberSchema>;
export type Feature012ReviewEvidenceMember = Static<typeof Feature012ReviewEvidenceMemberSchema>;
export type Feature012DetailResult = Static<typeof Feature012DetailResultSchema>;
export type Feature012ReviewResult = Static<typeof Feature012ReviewResultSchema>;
export type Feature012AssignmentRequest = Static<typeof Feature012AssignmentRequestSchema>;
export type Feature012AssignmentResult = Static<typeof Feature012AssignmentResultSchema>;
export type Feature012Problem = Static<typeof Feature012ProblemSchema>;
export type Feature012Problem400 = Static<typeof Feature012Problem400Schema>;
export type Feature012Problem401 = Static<typeof Feature012Problem401Schema>;
export type Feature012Problem403 = Static<typeof Feature012Problem403Schema>;
export type Feature012Problem404 = Static<typeof Feature012Problem404Schema>;
export type Feature012Problem409 = Static<typeof Feature012Problem409Schema>;
export type Feature012Problem422 = Static<typeof Feature012Problem422Schema>;
export type Feature012Problem429 = Static<typeof Feature012Problem429Schema>;
export type Feature012Problem503 = Static<typeof Feature012Problem503Schema>;
export type Feature012ProjectionControlResult = Static<
  typeof Feature012ProjectionControlResultSchema
>;
export type Feature012UpdatePrescriptionResult = Static<
  typeof Feature012UpdatePrescriptionResultSchema
>;
export type Feature012ListPatientMedicationsQuery = Static<
  typeof Feature012ListPatientMedicationsQuerySchema
>;
export type Feature012GetOverrideReviewCasesQuery = Static<
  typeof Feature012GetOverrideReviewCasesQuerySchema
>;
