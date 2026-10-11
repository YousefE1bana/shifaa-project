import assert from 'node:assert/strict';
import test from 'node:test';
import * as state from '@shifaa/api-client/feature-011-allergy-state';
import { Feature011Client } from '@shifaa/api-client/feature-011';
const patient = 'f0110000-0000-4000-8100-000000000001';
const row = {
  patientId: patient,
  allergyId: crypto.randomUUID(),
  revisionId: crypto.randomUUID(),
  version: 1,
  status: 'self_reported',
  previousRevisionId: null,
  substance: { identity: 'neutral', display: 'مادة تجريبية' },
  source: { display: 'Synthetic source' },
  coding: { knowledge: 'unknown' },
  reaction: { knowledge: 'unknown' },
  severity: { knowledge: 'unknown' },
  onset: { knowledge: 'unknown' },
  recorderPersonId: crypto.randomUUID(),
  recordedAt: '2026-10-08T00:00:00Z',
  actionActorPersonId: crypto.randomUUID(),
  actionAt: '2026-10-08T00:00:00Z',
  verification: null,
  correctsAllergyId: null,
};
const request = {
  targetStatus: 'clinician_confirmed',
  reason: 'سبب تجريبي',
  verificationEvidenceRef: crypto.randomUUID(),
};
function fixture(role = 'CLN') {
  let online = true,
    status = 200,
    ack = false;
  const calls = [];
  const client = new Feature011Client({
    baseUrl: 'https://synthetic.invalid',
    accessToken: () => 'synthetic-only',
    purpose: 'care',
    fetch: async (url, init) => {
      const headers = new Headers(init?.headers);
      calls.push({
        url: String(url),
        body: init?.body,
        key: headers.get('idempotency-key'),
        version: headers.get('if-match'),
      });
      if (ack) {
        ack = false;
        throw new TypeError('Synthetic ACK loss');
      }
      return new Response(
        JSON.stringify(
          init?.method === 'POST'
            ? {
                ...row,
                revisionId: crypto.randomUUID(),
                version: 2,
                previousRevisionId: row.revisionId,
                status: 'clinician_confirmed',
                verification: {
                  reason: request.reason,
                  evidenceRef: request.verificationEvidenceRef,
                  verifierPersonId: row.actionActorPersonId,
                },
              }
            : { view: 'current', data: [row], meta: { nextCursor: null, stale: false } },
        ),
        { status, headers: { 'cache-control': 'private, no-store' } },
      );
    },
  });
  const model = new state.AllergyReportController({
    client,
    patientId: patient,
    role,
    online: () => online,
    idempotencyKey: () => crypto.randomUUID(),
  });
  const review = (r = row, input = request) => {
    assert.equal(typeof model.reviewVerification, 'function', 'MISSING_VERIFICATION_UI_STATE');
    model.reviewVerification(r, input);
  };
  return {
    model,
    calls,
    review,
    offline() {
      online = false;
    },
    fail(value) {
      status = value;
    },
    ack() {
      ack = true;
    },
  };
}
test('clinician review captures exact assertion/version/reason/evidence and generated operation', async () => {
  const f = fixture();
  await f.model.load();
  f.review();
  assert.equal(f.model.phase, 'review');
  assert.equal(f.model.mutationKind, 'verify');
  await f.model.submit();
  assert.equal(f.model.phase, 'success');
  const sent = f.calls.at(-1);
  assert(sent.url.endsWith(`/allergies/${row.allergyId}/verification`));
  assert.equal(sent.version, '"1"');
  assert.deepEqual(JSON.parse(sent.body), request);
});
for (const role of ['PAT', 'GUA', 'DEL'])
  test(`${role} has no verification controls/state`, async () => {
    const f = fixture(role);
    await f.model.load();
    assert.equal(typeof f.model.reviewVerification, 'function', 'MISSING_VERIFICATION_UI_STATE');
    assert.throws(() => f.review());
    assert.equal(f.calls.length, 1);
  });
for (const input of [
  { ...request, reason: '' },
  { ...request, verificationEvidenceRef: '' },
  { ...request, targetStatus: 'self_reported' },
])
  test(`reason/evidence/closed status ${JSON.stringify(input)}`, async () => {
    const f = fixture();
    await f.model.load();
    assert.equal(typeof f.model.reviewVerification, 'function', 'MISSING_VERIFICATION_UI_STATE');
    assert.throws(() => f.review(row, input));
    assert.equal(f.calls.length, 1);
  });
test('terminal or historical row is never mutable', async () => {
  const f = fixture();
  await f.model.load();
  assert.equal(typeof f.model.reviewVerification, 'function', 'MISSING_VERIFICATION_UI_STATE');
  assert.throws(() => f.review({ ...row, status: 'entered_in_error' }));
  await f.model.load('history');
  assert.throws(() => f.review());
});
test('offline verification sends nothing and queues nothing', async () => {
  const f = fixture();
  await f.model.load();
  f.offline();
  assert.equal(typeof f.model.reviewVerification, 'function', 'MISSING_VERIFICATION_UI_STATE');
  assert.throws(() => f.review());
  assert.equal(f.calls.length, 1);
});
test('uncertain outcome retains original key/version/body until explicit settlement', async () => {
  const f = fixture();
  await f.model.load();
  f.review();
  f.ack();
  await f.model.submit();
  assert.equal(f.model.phase, 'reconciling');
  const first = f.calls.at(-1);
  await f.model.load();
  assert.equal(f.model.phase, 'reconciling');
  await f.model.submit();
  assert.equal(f.model.phase, 'success');
  assert.deepEqual(f.calls.at(-1), first);
});
for (const [status, phase] of [
  [409, 'stale'],
  [403, 'denied'],
])
  test(`current ${status} clears candidate and protected projection`, async () => {
    const f = fixture();
    await f.model.load();
    f.review();
    f.fail(status);
    await f.model.submit();
    assert.equal(f.model.phase, phase);
    assert.deepEqual(f.model.rows, []);
    assert.equal(f.model.receipt, null);
  });
