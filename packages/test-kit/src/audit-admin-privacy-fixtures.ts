export const auditAdminApprovedPrivacyPolicy = {
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
} as const;

export type AuditAdminPrivacyVectorClass =
  | 'boundary'
  | 'distinct-subject'
  | 'dimension'
  | 'complementary-suppression'
  | 'linked-release'
  | 'locale'
  | 'authorization'
  | 'configuration'
  | 'side-channel'
  | 'retry'
  | 'snapshot'
  | 'summary-operation'
  | 'measure';

export type AuditAdminPrivacyExpectedDecision = {
  decision: 'RELEASE' | 'SUPPRESS' | 'REJECT' | 'MIXED';
  reason: string;
  protectedCount?: number;
  releasedCells?: readonly string[];
  suppressedCells?: readonly string[];
};

export type AuditAdminPrivacyVector = {
  id: `TV-PRIV-001-${string}`;
  vectorClass: AuditAdminPrivacyVectorClass;
  fixture: Readonly<Record<string, unknown>>;
  expected: AuditAdminPrivacyExpectedDecision;
};

export const auditAdminPrivacyVectors = [
  {
    id: 'TV-PRIV-001-001',
    vectorClass: 'boundary',
    fixture: { distinctSubjectCount: 0 },
    expected: { decision: 'SUPPRESS', reason: 'small_cell', protectedCount: 0 },
  },
  {
    id: 'TV-PRIV-001-002',
    vectorClass: 'boundary',
    fixture: { distinctSubjectCount: 1 },
    expected: { decision: 'SUPPRESS', reason: 'small_cell', protectedCount: 1 },
  },
  {
    id: 'TV-PRIV-001-003',
    vectorClass: 'boundary',
    fixture: { distinctSubjectCount: 10 },
    expected: { decision: 'SUPPRESS', reason: 'small_cell', protectedCount: 10 },
  },
  {
    id: 'TV-PRIV-001-004',
    vectorClass: 'boundary',
    fixture: { distinctSubjectCount: 11, linkedDerivationRisk: false },
    expected: { decision: 'RELEASE', reason: 'threshold_met', protectedCount: 11 },
  },
  {
    id: 'TV-PRIV-001-005',
    vectorClass: 'boundary',
    fixture: { distinctSubjectCount: 12, linkedDerivationRisk: false },
    expected: { decision: 'RELEASE', reason: 'threshold_met', protectedCount: 12 },
  },
  {
    id: 'TV-PRIV-001-006',
    vectorClass: 'distinct-subject',
    fixture: { eventCount: 20, distinctSubjectCount: 1 },
    expected: { decision: 'SUPPRESS', reason: 'small_cell', protectedCount: 1 },
  },
  {
    id: 'TV-PRIV-001-007',
    vectorClass: 'distinct-subject',
    fixture: { eventCount: 15, distinctSubjectCount: 10 },
    expected: { decision: 'SUPPRESS', reason: 'small_cell', protectedCount: 10 },
  },
  {
    id: 'TV-PRIV-001-008',
    vectorClass: 'distinct-subject',
    fixture: { eventCount: 40, distinctSubjectCount: 11 },
    expected: { decision: 'RELEASE', reason: 'distinct_subject_measure', protectedCount: 11 },
  },
  {
    id: 'TV-PRIV-001-009',
    vectorClass: 'dimension',
    fixture: { dimensions: { facility_type: 'hospital' }, distinctSubjectCount: 10 },
    expected: { decision: 'SUPPRESS', reason: 'small_cell', protectedCount: 10 },
  },
  {
    id: 'TV-PRIV-001-010',
    vectorClass: 'dimension',
    fixture: {
      dimensions: { calendar_month_utc: '2026-07', facility_type: 'hospital' },
      distinctSubjectCount: 11,
      completedPeriod: true,
    },
    expected: { decision: 'RELEASE', reason: 'approved_dimension_combination', protectedCount: 11 },
  },
  {
    id: 'TV-PRIV-001-011',
    vectorClass: 'dimension',
    fixture: { dimensions: { facility_id: '80000000-0000-4000-8000-000000000001' }, count: 200 },
    expected: { decision: 'REJECT', reason: 'prohibited_dimension' },
  },
  {
    id: 'TV-PRIV-001-012',
    vectorClass: 'dimension',
    fixture: {
      attemptedDimensions: ['governorate', 'city', 'district', 'coordinates'],
      count: 200,
    },
    expected: { decision: 'REJECT', reason: 'prohibited_geography' },
  },
  {
    id: 'TV-PRIV-001-013',
    vectorClass: 'dimension',
    fixture: { dimensions: ['facility_type', 'approved_workflow_status_class'] },
    expected: { decision: 'REJECT', reason: 'two_categorical_dimensions' },
  },
  {
    id: 'TV-PRIV-001-014',
    vectorClass: 'dimension',
    fixture: {
      dimensions: ['calendar_month_utc', 'facility_type', 'approved_workflow_status_class'],
    },
    expected: { decision: 'REJECT', reason: 'too_many_dimensions' },
  },
  {
    id: 'TV-PRIV-001-015',
    vectorClass: 'dimension',
    fixture: { period: 'current_month', completedPeriod: false },
    expected: { decision: 'REJECT', reason: 'incomplete_period' },
  },
  {
    id: 'TV-PRIV-001-016',
    vectorClass: 'dimension',
    fixture: { period: 'rolling_30_day_or_arbitrary_range' },
    expected: { decision: 'REJECT', reason: 'prohibited_time_definition' },
  },
  {
    id: 'TV-PRIV-001-017',
    vectorClass: 'dimension',
    fixture: { period: 'quarter_cumulative_alternate_or_overlapping' },
    expected: { decision: 'REJECT', reason: 'prohibited_time_definition' },
  },
  {
    id: 'TV-PRIV-001-018',
    vectorClass: 'complementary-suppression',
    fixture: { equation: 'T=A+B', counts: { A: 10, B: 90, T: 100 } },
    expected: {
      decision: 'MIXED',
      reason: 'parent_total_complementary',
      releasedCells: ['B'],
      suppressedCells: ['A', 'T'],
    },
  },
  {
    id: 'TV-PRIV-001-019',
    vectorClass: 'complementary-suppression',
    fixture: { equation: 'T=A+B+C', counts: { A: 9, B: 11, C: 80, T: 100 } },
    expected: {
      decision: 'MIXED',
      reason: 'parent_total_complementary',
      releasedCells: ['B', 'C'],
      suppressedCells: ['A', 'T'],
    },
  },
  {
    id: 'TV-PRIV-001-020',
    vectorClass: 'linked-release',
    fixture: {
      linkedCards: ['card_ar', 'card_en'],
      equation: 'T=X+Y',
      counts: { T: 100, X: 7, Y: 93 },
    },
    expected: {
      decision: 'MIXED',
      reason: 'linked_release',
      releasedCells: ['Y'],
      suppressedCells: ['T', 'X'],
    },
  },
  {
    id: 'TV-PRIV-001-021',
    vectorClass: 'locale',
    fixture: { locales: ['ar-EG', 'en-EG'], immutableSnapshot: 'snapshot-001' },
    expected: { decision: 'RELEASE', reason: 'locale_equivalent' },
  },
  {
    id: 'TV-PRIV-001-022',
    vectorClass: 'authorization',
    fixture: {
      roles: ['super_admin', 'project_dpo_privacy_decision_owner'],
      bypassRequested: true,
    },
    expected: { decision: 'REJECT', reason: 'role_bypass_prohibited' },
  },
  {
    id: 'TV-PRIV-001-023',
    vectorClass: 'configuration',
    fixture: { unknown: ['metric', 'dimension', 'category', 'combination'] },
    expected: { decision: 'REJECT', reason: 'unknown_configuration' },
  },
  {
    id: 'TV-PRIV-001-024',
    vectorClass: 'configuration',
    fixture: { invalidApproval: ['missing', 'conditional', 'digest_mismatch', 'not_approved'] },
    expected: { decision: 'REJECT', reason: 'inactive_configuration' },
  },
  {
    id: 'TV-PRIV-001-025',
    vectorClass: 'boundary',
    fixture: { invalidCounts: [-1, 1.5, null, 'indeterminate', 'overflow'] },
    expected: { decision: 'REJECT', reason: 'invalid_count' },
  },
  {
    id: 'TV-PRIV-001-026',
    vectorClass: 'side-channel',
    fixture: {
      inspectedChannels: [
        'response',
        'problem',
        'log',
        'trace',
        'metric',
        'cache_key',
        'etag',
        'tooltip',
        'accessible_name',
      ],
      suppressedCount: 10,
      subjectIdentifier: '80000000-0000-4000-8000-000000000002',
    },
    expected: { decision: 'SUPPRESS', reason: 'no_side_channel_disclosure' },
  },
  {
    id: 'TV-PRIV-001-027',
    vectorClass: 'retry',
    fixture: { attempts: 2, immutableSnapshot: 'snapshot-001', policyVersion: '1.0.0-approved' },
    expected: { decision: 'RELEASE', reason: 'byte_equivalent_retry' },
  },
  {
    id: 'TV-PRIV-001-028',
    vectorClass: 'snapshot',
    fixture: { releasedSnapshot: 'snapshot-001', lateDataArrival: true },
    expected: { decision: 'REJECT', reason: 'immutable_snapshot_requires_new_version' },
  },
  {
    id: 'TV-PRIV-001-029',
    vectorClass: 'configuration',
    fixture: { dimension: 'approved_workflow_status_class', statusMapping: null },
    expected: { decision: 'REJECT', reason: 'status_mapping_missing' },
  },
  {
    id: 'TV-PRIV-001-030',
    vectorClass: 'summary-operation',
    fixture: { attemptedOperation: ['drill_down', 'search', 'pagination', 'filter', 'export'] },
    expected: { decision: 'REJECT', reason: 'operation_not_authorized' },
  },
  {
    id: 'TV-PRIV-001-031',
    vectorClass: 'configuration',
    fixture: { nonPersonMetric: true, protectedUnit: null, zeroPolicy: null },
    expected: { decision: 'REJECT', reason: 'protected_unit_or_zero_policy_missing' },
  },
  {
    id: 'TV-PRIV-001-032',
    vectorClass: 'boundary',
    fixture: { distinctSubjectCount: 19, higherThreshold: 20 },
    expected: { decision: 'SUPPRESS', reason: 'higher_threshold', protectedCount: 19 },
  },
  {
    id: 'TV-PRIV-001-033',
    vectorClass: 'measure',
    fixture: {
      distinctSubjectCount: 11,
      requestedMeasure: ['event_count', 'encounter_count', 'record_count', 'audit_row_count'],
    },
    expected: { decision: 'REJECT', reason: 'person_measure_not_distinct_subject_count' },
  },
  {
    id: 'TV-PRIV-001-034',
    vectorClass: 'linked-release',
    fixture: {
      invalidGraph: [
        'missing_equation',
        'two_parents',
        'nonexclusive_children',
        'derivable_after_fixed_point',
      ],
    },
    expected: { decision: 'REJECT', reason: 'invalid_linked_release_group' },
  },
] as const satisfies readonly AuditAdminPrivacyVector[];
