import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

import { runF012MechanismCandidate } from '../../../../../packages/test-kit/src/feature-012.ts';
import { probeFor, probeForVector, vectors } from './verify-behavior.mjs';

const root = new URL('../../../../../', import.meta.url);
const manifest = JSON.parse(readFileSync(new URL('manifest.json', import.meta.url), 'utf8'));

test('manifest binds the original and candidate artifacts by raw byte length and SHA-256', () => {
  for (const entry of [...manifest.originalInputs, ...manifest.candidateFiles]) {
    const contents = readFileSync(new URL(entry.path, root));
    assert.equal(contents.length, entry.bytes, entry.path);
    assert.equal(createHash('sha256').update(contents).digest('hex'), entry.sha256, entry.path);
  }
  assert.equal(manifest.approval, null);
  assert.equal(manifest.execution, 'disabled');
});

test('every explicit logical designation has an independent control on all three immutable carriers', () => {
  const originalPath = manifest.originalInputs.find((entry) =>
    entry.path.endsWith('/engineering-fixtures.candidate.json'),
  ).path;
  const original = JSON.parse(readFileSync(new URL(originalPath, root), 'utf8'));
  assert.deepEqual(
    vectors.caseIds,
    original.cases.map((fixture) => fixture.caseId),
  );
  assert.deepEqual(Object.keys(vectors.controls), ['W-M', 'W-NA', 'N', 'E']);
  for (const context of Object.keys(vectors.controls)) {
    for (const caseId of vectors.caseIds) {
      const probe = probeFor(context, caseId);
      assert.equal(probe.context, context);
      assert.equal(probe.evidence.context, context);
      assert.equal(probe.evidence.caseId, caseId);
      assert.equal(Object.hasOwn(probe.fields, 'monitoringPlan'), context !== 'W-NA');
      assert.equal('controlled' in probe || 'nti' in probe, false);
      assert.throws(() => runF012MechanismCandidate(probe), {
        message: 'F012_T003_EXACT_BYTE_ACCEPTANCE_REQUIRED',
      });
    }
  }
});

test('every named positive extension and adversarial vector is refused before evaluation', () => {
  const extensions = [...vectors.denials, ...vectors.positiveExtensions];
  assert.equal(new Set(extensions.map((entry) => entry.id)).size, extensions.length);
  for (const vector of extensions) {
    const probe = probeForVector(vector, vectors.caseIds[0]);
    assert.throws(
      () => runF012MechanismCandidate(probe),
      {
        message: 'F012_T003_EXACT_BYTE_ACCEPTANCE_REQUIRED',
      },
      vector.id,
    );
  }
});

test('every named denial differs from its eligible control on each carrier', () => {
  const substitution = vectors.denials.find((entry) => entry.id === 'case-substitution');
  assert.ok(substitution);
  for (const caseId of vectors.caseIds) {
    for (const entry of vectors.denials) {
      assert.notDeepEqual(
        probeForVector(entry, caseId),
        probeFor(entry.control, caseId),
        `${caseId}/${entry.id}`,
      );
    }
    const substituted = probeForVector(substitution, caseId);
    assert.equal(substituted.caseId, caseId);
    assert.notEqual(substituted.evidence.caseId, caseId);
    assert.ok(vectors.caseIds.includes(substituted.evidence.caseId));
  }
});

test('timestamp, clock and field-type catalogs cover malformed inputs and expiry edges', () => {
  const timestampIds = new Set(vectors.timestampVectors.map((entry) => entry.id));
  for (const id of [
    'timestamp-utc-seconds',
    'timestamp-offset',
    'timestamp-date-only',
    'timestamp-ambiguous-slash-date',
    'timestamp-invalid-month',
    'timestamp-invalid-day',
    'timestamp-invalid-leap-day',
    'timestamp-leap-day',
    'timestamp-number',
    'timestamp-object',
  ])
    assert(timestampIds.has(id), `missing timestamp vector ${id}`);

  const clockIds = new Set(vectors.clockVectors.map((entry) => entry.id));
  for (const id of [
    'request-expiry-one-second-before',
    'request-expiry-equality',
    'request-expiry-one-second-after',
    'clock-nan',
    'clock-infinity',
    'clock-fraction',
    'clock-string',
  ])
    assert(clockIds.has(id), `missing virtual-clock vector ${id}`);
  assert.equal(
    vectors.clockVectors.find((entry) => entry.id === 'request-expiry-equality').expected,
    'expired',
  );
  const windowIds = new Set([
    ...vectors.denials.map((entry) => entry.id),
    ...vectors.positiveExtensions.map((entry) => entry.id),
  ]);
  assert(windowIds.has('emergency-window-one-second-before-expiry-pending-pharmacist'));
  assert(windowIds.has('emergency-expiry-equality-pending-pharmacist'));
  assert(windowIds.has('emergency-window-one-second-after-expiry-pending-pharmacist'));
  const fieldTypeIds = new Set(vectors.fieldTypeVectors.map((entry) => entry.id));
  for (const id of [
    'field-rationale-number',
    'field-alternatives-string',
    'field-alternatives-number-item',
    'field-monitoring-array',
    'field-reviewer-person-number',
    'field-container-array',
  ])
    assert(fieldTypeIds.has(id), `missing field type vector ${id}`);
});

test('activation denial occurs before any probe property is read', () => {
  const poison = new Proxy({}, { get: () => assert.fail('an unaccepted probe was read') });
  assert.throws(() => runF012MechanismCandidate(poison), {
    message: 'F012_T003_EXACT_BYTE_ACCEPTANCE_REQUIRED',
  });
});
