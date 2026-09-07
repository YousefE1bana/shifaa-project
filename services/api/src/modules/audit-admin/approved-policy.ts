import type { AggregatePolicyConfiguration } from '@shifaa/core/audit-admin/aggregate-policy';

export const approvedInactiveAggregatePolicy: AggregatePolicyConfiguration = {
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
