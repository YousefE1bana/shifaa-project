import { createHash } from 'node:crypto';

const APPROVED_POLICY_ID = 'OPEN-PRIV-001';
const APPROVED_PACKAGE_VERSION = '1.0.0-approved';
const APPROVED_PACKAGE_SHA256 = '38855c7319b6bcd06b491bf4213a277303a6d6e2c1ebe7499b65fdfa4ae15039';
const APPROVED_DIMENSIONS = new Set([
  'calendar_month_utc',
  'facility_type',
  'approved_workflow_status_class',
]);
const APPROVED_FACILITY_TYPES = new Set(['clinic', 'pharmacy', 'hospital', 'laboratory']);
export type AggregateMetricConfiguration = {
  metricId: string;
  description: string;
  sourceEntities: readonly string[];
  protectedUnit: 'patient' | 'person' | 'non_person_entity';
  distinctSubjectKeyClass: string;
  measure: 'distinct_subject_count' | 'approved_non_person_entity_count';
  allowedDimensions: readonly string[];
  allowedCombinations: readonly (readonly string[])[];
  statusMapping?: Readonly<Record<string, string>>;
  zeroPolicy: 'suppress' | 'release';
  higherThreshold?: number;
  linkedReleaseGroup: string;
  cellId: string;
  owner: string;
  approvalArtifactDigest: string;
};

export type AggregateEquation = {
  equationId: string;
  parentCellId: string;
  childCellIds: readonly string[];
  childrenMutuallyExclusive: boolean;
};

export type LinkedReleaseGroup = {
  groupId: string;
  cellIds: readonly string[];
  equations: readonly AggregateEquation[];
};

export type AggregatePolicyConfiguration = {
  policyId: string;
  packageVersion: string;
  packageSha256: string;
  policyStatus: string;
  threshold: {
    minimumReleasableDistinctSubjects: number;
    primarySuppressionMin: number;
    primarySuppressionMax: number;
    personDerivedZeroPolicy: string;
  };
  releaseRules: {
    fixedServerTemplatesOnly: boolean;
    completedPeriodsOnly: boolean;
    immutableClosedSnapshots: boolean;
    maxDimensions: number;
    maxCategoricalDimensions: number;
    complementarySuppression: string;
    linkedReleaseCheck: string;
    localeAndRoleBypass: string;
  };
  allowedTimeDimensions: readonly string[];
  allowedCategoricalDimensions: Readonly<Record<string, readonly string[]>>;
  allowedCombinations: readonly (readonly string[])[];
  metrics: readonly AggregateMetricConfiguration[];
  linkedReleaseGroups: readonly LinkedReleaseGroup[];
};

export type AggregateCellInput = {
  cellId: string;
  metricId: string;
  distinctSubjectCount: unknown;
  measure: string;
  dimensions?: Readonly<Record<string, string>>;
  completedPeriod?: boolean;
  snapshotId: string;
  snapshotVersion: number;
  lateDataArrival?: boolean;
};

export type AggregateDisclosureCell = {
  metricId: string;
  dimensions: Readonly<Record<string, string>>;
  disclosure: 'released' | 'suppressed';
  count?: number;
  reason?: 'small_cell' | 'complementary_suppression';
  policyVersion: string;
  snapshotVersion: number;
};

type EvaluatedAggregateCell = AggregateDisclosureCell & { internalCellId: string };

export type AggregateDisclosureResult = {
  decision: 'released' | 'mixed' | 'suppressed' | 'inactive' | 'rejected';
  reason: string;
  cells: readonly AggregateDisclosureCell[];
};

export type AggregateReleaseInput = {
  cells: readonly AggregateCellInput[];
  requestedOperation?: string;
  priorReleasedSnapshot?: { snapshotId: string; snapshotVersion: number };
};

type ValidationResult = { valid: true } | { valid: false; reason: string };

export function validateAggregatePolicy(
  value: unknown,
  approvedRuntimeConfigSha256?: string,
): ValidationResult & { activeMetricCount?: number } {
  if (!isRecord(value)) return { valid: false, reason: 'unknown_configuration' };
  if (!hasOnlyKeys(value, POLICY_KEYS)) return { valid: false, reason: 'unknown_configuration' };
  const config = value as Partial<AggregatePolicyConfiguration>;
  if (!approvedPolicyIdentity(config)) return { valid: false, reason: 'inactive_configuration' };
  if (!validPolicyControls(config)) return { valid: false, reason: 'unknown_configuration' };
  if (!Array.isArray(config.metrics) || !Array.isArray(config.linkedReleaseGroups))
    return { valid: false, reason: 'unknown_configuration' };
  if (
    config.metrics.length > 0 &&
    approvedRuntimeConfigSha256 !== runtimeAggregateConfigurationSha256(value)
  )
    return { valid: false, reason: 'inactive_configuration' };
  const entries = validateConfigurationEntries(config.metrics, config.linkedReleaseGroups, config);
  return entries.valid ? { valid: true, activeMetricCount: config.metrics.length } : entries;
}

const POLICY_KEYS = [
  'policyId',
  'packageVersion',
  'packageSha256',
  'policyStatus',
  'threshold',
  'releaseRules',
  'allowedTimeDimensions',
  'allowedCategoricalDimensions',
  'allowedCombinations',
  'metrics',
  'linkedReleaseGroups',
] as const;

function approvedPolicyIdentity(config: Partial<AggregatePolicyConfiguration>): boolean {
  return (
    config.policyId === APPROVED_POLICY_ID &&
    config.packageVersion === APPROVED_PACKAGE_VERSION &&
    config.packageSha256 === APPROVED_PACKAGE_SHA256 &&
    config.policyStatus === 'approved'
  );
}

function validateConfigurationEntries(
  metrics: readonly AggregateMetricConfiguration[],
  groups: readonly LinkedReleaseGroup[],
  config: Partial<AggregatePolicyConfiguration>,
): ValidationResult {
  const metricIds = new Set<string>();
  const cellIds = new Set<string>();
  for (const metric of metrics) {
    const result = validateMetric(metric, config);
    if (!result.valid) return result;
    if (metricIds.has(metric.metricId) || cellIds.has(metric.cellId))
      return { valid: false, reason: 'unknown_configuration' };
    metricIds.add(metric.metricId);
    cellIds.add(metric.cellId);
  }
  const groupIds = new Set<string>();
  const cellsByGroup = new Map<string, Set<string>>();
  for (const group of groups) {
    if (!validLinkedReleaseGroup(group) || groupIds.has(group.groupId))
      return { valid: false, reason: 'invalid_linked_release_group' };
    if (group.cellIds.some((cellId) => !cellIds.has(cellId)))
      return { valid: false, reason: 'invalid_linked_release_group' };
    groupIds.add(group.groupId);
    cellsByGroup.set(group.groupId, new Set(group.cellIds));
  }
  if (metrics.some((metric) => !cellsByGroup.get(metric.linkedReleaseGroup)?.has(metric.cellId)))
    return { valid: false, reason: 'invalid_linked_release_group' };
  return { valid: true };
}

export function discloseAggregateRelease(
  value: unknown,
  input: AggregateReleaseInput,
  approvedRuntimeConfigSha256?: string,
): AggregateDisclosureResult {
  const validation = validateAggregatePolicy(value, approvedRuntimeConfigSha256);
  if (!validation.valid) return rejected(validation.reason);
  const config = value as AggregatePolicyConfiguration;
  if (config.metrics.length === 0)
    return { decision: 'inactive', reason: 'no_active_metrics', cells: [] };
  if (!summaryOperationAllowed(input.requestedOperation))
    return rejected('operation_not_authorized');
  const uniqueCells = uniqueReleaseCells(input.cells);
  if (!uniqueCells.valid) return rejected(uniqueCells.reason);
  const primary = disclosePrimaryCells(config, [...uniqueCells.cells.values()], input);
  if (!primary.valid) return rejected(primary.reason);
  const complementary = applyComplementarySuppression(config, primary.cells);
  if (!complementary.valid) return rejected(complementary.reason);
  return disclosureResult(complementary.cells);
}

export function runtimeAggregateConfigurationSha256(value: unknown): string {
  return createHash('sha256').update(stableJson(value), 'utf8').digest('hex');
}

function disclosePrimaryCells(
  config: AggregatePolicyConfiguration,
  cells: readonly AggregateCellInput[],
  input: AggregateReleaseInput,
): { valid: true; cells: EvaluatedAggregateCell[] } | { valid: false; reason: string } {
  const metricById = new Map(config.metrics.map((metric) => [metric.metricId, metric]));
  if (cells.length !== config.metrics.length)
    return { valid: false, reason: 'unknown_configuration' };
  const disclosed: EvaluatedAggregateCell[] = [];
  for (const cell of cells) {
    const metric = metricById.get(cell.metricId);
    if (!metric || metric.cellId !== cell.cellId)
      return { valid: false, reason: 'unknown_configuration' };
    const cellValidation = validateCell(cell, metric, input.priorReleasedSnapshot);
    if (!cellValidation.valid) return cellValidation;
    disclosed.push(disclosePrimaryCell(config, metric, cell));
  }
  return { valid: true, cells: disclosed };
}

function disclosePrimaryCell(
  config: AggregatePolicyConfiguration,
  metric: AggregateMetricConfiguration,
  cell: AggregateCellInput,
): EvaluatedAggregateCell {
  const count = cell.distinctSubjectCount as number;
  const threshold = metric.higherThreshold ?? config.threshold.minimumReleasableDistinctSubjects;
  const base = disclosureCellBase(config, cell);
  return count < threshold
    ? { ...base, disclosure: 'suppressed', reason: 'small_cell' }
    : { ...base, disclosure: 'released', count };
}

function disclosureResult(cells: readonly EvaluatedAggregateCell[]): AggregateDisclosureResult {
  const releasedCount = cells.filter(({ disclosure }) => disclosure === 'released').length;
  const decision =
    releasedCount === cells.length ? 'released' : releasedCount === 0 ? 'suppressed' : 'mixed';
  return {
    decision,
    reason: decisionReason(cells),
    cells: cells.map(({ internalCellId: _internalCellId, ...cell }) => cell),
  };
}

function summaryOperationAllowed(operation: string | undefined): boolean {
  return operation === undefined || operation === 'summary';
}

function uniqueReleaseCells(
  cells: readonly AggregateCellInput[],
): { valid: true; cells: Map<string, AggregateCellInput> } | { valid: false; reason: string } {
  const cellsById = new Map<string, AggregateCellInput>();
  for (const cell of cells) {
    const existing = cellsById.get(cell.cellId);
    if (existing && stableJson(existing) !== stableJson(cell))
      return { valid: false, reason: 'invalid_linked_release_group' };
    cellsById.set(cell.cellId, cell);
  }
  return { valid: true, cells: cellsById };
}

function disclosureCellBase(config: AggregatePolicyConfiguration, cell: AggregateCellInput) {
  return {
    internalCellId: cell.cellId,
    metricId: cell.metricId,
    dimensions: cell.dimensions ?? {},
    policyVersion: config.packageVersion,
    snapshotVersion: cell.snapshotVersion,
  };
}

function validPolicyControls(config: Partial<AggregatePolicyConfiguration>): boolean {
  return (
    validThreshold(config.threshold) &&
    validReleaseRules(config.releaseRules) &&
    equalStringArray(config.allowedTimeDimensions, ['calendar_month_utc']) &&
    equalStringArray(config.allowedCategoricalDimensions?.['facility_type'], [
      'clinic',
      'pharmacy',
      'hospital',
      'laboratory',
    ]) &&
    isRecord(config.allowedCategoricalDimensions) &&
    hasOnlyKeys(config.allowedCategoricalDimensions, [
      'facility_type',
      'approved_workflow_status_class',
    ]) &&
    equalStringArray(config.allowedCategoricalDimensions?.['approved_workflow_status_class'], []) &&
    sameCombinations(config.allowedCombinations, [
      [],
      ['calendar_month_utc'],
      ['facility_type'],
      ['approved_workflow_status_class'],
      ['calendar_month_utc', 'facility_type'],
      ['calendar_month_utc', 'approved_workflow_status_class'],
    ])
  );
}

function validThreshold(threshold: AggregatePolicyConfiguration['threshold'] | undefined): boolean {
  return (
    !!threshold &&
    hasOnlyKeys(threshold, [
      'minimumReleasableDistinctSubjects',
      'primarySuppressionMin',
      'primarySuppressionMax',
      'personDerivedZeroPolicy',
    ]) &&
    threshold.minimumReleasableDistinctSubjects === 11 &&
    threshold.primarySuppressionMin === 0 &&
    threshold.primarySuppressionMax === 10 &&
    threshold.personDerivedZeroPolicy === 'suppress'
  );
}

function validReleaseRules(
  rules: AggregatePolicyConfiguration['releaseRules'] | undefined,
): boolean {
  return (
    !!rules &&
    hasOnlyKeys(rules, [
      'fixedServerTemplatesOnly',
      'completedPeriodsOnly',
      'immutableClosedSnapshots',
      'maxDimensions',
      'maxCategoricalDimensions',
      'complementarySuppression',
      'linkedReleaseCheck',
      'localeAndRoleBypass',
    ]) &&
    rules.fixedServerTemplatesOnly &&
    rules.completedPeriodsOnly &&
    rules.immutableClosedSnapshots &&
    rules.maxDimensions === 2 &&
    rules.maxCategoricalDimensions === 1 &&
    rules.complementarySuppression === 'required' &&
    rules.linkedReleaseCheck === 'required' &&
    rules.localeAndRoleBypass === 'prohibited'
  );
}

function validateMetric(
  metric: unknown,
  config: Partial<AggregatePolicyConfiguration>,
): ValidationResult {
  if (!isRecord(metric)) return { valid: false, reason: 'unknown_configuration' };
  if (!hasOnlyKeys(metric, METRIC_KEYS)) return { valid: false, reason: 'unknown_configuration' };
  const candidate = metric as Partial<AggregateMetricConfiguration>;
  const identity = validateMetricIdentity(candidate);
  if (!identity.valid) return identity;
  const dimensions = validateMetricDimensions(candidate, config);
  if (!dimensions.valid) return dimensions;
  return validateMetricMeasure(candidate);
}

const METRIC_KEYS = [
  'metricId',
  'description',
  'sourceEntities',
  'protectedUnit',
  'distinctSubjectKeyClass',
  'measure',
  'allowedDimensions',
  'allowedCombinations',
  'statusMapping',
  'zeroPolicy',
  'higherThreshold',
  'linkedReleaseGroup',
  'cellId',
  'owner',
  'approvalArtifactDigest',
] as const;

function validateMetricIdentity(
  candidate: Partial<AggregateMetricConfiguration>,
): ValidationResult {
  const strings = [
    candidate.metricId,
    candidate.description,
    candidate.distinctSubjectKeyClass,
    candidate.linkedReleaseGroup,
    candidate.cellId,
    candidate.owner,
    candidate.approvalArtifactDigest,
  ];
  if (strings.some((item) => typeof item !== 'string' || item.length === 0)) {
    return { valid: false, reason: 'inactive_configuration' };
  }
  if (!nonEmptyStrings(candidate.sourceEntities)) {
    return { valid: false, reason: 'inactive_configuration' };
  }
  if (!/^[a-f0-9]{64}$/.test(candidate.approvalArtifactDigest ?? ''))
    return { valid: false, reason: 'inactive_configuration' };
  return { valid: true };
}

function validateMetricDimensions(
  candidate: Partial<AggregateMetricConfiguration>,
  config: Partial<AggregatePolicyConfiguration>,
): ValidationResult {
  if (
    !Array.isArray(candidate.allowedDimensions) ||
    !Array.isArray(candidate.allowedCombinations)
  ) {
    return { valid: false, reason: 'unknown_configuration' };
  }
  const allowedDimensions = candidate.allowedDimensions as readonly string[];
  const allowedCombinations = candidate.allowedCombinations as readonly (readonly string[])[];
  if (
    !nonEmptyStrings(allowedDimensions) ||
    allowedCombinations.some((combination) => !stringArray(combination))
  ) {
    return { valid: false, reason: 'unknown_configuration' };
  }
  if (allowedDimensions.some((dimension) => !APPROVED_DIMENSIONS.has(dimension))) {
    return { valid: false, reason: 'prohibited_dimension' };
  }
  if (
    allowedCombinations.some(
      (combination) =>
        !containsCombination(config.allowedCombinations, combination) ||
        combination.some((dimension) => !allowedDimensions.includes(dimension)),
    )
  ) {
    return { valid: false, reason: 'prohibited_dimension' };
  }
  if (
    allowedDimensions.includes('approved_workflow_status_class') &&
    (!candidate.statusMapping || Object.keys(candidate.statusMapping).length === 0)
  )
    return { valid: false, reason: 'status_mapping_missing' };
  return { valid: true };
}

function validateMetricMeasure(candidate: Partial<AggregateMetricConfiguration>): ValidationResult {
  if (candidate.protectedUnit === 'patient' || candidate.protectedUnit === 'person') {
    if (candidate.measure !== 'distinct_subject_count') {
      return { valid: false, reason: 'person_measure_not_distinct_subject_count' };
    }
    if (candidate.zeroPolicy !== 'suppress') {
      return { valid: false, reason: 'protected_unit_or_zero_policy_missing' };
    }
  } else if (
    candidate.protectedUnit !== 'non_person_entity' ||
    candidate.measure !== 'approved_non_person_entity_count' ||
    candidate.zeroPolicy === undefined
  ) {
    return { valid: false, reason: 'protected_unit_or_zero_policy_missing' };
  }
  if (
    candidate.higherThreshold !== undefined &&
    (!Number.isSafeInteger(candidate.higherThreshold) || candidate.higherThreshold < 11)
  ) {
    return { valid: false, reason: 'invalid_count' };
  }
  return { valid: true };
}

function validateCell(
  cell: AggregateCellInput,
  metric: AggregateMetricConfiguration,
  prior: AggregateReleaseInput['priorReleasedSnapshot'],
): ValidationResult {
  if (
    typeof cell.snapshotId !== 'string' ||
    cell.snapshotId.length === 0 ||
    !Number.isSafeInteger(cell.snapshotVersion) ||
    cell.snapshotVersion < 1
  )
    return { valid: false, reason: 'unknown_configuration' };
  if (!validProtectedCount(cell.distinctSubjectCount))
    return { valid: false, reason: 'invalid_count' };
  if (cell.measure !== metric.measure) {
    return { valid: false, reason: 'person_measure_not_distinct_subject_count' };
  }
  if (snapshotChanged(cell, prior))
    return { valid: false, reason: 'immutable_snapshot_requires_new_version' };
  return validateCellDimensions(cell, metric);
}

function validProtectedCount(count: unknown): count is number {
  return typeof count === 'number' && Number.isSafeInteger(count) && count >= 0;
}

function snapshotChanged(
  cell: AggregateCellInput,
  prior: AggregateReleaseInput['priorReleasedSnapshot'],
): boolean {
  return (
    cell.lateDataArrival === true ||
    (!!prior &&
      prior.snapshotId === cell.snapshotId &&
      prior.snapshotVersion !== cell.snapshotVersion)
  );
}

function validateCellDimensions(
  cell: AggregateCellInput,
  metric: AggregateMetricConfiguration,
): ValidationResult {
  const dimensions = cell.dimensions ?? {};
  if (
    !isRecord(dimensions) ||
    !Object.values(dimensions).every((entry) => typeof entry === 'string')
  )
    return { valid: false, reason: 'unknown_configuration' };
  const names = Object.keys(dimensions).sort();
  if (names.length > 2) return { valid: false, reason: 'too_many_dimensions' };
  if (
    names.some((name) => !APPROVED_DIMENSIONS.has(name) || !metric.allowedDimensions.includes(name))
  ) {
    return { valid: false, reason: 'prohibited_dimension' };
  }
  if (names.filter((name) => name !== 'calendar_month_utc').length > 1) {
    return { valid: false, reason: 'two_categorical_dimensions' };
  }
  if (!containsCombination(metric.allowedCombinations, names)) {
    return { valid: false, reason: 'prohibited_dimension' };
  }
  if ('calendar_month_utc' in dimensions) {
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(dimensions['calendar_month_utc'] ?? '')) {
      return { valid: false, reason: 'prohibited_time_definition' };
    }
    if (cell.completedPeriod !== true) return { valid: false, reason: 'incomplete_period' };
  }
  if (
    'facility_type' in dimensions &&
    !APPROVED_FACILITY_TYPES.has(dimensions['facility_type'] ?? '')
  ) {
    return { valid: false, reason: 'unknown_configuration' };
  }
  if (
    'approved_workflow_status_class' in dimensions &&
    !Object.values(metric.statusMapping ?? {}).includes(
      dimensions['approved_workflow_status_class'] ?? '',
    )
  ) {
    return { valid: false, reason: 'status_mapping_missing' };
  }
  return { valid: true };
}

function applyComplementarySuppression(
  config: AggregatePolicyConfiguration,
  cells: EvaluatedAggregateCell[],
): { valid: true; cells: EvaluatedAggregateCell[] } | { valid: false; reason: string } {
  const byId = new Map(cells.map((cell) => [cell.internalCellId, cell]));
  for (const group of [...config.linkedReleaseGroups].sort((a, b) =>
    a.groupId.localeCompare(b.groupId),
  )) {
    if (!validLinkedReleaseGroup(group) || group.cellIds.some((cellId) => !byId.has(cellId))) {
      return { valid: false, reason: 'invalid_linked_release_group' };
    }
    suppressParentTotals(byId, group.equations);
  }
  return { valid: true, cells: [...byId.values()] };
}

function suppressParentTotals(
  cellsById: Map<string, EvaluatedAggregateCell>,
  configuredEquations: readonly AggregateEquation[],
): void {
  const equations = [...configuredEquations].sort((a, b) =>
    a.equationId.localeCompare(b.equationId),
  );
  let changed = true;
  while (changed)
    changed = equations.some((equation) => suppressEquationParent(cellsById, equation));
}

function suppressEquationParent(
  cellsById: Map<string, EvaluatedAggregateCell>,
  equation: AggregateEquation,
): boolean {
  if (!equation.childCellIds.some((id) => cellsById.get(id)?.disclosure === 'suppressed'))
    return false;
  const parent = cellsById.get(equation.parentCellId);
  if (parent?.disclosure !== 'released') return false;
  const { count: _releasedCount, ...protectedParent } = parent;
  cellsById.set(equation.parentCellId, {
    ...protectedParent,
    disclosure: 'suppressed',
    reason: 'complementary_suppression',
  });
  return true;
}

function validLinkedReleaseGroup(value: unknown): value is LinkedReleaseGroup {
  if (!isRecord(value) || !hasOnlyKeys(value, ['groupId', 'cellIds', 'equations'])) return false;
  const group = value as Partial<LinkedReleaseGroup>;
  if (!validLinkedGroupHeader(group)) return false;
  const graph = linkedEquationGraph(group);
  return graph !== undefined && !hasCycle(graph);
}

function validLinkedGroupHeader(group: Partial<LinkedReleaseGroup>): group is LinkedReleaseGroup {
  return (
    typeof group.groupId === 'string' &&
    group.groupId.length > 0 &&
    nonEmptyStrings(group.cellIds) &&
    new Set(group.cellIds).size === group.cellIds.length &&
    Array.isArray(group.equations) &&
    (group.cellIds.length === 1 || group.equations.length > 0)
  );
}

function linkedEquationGraph(group: LinkedReleaseGroup): Map<string, Set<string>> | undefined {
  const equationIds = new Set<string>();
  const parents = new Set<string>();
  const edges = new Map<string, Set<string>>();
  for (const equation of group.equations) {
    const candidate = equation as Partial<AggregateEquation>;
    if (!validEquation(candidate, group, equationIds, parents)) return undefined;
    equationIds.add(candidate.equationId);
    parents.add(candidate.parentCellId);
    edges.set(candidate.parentCellId, new Set(candidate.childCellIds));
  }
  return edges;
}

function validEquation(
  equation: Partial<AggregateEquation>,
  group: LinkedReleaseGroup,
  equationIds: Set<string>,
  parents: Set<string>,
): equation is AggregateEquation {
  return (
    isRecord(equation) &&
    hasOnlyKeys(equation, [
      'equationId',
      'parentCellId',
      'childCellIds',
      'childrenMutuallyExclusive',
    ]) &&
    typeof equation.equationId === 'string' &&
    equation.equationId.length > 0 &&
    !equationIds.has(equation.equationId) &&
    typeof equation.parentCellId === 'string' &&
    !parents.has(equation.parentCellId) &&
    Array.isArray(equation.childCellIds) &&
    equation.childCellIds.length >= 2 &&
    new Set(equation.childCellIds).size === equation.childCellIds.length &&
    equation.childrenMutuallyExclusive === true &&
    group.cellIds.includes(equation.parentCellId) &&
    equation.childCellIds.every((id) => group.cellIds.includes(id) && id !== equation.parentCellId)
  );
}

function hasCycle(edges: Map<string, Set<string>>): boolean {
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const visit = (node: string): boolean => {
    if (visiting.has(node)) return true;
    if (visited.has(node)) return false;
    visiting.add(node);
    for (const child of edges.get(node) ?? []) if (visit(child)) return true;
    visiting.delete(node);
    visited.add(node);
    return false;
  };
  return [...edges.keys()].some(visit);
}

function decisionReason(cells: readonly AggregateDisclosureCell[]): string {
  if (cells.some(({ reason }) => reason === 'complementary_suppression')) {
    return 'parent_total_complementary';
  }
  if (cells.some(({ disclosure }) => disclosure === 'suppressed')) return 'small_cell';
  return 'threshold_met';
}

function rejected(reason: string): AggregateDisclosureResult {
  return { decision: 'rejected', reason, cells: [] };
}

function containsCombination(
  combinations: readonly (readonly string[])[] | undefined,
  sought: readonly string[],
): boolean {
  const normalized = [...sought].sort().join('|');
  return (
    combinations?.some((combination) => [...combination].sort().join('|') === normalized) ?? false
  );
}

function sameCombinations(
  actual: readonly (readonly string[])[] | undefined,
  expected: readonly (readonly string[])[],
): boolean {
  if (!actual || actual.length !== expected.length) return false;
  return expected.every((combination) => containsCombination(actual, combination));
}

function equalStringArray(
  actual: readonly string[] | undefined,
  expected: readonly string[],
): boolean {
  return (
    !!actual &&
    actual.length === expected.length &&
    actual.every((item, index) => item === expected[index])
  );
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (isRecord(value)) {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasOnlyKeys(value: object, allowed: readonly string[]): boolean {
  const allowedSet = new Set(allowed);
  return Object.keys(value).every((key) => allowedSet.has(key));
}

function nonEmptyStrings(value: unknown): value is readonly string[] {
  return stringArray(value) && value.length > 0;
}

function stringArray(value: unknown): value is readonly string[] {
  return (
    Array.isArray(value) && value.every((entry) => typeof entry === 'string' && entry.length > 0)
  );
}
