import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { Value } from '@sinclair/typebox/value';
import { describe, expect, it } from 'vitest';

const openApi = new URL(
  '../../../specs/012-prescription-safety-governed-overrides/contracts/openapi.yaml',
  import.meta.url,
);
const fixture = JSON.parse(
  readFileSync(new URL('../readiness/engineering-fixtures.candidate.json', openApi), 'utf8'),
).cases[0];
const id = '00000000-0000-4000-8000-000000000001';
const digest = 'a'.repeat(64);
const instant = '2026-11-12T10:00:00Z';
const coding = { system: 'synthetic', code: 'synthetic', version: '1' };
const draft = {
  items: [{ caseId: fixture.caseId, inputSha256: digest, item: fixture.item }],
  substitutionAllowed: false,
  expiresAt: instant,
};
const control = {
  policyVersion: 'F012-VP-2/0.2.0',
  audience: 'subject',
  expectedSignedRevisionRef: id,
  expectedPrescriptionVersion: 2,
  expectedProjectionControlVersion: 1,
  confirmation: true,
};
const release = {
  ...control,
  action: 'release_patient_projection',
  targets: { prescription: true },
};
const withdraw = {
  ...control,
  action: 'withdraw_patient_projection',
  releaseRefs: [id],
  reasonCategory: 'privacy_restriction',
};
const discover = { view: 'discover', lane: 'pharmacist', scope: 'eligible' };
const detail = {
  view: 'detail',
  lane: 'pharmacist',
  overrideId: id,
  requestVersion: 1,
  assignmentVersion: 1,
  evidenceRevision: digest,
};
const assignment = {
  lane: 'pharmacist',
  requestVersion: 1,
  assignmentVersion: 1,
  rosterRevision: 1,
  evidenceRevision: digest,
};
const source = {
  sourceId: 'synthetic',
  sourceState: 'present',
  freshness: 'current',
  completeness: 'complete_within_declared_scope',
  knownScope: 'synthetic',
  capturedAt: instant,
  overallAssessment: 'not_fully_checked',
};
const allergy = {
  sourceKind: 'allergy',
  source,
  assertionRef: id,
  revisionRef: id,
  version: 1,
  status: 'self_reported',
  codingState: 'known',
  substanceCoding: coding,
};
const patient = {
  prescriptionRef: id,
  status: 'signed',
  version: 1,
  items: [{ itemRef: id, productCoding: coding }],
  source: { ...source, sourceId: 'prescription', knownScope: 'released_prescription' },
};
const problem = {
  type: '/problems/version-conflict',
  title: 'Conflict',
  status: 409,
  detail: 'Refresh the current resource.',
  instance: '/problems/1',
  code: 'version-conflict',
  request_id: id,
  errors: [],
};

async function generated() {
  return import('./feature-012.js');
}

describe('F012 schema contract', () => {
  it('binds twelve exact operations with contracted mutation and precondition carriers', async () => {
    const { feature012Operations } = await generated();
    expect(createHash('sha256').update(readFileSync(openApi)).digest('hex')).toBe(
      'c135c26a4e897a86d6d37ea756e46904a83c5fcc55387003ceeb71c97635fb9d',
    );
    expect(
      feature012Operations.map((operation) => [
        operation.operationId,
        operation.method,
        operation.path,
        'requestSchema' in operation ? operation.requestSchema : undefined,
        operation.responseSchema,
      ]),
    ).toEqual([
      [
        'createPrescription',
        'POST',
        '/encounters/{encounterId}/prescriptions',
        'CreatePrescription',
        'PrescriptionMutation',
      ],
      [
        'updatePrescription',
        'PATCH',
        '/prescriptions/{prescriptionId}',
        'UpdatePrescription',
        'UpdatePrescriptionResult',
      ],
      ['getPrescription', 'GET', '/prescriptions/{prescriptionId}', undefined, 'PrescriptionRead'],
      [
        'runPrescriptionSafety',
        'POST',
        '/prescriptions/{prescriptionId}/safety-checks',
        'SafetyCheckRequest',
        'SafetyResult',
      ],
      [
        'acknowledgeWarning',
        'POST',
        '/detected-issues/{issueId}/acknowledgements',
        'AcknowledgeRequest',
        'Acknowledgement',
      ],
      [
        'requestContraindicatedOverride',
        'POST',
        '/detected-issues/{issueId}/override-requests',
        'OverrideRequest',
        'OverrideResult',
      ],
      [
        'decideOverride',
        'POST',
        '/override-requests/{overrideId}/decisions',
        'DecisionRequest',
        'DecisionResult',
      ],
      [
        'signPrescription',
        'POST',
        '/prescriptions/{prescriptionId}/sign',
        'SignRequest',
        'SignResult',
      ],
      [
        'cancelPrescription',
        'POST',
        '/prescriptions/{prescriptionId}/cancel',
        'CancelRequest',
        'CancelResult',
      ],
      [
        'listPatientMedications',
        'GET',
        '/patients/{managedPatientId}/medications',
        undefined,
        'MedicationList',
      ],
      ['getOverrideReviewCases', 'GET', '/override-review-cases', undefined, 'ReviewResult'],
      [
        'transitionOverrideReviewAssignment',
        'POST',
        '/override-requests/{overrideId}/assignment-transitions',
        'AssignmentRequest',
        'AssignmentResult',
      ],
    ]);
    expect(
      feature012Operations
        .filter((o) => o.headerParameters.some((h) => h.name === 'Idempotency-Key' && h.required))
        .map((o) => o.method),
    ).toEqual(['POST', 'PATCH', ...Array(7).fill('POST')]);
    expect(
      feature012Operations
        .filter((o) => o.headerParameters.some((h) => h.name === 'If-Match' && h.required))
        .map((o) => o.operationId),
    ).toEqual([
      'updatePrescription',
      'runPrescriptionSafety',
      'decideOverride',
      'signPrescription',
      'cancelPrescription',
      'transitionOverrideReviewAssignment',
    ]);
    for (const operation of feature012Operations) {
      expect(operation.headerParameters).toContainEqual(
        expect.objectContaining({ name: 'X-Purpose', required: true }),
      );
      expect(Object.keys(operation.problems)).toEqual([
        '400',
        '401',
        '403',
        '404',
        '409',
        '422',
        '429',
        '503',
      ]);
    }
  });

  it.each([
    ['UpdatePrescription', 'draft', draft, true],
    ['UpdatePrescription', 'release', release, true],
    ['UpdatePrescription', 'withdrawal', withdraw, true],
    ['UpdatePrescription', 'mixed draft and release', { ...draft, ...release }, false],
    [
      'UpdatePrescription',
      'mixed release and withdrawal',
      { ...release, releaseRefs: [id] },
      false,
    ],
    ['UpdatePrescription', 'empty release selection', { ...release, targets: {} }, false],
    [
      'UpdatePrescription',
      'release selection of both P and M',
      { ...release, targets: { prescription: true, medicationStatementRefs: [id] } },
      true,
    ],
    [
      'UpdatePrescription',
      'duplicate withdrawal refs',
      { ...withdraw, releaseRefs: [id, id] },
      false,
    ],
    ['UpdatePrescription', 'subject injection', { ...release, patientId: id }, false],
    [
      'UpdatePrescription',
      'nested target injection',
      { ...release, targets: { prescription: true, facilityId: id } },
      false,
    ],
    [
      'UpdatePrescription',
      'null optional draft field',
      { ...draft, mechanismScenarioRef: null },
      false,
    ],
    [
      'UpdatePrescription',
      'unapproved nested fixture coding',
      {
        ...draft,
        items: [
          {
            ...draft.items[0],
            item: {
              ...fixture.item,
              productCoding: { ...fixture.item.productCoding, code: 'manufactured' },
            },
          },
        ],
      },
      false,
    ],
    ['ReviewQuery', 'discovery without cursor', discover, true],
    ['ReviewQuery', 'opaque cursor shape', { ...discover, cursor: 'opaque+/=' }, true],
    ['ReviewQuery', 'null cursor', { ...discover, cursor: null }, false],
    ['ReviewQuery', 'empty cursor', { ...discover, cursor: '' }, false],
    ['ReviewQuery', 'over-length cursor', { ...discover, cursor: 'a'.repeat(4097) }, false],
    ['ReviewQuery', 'out-of-range limit', { ...discover, limit: 101 }, false],
    ['ReviewQuery', 'detail', detail, true],
    ['ReviewQuery', 'incomplete detail', { ...detail, assignmentVersion: 0 }, false],
    ['ReviewQuery', 'mixed selectors', { ...discover, overrideId: id }, false],
    ['ReviewQuery', 'detail with cursor', { ...detail, cursor: 'opaque' }, false],
    ['ReviewQuery', 'missing discovery scope', { view: 'discover', lane: 'pharmacist' }, false],
    ['ReviewQuery', 'facility injection', { ...discover, facilityId: id }, false],
    ['ReviewQuery', 'patient injection', { ...detail, patientId: id }, false],
    ...['claim', 'release_own', 'takeover_invalid'].map(
      (action) => ['AssignmentRequest', action, { ...assignment, action }, true] as const,
    ),
    ['AssignmentRequest', 'uncontracted action', { ...assignment, action: 'renew' }, false],
    [
      'AssignmentRequest',
      'assignee injection',
      { ...assignment, action: 'claim', assigneeId: id },
      false,
    ],
    [
      'AssignmentRequest',
      'forged context',
      { ...assignment, action: 'claim', aal: 'aal2', facilityId: id },
      false,
    ],
    ['PrescriptionRead', 'minimal patient projection', patient, true],
    [
      'PrescriptionRead',
      'hidden field inside P item',
      { ...patient, items: [{ ...patient.items[0], indication: coding }] },
      false,
    ],
    [
      'PrescriptionRead',
      'hidden source digest',
      { ...patient, source: { ...patient.source, digest } },
      false,
    ],
    [
      'PrescriptionRead',
      'borrowed control disclosure',
      { ...patient, projectionControl: {} },
      false,
    ],
    ['ReviewEvidenceMember', 'known allergy with coding', allergy, true],
    [
      'ReviewEvidenceMember',
      'known allergy without coding',
      { ...allergy, substanceCoding: undefined },
      false,
    ],
    [
      'ReviewEvidenceMember',
      'unknown allergy with coding',
      { ...allergy, codingState: 'unknown' },
      false,
    ],
    [
      'ReviewEvidenceMember',
      'present allergy with missing source',
      { ...allergy, source: { ...source, sourceState: 'missing' } },
      false,
    ],
    [
      'ReviewEvidenceMember',
      'hidden nested evidence detail',
      { ...allergy, source: { ...source, protectedBody: 'hidden' } },
      false,
    ],
    ['ProjectionTargetControl', 'unreleased without ref', { state: 'unreleased' }, true],
    [
      'ProjectionTargetControl',
      'unreleased with ref',
      { state: 'unreleased', releaseRef: id },
      false,
    ],
    ['ProjectionTargetControl', 'withdrawn without ref', { state: 'withdrawn' }, false],
    ['ProjectionTargetControl', 'withdrawn with ref', { state: 'withdrawn', releaseRef: id }, true],
    ['Problem409', 'contracted conflict', problem, true],
    ['Problem409', 'wrong status/code pairing', { ...problem, code: 'not-found' }, false],
    [
      'Problem409',
      'hidden nested error evidence',
      {
        ...problem,
        errors: [{ field: 'query', code: 'invalid', message: 'Invalid.', evidence: digest }],
      },
      false,
    ],
    ['Problem409', 'old result in conflict payload', { ...problem, data: patient }, false],
  ] as const)('%s: %s', async (name, _case, value, expected) => {
    const { feature012Schemas } = await generated();
    // Wire values pass through JSON serialization, which omits undefined.
    expect(
      Value.Check(
        feature012Schemas[name as keyof typeof feature012Schemas],
        JSON.parse(JSON.stringify(value)),
      ),
    ).toBe(expected);
  });

  it('checks numeric and projection-control wire precondition and result header shapes', async () => {
    const { feature012HeaderSchemas } = await generated();
    const { IfMatch, UpdateIfMatch, ETag, UpdateETag } = feature012HeaderSchemas;
    const numeric = '"2"';
    const projection = `"ppc:${id}:${id}:2"`;
    for (const schema of [IfMatch, ETag]) {
      expect(Value.Check(schema, numeric)).toBe(true);
      expect(Value.Check(schema, projection)).toBe(false);
    }
    for (const schema of [UpdateIfMatch, UpdateETag]) {
      expect(Value.Check(schema, numeric)).toBe(true);
      expect(Value.Check(schema, projection)).toBe(true);
      for (const malformed of [
        '*',
        '2',
        '"0"',
        `W/${numeric}`,
        `${numeric}, "3"`,
        projection.replace(':2"', ':0"'),
      ]) {
        expect(Value.Check(schema, malformed)).toBe(false);
      }
    }
  });

  it('accepts structurally valid payloads on all remaining mutation carriers', async () => {
    const { feature012RequestSchemas: requests } = await generated();
    const reason = {
      evidenceRevision: digest,
      structuredReason: 'synthetic',
      justification: 'synthetic',
    };
    const override = {
      evidenceRevision: digest,
      rationale: 'synthetic',
      alternativesConsidered: ['synthetic'],
      monitoringPlan: 'synthetic',
      expiresAt: instant,
    };
    const inputs = [
      [requests.createPrescription, draft],
      [requests.runPrescriptionSafety, {}],
      [requests.acknowledgeWarning, { ...reason, context: 'W-M', monitoringPlan: 'synthetic' }],
      [requests.acknowledgeWarning, { ...reason, context: 'W-NA' }],
      [requests.requestContraindicatedOverride, { ...override, context: 'N', emergency: false }],
      [
        requests.requestContraindicatedOverride,
        { ...override, context: 'E', emergency: true, syntheticPathwayConfirmation: true },
      ],
      [
        requests.decideOverride,
        {
          ...assignment,
          decision: 'approve',
          comment: 'synthetic',
          signatureDigest: digest,
          simulationConfirmation: true,
        },
      ],
      [
        requests.signPrescription,
        { evidenceRevision: digest, signatureConfirmation: true, simulationConfirmation: true },
      ],
      [requests.cancelPrescription, { reason: 'synthetic' }],
    ] as const;
    for (const [schema, input] of inputs) {
      expect(Value.Check(schema, input)).toBe(true);
      expect(Value.Check(schema, { ...input, actorId: id })).toBe(false);
    }
  });

  it('distinguishes nullable values from omitted optional values', async () => {
    const { feature012Schemas } = await generated();
    const meta = { requestId: id, rosterRevision: 1 };
    expect(Value.Check(feature012Schemas.DiscoverResult, { data: [], meta })).toBe(true);
    expect(
      Value.Check(feature012Schemas.DiscoverResult, {
        data: [],
        meta: { ...meta, nextCursor: null },
      }),
    ).toBe(false);
    expect(
      Value.Check(feature012Schemas.DiscoverResult, {
        data: [],
        meta: { ...meta, nextCursor: 'opaque' },
      }),
    ).toBe(true);
  });
});
