import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { root } from './run-feature-011-postgres-test.mjs';
import { assertPhysicalRed, parseCases, suiteFiles } from './run-feature-011-physical-red.mjs';

test('physical RED cannot be manufactured from syntax, setup, permission, runtime, or unrelated failures', () => {
  const item = { id: 'PROBE', missing: { kind: 'table', name: 'clinical.allergies' } };
  const valid = {
    exitCode: 3,
    stdout: 'K04_CASE_COMPILED\n',
    stderr: 'ERROR:  P0001: F011_K04_MISSING:PROBE:table:clinical.allergies\n',
  };
  assert.doesNotThrow(() => assertPhysicalRed(valid, item, true));
  for (const altered of [
    { ...valid, exitCode: 0 },
    { ...valid, exitCode: 2 },
    { ...valid, stdout: '' },
    { ...valid, stderr: 'ERROR:  42601: syntax error\n' },
    { ...valid, stderr: 'ERROR:  42501: permission denied\n' },
    { ...valid, stderr: 'ERROR:  P0001: unrelated\n' },
    { ...valid, stderr: valid.stderr + 'ERROR:  42601: syntax error\n' },
    { ...valid, stderr: valid.stderr.replace('PROBE', 'WRONG_CASE') },
  ])
    assert.throws(() => assertPhysicalRed(altered, item, true));
  assert.throws(() => assertPhysicalRed(valid, item, false));
});
test('closed case inventory binds exactly the four K04 RED owners without raw evidence input', () => {
  const cases = suiteFiles.flatMap((file) =>
    parseCases(readFileSync(resolve(root, file), 'utf8'), file),
  );
  assert.equal(new Set(cases.map((item) => item.id)).size, cases.length);
  assert.deepEqual([...new Set(cases.map((item) => item.task))].sort(), [
    'T012',
    'T013',
    'T014',
    'T015',
  ]);
  assert.equal(cases.filter((item) => item.id.startsWith('ART-V')).length, 7);
  assert.equal(cases.filter((item) => item.id.startsWith('COMMIT-')).length, 40);
  assert.equal(cases.filter((item) => item.id.startsWith('RACE-')).length, 6);
  assert.throws(() => parseCases('-- F011_CASE {"id":"INJECT;DROP"}\n', 'unsafe.sql'));
});
