// K21 live clinic UI. Login transport supplies an actual isolated native token;
// every non-fixture domain read crosses the current API/non-owner SQL boundary.
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { chromium } from 'playwright';
import { withPublication, quote as q, person } from './feature-011-publication-fixtures.mjs';
import { request as initial } from './run-feature-011-content-api-test.mjs';
import { root, runtimes, sql, digest, runtimeManifest } from './run-feature-011-postgres-test.mjs';
import { Feature011Governance } from '../services/api/src/modules/feature-011/list-clinical-content.ts';
import { clinicalStatusCopy } from '../packages/i18n/src/feature-011-status.ts';
import {
  verifyFeature011Contracts,
  currentPhysicalSourceDigests,
} from './verify-feature-011-contracts.mjs';
const e = 'specs/011-allergies-clinical-content-governance/evidence/fresh-implementation/K21',
  a = 'artifacts/feature-011/k21';
mkdirSync(e, { recursive: true });
mkdirSync(a, { recursive: true });
const paths = [
  'apps/clinic/src/app/clinical-content/status/page.tsx',
  'apps/clinic/src/app/clinical-content/status/StatusWorkspace.tsx',
  'apps/clinic/src/lib/feature-011-status.ts',
  'apps/clinic/test/feature-011-status.test.tsx',
  'packages/i18n/src/feature-011-status.ts',
  'packages/i18n/src/index.ts',
  'packages/api-client/src/feature-011.ts',
  'packages/contracts/src/feature-011.ts',
  'services/api/src/modules/feature-011/clinical-status.ts',
  'services/api/src/modules/feature-011/list-clinical-content.ts',
  'tools/run-feature-011-status-ui-test.mjs',
  'tools/feature-011-publication-fixtures.mjs',
];
const parity = await verifyFeature011Contracts();
assert.equal(parity.result, 'PASS', parity.failures.join('\n'));
const inputs = Object.fromEntries(paths.map((p) => [p, digest(p)])),
  pins = currentPhysicalSourceDigests(root),
  results = [];
const facility = 'f0110000-0000-4000-8200-000000000001';
const registry = JSON.parse(
  readFileSync(
    'specs/011-allergies-clinical-content-governance/visual-baselines/reference-manifest.json',
  ),
);
const assignedStates = [
  ...new Set(
    registry.entries.filter((r) => r.route === '/clinical-content/status').map((r) => r.state),
  ),
];
assert.equal(new Set(registry.entries.map((r) => r.baselineId + '/' + r.state)).size, 99);
const browser = await chromium.launch({ channel: 'chrome' });
const { declaredDigest: _digest, ...successorArtifact } = initial.artifact;
try {
  for (const runtime of runtimes) {
    runtimeManifest(runtime);
    for (const scenario of ['lifecycle', 'signer-loss']) {
      console.log(runtime.name + ': clean K21 ' + scenario);
      const control = { facility, role: 'CLN', resolver: 0, keys: 0, reading: false },
        checks = [],
        contexts = [],
        screenshots = [];
      const result = await withPublication(
        runtime,
        async (h) => {
          const check = (id) => {
            checks.push({ id, result: 'PASS' });
            console.log(runtime.name + ': ' + scenario + ' ' + id);
          };
          const state = () =>
            h.owner(
              `SELECT json_build_object('releases',(SELECT count(*) FROM clinical.content_releases),'signatures',(SELECT count(*) FROM audit.signature_evidence),'audit',(SELECT count(*) FROM audit.events),'outbox',(SELECT count(*) FROM platform.outbox_events),'receipts',(SELECT count(*) FROM clinical.mutation_receipts),'idempotency',(SELECT count(*) FROM platform.idempotency_records));`,
            );
          const ready = await h.ready(),
            publication = await h.publish(ready.id);
          assert.equal(publication.statusCode, 200, publication.body);
          const history = () =>
            h.owner(
              `SELECT json_build_object('r',to_jsonb(r),'s',(SELECT json_agg(to_jsonb(s) ORDER BY s.id) FROM audit.signature_evidence s WHERE s.resource_id=r.id),'b',(SELECT json_agg(to_jsonb(b) ORDER BY b.signature_evidence_id) FROM clinical.content_signature_bindings b JOIN audit.signature_evidence s ON s.id=b.signature_evidence_id WHERE s.resource_id=r.id)) FROM clinical.content_releases r WHERE r.id=${q(ready.id)}::uuid;`,
            );
          const original = history();
          async function login(locale, actor = 'clinician', aal = 2) {
            const context = await browser.newContext({
                viewport: { width: 1440, height: 900 },
                reducedMotion: 'reduce',
              }),
              page = await context.newPage();
            contexts.push(context);
            const ui = {
              context,
              page,
              locale,
              c: clinicalStatusCopy[locale],
              mode: null,
              last: null,
              reads: 0,
              console: [],
            };
            page.on('console', (message) => {
              if (['error', 'warning'].includes(message.type())) ui.console.push(message.text());
            });
            await page.route('**/v1/**', async (route) => {
              const req = route.request(),
                url = new URL(req.url());
              if (url.pathname === '/v1/auth/login')
                return route.fulfill({
                  json: { kind: 'challenge', challenge_id: 'synthetic-existing-login-handoff' },
                });
              if (url.pathname === '/v1/auth/otp/verify')
                return route.fulfill({
                  json: {
                    kind: 'session',
                    access_token: aal === 2 ? h.actors[actor].token : h.actors[actor].aal1,
                    aal,
                  },
                });
              assert.equal(req.method(), 'GET');
              assert.equal(url.pathname, '/v1/admin/clinical-content/synthetic');
              assert.equal(url.searchParams.get('projection'), 'status');
              ui.reads++;
              const mode = ui.mode;
              if (mode === 'loading') await new Promise((resolve) => setTimeout(resolve, 800));
              const noStore = { 'cache-control': 'private, no-store' };
              const status = { error: 500, denied: 403, stale: 409, gated: 503 }[mode];
              if (status)
                return route.fulfill({
                  status,
                  headers: noStore,
                  json: { code: 'synthetic-test-only' },
                });
              if (mode === 'empty')
                return route.fulfill({
                  headers: noStore,
                  json: {
                    projection: 'status',
                    data: [],
                    meta: { stale: false, nextCursor: null, lastUpdatedAt: initial.effectiveAt },
                  },
                });
              if (mode === 'terminal')
                return route.fulfill({
                  headers: noStore,
                  json: {
                    ...ui.last,
                    data: ui.last.data.map((r) => ({ ...r, body: 'PRIVATE_SENTINEL' })),
                  },
                });
              if (['future', 'superseded', 'unavailable'].includes(mode))
                return route.fulfill({
                  headers: noStore,
                  json: {
                    ...ui.last,
                    data: ui.last.data.map((r) => ({ ...r, eligibility: mode })),
                  },
                });
              const before = state(),
                crypto = h.counters().keyPreparations,
                headers = { ...req.headers() };
              delete headers.host;
              delete headers['content-length'];
              control.reading = true;
              let response;
              try {
                response = await h.app.inject({
                  method: 'GET',
                  url: url.pathname + url.search,
                  headers,
                });
              } finally {
                control.reading = false;
              }
              assert.deepEqual(state(), before, 'UI read must produce zero durable effects');
              assert.equal(h.counters().keyPreparations, crypto);
              for (const privateField of [
                'body',
                'artifactReview',
                'artifactDigest',
                'workflowVersion',
                'signatures',
                'signerPersonId',
                'evidenceRef',
                'keyRef',
                'privateReviewSources',
                'protectedBody',
                'credentialDocuments',
              ])
                assert(
                  !response.body.includes('"' + privateField + '"'),
                  privateField + ' absent from real HTTP',
                );
              if (response.statusCode === 200) ui.last = response.json();
              return route.fulfill({
                status: response.statusCode,
                headers: Object.fromEntries(
                  Object.entries(response.headers).map(([k, v]) => [k, String(v)]),
                ),
                body: response.body,
              });
            });
            await page.goto('http://localhost:18221/clinical-content/status');
            if (locale === 'en-EG')
              await page.getByRole('button', { name: 'English', exact: true }).click();
            await page.getByLabel(ui.c.handle, { exact: true }).fill('synthetic-staff');
            await page.getByLabel(ui.c.password, { exact: true }).fill('synthetic-login-fixture');
            await page.getByRole('button', { name: ui.c.continue, exact: true }).click();
            await page.getByLabel(ui.c.otp, { exact: true }).fill('000000');
            await page.getByRole('button', { name: ui.c.verify, exact: true }).click();
            if (aal === 2) await page.locator('[data-status-outcome]').waitFor();
            else
              await page
                .locator('main')
                .getByRole('alert')
                .filter({ hasText: ui.c.authError })
                .waitFor();
            return ui;
          }
          const wait = async (ui, kind) => {
            await ui.page
              .locator('[data-status-outcome]')
              .filter({ hasText: ui.c[kind] })
              .waitFor();
          };
          const refresh = async (ui, kind = 'ready') => {
            await ui.page.bringToFront();
            await ui.page.getByRole('button', { name: ui.c.refresh, exact: true }).click();
            await wait(ui, kind);
          };
          const noLeaks = async (ui) => {
            const text = await ui.page.locator('main').innerText();
            assert(!text.includes('PRIVATE_SENTINEL'));
            for (const privateField of [
              'keyRef',
              'artifactReview',
              'signerPersonId',
              'credentialDocuments',
              'signingEvidenceRef',
            ])
              assert(!text.includes(privateField));
            assert.equal(await ui.page.locator('textarea').count(), 0);
            const storage = await ui.page.evaluate(() => ({
              local: localStorage.length,
              session: sessionStorage.length,
            }));
            assert.deepEqual(storage, { local: 0, session: 0 });
            assert(!ui.console.join('\n').includes('PRIVATE_SENTINEL'));
            assert(!ui.console.join('\n').includes(h.actors.clinician.token));
          };
          try {
            const uis = [];
            for (const locale of ['ar-EG', 'en-EG']) {
              const ui = await login(locale);
              uis.push(ui);
              await wait(ui, 'ready');
              assert.equal(ui.last.data[0].releaseId, ready.id);
              await noLeaks(ui);
              check('NATIVE_AUTHORIZED_METADATA_' + locale);
              assert.equal(
                await ui.page.locator('main').getAttribute('dir'),
                locale === 'ar-EG' ? 'rtl' : 'ltr',
              );
              check('DIRECTION_' + locale);
              if (scenario === 'lifecycle') {
                const font = await ui.page.evaluate(async (locale) => {
                  const family = locale === 'ar-EG' ? 'IBM Plex Sans Arabic' : 'Inter';
                  const loaded = await document.fonts.load(
                    `400 16px "${family}"`,
                    locale === 'ar-EG' ? 'عربي' : 'English',
                  );
                  return loaded.length > 0 && loaded.every((f) => f.status === 'loaded');
                }, locale);
                assert(font);
                check('BUNDLED_FONT_' + locale);
                for (const [mode, kind] of [
                  ['empty', 'empty'],
                  ['error', 'error'],
                  ['denied', 'denied'],
                  ['stale', 'stale'],
                  ['gated', 'gated'],
                  ['terminal', 'terminal'],
                ]) {
                  ui.mode = mode;
                  await refresh(ui, kind);
                  assert.equal(await ui.page.locator('article').count(), 0);
                  await noLeaks(ui);
                  await ui.page.screenshot({
                    path: `${a}/${runtime.name}-${locale}-${kind}.png`,
                    fullPage: true,
                  });
                  screenshots.push(`${a}/${runtime.name}-${locale}-${kind}.png`);
                  check('FIXTURE_STATE_' + kind + '_' + locale);
                }
                ui.mode = null;
                await refresh(ui);
                for (const eligibility of ['future', 'superseded', 'unavailable']) {
                  ui.mode = eligibility;
                  await refresh(ui);
                  await ui.page.getByText(ui.c[eligibility], { exact: true }).waitFor();
                  await ui.page.screenshot({
                    path: `${a}/${runtime.name}-${locale}-${eligibility}.png`,
                    fullPage: true,
                  });
                  screenshots.push(`${a}/${runtime.name}-${locale}-${eligibility}.png`);
                  check('UI_ONLY_AUTHORIZED_SHAPE_' + eligibility + '_' + locale);
                }
                ui.mode = 'loading';
                await ui.page.getByRole('button', { name: ui.c.refresh, exact: true }).click();
                await wait(ui, 'loading');
                assert.equal(await ui.page.locator('article').count(), 0);
                await wait(ui, 'ready');
                ui.mode = null;
                check('LOADING_CLEARS_OLD_ROWS_' + locale);
                await ui.page.evaluate(() => window.dispatchEvent(new Event('offline')));
                await wait(ui, 'offline');
                assert(
                  await ui.page
                    .getByRole('button', { name: ui.c.refresh, exact: true })
                    .isDisabled(),
                );
                assert.equal(await ui.page.locator('article').count(), 0);
                const reads = ui.reads;
                await ui.page.evaluate(() => window.dispatchEvent(new Event('online')));
                await wait(ui, 'stale');
                assert.equal(ui.reads, reads);
                await refresh(ui);
                check('OFFLINE_NO_QUEUE_EXPLICIT_RECOVERY_' + locale);
                await ui.page.evaluate(() =>
                  window.dispatchEvent(new Event('shifaa:context-changed')),
                );
                await wait(ui, 'denied');
                assert.equal(await ui.page.locator('article').count(), 0);
                await refresh(ui);
                check('CONTEXT_CHANGE_CLEARS_ROWS_' + locale);
                await ui.page.getByRole('button', { name: ui.c.refresh, exact: true }).focus();
                await ui.page.keyboard.press('Enter');
                await wait(ui, 'ready');
                assert(
                  await ui.page
                    .locator('[data-status-outcome]')
                    .evaluate((e) => e === document.activeElement),
                );
                await ui.page.keyboard.press('Tab');
                assert.equal(
                  await ui.page.evaluate(() => document.activeElement.id),
                  'status-content-type',
                );
                check('KEYBOARD_FOCUS_RETURN_LIVE_RECOVERY_' + locale);
                for (const [width, height] of [
                  [360, 800],
                  [412, 915],
                  [768, 1024],
                  [1440, 900],
                ]) {
                  await ui.page.setViewportSize({ width, height });
                  assert(
                    await ui.page.evaluate(
                      () => document.documentElement.scrollWidth <= innerWidth + 1,
                    ),
                  );
                  assert(
                    await ui.page
                      .locator('main button:visible,main input:visible,main a:visible')
                      .evaluateAll((es) =>
                        es.every(
                          (e) =>
                            e.getBoundingClientRect().width >= 44 &&
                            e.getBoundingClientRect().height >= 44,
                        ),
                      ),
                  );
                  const shot = `${a}/${runtime.name}-${locale}-${width}x${height}.png`;
                  await ui.page.screenshot({ path: shot, fullPage: true });
                  screenshots.push(shot);
                  check('VIEWPORT_REFLOW_TARGETS_' + width + '_' + locale);
                }
                await ui.page.setViewportSize({ width: 360, height: 900 });
                await ui.page.evaluate(() => {
                  document.documentElement.style.fontSize = '200%';
                });
                assert(
                  await ui.page.evaluate(
                    () => document.documentElement.scrollWidth <= innerWidth + 1,
                  ),
                );
                await ui.page.emulateMedia({ forcedColors: 'active', reducedMotion: 'reduce' });
                await ui.page.getByRole('button', { name: ui.c.refresh, exact: true }).focus();
                assert(
                  await ui.page
                    .getByRole('button', { name: ui.c.refresh, exact: true })
                    .evaluate((e) => getComputedStyle(e).outlineStyle !== 'none'),
                );
                await ui.page.evaluate(() => {
                  document.documentElement.style.fontSize = '';
                });
                await ui.page.emulateMedia({ forcedColors: 'none', reducedMotion: 'reduce' });
                check('200_PERCENT_TEXT_400_PERCENT_REFLOW_EQUIVALENT_FORCED_COLORS_' + locale);
                await noLeaks(ui);
                check('DOM_STORAGE_CONSOLE_NO_PRIVATE_MATERIAL_' + locale);
              }
            }
            if (scenario === 'lifecycle') {
              const denied = await login('ar-EG', 'pharmacist');
              await wait(denied, 'denied');
              assert.equal(await denied.page.locator('article').count(), 0);
              check('SIGNING_ALONE_HAS_NO_STATUS_AUTHORITY');
              const weak = await login('en-EG', 'clinician', 1);
              assert.equal(weak.reads, 0);
              check('NATIVE_AAL1_NEVER_CLAIMS_AAL2');
              const grant = h.owner(
                `SELECT to_json(id) FROM clinical.content_governance_authorities WHERE person_id=${q(person(2))}::uuid AND action='listClinicalContent' AND capacity IS NULL;`,
              );
              sql(
                runtime,
                h.database,
                `UPDATE clinical.content_governance_authorities SET status='revoked',version=version+1 WHERE id=${q(grant)}::uuid;`,
              );
              for (const ui of uis) {
                await refresh(ui, 'denied');
                assert.equal(await ui.page.locator('article').count(), 0);
              }
              check('REAL_STATUS_GRANT_LOSS_AR_EN');
              sql(
                runtime,
                h.database,
                `UPDATE clinical.content_governance_authorities SET status='active',version=version+1 WHERE id=${q(grant)}::uuid;`,
              );
              control.facility = 'f0110000-0000-4000-8200-000000000099';
              for (const ui of uis) await refresh(ui, 'denied');
              control.facility = facility;
              check('SERVER_SELECTED_WRONG_FACILITY_DENIES_AR_EN');
              for (const key of ['feature011Enabled', 'feature011KillSwitch']) {
                const saved = h.config[key];
                h.config[key] = key === 'feature011KillSwitch';
                // The root exposure hook returns no-store without private. The
                // generated client intentionally rejects that response as unsafe
                // cache policy; the UI displays recoverable unavailability.
                for (const ui of uis) await refresh(ui, 'error');
                h.config[key] = saved;
                check('REAL_API_GUARD_' + key + '_AR_EN');
              }
              const future = await h.ready({
                request: {
                  ...initial,
                  artifact: successorArtifact,
                  effectiveAt: new Date(Date.now() + 30000).toISOString(),
                  predecessor: { initial: false, supersedesReleaseId: ready.id },
                },
              });
              const published = await h.publish(future.id);
              assert.equal(published.statusCode, 200, published.body);
              for (const ui of uis) {
                await refresh(ui);
                assert.equal(ui.last.data[0].releaseId, ready.id);
                assert(!ui.last.data.some((r) => r.releaseId === future.id));
              }
              check('REAL_FUTURE_RESERVATION_NOT_EARLY_OR_DISCLOSED_AR_EN');
              const boundary = new Date(published.json().effectiveAt).getTime();
              while (Date.now() <= boundary + 20) await new Promise((r) => setTimeout(r, 100));
              for (const ui of uis) {
                await refresh(ui);
                assert.equal(ui.last.data[0].releaseId, future.id);
                await ui.page.getByText(ui.c.successor, { exact: false }).waitFor();
              }
              check('REAL_EFFECTIVE_BOUNDARY_SUCCESSOR_AR_EN');
              sql(
                runtime,
                h.database,
                `UPDATE clinical.content_admissibility_evidence SET status='revoked',version=version+1 WHERE id=${q(future.approval)}::uuid;`,
              );
              for (const ui of uis) {
                await refresh(ui, 'empty');
                assert.equal(await ui.page.locator('article').count(), 0);
                assert.deepEqual(ui.last.data, []);
              }
              check('REAL_EXACT_ADMISSION_LOSS_NO_ANCESTOR_FALLBACK_AR_EN');
            } else {
              const binding = h.owner(
                `SELECT to_jsonb(b) FROM clinical.content_signature_bindings b JOIN audit.signature_evidence s ON s.id=b.signature_evidence_id WHERE s.resource_id=${q(ready.id)}::uuid AND s.signer_role='pharmacist';`,
              );
              sql(
                runtime,
                h.database,
                `UPDATE identity.professional_licenses SET expires_on='2000-01-01',version=version+1 WHERE id=${q(binding.credential_id)}::uuid;`,
              );
              for (const ui of uis) {
                await refresh(ui, 'empty');
                assert.deepEqual(ui.last.data, []);
                assert.equal(await ui.page.locator('article').count(), 0);
                await noLeaks(ui);
              }
              check('REAL_BOUND_SIGNER_QUALIFICATION_LOSS_AR_EN');
            }
            assert.deepEqual(history(), original);
            check('IMMUTABLE_HISTORY_PRESERVED');
            assert.equal(control.resolver, 0);
            assert.equal(control.keys, 0);
            check('ZERO_MATERIAL_RESOLUTION_KEY_PREPARATION_FOR_STATUS');
            return {
              runtime: runtime.name,
              scenario,
              health: h.health,
              checks,
              count: checks.length,
              screenshots: screenshots.map((path) => ({ path, sha256: digest(path) })),
              counters: h.counters(),
              syntheticOnly: true,
            };
          } finally {
            for (const context of contexts) await context.close();
          }
        },
        (args) => {
          const repository = {
            ...args.repository,
            readContext: args.repository.readContext.bind(args.repository),
          };
          const source = args.deps.material.resolve.bind(args.deps.material),
            prepare = args.provider.prepare.bind(args.provider);
          args.deps.material.resolve = async (...a) => {
            if (control.reading) {
              control.resolver++;
              throw Error('STATUS_RESOLVER_FORBIDDEN');
            }
            return source(...a);
          };
          args.provider.prepare = async (...a) => {
            if (control.reading) {
              control.keys++;
              throw Error('STATUS_KEY_PREPARATION_FORBIDDEN');
            }
            return prepare(...a);
          };
          return {
            reading: new Feature011Governance({
              repository,
              material: args.deps.material,
              evidence: args.deps.evidence,
              cursorKey: randomBytes(32),
              context: {
                resolve: async (actor) =>
                  Number(actor.personId.slice(-12)) === 2
                    ? { role: control.role, facilityId: control.facility }
                    : Number(actor.personId.slice(-12)) === 3
                      ? { role: 'PHA', facilityId: facility }
                      : { role: 'ADM-MEDICAL' },
              },
            }),
          };
        },
      );
      assert(result.cleanup.absenceVerified);
      results.push(result);
    }
  }
  assert.deepEqual(currentPhysicalSourceDigests(root), pins);
  for (const [p, h] of Object.entries(inputs)) assert.equal(digest(p), h);
  const final = await verifyFeature011Contracts();
  assert.equal(final.result, 'PASS', final.failures.join('\n'));
  writeFileSync(
    e + '/us4-demo.json',
    JSON.stringify(
      {
        result: 'PASS',
        checkpoint: 'K21',
        task: 'T079',
        inputs,
        physicalSourceDigests: pins,
        parityPins: Object.keys(final.inputDigests).length,
        runtimes: results,
        registry: {
          allFamilyStates: 99,
          statusFamily: assignedStates,
          ownership: {
            K12: 'patient records/clinic allergy summary',
            K14: 'allergy verification/history',
            K19: 'admin content',
            K21: 'clinic status',
          },
          frozenReferencesChanged: false,
        },
        browser: {
          channel: 'installed Chrome',
          version: browser.version(),
          limitation:
            'Headless installed Chrome synthetic engineering evidence; 400% CSS reflow equivalence, not native zoom/reference environment/final visual acceptance',
        },
        fixtureBoundaries:
          'Auth handoff fixture carries real native token. UI future/superseded/unavailable shape fixtures do not imply SQL discloses unavailable releases. Real future/admission/signer-loss reads separately proven. Current security proof remains K20, not replaced by UI.',
        clinicalApproval: false,
        productionReady: false,
        shippableMvp: false,
        finalDesignApproval: false,
        openUx002: 'OPEN',
        retainedGates: 'UNCHANGED_OPEN',
        acceptance: 'PENDING_PRODUCT_OWNER',
        capturedAt: new Date().toISOString(),
      },
      null,
      2,
    ) + '\n',
  );
  console.log(
    JSON.stringify({
      result: 'PASS',
      runtimes: results.map((r) => ({ runtime: r.runtime, scenario: r.scenario, count: r.count })),
    }),
  );
} finally {
  await browser.close();
}
