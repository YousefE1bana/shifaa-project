import { createHash } from 'node:crypto';

import { auditAdminIntegrityFixtures } from '@shifaa/test-kit/audit-admin-fixtures';
import { describe, expect, it } from 'vitest';

import {
  AUDIT_GENESIS_HASH,
  buildAuditExportObject,
  calculateAuditEventHash,
  canonicalAuditEventV1,
  linkAuditEvents,
  verifyAuditChain,
  verifyAuditExportManifest,
  type CanonicalAuditEventInput,
  type ChainedAuditEvent,
} from './audit-integrity.js';

const baseEvents = [
  event({ actionCode: 'audit.read', resourceId: '82000000-0000-4000-8000-000000000001' }),
  event({
    occurredAt: '2026-07-01T00:00:01.120Z',
    actionCode: 'audit.export.requested',
    resourceType: 'audit_export',
    resourceId: auditAdminIntegrityFixtures.export.batchId,
  }),
  event({
    occurredAt: '2026-07-31T23:59:59.999Z',
    actionCode: 'audit.export.proven',
    resourceType: 'audit_export',
    resourceId: auditAdminIntegrityFixtures.export.batchId,
  }),
] as const;

const linked = linkAuditEvents(baseEvents);

describe('Feature 008 portable audit integrity', () => {
  it('serializes canonical v1 events to stable PostgreSQL jsonb text bytes', () => {
    const first: CanonicalAuditEventInput = {
      ...baseEvents[0],
      chainSequence: 1,
      previousHash: AUDIT_GENESIS_HASH,
    };
    const canonical = canonicalAuditEventV1(first);
    expect(canonical).toBe(
      canonicalAuditEventV1({ ...first, occurredAt: new Date(first.occurredAt) }),
    );
    expect(
      canonicalAuditEventV1({ ...first, occurredAt: '2026-07-01T00:00:00.123456Z' }),
    ).toContain('"occurred_at": "2026-07-01T00:00:00.123456Z"');
    expect(canonical).toBe(
      '{"outcome": "success", "trace_id": "synthetic-trace-008", "patient_id": null, "request_id": "84000000-0000-4000-8000-000000000001", "action_code": "audit.read", "facility_id": null, "occurred_at": "2026-07-01T00:00:00.000000Z", "reason_code": null, "resource_id": "82000000-0000-4000-8000-000000000001", "purpose_code": "security.audit.review", "actor_user_id": null, "chain_version": 1, "partition_key": "2026-07-01", "previous_hash": "0000000000000000000000000000000000000000000000000000000000000000", "resource_type": "audit_event", "chain_sequence": 1, "actor_person_id": "81000000-0000-4000-8000-000000000014", "resource_version": 1, "source_ip_prefix": "192.0.2.0/24", "user_agent_class": "service", "authentication_aal": 2}',
    );
    expect(calculateAuditEventHash(first)).toBe(
      '14a1d15fdf2136799e02dd941f8bbc8909f36343e4d563b575726b3d12befb73',
    );
  });

  it('uses the documented genesis and binds each following link', () => {
    expect(AUDIT_GENESIS_HASH).toBe(auditAdminIntegrityFixtures.chain.genesisHash);
    expect(linked[0]?.previousHash).toBe(AUDIT_GENESIS_HASH);
    expect(linked[1]?.previousHash).toBe(linked[0]?.eventHash);
    expect(linked[2]?.previousHash).toBe(linked[1]?.eventHash);
    expect(verifyAuditChain(linked)).toEqual({ valid: true, checkedCount: 3 });
  });

  it('builds and verifies a manifest-prefixed immutable export', () => {
    const object = buildExport(linked);
    const first = verifyExport(object.bytes, object.objectDigest);
    const retry = verifyExport(object.bytes, object.objectDigest);
    expect(first).toEqual(retry);
    expect(first.valid).toBe(true);
    if (first.valid) {
      expect(first.manifest.event_count).toBe(3);
      expect(first.events).toEqual(linked);
    }
  });

  it('rejects content tampering even when a caller presents the original event hash', () => {
    const tampered = linked.map((item, index) =>
      index === 1 ? { ...item, actionCode: 'audit.export.changed' } : item,
    );
    expect(verifyAuditChain(tampered)).toEqual({
      valid: false,
      checkedCount: 2,
      firstInvalidSequence: 2,
      failureCode: 'event_hash_mismatch',
    });
  });

  it('rejects previous-hash tampering', () => {
    const tampered = linked.map((item, index) =>
      index === 1 ? { ...item, previousHash: 'f'.repeat(64) } : item,
    );
    expect(verifyAuditChain(tampered)).toEqual({
      valid: false,
      checkedCount: 2,
      firstInvalidSequence: 2,
      failureCode: 'previous_hash_mismatch',
    });
  });

  it('rejects ordering tampering', () => {
    expect(verifyAuditChain([linked[1]!, linked[0]!, linked[2]!])).toEqual({
      valid: false,
      checkedCount: 1,
      firstInvalidSequence: 2,
      failureCode: 'sequence_gap',
    });
  });

  it('rejects a substituted event hash', () => {
    const tampered = linked.map((item, index) =>
      index === 0 ? { ...item, eventHash: 'f'.repeat(64) } : item,
    );
    expect(verifyAuditChain(tampered)).toEqual({
      valid: false,
      checkedCount: 1,
      firstInvalidSequence: 1,
      failureCode: 'event_hash_mismatch',
    });
  });

  it('rejects object-byte and recorded-digest tampering', () => {
    const object = buildExport(linked);
    const changedBytes = Buffer.from(object.bytes);
    const lastByte = changedBytes.length - 1;
    changedBytes[lastByte] = (changedBytes[lastByte] ?? 0) ^ 1;
    expect(verifyExport(changedBytes, object.objectDigest)).toEqual({
      valid: false,
      reason: 'object_digest_mismatch',
    });
    expect(verifyExport(object.bytes, 'f'.repeat(64))).toEqual({
      valid: false,
      reason: 'object_digest_mismatch',
    });
    expect(verifyExport(changedBytes, sha256(changedBytes))).toEqual({
      valid: false,
      reason: 'content_digest_mismatch',
    });
  });

  it('rejects mismatched and ambiguous manifests', () => {
    const object = buildExport(linked);
    expect(
      verifyAuditExportManifest({
        objectBytes: object.bytes,
        recordedObjectDigest: object.objectDigest,
        expectedExportBatchId: '83000000-0000-4000-8000-000000000099',
        expectedPartitionStart: '2026-07-01',
        expectedPartitionEndExclusive: '2026-08-01',
      }),
    ).toEqual({ valid: false, reason: 'manifest_mismatch' });

    const newline = Buffer.from(object.bytes).indexOf(0x0a);
    const manifest = JSON.parse(
      Buffer.from(object.bytes).subarray(0, newline).toString('utf8'),
    ) as Record<string, unknown>;
    const ambiguous = Buffer.concat([
      Buffer.from(`${JSON.stringify({ ...manifest, extra_interpretation: true })}\n`, 'utf8'),
      Buffer.from(object.bytes).subarray(newline + 1),
    ]);
    expect(verifyExport(ambiguous, sha256(ambiguous))).toEqual({
      valid: false,
      reason: 'manifest_ambiguous',
    });
  });
});

function event(
  overrides: Partial<Omit<CanonicalAuditEventInput, 'previousHash' | 'chainSequence'>> = {},
): Omit<CanonicalAuditEventInput, 'previousHash' | 'chainSequence'> {
  return {
    occurredAt: '2026-07-01T00:00:00.000Z',
    partitionKey: '2026-07-01',
    requestId: '84000000-0000-4000-8000-000000000001',
    traceId: 'synthetic-trace-008',
    actorUserId: null,
    actorPersonId: '81000000-0000-4000-8000-000000000014',
    authenticationAal: 2,
    facilityId: null,
    patientId: null,
    purposeCode: 'security.audit.review',
    actionCode: 'audit.read',
    resourceType: 'audit_event',
    resourceId: null,
    resourceVersion: 1,
    outcome: 'success',
    reasonCode: null,
    sourceIpPrefix: '192.0.2.0/24',
    userAgentClass: 'service',
    ...overrides,
  };
}

function buildExport(events: readonly ChainedAuditEvent[]) {
  return buildAuditExportObject({
    exportBatchId: auditAdminIntegrityFixtures.export.batchId,
    partitionStart: '2026-07-01',
    partitionEndExclusive: '2026-08-01',
    events,
  });
}

function verifyExport(bytes: Uint8Array, digest: string) {
  return verifyAuditExportManifest({
    objectBytes: bytes,
    recordedObjectDigest: digest,
    expectedExportBatchId: auditAdminIntegrityFixtures.export.batchId,
    expectedPartitionStart: '2026-07-01',
    expectedPartitionEndExclusive: '2026-08-01',
  });
}

function sha256(value: Uint8Array): string {
  return createHash('sha256').update(value).digest('hex');
}
