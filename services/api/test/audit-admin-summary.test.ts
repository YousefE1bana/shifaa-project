import {
  runtimeAggregateConfigurationSha256,
  type AggregateCellInput,
  type AggregatePolicyConfiguration,
} from '@shifaa/core/audit-admin/aggregate-policy';
import { describe, expect, it, vi } from 'vitest';

import { ApiPolicyError } from '../src/modules/identity-onboarding/errors.js';
import {
  AuditAdminService,
  type AuditAdminServiceDependencies,
} from '../src/modules/audit-admin/service.js';
import type { AuditAdminActor, AuditAdminRepository } from '../src/modules/audit-admin/types.js';

const actor: AuditAdminActor = {
  personId: '81000000-0000-4000-8000-000000000014',
  principal: 'synthetic-admin',
  sessionCurrent: true,
  aal: 1,
  factorAgeSeconds: null,
  purpose: null,
  requestId: '84000000-0000-4000-8000-000000000001',
  traceId: 'trace-008-summary',
};

const inactivePolicy: AggregatePolicyConfiguration = {
  policyId: 'OPEN-PRIV-001',
  packageVersion: '1.0.0-approved',
  packageSha256: '38855c7319b6bcd06b491bf4213a277303a6d6e2c1ebe7499b65fdfa4ae15039',
  policyStatus: 'approved',
  threshold: {
    minimumReleasableDistinctSubjects: 11,
    primarySuppressionMin: 0,
    primarySuppressionMax: 10,
    personDerivedZeroPolicy: 'suppress',
  },
  releaseRules: {
    fixedServerTemplatesOnly: true,
    completedPeriodsOnly: true,
    immutableClosedSnapshots: true,
    maxDimensions: 2,
    maxCategoricalDimensions: 1,
    complementarySuppression: 'required',
    linkedReleaseCheck: 'required',
    localeAndRoleBypass: 'prohibited',
  },
  allowedTimeDimensions: ['calendar_month_utc'],
  allowedCategoricalDimensions: {
    facility_type: ['clinic', 'pharmacy', 'hospital', 'laboratory'],
    approved_workflow_status_class: [],
  },
  allowedCombinations: [
    [],
    ['calendar_month_utc'],
    ['facility_type'],
    ['approved_workflow_status_class'],
    ['calendar_month_utc', 'facility_type'],
    ['calendar_month_utc', 'approved_workflow_status_class'],
  ],
  metrics: [],
  linkedReleaseGroups: [],
};

function activePolicy(): AggregatePolicyConfiguration {
  return {
    ...inactivePolicy,
    metrics: [
      {
        metricId: 'synthetic_patient_total',
        description: 'Synthetic approved metric',
        sourceEntities: ['identity.patients'],
        protectedUnit: 'patient',
        distinctSubjectKeyClass: 'patient_id',
        measure: 'distinct_subject_count',
        allowedDimensions: ['calendar_month_utc'],
        allowedCombinations: [['calendar_month_utc']],
        zeroPolicy: 'suppress',
        linkedReleaseGroup: 'synthetic-total',
        cellId: 'synthetic-total-cell',
        owner: 'SHIFAA Data Lead',
        approvalArtifactDigest: 'a'.repeat(64),
      },
    ],
    linkedReleaseGroups: [
      { groupId: 'synthetic-total', cellIds: ['synthetic-total-cell'], equations: [] },
    ],
  };
}

describe('audit admin summary', () => {
  it('returns legal-gate-disabled with no cell access when metrics are empty', async () => {
    const getCells = vi.fn();
    const service = makeService(inactivePolicy, [], getCells);

    await expect(service.getAdminSummary(actor)).rejects.toMatchObject({
      code: 'legal-gate-disabled',
      status: 503,
    } satisfies Partial<ApiPolicyError>);
    expect(getCells).not.toHaveBeenCalled();
  });

  it('authorizes before looking up server policy', async () => {
    const getApprovedPolicy = vi.fn();
    const service = makeService(inactivePolicy, [], vi.fn(), {
      canReadAdminSummary: vi.fn().mockResolvedValue(false),
      getApprovedPolicy,
    });

    await expect(service.getAdminSummary(actor)).rejects.toMatchObject({ code: 'forbidden' });
    expect(getApprovedPolicy).not.toHaveBeenCalled();
  });

  it('serializes approved suppression without the protected count', async () => {
    const policy = activePolicy();
    const cells: readonly AggregateCellInput[] = [
      {
        cellId: 'synthetic-total-cell',
        metricId: 'synthetic_patient_total',
        distinctSubjectCount: 10,
        measure: 'distinct_subject_count',
        dimensions: { calendar_month_utc: '2026-08' },
        completedPeriod: true,
        snapshotId: 'snapshot-008-001',
        snapshotVersion: 1,
      },
    ];

    const response = await makeService(policy, cells).getAdminSummary(actor);

    expect(response.data).toEqual([
      expect.objectContaining({ disclosure: 'suppressed', suppression_reason: 'small_cell' }),
    ]);
    expect(response.data[0]).not.toHaveProperty('distinct_subject_count');
    expect(JSON.stringify(response)).not.toContain('distinctSubjectCount');
  });

  it('releases only an approved k=11 server-side fixture', async () => {
    const policy = activePolicy();
    const response = await makeService(policy, [
      {
        cellId: 'synthetic-total-cell',
        metricId: 'synthetic_patient_total',
        distinctSubjectCount: 11,
        measure: 'distinct_subject_count',
        dimensions: { calendar_month_utc: '2026-08' },
        completedPeriod: true,
        snapshotId: 'snapshot-008-002',
        snapshotVersion: 1,
      },
    ]).getAdminSummary(actor);

    expect(response).toMatchObject({
      policy_id: 'OPEN-PRIV-001',
      policy_version: '1.0.0-approved',
      data: [{ disclosure: 'released', distinct_subject_count: 11, period: '2026-08' }],
    });
  });
});

function makeService(
  policyValue: AggregatePolicyConfiguration,
  cells: readonly AggregateCellInput[],
  getCells = vi.fn().mockResolvedValue(cells),
  overrides: {
    canReadAdminSummary?: AuditAdminRepository['canReadAdminSummary'];
    getApprovedPolicy?: () => Promise<unknown>;
  } = {},
): AuditAdminService {
  const repository = repositoryStub({
    canReadAdminSummary: overrides.canReadAdminSummary ?? vi.fn().mockResolvedValue(true),
  });
  const dependencies: AuditAdminServiceDependencies = {
    repository,
    policy: {
      getApprovedPolicy: overrides.getApprovedPolicy ?? vi.fn().mockResolvedValue(policyValue),
      getApprovedRuntimeConfigurationSha256: vi
        .fn()
        .mockResolvedValue(
          policyValue.metrics.length > 0
            ? runtimeAggregateConfigurationSha256(policyValue)
            : undefined,
        ),
    },
    aggregates: { getCells },
    clock: { now: () => new Date('2026-09-01T12:00:00.000Z') },
    cursorSecret: 'synthetic-cursor-secret-008-at-least-32-bytes',
  };
  return new AuditAdminService(dependencies);
}

function repositoryStub(overrides: Partial<AuditAdminRepository> = {}): AuditAdminRepository {
  return {
    canReadAdminSummary: vi.fn().mockResolvedValue(true),
    canReadAudit: vi.fn().mockResolvedValue(true),
    listRedactedAuditEvents: vi.fn().mockResolvedValue([]),
    getRedactedAuditEvent: vi.fn().mockResolvedValue(null),
    verifyAuditChain: vi.fn(),
    getAuditExportBatch: vi.fn().mockResolvedValue(null),
    requestAuditExport: vi.fn(),
    readiness: vi.fn(),
    ...overrides,
  };
}
