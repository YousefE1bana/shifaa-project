import test from 'node:test';
import assert from 'node:assert/strict';
import { validateMetadata, loadKnownLabels } from './github-metadata.mjs';

const known = await loadKnownLabels();

test('accepts one type, optional area/spec and coordination labels', () => {
  const result = validateMetadata(
    { labels: ['type:bug', 'area:backend', 'spec:012', 'needs:triage'] },
    known,
  );
  assert.deepEqual(result, { valid: true, errors: [] });
});

test('rejects missing or conflicting types', () => {
  assert.equal(validateMetadata({ labels: ['area:backend'] }, known).valid, false);
  assert.match(
    validateMetadata({ labels: ['type:bug', 'type:feature'] }, known).errors.join(' '),
    /exactly one/,
  );
});

test('rejects unknown labels and conflicting priorities', () => {
  assert.match(
    validateMetadata({ labels: ['type:task', 'priority:p1', 'priority:p2'] }, known).errors.join(
      ' ',
    ),
    /at most one priority/,
  );
  assert.match(
    validateMetadata({ labels: ['type:task', 'priority:urgent'] }, known).errors.join(' '),
    /labels\.json/,
  );
});

test('severity is optional and restricted to bug work', () => {
  assert.equal(validateMetadata({ labels: ['type:feature', 'severity:s2'] }, known).valid, false);
  assert.equal(validateMetadata({ labels: ['type:bug', 'severity:s2'] }, known).valid, true);
  assert.equal(
    validateMetadata({ labels: ['type:bug', 'severity:s2', 'severity:s3'] }, known).valid,
    false,
  );
});

test('rejects duplicate labels and malformed payloads', () => {
  assert.equal(validateMetadata({ labels: ['type:task', 'type:task'] }, known).valid, false);
  assert.equal(validateMetadata({ labels: 'type:task' }, known).valid, false);
  assert.equal(validateMetadata('type:task', known).valid, false);
});

test('treats injection-looking strings as data and never evaluates them', () => {
  globalThis.__metadataInjectionProbe = 0;
  const result = validateMetadata(
    { labels: ['type:task', '$(globalThis.__metadataInjectionProbe=1)'] },
    known,
  );
  assert.equal(result.valid, false);
  assert.equal(globalThis.__metadataInjectionProbe, 0);
  delete globalThis.__metadataInjectionProbe;
});

test('accepts only explicit coordination labels from the manifest', () => {
  assert.equal(validateMetadata({ labels: ['type:maintenance', 'duplicate'] }, known).valid, true);
  assert.equal(
    validateMetadata({ labels: ['type:maintenance', 'approval:clinical'] }, known).valid,
    true,
  );
});
