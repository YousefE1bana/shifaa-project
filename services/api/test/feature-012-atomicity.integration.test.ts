import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { expect, it } from 'vitest';

const root = resolve(import.meta.dirname, '../../..');
const explicitlyRequested = process.env['SHIFAA_RUN_F012_ATOMICITY'] === 'true';

it.skipIf(!explicitlyRequested)(
  'proves rollback, original-key reconciliation and current receipt authorization',
  () => {
    const result = spawnSync(
      process.execPath,
      ['tools/verify-feature-012-harness.mjs', '--atomicity'],
      { cwd: root, encoding: 'utf8', timeout: 180_000, windowsHide: true },
    );
    const receipt = JSON.parse(result.stdout);
    expect(result.status, receipt.atomicity?.stderr ?? receipt.reason).toBe(0);
    expect(receipt.status).toBe('EXECUTED_ATOMICITY_SQL');
    expect(receipt.preservation.matches).toBe(true);
    expect(receipt.predecessor.files).toHaveLength(38);

    const records = new Map<string, string[]>();
    for (const line of String(receipt.atomicity.stdout).trim().split(/\r?\n/)) {
      const [key, ...fields] = line.split('|');
      if (key && fields.length) {
        expect(records.has(key), key).toBe(false);
        records.set(key, fields);
      }
    }
    const readState = (key: string, expectedCode: string) => {
      const [code, state] = records.get(key) ?? [];
      expect(code).toBe(expectedCode);
      if (!state) throw new Error('Missing probe state for ' + key);
      return JSON.parse(state) as Record<string, string | number | null>;
    };
    const empty = {
      probe: 0,
      heads: 0,
      audit: 0,
      outbox: 0,
      receipt: 0,
      obligation: 0,
      idempotency: 0,
      processing: 0,
      digest: null,
    };
    expect(readState('precommit', '22012')).toEqual(empty);
    expect(readState('missing-receipt', '23514')).toEqual(empty);
    expect(receipt.atomicity.stderr).toContain('tuple is incomplete or mismatched');
    const committed = readState('committed-without-response', '00000');
    // PostgreSQL jsonb renders one space between array items.
    const tuple = [201, '"1"', 'en-EG', 'f0120000-0000-4000-8000-000000000004', 'b0'];
    const digest = createHash('sha256')
      .update('[' + tuple.map((value) => JSON.stringify(value)).join(', ') + ']')
      .digest('hex');
    expect(committed).toEqual({
      probe: 1,
      heads: 1,
      audit: 1,
      outbox: 1,
      receipt: 1,
      obligation: 1,
      idempotency: 1,
      processing: 0,
      digest,
    });
    expect(records.get('original-key')).toEqual(['true', digest]);
    expect(records.get('changed-body')).toEqual(['23505']);
    expect(records.get('changed-action')).toEqual(['42501']);
    expect(records.get('revoked')).toEqual(['42501']);
    expect(readState('after-replays', '00000')).toEqual(committed);
  },
  190_000,
);
