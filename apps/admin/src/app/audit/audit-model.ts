export type AuditWorkspaceState =
  | 'aal-required'
  | 'purpose-required'
  | 'loading'
  | 'empty'
  | 'permission'
  | 'offline'
  | 'stale'
  | 'error'
  | 'success';

export type ExportUiState =
  | 'idle'
  | 'submitting'
  | 'queued'
  | 'retrying'
  | 'failed'
  | 'dead_letter'
  | 'proven'
  | 'offline'
  | 'conflict';

export type SafeAuditEvent = Readonly<{
  eventId: string;
  occurredAt: string;
  requestId: string;
  traceId: string;
  authenticationAal: 1 | 2 | null;
  purposeCode: string | null;
  actionCode: string;
  resourceType: string;
  resourceId: string | null;
  resourceVersion: number | null;
  outcome: 'success' | 'denied' | 'failed';
  reasonCode: string | null;
  sourceIpPrefix: string | null;
  userAgentClass: 'web' | 'mobile' | 'service' | 'worker' | 'system' | 'unknown' | null;
  chain: Readonly<{
    version: 1;
    partition: string;
    sequence: number;
    previousHash: string;
    eventHash: string;
    verification: 'verified' | 'failed';
  }>;
}>;

export type SafeAuditPage = Readonly<{
  events: readonly SafeAuditEvent[];
  nextCursor: string | null;
}>;

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const code = /^[a-z][a-z0-9._:-]{0,127}$/i;
const trace = /^(?:[0-9a-f]{32}|[a-z][a-z0-9._:-]{0,95})$/i;
const hash = /^[a-f0-9]{64}$/;
const ipPrefix = /^(?:\d{1,3}\.){3}\d{1,3}\/\d{1,2}$|^[0-9a-f:]+\/\d{1,3}$/i;
const userAgentClasses = new Set(['web', 'mobile', 'service', 'worker', 'system', 'unknown']);

export function parseAuditPage(value: unknown): SafeAuditPage | null {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, ['data', 'meta']) ||
    !Array.isArray(value['data']) ||
    !isRecord(value['meta']) ||
    !hasExactKeys(value['meta'], ['next_cursor'])
  )
    return null;
  const nextCursor = value['meta']['next_cursor'];
  if (
    nextCursor !== null &&
    (typeof nextCursor !== 'string' ||
      nextCursor.length < 16 ||
      nextCursor.length > 512 ||
      !/^[A-Za-z0-9_-]+$/.test(nextCursor))
  )
    return null;
  const events = value['data'].map(parseAuditEvent);
  if (events.some((event) => event === null)) return null;
  return { events: events as SafeAuditEvent[], nextCursor };
}

export function parseAuditDetail(value: unknown): SafeAuditEvent | null {
  if (!isRecord(value) || !hasExactKeys(value, ['event'])) return null;
  return parseAuditEvent(value['event']);
}

export function auditProblemState(
  status: number,
  codeValue: string | undefined,
  hasSafePage: boolean,
): AuditWorkspaceState {
  if (codeValue === 'mfa-required' || status === 401) return 'aal-required';
  if (codeValue === 'purpose-required' || status === 428) return 'purpose-required';
  if (codeValue === 'forbidden' || status === 403) return 'permission';
  return hasSafePage ? 'stale' : 'error';
}

export function exportStateFromEvidence(event: SafeAuditEvent): ExportUiState | null {
  if (event.resourceType !== 'audit_export') return null;
  if (event.chain.verification !== 'verified') return 'failed';
  const stateByAction: Readonly<Record<string, ExportUiState>> = {
    'audit.export.requested': 'queued',
    'audit.export.retryable': 'retrying',
    'audit.export.failed': 'failed',
    'audit.export.dead_lettered': 'dead_letter',
    'audit.export.proven': 'proven',
  };
  return stateByAction[event.actionCode] ?? null;
}

export function canQueueAuditExport(
  input: Readonly<{
    online: boolean;
    authorized: boolean;
    purpose: string | null;
    partitionStart: string;
    partitionEndExclusive: string;
  }>,
): boolean {
  return (
    input.online &&
    input.authorized &&
    input.purpose === 'security.audit.review' &&
    /^\d{4}-\d{2}-01$/.test(input.partitionStart) &&
    /^\d{4}-\d{2}-01$/.test(input.partitionEndExclusive) &&
    input.partitionStart < input.partitionEndExclusive
  );
}

function parseAuditEvent(value: unknown): SafeAuditEvent | null {
  if (!isRecord(value)) return null;
  const expectedKeys = [
    'event_id',
    'occurred_at',
    'request_id',
    'trace_id',
    'actor_person_id',
    'authentication_aal',
    'facility_id',
    'patient_id',
    'purpose_code',
    'action_code',
    'resource_type',
    'resource_id',
    'resource_version',
    'outcome',
    'reason_code',
    'source_ip_prefix',
    'user_agent_class',
    'chain',
  ];
  if (
    !hasExactKeys(value, expectedKeys) ||
    !uuid.test(String(value['event_id'])) ||
    !safeTimestamp(value['occurred_at']) ||
    !uuid.test(String(value['request_id'])) ||
    typeof value['trace_id'] !== 'string' ||
    !trace.test(value['trace_id']) ||
    (value['authentication_aal'] !== null &&
      value['authentication_aal'] !== 1 &&
      value['authentication_aal'] !== 2) ||
    !nullableCode(value['purpose_code']) ||
    typeof value['action_code'] !== 'string' ||
    !code.test(value['action_code']) ||
    typeof value['resource_type'] !== 'string' ||
    !code.test(value['resource_type']) ||
    !nullableUuid(value['resource_id']) ||
    (value['resource_version'] !== null &&
      (!Number.isSafeInteger(value['resource_version']) ||
        Number(value['resource_version']) < 1)) ||
    (value['outcome'] !== 'success' &&
      value['outcome'] !== 'denied' &&
      value['outcome'] !== 'failed') ||
    !nullableCode(value['reason_code']) ||
    (value['source_ip_prefix'] !== null &&
      (typeof value['source_ip_prefix'] !== 'string' ||
        !ipPrefix.test(value['source_ip_prefix']))) ||
    (value['user_agent_class'] !== null &&
      (typeof value['user_agent_class'] !== 'string' ||
        !userAgentClasses.has(value['user_agent_class']))) ||
    !isRecord(value['chain'])
  )
    return null;
  const chainValue = value['chain'];
  if (
    !hasExactKeys(chainValue, [
      'version',
      'partition',
      'sequence',
      'previous_hash',
      'event_hash',
      'verification',
    ]) ||
    chainValue['version'] !== 1 ||
    typeof chainValue['partition'] !== 'string' ||
    !/^\d{4}-\d{2}-01$/.test(chainValue['partition']) ||
    !Number.isSafeInteger(chainValue['sequence']) ||
    Number(chainValue['sequence']) < 1 ||
    typeof chainValue['previous_hash'] !== 'string' ||
    !hash.test(chainValue['previous_hash']) ||
    typeof chainValue['event_hash'] !== 'string' ||
    !hash.test(chainValue['event_hash']) ||
    (chainValue['verification'] !== 'verified' && chainValue['verification'] !== 'failed')
  )
    return null;
  return {
    eventId: value['event_id'] as string,
    occurredAt: value['occurred_at'] as string,
    requestId: value['request_id'] as string,
    traceId: value['trace_id'],
    authenticationAal: value['authentication_aal'],
    purposeCode: value['purpose_code'] as string | null,
    actionCode: value['action_code'],
    resourceType: value['resource_type'],
    resourceId: value['resource_id'] as string | null,
    resourceVersion: value['resource_version'] as number | null,
    outcome: value['outcome'],
    reasonCode: value['reason_code'] as string | null,
    sourceIpPrefix: value['source_ip_prefix'] as string | null,
    userAgentClass: value['user_agent_class'] as SafeAuditEvent['userAgentClass'],
    chain: {
      version: 1,
      partition: chainValue['partition'],
      sequence: chainValue['sequence'] as number,
      previousHash: chainValue['previous_hash'],
      eventHash: chainValue['event_hash'],
      verification: chainValue['verification'],
    },
  };
}

function safeTimestamp(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value) &&
    Number.isFinite(Date.parse(value))
  );
}
function nullableUuid(value: unknown): boolean {
  return value === null || (typeof value === 'string' && uuid.test(value));
}
function nullableCode(value: unknown): boolean {
  return value === null || (typeof value === 'string' && code.test(value));
}
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function hasExactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  return Object.keys(value).sort().join(',') === [...keys].sort().join(',');
}
