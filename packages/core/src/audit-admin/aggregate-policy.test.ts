import {
  auditAdminApprovedPrivacyPolicy,
  auditAdminPrivacyVectors,
  type AuditAdminPrivacyVector,
} from '@shifaa/test-kit/audit-admin-privacy-fixtures';
import { describe, expect, it } from 'vitest';

import {
  discloseAggregateRelease,
  runtimeAggregateConfigurationSha256,
  type AggregateCellInput,
  type AggregateMetricConfiguration,
  type AggregatePolicyConfiguration,
} from './aggregate-policy.js';

const metric: AggregateMetricConfiguration = {
  metricId: 'synthetic_distinct_people',
  description: 'Synthetic approved distinct-person count',
  sourceEntities: ['synthetic.activity'],
  protectedUnit: 'person',
  distinctSubjectKeyClass: 'internal_person_id',
  measure: 'distinct_subject_count',
  allowedDimensions: ['calendar_month_utc', 'facility_type'],
  allowedCombinations: [
    [],
    ['calendar_month_utc'],
    ['facility_type'],
    ['calendar_month_utc', 'facility_type'],
  ],
  zeroPolicy: 'suppress',
  linkedReleaseGroup: 'synthetic_primary',
  cellId: 'A',
  owner: 'synthetic_data_owner',
  approvalArtifactDigest: 'a'.repeat(64),
};

function policy(
  overrides: Partial<AggregatePolicyConfiguration> = {},
): AggregatePolicyConfiguration {
  return {
    ...auditAdminApprovedPrivacyPolicy,
    metrics: [metric],
    linkedReleaseGroups: [
      { groupId: metric.linkedReleaseGroup, cellIds: [metric.cellId], equations: [] },
    ],
    ...overrides,
  };
}

function cell(overrides: Partial<AggregateCellInput> = {}): AggregateCellInput {
  return {
    cellId: 'A',
    metricId: metric.metricId,
    distinctSubjectCount: 11,
    measure: 'distinct_subject_count',
    snapshotId: 'snapshot-001',
    snapshotVersion: 1,
    ...overrides,
  };
}

describe('Feature 008 aggregate disclosure policy', () => {
  it('accepts the approved empty policy as inactive and emits no cells', () => {
    expect(discloseAggregateRelease(auditAdminApprovedPrivacyPolicy, { cells: [cell()] })).toEqual({
      decision: 'inactive',
      reason: 'no_active_metrics',
      cells: [],
    });
  });

  it('fails closed with no cells for unknown policy configuration', () => {
    expect(
      discloseAggregateRelease(
        { ...auditAdminApprovedPrivacyPolicy, unknownControl: true },
        { cells: [cell()] },
      ),
    ).toEqual({ decision: 'rejected', reason: 'unknown_configuration', cells: [] });
    expect(
      discloseAggregateRelease(
        { ...auditAdminApprovedPrivacyPolicy, packageSha256: '0'.repeat(64) },
        { cells: [cell()] },
      ),
    ).toEqual({ decision: 'rejected', reason: 'inactive_configuration', cells: [] });
  });

  it.each(auditAdminPrivacyVectors)('$id enforces the approved $vectorClass decision', (vector) => {
    verifyPrivacyVector(vector);
  });

  it('registers exactly the 34 approved vectors in canonical order', () => {
    expect(auditAdminPrivacyVectors).toHaveLength(34);
    expect(auditAdminPrivacyVectors.map(({ id }) => id)).toEqual(
      Array.from({ length: 34 }, (_, index) => `TV-PRIV-001-${String(index + 1).padStart(3, '0')}`),
    );
  });
});

function verifyPrivacyVector(vector: AuditAdminPrivacyVector): void {
  const id = Number(vector.id.slice(-3));
  if (id <= 10) return verifyBoundaryAndAllowedDimensionVector(id, vector);
  if (id >= 11 && id <= 17) return verifyProhibitedDimensionVector(id, vector);
  if (id >= 18 && id <= 20) return verifyDifferencingVector(id, vector);
  if (id === 21) return verifyLocaleVector(vector);
  if (id === 22) return verifyRoleBypassVector(vector);
  if (id === 23) return verifyUnknownConfigurationVector(vector);
  if (id === 24) return verifyInactiveConfigurationVector(vector);
  if (id === 25) return verifyInvalidCountVector(vector);
  if (id === 26) return verifySideChannelVector(vector);
  if (id === 27) return verifyRetryVector(vector);
  if (id === 28) return verifyImmutableSnapshotVector(vector);
  if (id === 29) return verifyStatusMappingVector(vector);
  if (id === 30) return verifyOperationVector(vector);
  if (id === 31) return verifyNonPersonVector(vector);
  if (id === 32) return verifyHigherThresholdVector(vector);
  if (id === 33) return verifyMeasureVector(vector);
  if (id === 34) return verifyInvalidGraphVector(vector);
  throw new Error(`Unimplemented privacy vector ${vector.id}`);
}

function verifyBoundaryAndAllowedDimensionVector(
  id: number,
  vector: AuditAdminPrivacyVector,
): void {
  const count = Number(vector.expected.protectedCount);
  const dimensions =
    id === 9
      ? { facility_type: 'hospital' }
      : id === 10
        ? { calendar_month_utc: '2026-07', facility_type: 'hospital' }
        : {};
  const result = release(policy(), {
    cells: [cell({ distinctSubjectCount: count, dimensions, completedPeriod: id === 10 })],
  });
  expectDecision(result.decision, vector.expected.decision);
  expect(result.cells).toHaveLength(1);
  if (vector.expected.decision === 'SUPPRESS') {
    expect(result.cells[0]).not.toHaveProperty('count');
  } else {
    expect(result.cells[0]?.count).toBe(count);
  }
  if (id === 6 || id === 7 || id === 8) {
    expect(JSON.stringify(result)).not.toContain('eventCount');
  }
}

function verifyProhibitedDimensionVector(id: number, vector: AuditAdminPrivacyVector): void {
  const variants: Record<number, Partial<AggregateCellInput>> = {
    11: { dimensions: { facility_id: 'synthetic-facility' } },
    12: { dimensions: { governorate: 'synthetic-governorate' } },
    13: { dimensions: { facility_type: 'hospital', approved_workflow_status_class: 'complete' } },
    14: {
      dimensions: {
        calendar_month_utc: '2026-07',
        facility_type: 'hospital',
        approved_workflow_status_class: 'complete',
      },
      completedPeriod: true,
    },
    15: { dimensions: { calendar_month_utc: '2026-09' }, completedPeriod: false },
    16: { dimensions: { calendar_month_utc: 'rolling-30-days' }, completedPeriod: true },
    17: { dimensions: { calendar_month_utc: '2026-Q3' }, completedPeriod: true },
  };
  const result = release(policy(), { cells: [cell(variants[id])] });
  expectDecision(result.decision, vector.expected.decision);
  expect(result.cells).toEqual([]);
}

function verifyDifferencingVector(id: number, vector: AuditAdminPrivacyVector): void {
  const counts =
    id === 19
      ? { A: 9, B: 11, C: 80, T: 100 }
      : id === 20
        ? { T: 100, X: 7, Y: 93 }
        : { A: 10, B: 90, T: 100 };
  const childIds = Object.keys(counts).filter((key) => key !== 'T');
  const groupId = id === 20 ? 'linked_cards' : 'parent_total';
  const metrics = Object.keys(counts).map((cellId) => ({
    ...metric,
    metricId: cellId,
    cellId,
    linkedReleaseGroup: groupId,
  }));
  const configuredPolicy = policy({
    metrics,
    linkedReleaseGroups: [
      {
        groupId,
        cellIds: Object.keys(counts),
        equations: [
          {
            equationId: 'equation-001',
            parentCellId: 'T',
            childCellIds: childIds,
            childrenMutuallyExclusive: true,
          },
        ],
      },
    ],
  });
  const result = release(configuredPolicy, {
    cells: Object.entries(counts).map(([cellId, distinctSubjectCount]) =>
      cell({ cellId, metricId: cellId, distinctSubjectCount }),
    ),
  });
  expectDecision(result.decision, vector.expected.decision);
  expect(releasedIds(result)).toEqual(vector.expected.releasedCells);
  expect(suppressedIds(result)).toEqual(vector.expected.suppressedCells);
  expect(result.cells.filter(({ disclosure }) => disclosure === 'suppressed')).not.toContainEqual(
    expect.objectContaining({ count: expect.any(Number) }),
  );
}

function verifyLocaleVector(vector: AuditAdminPrivacyVector): void {
  const first = release(policy(), { cells: [cell()] });
  const second = release(policy(), { cells: [cell()] });
  expectDecision(first.decision, vector.expected.decision);
  expect(JSON.stringify(first)).toBe(JSON.stringify(second));
}

function verifyRoleBypassVector(vector: AuditAdminPrivacyVector): void {
  const configuredPolicy = policy({
    releaseRules: {
      ...auditAdminApprovedPrivacyPolicy.releaseRules,
      localeAndRoleBypass: 'allowed',
    },
  });
  const result = release(configuredPolicy, { cells: [cell({ distinctSubjectCount: 10 })] });
  expectDecision(result.decision, vector.expected.decision);
  expect(result.cells).toEqual([]);
}

function verifyUnknownConfigurationVector(vector: AuditAdminPrivacyVector): void {
  const result = release(policy(), {
    cells: [cell({ metricId: 'unknown-metric' })],
  });
  expectDecision(result.decision, vector.expected.decision);
  expect(result.cells).toEqual([]);
}

function verifyInactiveConfigurationVector(vector: AuditAdminPrivacyVector): void {
  for (const invalid of [
    policy({ policyStatus: 'conditional' }),
    policy({ packageSha256: '0'.repeat(64) }),
    policy({ metrics: [{ ...metric, approvalArtifactDigest: '' }] }),
  ]) {
    const result = release(invalid, { cells: [cell()] });
    expectDecision(result.decision, vector.expected.decision);
    expect(result.cells).toEqual([]);
  }
  expect(discloseAggregateRelease(policy(), { cells: [cell()] })).toEqual({
    decision: 'rejected',
    reason: 'inactive_configuration',
    cells: [],
  });
}

function verifyInvalidCountVector(vector: AuditAdminPrivacyVector): void {
  for (const invalid of [-1, 1.5, null, 'indeterminate', Number.MAX_SAFE_INTEGER + 1]) {
    const result = release(policy(), {
      cells: [cell({ distinctSubjectCount: invalid })],
    });
    expectDecision(result.decision, vector.expected.decision);
    expect(result.cells).toEqual([]);
  }
}

function verifySideChannelVector(vector: AuditAdminPrivacyVector): void {
  const result = release(policy(), {
    cells: [cell({ distinctSubjectCount: 10 })],
  });
  expectDecision(result.decision, vector.expected.decision);
  const encoded = JSON.stringify(result);
  expect(encoded).not.toContain('10');
  expect(encoded).not.toContain('80000000-0000-4000-8000-000000000002');
  expect(result.cells[0]).not.toHaveProperty('cellId');
  expect(result.cells[0]).not.toHaveProperty('snapshotId');
}

function verifyRetryVector(vector: AuditAdminPrivacyVector): void {
  const first = release(policy(), { cells: [cell()] });
  const retry = release(policy(), { cells: [cell()] });
  expectDecision(first.decision, vector.expected.decision);
  expect(JSON.stringify(first)).toBe(JSON.stringify(retry));
}

function verifyImmutableSnapshotVector(vector: AuditAdminPrivacyVector): void {
  const result = release(policy(), {
    cells: [cell({ lateDataArrival: true })],
    priorReleasedSnapshot: { snapshotId: 'snapshot-001', snapshotVersion: 1 },
  });
  expectDecision(result.decision, vector.expected.decision);
  expect(result.cells).toEqual([]);
}

function verifyStatusMappingVector(vector: AuditAdminPrivacyVector): void {
  const statusMetric = {
    ...metric,
    allowedDimensions: ['approved_workflow_status_class'],
    allowedCombinations: [['approved_workflow_status_class']],
  };
  const result = release(policy({ metrics: [statusMetric] }), {
    cells: [cell({ dimensions: { approved_workflow_status_class: 'complete' } })],
  });
  expectDecision(result.decision, vector.expected.decision);
}

function verifyOperationVector(vector: AuditAdminPrivacyVector): void {
  for (const requestedOperation of ['drill_down', 'search', 'pagination', 'filter', 'export']) {
    const result = release(policy(), { cells: [cell()], requestedOperation });
    expectDecision(result.decision, vector.expected.decision);
  }
}

function verifyNonPersonVector(vector: AuditAdminPrivacyVector): void {
  const invalid = { ...metric, protectedUnit: 'non_person_entity', zeroPolicy: undefined };
  const invalidPolicy = { ...policy(), metrics: [invalid] };
  const result = release(invalidPolicy, { cells: [cell()] });
  expectDecision(result.decision, vector.expected.decision);
}

function verifyHigherThresholdVector(vector: AuditAdminPrivacyVector): void {
  const configuredPolicy = policy({ metrics: [{ ...metric, higherThreshold: 20 }] });
  const result = release(configuredPolicy, { cells: [cell({ distinctSubjectCount: 19 })] });
  expectDecision(result.decision, vector.expected.decision);
  expect(result.cells[0]).not.toHaveProperty('count');
}

function verifyMeasureVector(vector: AuditAdminPrivacyVector): void {
  for (const measure of ['event_count', 'encounter_count', 'record_count', 'audit_row_count']) {
    const result = release(policy(), { cells: [cell({ measure })] });
    expectDecision(result.decision, vector.expected.decision);
    expect(result.cells).toEqual([]);
  }
}

function verifyInvalidGraphVector(vector: AuditAdminPrivacyVector): void {
  const invalidGroups = [
    { groupId: 'g', cellIds: ['A', 'B', 'T'], equations: [] },
    {
      groupId: 'g',
      cellIds: ['A', 'B', 'T'],
      equations: [
        {
          equationId: 'e1',
          parentCellId: 'T',
          childCellIds: ['A', 'B'],
          childrenMutuallyExclusive: false,
        },
      ],
    },
    {
      groupId: 'g',
      cellIds: ['A', 'B', 'T'],
      equations: [
        {
          equationId: 'e1',
          parentCellId: 'T',
          childCellIds: ['A', 'B'],
          childrenMutuallyExclusive: true,
        },
        {
          equationId: 'e2',
          parentCellId: 'T',
          childCellIds: ['A', 'B'],
          childrenMutuallyExclusive: true,
        },
      ],
    },
    {
      groupId: 'g',
      cellIds: ['A', 'B', 'T'],
      equations: [
        {
          equationId: 'e1',
          parentCellId: 'T',
          childCellIds: ['A', 'B'],
          childrenMutuallyExclusive: true,
        },
        {
          equationId: 'e2',
          parentCellId: 'A',
          childCellIds: ['T', 'B'],
          childrenMutuallyExclusive: true,
        },
      ],
    },
  ];
  for (const linkedReleaseGroups of invalidGroups) {
    const result = release(policy({ linkedReleaseGroups: [linkedReleaseGroups] }), {
      cells: [cell()],
    });
    expectDecision(result.decision, vector.expected.decision);
    expect(result.cells).toEqual([]);
  }
}

function expectDecision(
  actual: string,
  expected: AuditAdminPrivacyVector['expected']['decision'],
): void {
  const mapping = {
    RELEASE: 'released',
    SUPPRESS: 'suppressed',
    REJECT: 'rejected',
    MIXED: 'mixed',
  } as const;
  expect(actual).toBe(mapping[expected]);
}

function release(config: unknown, input: Parameters<typeof discloseAggregateRelease>[1]) {
  return discloseAggregateRelease(config, input, runtimeAggregateConfigurationSha256(config));
}

function releasedIds(result: ReturnType<typeof discloseAggregateRelease>): string[] {
  return result.cells
    .filter(({ disclosure }) => disclosure === 'released')
    .map(({ metricId }) => metricId);
}

function suppressedIds(result: ReturnType<typeof discloseAggregateRelease>): string[] {
  return result.cells
    .filter(({ disclosure }) => disclosure === 'suppressed')
    .map(({ metricId }) => metricId);
}
