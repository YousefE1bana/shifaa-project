import { createHash, timingSafeEqual } from 'node:crypto';

export const AUDIT_GENESIS_HASH = '0'.repeat(64);

export type CanonicalAuditEventInput = {
  occurredAt: Date | string;
  partitionKey: string;
  chainSequence: number;
  requestId: string;
  traceId: string;
  actorUserId: string | null;
  actorPersonId: string | null;
  authenticationAal: number | null;
  facilityId: string | null;
  patientId: string | null;
  purposeCode: string | null;
  actionCode: string;
  resourceType: string;
  resourceId: string | null;
  resourceVersion: number | null;
  outcome: string;
  reasonCode: string | null;
  sourceIpPrefix: string | null;
  userAgentClass: string | null;
  previousHash: string;
};

export type ChainedAuditEvent = CanonicalAuditEventInput & { eventHash: string };

export type AuditChainVerification =
  | { valid: true; checkedCount: number }
  | {
      valid: false;
      checkedCount: number;
      firstInvalidSequence: number | null;
      failureCode:
        | 'partition_mismatch'
        | 'sequence_gap'
        | 'previous_hash_mismatch'
        | 'event_hash_mismatch';
    };

export type AuditExportManifest = {
  format: 'shifaa-audit-export-v1';
  schema_version: 1;
  export_batch_id: string;
  partition_start: string;
  partition_end_exclusive: string;
  event_count: number;
  first_event_hash: string;
  last_event_hash: string;
  content_sha256: string;
};

export type AuditExportObject = {
  manifest: AuditExportManifest;
  bytes: Uint8Array;
  objectDigest: string;
};

export type ExportManifestVerification =
  | { valid: true; manifest: AuditExportManifest; events: readonly ChainedAuditEvent[] }
  | {
      valid: false;
      reason:
        | 'object_digest_mismatch'
        | 'manifest_ambiguous'
        | 'manifest_mismatch'
        | 'content_digest_mismatch'
        | 'event_content_invalid'
        | 'event_order_invalid';
    };

const MANIFEST_KEYS = [
  'content_sha256',
  'event_count',
  'export_batch_id',
  'first_event_hash',
  'format',
  'last_event_hash',
  'partition_end_exclusive',
  'partition_start',
  'schema_version',
] as const;

const EXPORTED_EVENT_KEYS = [
  'action_code',
  'actor_person_id',
  'actor_user_id',
  'authentication_aal',
  'chain_sequence',
  'chain_version',
  'event_hash',
  'facility_id',
  'occurred_at',
  'outcome',
  'partition_key',
  'patient_id',
  'previous_hash',
  'purpose_code',
  'reason_code',
  'request_id',
  'resource_id',
  'resource_type',
  'resource_version',
  'source_ip_prefix',
  'trace_id',
  'user_agent_class',
] as const;

export function canonicalAuditEventV1(event: CanonicalAuditEventInput): string {
  validateCanonicalEvent(event);
  return postgresJsonbText({
    action_code: event.actionCode,
    actor_person_id: event.actorPersonId,
    actor_user_id: event.actorUserId,
    authentication_aal: event.authenticationAal,
    chain_sequence: event.chainSequence,
    chain_version: 1,
    facility_id: event.facilityId,
    occurred_at: postgresUtcTimestamp(event.occurredAt),
    outcome: event.outcome,
    partition_key: event.partitionKey,
    patient_id: event.patientId,
    previous_hash: normalizeHash(event.previousHash),
    purpose_code: event.purposeCode,
    reason_code: event.reasonCode,
    request_id: event.requestId,
    resource_id: event.resourceId,
    resource_type: event.resourceType,
    resource_version: event.resourceVersion,
    source_ip_prefix: event.sourceIpPrefix,
    trace_id: event.traceId,
    user_agent_class: event.userAgentClass,
  });
}

export function calculateAuditEventHash(event: CanonicalAuditEventInput): string {
  return sha256(Buffer.from(canonicalAuditEventV1(event), 'utf8'));
}

export function linkAuditEvents(
  events: readonly Omit<CanonicalAuditEventInput, 'previousHash' | 'chainSequence'>[],
): readonly ChainedAuditEvent[] {
  let previousHash = AUDIT_GENESIS_HASH;
  return events.map((event, index) => {
    const linked: CanonicalAuditEventInput = {
      ...event,
      occurredAt: postgresUtcTimestamp(event.occurredAt),
      chainSequence: index + 1,
      previousHash,
    };
    const result: ChainedAuditEvent = { ...linked, eventHash: calculateAuditEventHash(linked) };
    previousHash = result.eventHash;
    return result;
  });
}

export function verifyAuditChain(events: readonly ChainedAuditEvent[]): AuditChainVerification {
  let expectedPreviousHash = AUDIT_GENESIS_HASH;
  let partitionKey: string | undefined;
  for (let index = 0; index < events.length; index += 1) {
    const event = events[index];
    if (!event) continue;
    const checkedCount = index + 1;
    partitionKey ??= event.partitionKey;
    if (event.partitionKey !== partitionKey) {
      return failure(checkedCount, event.chainSequence, 'partition_mismatch');
    }
    if (event.chainSequence !== checkedCount) {
      return failure(checkedCount, event.chainSequence, 'sequence_gap');
    }
    if (!equalHash(event.previousHash, expectedPreviousHash)) {
      return failure(checkedCount, event.chainSequence, 'previous_hash_mismatch');
    }
    let expectedHash: string;
    try {
      expectedHash = calculateAuditEventHash(event);
    } catch {
      return failure(checkedCount, event.chainSequence, 'event_hash_mismatch');
    }
    if (!equalHash(event.eventHash, expectedHash)) {
      return failure(checkedCount, event.chainSequence, 'event_hash_mismatch');
    }
    expectedPreviousHash = event.eventHash;
  }
  return { valid: true, checkedCount: events.length };
}

export function buildAuditExportObject(input: {
  exportBatchId: string;
  partitionStart: string;
  partitionEndExclusive: string;
  events: readonly ChainedAuditEvent[];
}): AuditExportObject {
  const chain = verifyAuditChain(input.events);
  if (!chain.valid) throw new Error(`Cannot export invalid audit chain: ${chain.failureCode}`);
  if (
    input.events.some(
      ({ partitionKey }) =>
        partitionKey < input.partitionStart || partitionKey >= input.partitionEndExclusive,
    )
  ) {
    throw new Error('Cannot export an event outside the declared partition range.');
  }
  const eventLines = input.events.map(exportedEventText);
  const content = Buffer.from(eventLines.join('\n'), 'utf8');
  const first = input.events[0];
  const last = input.events.at(-1);
  const manifest: AuditExportManifest = {
    format: 'shifaa-audit-export-v1',
    schema_version: 1,
    export_batch_id: input.exportBatchId,
    partition_start: input.partitionStart,
    partition_end_exclusive: input.partitionEndExclusive,
    event_count: input.events.length,
    first_event_hash: first?.eventHash ?? AUDIT_GENESIS_HASH,
    last_event_hash: last?.eventHash ?? AUDIT_GENESIS_HASH,
    content_sha256: sha256(content),
  };
  const bytes = Buffer.concat([Buffer.from(`${stableJson(manifest)}\n`, 'utf8'), content]);
  return { manifest, bytes, objectDigest: sha256(bytes) };
}

export function verifyAuditExportManifest(input: {
  objectBytes: Uint8Array;
  recordedObjectDigest: string;
  expectedExportBatchId: string;
  expectedPartitionStart: string;
  expectedPartitionEndExclusive: string;
}): ExportManifestVerification {
  const bytes = Buffer.from(input.objectBytes);
  if (!equalHash(sha256(bytes), input.recordedObjectDigest))
    return { valid: false, reason: 'object_digest_mismatch' };
  const parsedObject = parseCanonicalManifest(bytes);
  if (!parsedObject.valid) return parsedObject;
  if (!manifestMatchesRequest(parsedObject.manifest, input))
    return { valid: false, reason: 'manifest_mismatch' };
  return verifyManifestContent(parsedObject.manifest, parsedObject.content);
}

function parseCanonicalManifest(
  bytes: Buffer,
):
  | { valid: true; manifest: AuditExportManifest; content: Buffer }
  | { valid: false; reason: 'manifest_ambiguous' } {
  const newline = bytes.indexOf(0x0a);
  if (newline < 1) return { valid: false, reason: 'manifest_ambiguous' };
  const manifestText = bytes.subarray(0, newline).toString('utf8');
  let parsedManifest: unknown;
  try {
    parsedManifest = JSON.parse(manifestText) as unknown;
  } catch {
    return { valid: false, reason: 'manifest_ambiguous' };
  }
  if (!isExactObject(parsedManifest, MANIFEST_KEYS))
    return { valid: false, reason: 'manifest_ambiguous' };
  const manifest = parsedManifest as AuditExportManifest;
  if (manifestText !== stableJson(manifest) || !validManifestFields(manifest)) {
    return { valid: false, reason: 'manifest_ambiguous' };
  }
  return { valid: true, manifest, content: bytes.subarray(newline + 1) };
}

function manifestMatchesRequest(
  manifest: AuditExportManifest,
  input: {
    expectedExportBatchId: string;
    expectedPartitionStart: string;
    expectedPartitionEndExclusive: string;
  },
): boolean {
  return (
    manifest.export_batch_id === input.expectedExportBatchId &&
    manifest.partition_start === input.expectedPartitionStart &&
    manifest.partition_end_exclusive === input.expectedPartitionEndExclusive
  );
}

function verifyManifestContent(
  manifest: AuditExportManifest,
  content: Buffer,
): ExportManifestVerification {
  if (!equalHash(sha256(content), manifest.content_sha256))
    return { valid: false, reason: 'content_digest_mismatch' };
  const parsed = parseExportedEvents(content, manifest.event_count);
  if (!parsed.valid) return parsed;
  if (!verifyAuditChain(parsed.events).valid)
    return { valid: false, reason: 'event_order_invalid' };
  if (!manifestAnchorsMatch(manifest, parsed.events))
    return { valid: false, reason: 'manifest_mismatch' };
  return { valid: true, manifest, events: parsed.events };
}

function manifestAnchorsMatch(
  manifest: AuditExportManifest,
  events: readonly ChainedAuditEvent[],
): boolean {
  return (
    (events[0]?.eventHash ?? AUDIT_GENESIS_HASH) === manifest.first_event_hash &&
    (events.at(-1)?.eventHash ?? AUDIT_GENESIS_HASH) === manifest.last_event_hash
  );
}

function parseExportedEvents(
  content: Uint8Array,
  expectedCount: number,
):
  | { valid: true; events: ChainedAuditEvent[] }
  | { valid: false; reason: 'event_content_invalid' } {
  const text = Buffer.from(content).toString('utf8');
  const lines = text.length === 0 ? [] : text.split('\n');
  if (lines.length !== expectedCount) return { valid: false, reason: 'event_content_invalid' };
  const events: ChainedAuditEvent[] = [];
  try {
    for (const line of lines) {
      const parsed = JSON.parse(line) as unknown;
      if (!isExactObject(parsed, EXPORTED_EVENT_KEYS) || line !== stableJson(parsed)) {
        return { valid: false, reason: 'event_content_invalid' };
      }
      events.push(fromExportedEvent(parsed));
    }
  } catch {
    return { valid: false, reason: 'event_content_invalid' };
  }
  return { valid: true, events };
}

function exportedEventText(event: ChainedAuditEvent): string {
  validateCanonicalEvent(event);
  normalizeHash(event.eventHash);
  return stableJson({
    action_code: event.actionCode,
    actor_person_id: event.actorPersonId,
    actor_user_id: event.actorUserId,
    authentication_aal: event.authenticationAal,
    chain_sequence: event.chainSequence,
    chain_version: 1,
    event_hash: event.eventHash,
    facility_id: event.facilityId,
    occurred_at: postgresUtcTimestamp(event.occurredAt),
    outcome: event.outcome,
    partition_key: event.partitionKey,
    patient_id: event.patientId,
    previous_hash: event.previousHash,
    purpose_code: event.purposeCode,
    reason_code: event.reasonCode,
    request_id: event.requestId,
    resource_id: event.resourceId,
    resource_type: event.resourceType,
    resource_version: event.resourceVersion,
    source_ip_prefix: event.sourceIpPrefix,
    trace_id: event.traceId,
    user_agent_class: event.userAgentClass,
  });
}

function fromExportedEvent(value: Record<string, unknown>): ChainedAuditEvent {
  if (value['chain_version'] !== 1) throw new Error('Unsupported chain version.');
  return {
    actionCode: requireString(value['action_code']),
    actorPersonId: nullableString(value['actor_person_id']),
    actorUserId: nullableString(value['actor_user_id']),
    authenticationAal: nullableInteger(value['authentication_aal']),
    chainSequence: requireInteger(value['chain_sequence']),
    eventHash: requireHash(value['event_hash']),
    facilityId: nullableString(value['facility_id']),
    occurredAt: requireString(value['occurred_at']),
    outcome: requireString(value['outcome']),
    partitionKey: requireString(value['partition_key']),
    patientId: nullableString(value['patient_id']),
    previousHash: requireHash(value['previous_hash']),
    purposeCode: nullableString(value['purpose_code']),
    reasonCode: nullableString(value['reason_code']),
    requestId: requireString(value['request_id']),
    resourceId: nullableString(value['resource_id']),
    resourceType: requireString(value['resource_type']),
    resourceVersion: nullableInteger(value['resource_version']),
    sourceIpPrefix: nullableString(value['source_ip_prefix']),
    traceId: requireString(value['trace_id']),
    userAgentClass: nullableString(value['user_agent_class']),
  };
}

function validManifestFields(value: AuditExportManifest): boolean {
  return (
    value.format === 'shifaa-audit-export-v1' &&
    value.schema_version === 1 &&
    typeof value.export_batch_id === 'string' &&
    /^\d{4}-\d{2}-\d{2}$/.test(value.partition_start) &&
    /^\d{4}-\d{2}-\d{2}$/.test(value.partition_end_exclusive) &&
    Number.isSafeInteger(value.event_count) &&
    value.event_count >= 0 &&
    isHash(value.first_event_hash) &&
    isHash(value.last_event_hash) &&
    isHash(value.content_sha256)
  );
}

function validateCanonicalEvent(event: CanonicalAuditEventInput): void {
  if (!Number.isSafeInteger(event.chainSequence) || event.chainSequence < 1) {
    throw new Error('Invalid audit chain sequence.');
  }
  if (!/^\d{4}-\d{2}-01$/.test(event.partitionKey)) throw new Error('Invalid partition key.');
  normalizeHash(event.previousHash);
  const occurredAt = postgresUtcTimestamp(event.occurredAt);
  if (occurredAt.slice(0, 7) !== event.partitionKey.slice(0, 7))
    throw new Error('Audit timestamp is outside its partition.');
}

function postgresUtcTimestamp(value: Date | string): string {
  if (typeof value === 'string') {
    const match = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})(?:\.(\d{1,6}))?Z$/.exec(value);
    if (!match) throw new Error('Invalid UTC audit timestamp.');
    const milliseconds = (match[2] ?? '').padEnd(3, '0').slice(0, 3);
    const date = new Date(`${match[1]}.${milliseconds}Z`);
    if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 19) !== match[1])
      throw new Error('Invalid UTC audit timestamp.');
    return `${match[1]}.${(match[2] ?? '').padEnd(6, '0')}Z`;
  }
  const date = value;
  if (!Number.isFinite(date.getTime())) throw new Error('Invalid UTC audit timestamp.');
  return date.toISOString().replace(/\.([0-9]{3})Z$/, '.$1000Z');
}

function postgresJsonbText(value: Record<string, unknown>): string {
  const keys = Object.keys(value).sort(postgresJsonbKeyOrder);
  return `{${keys.map((key) => `${JSON.stringify(key)}: ${jsonScalar(value[key])}`).join(', ')}}`;
}

function postgresJsonbKeyOrder(left: string, right: string): number {
  const length = Buffer.byteLength(left) - Buffer.byteLength(right);
  return length || Buffer.compare(Buffer.from(left), Buffer.from(right));
}

function jsonScalar(value: unknown): string {
  if (value === null || typeof value === 'string' || typeof value === 'number') {
    const encoded = JSON.stringify(value);
    if (encoded !== undefined) return encoded;
  }
  throw new Error('Canonical event contains a non-scalar value.');
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (isRecord(value)) {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`)
      .join(',')}}`;
  }
  const encoded = JSON.stringify(value);
  if (encoded === undefined) throw new Error('Unsupported canonical JSON value.');
  return encoded;
}

function isExactObject(value: unknown, keys: readonly string[]): value is Record<string, unknown> {
  if (!isRecord(value)) return false;
  const actual = Object.keys(value).sort();
  return actual.length === keys.length && actual.every((key, index) => key === keys[index]);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function sha256(value: Uint8Array): string {
  return createHash('sha256').update(value).digest('hex');
}

function normalizeHash(value: string): string {
  if (!isHash(value)) throw new Error('Invalid SHA-256 value.');
  return value.toLowerCase();
}

function isHash(value: unknown): value is string {
  return typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
}

function equalHash(left: string, right: string): boolean {
  if (!isHash(left) || !isHash(right)) return false;
  return timingSafeEqual(Buffer.from(left, 'hex'), Buffer.from(right, 'hex'));
}

function failure(
  checkedCount: number,
  firstInvalidSequence: number | null,
  failureCode: Exclude<AuditChainVerification, { valid: true }>['failureCode'],
): AuditChainVerification {
  return { valid: false, checkedCount, firstInvalidSequence, failureCode };
}

function requireString(value: unknown): string {
  if (typeof value !== 'string') throw new Error('Expected string.');
  return value;
}

function nullableString(value: unknown): string | null {
  if (value === null || typeof value === 'string') return value;
  throw new Error('Expected nullable string.');
}

function requireInteger(value: unknown): number {
  if (!Number.isSafeInteger(value)) throw new Error('Expected integer.');
  return value as number;
}

function nullableInteger(value: unknown): number | null {
  if (value === null) return null;
  return requireInteger(value);
}

function requireHash(value: unknown): string {
  if (!isHash(value)) throw new Error('Expected SHA-256.');
  return value;
}
