import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { AllergyReportController } from '../src/lib/feature-011-allergies.ts';
import { Feature011Client } from '@shifaa/api-client/feature-011';
const patient = 'f0110000-0000-4000-8100-000000000001';
const request = {
  substance: { identity: 'synthetic-neutral', display: 'Neutral' },
  source: { display: 'Self report' },
};
const revision = {
  revisionId: crypto.randomUUID(),
  allergyId: crypto.randomUUID(),
  patientId: patient,
  version: 1,
  status: 'self_reported',
  substance: request.substance,
  source: request.source,
  coding: { knowledge: 'unknown' },
  reaction: { knowledge: 'unknown' },
  severity: { knowledge: 'unknown' },
  onset: { knowledge: 'unknown' },
  recordedAt: '2026-10-07T10:00:00Z',
};
function fixture(role = 'PAT') {
  let status = 200,
    stale = false,
    online = true,
    fail = false,
    nonempty = false;
  const calls = [];
  const client = new Feature011Client({
    baseUrl: 'https://synthetic.invalid',
    accessToken: () => 'native-boundary-fixture',
    purpose: 'care',
    acceptLanguage: 'ar-EG',
    fetch: async (url, init) => {
      calls.push({
        url: String(url),
        method: init?.method,
        body: init?.body,
        key: new Headers(init?.headers).get('idempotency-key'),
      });
      if (fail) throw new TypeError('Synthetic ACK loss');
      return new Response(
        JSON.stringify(
          init?.method === 'POST'
            ? revision
            : status === 200
              ? {
                  view: 'current',
                  data: nonempty ? [revision] : [],
                  meta: { nextCursor: null, stale, lastUpdatedAt: '2026-10-07T10:00:00Z' },
                }
              : { code: 'forbidden' },
        ),
        {
          status: init?.method === 'POST' ? 201 : status,
          headers: { 'cache-control': 'private, no-store' },
        },
      );
    },
  });
  const model = new AllergyReportController({
    client,
    patientId: patient,
    ...(role === 'CLN' ? { encounterId: 'f0110000-0000-4000-8400-000000000001' } : {}),
    role,
    online: () => online,
    idempotencyKey: () => 'synthetic-exact-key-00001',
  });
  return {
    model,
    calls,
    setStatus: (v) => (status = v),
    setStale: (v) => (stale = v),
    setOnline: (v) => (online = v),
    setFail: (v) => (fail = v),
    setRows: () => (nonempty = true),
  };
}
test('clinician report retains server-issued encounter and rejects an unrelated encounter', async () => {
  const f = fixture('CLN');
  await f.model.load();
  assert.throws(() => f.model.review({ ...request, encounterId: crypto.randomUUID() }));
  assert.equal(f.calls.length, 1);
  f.model.review(request);
  await f.model.submit();
  assert.equal(f.model.phase, 'success');
  assert.equal(JSON.parse(f.calls.at(-1).body).encounterId, 'f0110000-0000-4000-8400-000000000001');
});
test('current empty explicitly retains unknown; source/history success stays attributable', async () => {
  const f = fixture();
  await f.model.load();
  assert.equal(f.model.phase, 'empty');
  f.setRows();
  await f.model.load('history');
  assert.equal(f.model.phase, 'ready');
  assert.equal(f.model.rows[0].coding.knowledge, 'unknown');
  assert.equal(f.model.rows[0].source.display, 'Self report');
  assert.match(f.calls.at(-1).url, /view=history/);
});
test('read-only roles cannot create; current context remains server-authorized', async () => {
  for (const role of ['GUA', 'DEL']) {
    const f = fixture(role);
    await f.model.load();
    assert.equal(f.model.canReport, false);
    assert.throws(() => f.model.review(request));
    assert.equal(
      f.calls.some((c) => c.method === 'POST'),
      false,
    );
  }
});
test('permission, offline and stale clear protected rows and disable mutations', async () => {
  for (const state of ['denied', 'offline', 'stale', 'error']) {
    const f = fixture();
    f.setRows();
    await f.model.load();
    if (state === 'denied') f.setStatus(403);
    if (state === 'offline') f.setOnline(false);
    if (state === 'stale') f.setStale(true);
    if (state === 'error') f.setStatus(500);
    await f.model.load();
    assert.equal(f.model.phase, state);
    assert.deepEqual(f.model.rows, []);
    assert.equal(f.model.canReport, false);
  }
});
test('explicit review/report and original-key reconciliation never queues a write', async () => {
  const f = fixture();
  await f.model.load();
  f.model.review(request);
  assert.equal(f.model.phase, 'review');
  assert.equal(f.calls.length, 1);
  f.setFail(true);
  await f.model.submit();
  assert.equal(f.model.phase, 'reconciling');
  f.setOnline(false);
  await f.model.submit();
  assert.equal(f.calls.length, 2);
  f.setOnline(true);
  f.setFail(false);
  await f.model.submit();
  assert.equal(f.model.phase, 'success');
  assert.equal(f.model.receipt.status, 'self_reported');
  const writes = f.calls.filter((c) => c.method === 'POST');
  assert.equal(writes[0].key, writes[1].key);
  assert.equal(writes[0].body, writes[1].body);
  f.model.dispose();
  assert.deepEqual(f.model.rows, []);
  assert.equal(f.model.receipt, null);
});
test('route composition includes named fields, focus and bidi-safe state regions', () => {
  const source = readFileSync(
    new URL('../src/app/patients/[id]/summary/page.tsx', import.meta.url),
    'utf8',
  );
  assert.match(source, /AllergySummaryPanel/);
  const panel = readFileSync(
    new URL('../src/components/feature-011/AllergySummaryPanel.tsx', import.meta.url),
    'utf8',
  );
  for (const required of ['aria-live', 'aria-labelledby', 'focus', 'bdi', 'minHeight', 'privacy'])
    assert.ok(panel.includes(required), required);
  assert.doesNotMatch(panel, /localStorage|sessionStorage|verifyAllergy|prescription/i);
});
