import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const path = new URL(
  '../specs/005-privacy-dsr-notifications/evidence/breach-tabletop.json',
  import.meta.url,
);
const fixture = JSON.parse(await readFile(path, 'utf8'));
const at = (name) => Date.parse(fixture[name]);
assert.equal(at('regulator_target_at') - at('awareness_at'), 72 * 60 * 60 * 1000);
assert.ok(at('regulator_notified_fixture_at') <= at('regulator_target_at'));
const addWorkingDays = (start, count) => {
  const cursor = new Date(start);
  let remaining = count;
  while (remaining > 0) {
    cursor.setUTCDate(cursor.getUTCDate() + 1);
    if (cursor.getUTCDay() !== 0 && cursor.getUTCDay() !== 6) remaining--;
  }
  return cursor.getTime();
};
assert.equal(at('subject_target_at'), addWorkingDays(at('regulator_notified_fixture_at'), 3));
assert.ok(at('subject_notified_fixture_at') <= at('subject_target_at'));
assert.ok(at('decision_recorded_at') >= at('awareness_at'));
assert.ok(at('containment_evidence_at') >= at('decision_recorded_at'));
assert.ok(at('closed_at') >= at('subject_notified_fixture_at'));
assert.match(fixture.evidence_digest, /^[a-f0-9]{64}$/);
assert.match(fixture.disclaimer, /No real incident.*No regulator.*contacted/i);
assert.equal(fixture.open_legal_gate, 'OPEN-LEGAL-007');
assert.equal(fixture.named_incident_owner_gate, 'OPEN-TEAM-001');
process.stdout.write('Synthetic privacy breach tabletop timestamps: PASS\n');
