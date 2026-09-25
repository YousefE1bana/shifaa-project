import assert from 'node:assert/strict';
import test from 'node:test';
import { validQueueReorderReason } from '../src/lib/queue-reason.ts';

test('restricted reorder reasons accept bounded visible text and reject blank, oversized, or control input', () => {
  const cases: Array<[string, boolean]> = [
    ['', false],
    [' \t ', false],
    ['Operational correction', true],
    ['سبب إعادة الترتيب', true],
    ['x'.repeat(500), true],
    ['x'.repeat(501), false],
    ['😀'.repeat(500), true],
    ['😀'.repeat(501), false],
    ['line one\nline two', false],
    ['line one\rline two', false],
    ['a\tb', false],
    ['a\u0001b', false],
    ['a\u007fb', false],
  ];

  for (const [value, expected] of cases)
    assert.equal(validQueueReorderReason(value), expected, JSON.stringify(value));
});
