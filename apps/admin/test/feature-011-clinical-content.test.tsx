import assert from 'node:assert/strict';
import test from 'node:test';
import { existsSync } from 'node:fs';
import { Feature011Client } from '@shifaa/api-client/feature-011';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
const file = '../src/app/clinical-content/content-controller.ts';
async function fixture(projection: 'governance' | 'assigned_review' = 'governance') {
  assert(existsSync(new URL(file, import.meta.url)), 'MISSING_APPROVED_GOVERNANCE_UI_COMPOSITION');
  const { ContentController } = await import(file);
  let online = true,
    status = 200,
    ack = false,
    aal = 2,
    delay: Promise<void> | undefined;
  const calls: any[] = [],
    id = crypto.randomUUID();
  const row: any = {
    releaseId: id,
    artifactVersion: 1,
    artifactDigest: 'a'.repeat(64),
    workflowVersion: 3,
    publicationState: 'draft',
    eligibility: 'unavailable',
    syntheticOnly: true,
    source: { display: 'Synthetic' },
    effectiveAt: '2026-10-09T00:00:00Z',
    initial: true,
    supersedesReleaseId: null,
    artifactReview: { content: 'عربي e\u0301', code: '', testVectors: '' },
    artifact: {
      contentEvidenceRef: crypto.randomUUID(),
      codeEvidenceRef: crypto.randomUUID(),
      testVectorEvidenceRef: crypto.randomUUID(),
    },
    contentType: 'synthetic',
    governedContentKey: 'neutral',
    effectiveScopeKey: 'isolated',
    creatorPersonId: crypto.randomUUID(),
    createdAt: '2026-10-09T00:00:00Z',
    publisherPersonId: null,
    publishedAt: null,
    signatures: [],
  };
  const client = new Feature011Client({
    baseUrl: 'https://synthetic.invalid',
    accessToken: () => 'synthetic',
    purpose: 'synthetic.feature011',
    fetch: async (url, init) => {
      calls.push({
        url: String(url),
        method: init?.method,
        key: new Headers(init?.headers).get('idempotency-key'),
        version: new Headers(init?.headers).get('if-match'),
        body: init?.body,
      });
      await delay;
      if (ack) {
        ack = false;
        throw new TypeError('ACK lost');
      }
      return new Response(
        JSON.stringify(
          status !== 200
            ? { code: 'denied' }
            : init?.method === 'POST'
              ? { ...row, workflowVersion: 4 }
              : {
                  projection,
                  data: [row],
                  meta: {
                    stale: false,
                    nextCursor: null,
                    lastUpdatedAt: '2026-10-09T00:00:00.000000Z',
                  },
                },
        ),
        { status, headers: { 'cache-control': 'private, no-store' } },
      );
    },
  });
  const controller = new ContentController(client, {
    online: () => online,
    aal: () => aal,
    purpose: () => 'synthetic.feature011',
  });
  return {
    controller,
    calls,
    row,
    id,
    offline: () => (online = false),
    status: (n: number) => (status = n),
    ack: () => (ack = true),
    aal: (n: number) => (aal = n),
    hold: (gate: Promise<void>) => (delay = gate),
  };
}
const create: any = {
  governedContentKey: 'neutral',
  effectiveScopeKey: 'isolated',
  source: { display: 'Synthetic' },
  effectiveAt: '2026-10-09T00:00:00Z',
  predecessor: { initial: true, supersedesReleaseId: null },
  artifact: {
    contentEvidenceRef: crypto.randomUUID(),
    codeEvidenceRef: crypto.randomUUID(),
    testVectorEvidenceRef: crypto.randomUUID(),
  },
};
test('K19 load through generated governance projection keeps exact review and workflow', async () => {
  const f = await fixture();
  await f.controller.load('synthetic', 'governance');
  assert.equal(f.controller.phase, 'ready');
  assert.deepEqual(f.controller.page.data[0].artifactReview, f.row.artifactReview);
  assert(f.calls[0].url.includes('projection=governance'));
});
test('K19 assigned reviewer uses exact release and never gains create/publish', async () => {
  const f = await fixture('assigned_review');
  await assert.rejects(f.controller.load('synthetic', 'assigned_review'));
  assert.equal(f.calls.length, 0);
  await f.controller.load('synthetic', 'assigned_review', f.id);
  assert.throws(() => f.controller.prepareCreate('synthetic', create, 'initial'));
  assert.throws(() => f.controller.preparePublish(f.row));
});
test('K19 explicit create confirmation precedes any generated write', async () => {
  const f = await fixture();
  await f.controller.load('synthetic', 'governance');
  f.controller.prepareCreate('synthetic', create, 'initial');
  assert.equal(f.calls.length, 1);
  assert.equal(f.controller.phase, 'review');
  f.controller.cancel();
  assert.equal(f.calls.length, 1);
});
test('K19 successor/rollback must bind the exact separate predecessor', async () => {
  const f = await fixture();
  await f.controller.load('synthetic', 'governance');
  assert.throws(() => f.controller.prepareCreate('synthetic', create, 'rollback'));
  f.controller.prepareCreate(
    'synthetic',
    { ...create, predecessor: { initial: false, supersedesReleaseId: f.id } },
    'rollback',
  );
  assert.equal(f.controller.pending.intent, 'rollback');
});
test('K19 signing binds exact immutable artifact and latest workflow CAS', async () => {
  const f = await fixture('assigned_review');
  await f.controller.load('synthetic', 'assigned_review', f.id);
  f.controller.prepareSign(f.row, {
    capacity: 'physician',
    decision: 'approved',
    signingEvidenceRef: crypto.randomUUID(),
  });
  await f.controller.submit();
  const p = f.calls.at(-1);
  assert.equal(p.version, '"3"');
  assert.equal(JSON.parse(p.body).artifactDigest, f.row.artifactDigest);
  assert.equal(JSON.parse(p.body).artifactVersion, 1);
  assert.equal(f.controller.phase, 'success');
});
test('K19 rejected decision requires reason and is distinct from unavailable', async () => {
  const f = await fixture('assigned_review');
  await f.controller.load('synthetic', 'assigned_review', f.id);
  assert.throws(() =>
    f.controller.prepareSign(f.row, {
      capacity: 'pharmacist',
      decision: 'rejected',
      signingEvidenceRef: crypto.randomUUID(),
    }),
  );
});
test('K19 offline confirmation sends nothing and creates no queue', async () => {
  const f = await fixture();
  await f.controller.load('synthetic', 'governance');
  f.controller.prepareCreate('synthetic', create, 'initial');
  f.offline();
  await f.controller.submit();
  assert.equal(f.calls.length, 1);
  assert.equal(f.controller.phase, 'offline');
});
test('K19 uncertain receipt retains immutable body/key/version for explicit reconciliation', async () => {
  const f = await fixture();
  await f.controller.load('synthetic', 'governance');
  f.controller.prepareCreate('synthetic', create, 'initial');
  f.ack();
  await f.controller.submit();
  assert.equal(f.controller.phase, 'reconciling');
  assert.throws(() => f.controller.prepareCreate('synthetic', create, 'initial'));
  await f.controller.reconcile();
  assert.deepEqual(f.calls[1], f.calls[2]);
  assert.equal(f.controller.phase, 'success');
});
test('K19 going offline cannot discard an uncertain original receipt binding', async () => {
  const f = await fixture();
  await f.controller.load('synthetic', 'governance');
  f.controller.prepareCreate('synthetic', create, 'initial');
  f.ack();
  await f.controller.submit();
  const pending = structuredClone(f.controller.pending);
  f.offline();
  await f.controller.reconcile();
  assert.equal(f.controller.phase, 'offline');
  assert.throws(() => f.controller.cancel());
  assert.deepEqual(f.controller.pending, pending);
});
test('K19 in-flight read cannot repopulate the protected projection after connectivity loss', async () => {
  const f = await fixture();
  let release!: () => void;
  f.hold(new Promise<void>((resolve) => (release = resolve)));
  const reading = f.controller.load('synthetic', 'governance');
  f.offline();
  f.controller.connectionChanged(false);
  release();
  await reading;
  assert.equal(f.controller.page, null);
  assert.equal(f.controller.phase, 'offline');
});
test('K19 in-flight mutation remains non-cancellable and duplicate sends are blocked while offline', async () => {
  const f = await fixture();
  await f.controller.load('synthetic', 'governance');
  f.controller.prepareCreate('synthetic', create, 'initial');
  let release!: () => void;
  f.hold(new Promise<void>((resolve) => (release = resolve)));
  const mutation = f.controller.submit();
  f.offline();
  f.controller.connectionChanged(false);
  assert.throws(() => f.controller.cancel());
  await assert.rejects(f.controller.reconcile(), /still in progress/);
  assert.equal(f.calls.length, 2);
  release();
  await mutation;
  assert.equal(f.controller.phase, 'success');
  assert.equal(f.controller.pending, null);
});
test('K19 offline before confirmation never makes an unconfirmed draft eligible for replay', async () => {
  const f = await fixture();
  await f.controller.load('synthetic', 'governance');
  f.controller.prepareCreate('synthetic', create, 'initial');
  f.offline();
  f.controller.connectionChanged(false);
  assert.equal(f.controller.needsSettlement, false);
  await assert.rejects(f.controller.reconcile());
  f.controller.cancel();
  assert.equal(f.calls.length, 1);
});
for (const [status, phase] of [
  [403, 'permission'],
  [409, 'stale'],
  [422, 'unavailable'],
  [503, 'reconciling'],
] as const)
  test(`K19 ${status} yields ${phase} with no stale protected read`, async () => {
    const f = await fixture();
    await f.controller.load('synthetic', 'governance');
    f.controller.prepareCreate('synthetic', create, 'initial');
    f.status(status);
    await f.controller.submit();
    assert.equal(f.controller.phase, phase);
    assert.equal(f.controller.page, null);
  });
test('K19 AAL2 is checked before read or mutation but never grants authority', async () => {
  const f = await fixture();
  f.aal(1);
  await f.controller.load('synthetic', 'governance');
  assert.equal(f.controller.phase, 'stepup');
  assert.equal(f.calls.length, 0);
});
test('K19 full AR/EN state markup includes announcements, retained gates and no private material', async () => {
  assert(
    existsSync(
      new URL('../src/app/clinical-content/ClinicalContentWorkspace.tsx', import.meta.url),
    ),
    'MISSING_APPROVED_GOVERNANCE_UI_COMPOSITION',
  );
  const { ClinicalContentView } = await import(
    '../src/app/clinical-content/ClinicalContentWorkspace.tsx'
  );
  for (const locale of ['ar-EG', 'en-EG'] as const)
    for (const phase of [
      'loading',
      'empty',
      'permission',
      'stepup',
      'error',
      'unavailable',
      'offline',
      'stale',
      'reconciling',
      'success',
    ]) {
      const html = renderToStaticMarkup(
        React.createElement(ClinicalContentView, { locale, phase, page: null }),
      );
      assert(html.includes(`dir="${locale === 'ar-EG' ? 'rtl' : 'ltr'}"`));
      assert(html.includes('aria-live'));
      assert(html.includes('OPEN-UX-002'));
      assert(!html.includes('keyRef'));
    }
});
test('K19 a successor labels its preserved predecessor as predecessor rather than initial release', async () => {
  const f = await fixture();
  f.row.initial = false;
  f.row.supersedesReleaseId = crypto.randomUUID();
  await f.controller.load('synthetic', 'governance');
  const { ClinicalContentView } = await import(
    '../src/app/clinical-content/ClinicalContentWorkspace.tsx'
  );
  const { contentCopy } = await import('@shifaa/i18n');
  for (const locale of ['ar-EG', 'en-EG'] as const) {
    const html = renderToStaticMarkup(
      React.createElement(ClinicalContentView, { locale, phase: 'ready', page: f.controller.page }),
    );
    assert(html.includes('<dt>' + contentCopy[locale].predecessor + '</dt>'));
    assert(html.includes(f.row.supersedesReleaseId));
  }
});
test('K19 ready drafts and published rows state unavailable eligibility without claiming source failure', async () => {
  const f = await fixture();
  await f.controller.load('synthetic', 'governance');
  const { ClinicalContentView } = await import(
    '../src/app/clinical-content/ClinicalContentWorkspace.tsx'
  );
  const { contentCopy } = await import('@shifaa/i18n');
  for (const [locale, expectedEligibility] of [
    ['ar-EG', 'الأهلية الحالية غير متاحة؛ لا استنتاج للسلامة'],
    ['en-EG', 'Current eligibility unavailable; no safety inference'],
  ] as const) {
    for (const publicationState of ['draft', 'published'] as const) {
      (f.controller.page!.data[0] as any).publicationState = publicationState;
      const html = renderToStaticMarkup(
        React.createElement(ClinicalContentView, {
          locale,
          phase: 'ready',
          page: f.controller.page,
        }),
      );
      const publicationLabel =
        publicationState === 'draft' ? contentCopy[locale].draft : contentCopy[locale].published;
      assert(html.includes(publicationLabel));
      assert(html.includes(expectedEligibility));
      assert(!html.includes(contentCopy[locale].unavailable));
      assert(html.includes(f.row.artifactReview.content));
      assert(html.includes(f.row.artifactReview.code));
      assert(html.includes(f.row.artifactReview.testVectors));
    }

    const unavailableHtml = renderToStaticMarkup(
      React.createElement(ClinicalContentView, { locale, phase: 'unavailable', page: null }),
    );
    assert(unavailableHtml.includes(contentCopy[locale].unavailable));
  }
});
