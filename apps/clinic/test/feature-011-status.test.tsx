import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { clinicalStatusCopy } from '@shifaa/i18n';
import { StatusView, StatusWorkspace } from '../src/app/clinical-content/status/StatusWorkspace';
import type { StatusState, StatusPage } from '../src/lib/feature-011-status';
import { Feature011Client } from '@shifaa/api-client/feature-011';
import { ClinicalStatusController } from '../src/lib/feature-011-status';
const id = 'f0110000-0000-4000-8100-000000000001';
const row = {
  releaseId: id,
  source: { display: 'مصدر اصطناعي Synthetic source' },
  artifactVersion: 1,
  effectiveAt: '2026-10-09T00:00:00.000000Z',
  publicationState: 'published',
  eligibility: 'effective',
  initial: true,
  supersedesReleaseId: null,
  signatureStatus: { physicianApproved: true, pharmacistApproved: true },
};
const page = (data: unknown[] = [row], stale = false) => ({
  projection: 'status',
  data,
  meta: { stale, nextCursor: null, lastUpdatedAt: row.effectiveAt },
});
function setup(reply: unknown, status = 200) {
  const calls: Array<{ url: string; method: string; headers: Headers }> = [];
  const client = new Feature011Client({
    baseUrl: 'http://isolated.test',
    accessToken: () => 'synthetic-token',
    purpose: 'synthetic.feature011',
    acceptLanguage: 'ar-EG',
    fetch: async (url, init) => {
      calls.push({
        url: String(url),
        method: init?.method ?? 'GET',
        headers: new Headers(init?.headers),
      });
      return new Response(JSON.stringify(reply), {
        status,
        headers: { 'content-type': 'application/json', 'cache-control': 'private, no-store' },
      });
    },
  });
  return { controller: new ClinicalStatusController(client), calls };
}
test('authorized metadata loads using only the generated status read', async () => {
  const { controller, calls } = setup(page());
  await controller.load('synthetic');
  assert.equal(controller.state.kind, 'ready');
  assert.equal(controller.state.page?.data[0]?.releaseId, id);
  assert.equal(calls.length, 1);
  assert.equal(calls[0]?.method, 'GET');
  assert.match(calls[0]!.url, /projection=status/);
  assert.equal(calls[0]!.headers.get('x-purpose'), 'synthetic.feature011');
});
test('empty current set stays unknown with no invented fallback', async () => {
  const { controller } = setup(page([]));
  await controller.load('synthetic');
  assert.equal(controller.state.kind, 'empty');
  assert.deepEqual(controller.state.page?.data, []);
});
test('offline clears metadata and sends no request or queued mutation', async () => {
  const { controller, calls } = setup(page());
  await controller.load('synthetic');
  const n = calls.length;
  await controller.load('synthetic', false);
  assert.equal(controller.state.kind, 'offline');
  assert.equal(controller.state.page, null);
  assert.equal(calls.length, n);
});
test('stale authorized response removes protected rows', async () => {
  const { controller } = setup(page([row], true));
  await controller.load('synthetic');
  assert.equal(controller.state.kind, 'stale');
  assert.equal(controller.state.page, null);
});
for (const [status, kind] of [
  [401, 'denied'],
  [403, 'denied'],
  [404, 'gated'],
  [503, 'gated'],
  [409, 'stale'],
  [412, 'stale'],
  [500, 'error'],
] as const)
  test(`HTTP ${status} fails closed as ${kind}`, async () => {
    const { controller } = setup({ detail: 'PRIVATE_SENTINEL' }, status);
    await controller.load('synthetic');
    assert.equal(controller.state.kind, kind);
    assert.equal(controller.state.page, null);
  });
for (const field of [
  'body',
  'artifactReview',
  'keyRef',
  'signatures',
  'evidenceRef',
  'workflowVersion',
  'creatorPersonId',
])
  test(`surplus ${field} rejects the entire metadata page`, async () => {
    const { controller } = setup(page([{ ...row, [field]: 'PRIVATE_SENTINEL' }]));
    await controller.load('synthetic');
    assert.equal(controller.state.kind, 'terminal');
    assert.equal(controller.state.page, null);
  });
for (const variant of [
  { ...row, publicationState: 'draft' },
  { ...row, signatureStatus: { physicianApproved: false, pharmacistApproved: true } },
  { ...row, source: { display: 'source', evidenceRef: id } },
  { ...row, effectiveAt: 'not-an-instant' },
  { ...row, initial: false, supersedesReleaseId: null },
])
  test('invalid, unsigned or inconsistent lineage metadata denies without partial rows', async () => {
    const { controller } = setup(page([row, variant]));
    await controller.load('synthetic');
    assert.equal(controller.state.kind, 'terminal');
    assert.equal(controller.state.page, null);
  });
test('authority clearing invalidates an already in-flight response', async () => {
  let release!: (r: Response) => void;
  const client = new Feature011Client({
    baseUrl: 'http://isolated.test',
    accessToken: () => 'synthetic',
    purpose: 'synthetic.feature011',
    fetch: () =>
      new Promise((r) => {
        release = r;
      }),
  });
  const controller = new ClinicalStatusController(client);
  const load = controller.load('synthetic');
  assert.equal(controller.state.kind, 'loading');
  controller.clear();
  release(
    new Response(JSON.stringify(page()), {
      headers: { 'content-type': 'application/json', 'cache-control': 'private, no-store' },
    }),
  );
  await load;
  assert.equal(controller.state.kind, 'denied');
  assert.equal(controller.state.page, null);
});
for (const eligibility of ['future', 'superseded', 'unavailable'] as const)
  test(`authorized ${eligibility} metadata is preserved without safety inference`, async () => {
    const { controller } = setup(page([{ ...row, eligibility }]));
    await controller.load('synthetic');
    assert.equal(controller.state.kind, 'ready');
    assert.equal(controller.state.page?.data[0]?.eligibility, eligibility);
  });
for (const locale of ['ar-EG', 'en-EG'] as const) {
  test(`${locale} preserves the existing privacy entrypoint without inventing a clinic route`, () => {
    const html = renderToStaticMarkup(
      <StatusWorkspace accessToken="synthetic" locale={locale} onSignOut={() => {}} />,
    );
    assert(html.includes(clinicalStatusCopy[locale].privacyEntry));
    assert(!html.includes('href="/privacy"'));
  });
  for (const kind of [
    'loading',
    'empty',
    'denied',
    'offline',
    'stale',
    'error',
    'terminal',
    'gated',
  ] as const)
    test(`${locale} ${kind} has named live recovery and no metadata`, () => {
      const html = renderToStaticMarkup(
        <StatusView locale={locale} state={{ kind, page: null }} />,
      );
      assert(html.includes(clinicalStatusCopy[locale][kind]));
      assert.match(html, /role="status"/);
      assert.match(html, /aria-live="polite"/);
      assert(!html.includes(id));
      assert(!html.includes('PRIVATE_SENTINEL'));
    });
  for (const eligibility of ['effective', 'future', 'superseded', 'unavailable'] as const)
    test(`${locale} ${eligibility} preserves dates, lineage, bidi and synthetic boundary`, () => {
      const html = renderToStaticMarkup(
        <StatusView
          locale={locale}
          state={{
            kind: 'ready',
            page: page([
              {
                ...row,
                eligibility,
                initial: false,
                supersedesReleaseId: 'f0110000-0000-4000-8100-000000000002',
              },
            ]) as StatusPage,
          }}
        />,
      );
      assert(html.includes(clinicalStatusCopy[locale][eligibility]));
      assert(html.includes(clinicalStatusCopy[locale].boundary));
      assert(html.includes(clinicalStatusCopy[locale].successor));
      assert.match(html, /<bdi dir="ltr">/);
      assert.match(html, /<time dateTime="2026-10-09T00:00:00.000000Z">/);
      assert(!html.includes('signClinicalContent'));
      assert(!html.includes('artifactReview'));
    });
}
test('missing private response cache policy fails closed without using metadata', async () => {
  const client = new Feature011Client({
    baseUrl: 'http://isolated.test',
    accessToken: () => 'synthetic',
    purpose: 'synthetic.feature011',
    fetch: async () =>
      new Response(JSON.stringify(page()), {
        headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
      }),
  });
  const controller = new ClinicalStatusController(client);
  await controller.load('synthetic');
  assert.equal(controller.state.kind, 'error');
  assert.equal(controller.state.page, null);
});
