export type DashboardState =
  | 'loading'
  | 'empty'
  | 'gated'
  | 'suppressed'
  | 'stale'
  | 'offline'
  | 'permission'
  | 'error'
  | 'success';

export type SafeDashboardCell = Readonly<{
  metricId: string;
  period: string;
  dimensions: Readonly<Record<string, string>>;
  disclosure: 'released' | 'suppressed';
  releasedCount?: number;
  suppressionReason?: 'small_cell' | 'complementary' | 'linked_release';
  policyVersion: string;
  snapshotAt: string;
}>;

export type SafeDashboardSummary = Readonly<{
  policyId: 'OPEN-PRIV-001';
  policyVersion: '1.0.0-approved';
  cells: readonly SafeDashboardCell[];
  generatedAt: string;
}>;

const approvedDimensions = new Set([
  'calendar_month_utc',
  'facility_type',
  'approved_workflow_status_class',
]);
const boundedCode = /^[a-z][a-z0-9._-]{0,95}$/;
const boundedValue = /^[\p{L}\p{N} ._:-]{1,96}$/u;
const isoTimestamp = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;

export function parseAdminSummary(value: unknown): SafeDashboardSummary | null {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, ['policy_id', 'policy_version', 'data', 'generated_at'])
  )
    return null;
  if (
    value['policy_id'] !== 'OPEN-PRIV-001' ||
    value['policy_version'] !== '1.0.0-approved' ||
    !Array.isArray(value['data']) ||
    !safeTimestamp(value['generated_at'])
  )
    return null;

  const cells: SafeDashboardCell[] = [];
  for (const candidate of value['data']) {
    const cell = parseCell(candidate);
    if (!cell) return null;
    cells.push(cell);
  }
  return {
    policyId: 'OPEN-PRIV-001',
    policyVersion: '1.0.0-approved',
    cells,
    generatedAt: value['generated_at'],
  };
}

export function dashboardStateFor(summary: SafeDashboardSummary): DashboardState {
  if (summary.cells.length === 0) return 'empty';
  return summary.cells.every((cell) => cell.disclosure === 'suppressed') ? 'suppressed' : 'success';
}

export function dashboardProblemState(
  status: number,
  code: string | undefined,
  hasSafeSnapshot: boolean,
): DashboardState {
  if (code === 'legal-gate-disabled') return 'gated';
  if (status === 401 || status === 403) return 'permission';
  return hasSafeSnapshot ? 'stale' : 'error';
}

function parseCell(value: unknown): SafeDashboardCell | null {
  if (!isRecord(value)) return null;
  const allowedKeys = new Set([
    'metric_id',
    'period',
    'dimensions',
    'disclosure',
    'distinct_subject_count',
    'suppression_reason',
    'policy_version',
    'snapshot_at',
  ]);
  if (Object.keys(value).some((key) => !allowedKeys.has(key))) return null;
  if (
    typeof value['metric_id'] !== 'string' ||
    !boundedCode.test(value['metric_id']) ||
    typeof value['period'] !== 'string' ||
    !/^\d{4}-\d{2}-01$/.test(value['period']) ||
    !isSafeDimensions(value['dimensions']) ||
    (value['disclosure'] !== 'released' && value['disclosure'] !== 'suppressed') ||
    typeof value['policy_version'] !== 'string' ||
    value['policy_version'].length > 64 ||
    !safeTimestamp(value['snapshot_at'])
  )
    return null;

  if (value['disclosure'] === 'suppressed') {
    if ('distinct_subject_count' in value) return null;
    if (
      value['suppression_reason'] !== 'small_cell' &&
      value['suppression_reason'] !== 'complementary' &&
      value['suppression_reason'] !== 'linked_release'
    )
      return null;
    return {
      metricId: value['metric_id'],
      period: value['period'],
      dimensions: value['dimensions'],
      disclosure: 'suppressed',
      suppressionReason: value['suppression_reason'],
      policyVersion: value['policy_version'],
      snapshotAt: value['snapshot_at'],
    };
  }

  if (
    !Number.isSafeInteger(value['distinct_subject_count']) ||
    Number(value['distinct_subject_count']) < 11 ||
    'suppression_reason' in value
  )
    return null;
  return {
    metricId: value['metric_id'],
    period: value['period'],
    dimensions: value['dimensions'],
    disclosure: 'released',
    releasedCount: value['distinct_subject_count'] as number,
    policyVersion: value['policy_version'],
    snapshotAt: value['snapshot_at'],
  };
}

function isSafeDimensions(value: unknown): value is Record<string, string> {
  if (!isRecord(value) || Object.keys(value).length > 2) return false;
  let categoricalDimensions = 0;
  for (const [key, dimensionValue] of Object.entries(value)) {
    if (
      !approvedDimensions.has(key) ||
      typeof dimensionValue !== 'string' ||
      !boundedValue.test(dimensionValue)
    )
      return false;
    if (key !== 'calendar_month_utc') categoricalDimensions += 1;
  }
  return categoricalDimensions <= 1;
}

function safeTimestamp(value: unknown): value is string {
  return (
    typeof value === 'string' && isoTimestamp.test(value) && Number.isFinite(Date.parse(value))
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasExactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  return Object.keys(value).sort().join(',') === [...keys].sort().join(',');
}
