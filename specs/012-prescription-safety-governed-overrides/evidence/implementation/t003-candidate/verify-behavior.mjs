import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

export const vectors = JSON.parse(readFileSync(new URL('vectors.json', import.meta.url), 'utf8'));

export function probeFor(context, caseId, changes = {}) {
  const probe = structuredClone(vectors.controls[context]);
  probe.caseId = caseId;
  probe.evidence.caseId = caseId;
  for (const [path, value] of Object.entries(changes)) {
    const segments = path.split('.');
    const field = segments.pop();
    const parent = segments.reduce((current, key) => current[key], probe);
    if (value === null) delete parent[field];
    else parent[field] = value;
  }
  return probe;
}

export function probeForVector(entry, caseId) {
  const probe = probeFor(entry.control, caseId, entry.changes);
  if (entry.substituteEvidenceCase === true) {
    const otherCase = vectors.caseIds.find((candidate) => candidate !== caseId);
    assert.ok(otherCase, 'case substitution requires a different known fixture');
    probe.evidence.caseId = otherCase;
  }
  return probe;
}

// Called only by the later, separately accepted harness with its admitted entry point.
// This file neither imports the candidate nor supplies any way to activate it.
export function verifyT003Behavior(evaluate) {
  const observed = [];
  function check(id, probe, expected) {
    const outcome = evaluate(probe);
    assert.deepEqual(
      outcome,
      { simulatedSignEligible: expected, clinicalAssessment: 'not_fully_checked' },
      id,
    );
    observed.push({ id, ...outcome });
  }

  for (const caseId of vectors.caseIds) {
    const control = (context, changes) => probeFor(context, caseId, changes);
    for (const context of Object.keys(vectors.controls)) {
      check(
        `${caseId}/${context}`,
        control(context),
        vectors.controlExpected.simulatedSignEligible,
      );
    }
    for (const entry of [...vectors.denials, ...vectors.positiveExtensions]) {
      check(`${caseId}/${entry.id}`, probeForVector(entry, caseId), entry.simulatedSignEligible);
    }
    for (const entry of vectors.timestampVectors) {
      const probe = control('N');
      probe.fields.expiresAt = entry.value;
      check(`${caseId}/${entry.id}`, probe, entry.expected === 'accepted-format');
    }
    const nonFinite = {
      'Number.NaN': Number.NaN,
      'Number.POSITIVE_INFINITY': Number.POSITIVE_INFINITY,
      'Number.NEGATIVE_INFINITY': Number.NEGATIVE_INFINITY,
    };
    for (const entry of vectors.clockVectors) {
      const probe = control('N');
      probe.state.nowSeconds = entry.runtimeValue
        ? nonFinite[entry.runtimeValue]
        : entry.nowSeconds;
      check(`${caseId}/clock/${entry.id}`, probe, entry.expected === 'before-expiry');
    }
    for (const entry of vectors.fieldTypeVectors) {
      check(`${caseId}/${entry.id}`, control(entry.control, { [entry.path]: entry.value }), false);
    }
  }

  const caseId = vectors.caseIds[0];
  const booleanPaths = {
    'authority.currentAal2CareAndFacility': 'N',
    'authority.pharmacist.current': 'N',
    'authority.secondPhysician.current': 'E',
    'state.separateSign': 'N',
    'state.acknowledged': 'W-M',
    'state.requestLive': 'N',
    'state.pharmacistObligationPersisted': 'E',
    'state.alreadySigned': 'N',
  };
  for (const [path, context] of Object.entries(booleanPaths)) {
    for (const [index, value] of ['false', 'true', 0, 1, [], {}, null].entries()) {
      check(`boolean/${path}/${index}`, probeFor(context, caseId, { [path]: value }), false);
    }
  }

  const sparse = probeFor('N', caseId, { 'fields.alternativesConsidered': Array(1) });
  const inherited = Object.create(probeFor('N', caseId));
  const accessor = probeFor('N', caseId);
  Object.defineProperty(accessor.state, 'separateSign', {
    get: () => assert.fail('malformed accessor was read'),
  });
  for (const [id, probe] of Object.entries({
    null: null,
    array: [],
    sparse,
    inherited,
    accessor,
  })) {
    check(`malformed/${id}`, probe, false);
  }
  return observed;
}
