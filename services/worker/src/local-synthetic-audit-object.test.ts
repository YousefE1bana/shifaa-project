import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { describe, it } from 'node:test';

import {
  ImmutableObjectConflictError,
  LocalSyntheticAuditObjectAdapter,
} from './adapters/local-synthetic-audit-object.ts';

const objectKey = `audit-exports/${'a'.repeat(64)}.jsonl`;
const now = () => new Date('2026-09-01T12:00:00.000Z');

describe('local synthetic audit object adapter', () => {
  it('encrypts create-if-absent content and accepts only byte-identical replay', async () => {
    const adapter = new LocalSyntheticAuditObjectAdapter(new Uint8Array(32).fill(7), now);
    const bytes = new TextEncoder().encode('{"synthetic":"audit-export"}\n');
    const first = await adapter.createIfAbsent(objectKey, bytes);
    const replay = await adapter.createIfAbsent(objectKey, bytes);
    assert.deepEqual(replay, first);
    assert.deepEqual(await adapter.readForVerification(objectKey), bytes);
    assert.equal(first.retentionProof.proof_class, 'synthetic_write_once');
    assert.equal(first.retentionProof.verified_at, now().toISOString());
  });

  it('rejects overwrite and caller-supplied digest mismatch', async () => {
    const adapter = new LocalSyntheticAuditObjectAdapter(new Uint8Array(32).fill(9), now);
    const original = new TextEncoder().encode('original');
    await adapter.createIfAbsent(
      objectKey,
      original,
      createHash('sha256').update(original).digest('hex'),
    );
    await assert.rejects(
      adapter.createIfAbsent(objectKey, new TextEncoder().encode('changed')),
      ImmutableObjectConflictError,
    );
    await assert.rejects(
      adapter.createIfAbsent(objectKey, original, 'b'.repeat(64)),
      ImmutableObjectConflictError,
    );
  });
});
