// K19 live UI -> generated client -> native Auth/non-owner SQL; only neutral synthetic sources.
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { chromium } from 'playwright';
import {
  withPublication,
  quote as q,
  person,
  publicationRow,
} from './feature-011-publication-fixtures.mjs';
import { request as initial } from './run-feature-011-content-api-test.mjs';
import { root, runtimes, sql, digest } from './run-feature-011-postgres-test.mjs';
import { Feature011Governance } from '../services/api/src/modules/feature-011/list-clinical-content.ts';
import { contentCopy } from '../packages/i18n/src/feature-011.ts';
import {
  verifyFeature011Contracts,
  currentPhysicalSourceDigests,
} from './verify-feature-011-contracts.mjs';
const f = 'specs/011-allergies-clinical-content-governance',
  e = `${f}/evidence/fresh-implementation/K19`,
  a = 'artifacts/feature-011/k19';
mkdirSync(e, { recursive: true });
mkdirSync(a, { recursive: true });
const parity = await verifyFeature011Contracts();
assert.equal(parity.result, 'PASS', parity.failures.join('\n'));
const pins = currentPhysicalSourceDigests(root);
const paths = [
  'apps/admin/src/app/clinical-content/page.tsx',
  'apps/admin/src/app/clinical-content/ClinicalContentWorkspace.tsx',
  'apps/admin/src/app/clinical-content/content-controller.ts',
  'apps/admin/src/app/clinical-content/clinical-content.css',
  'packages/i18n/src/feature-011.ts',
  'tools/run-feature-011-admin-ui-test.mjs',
];
const inputs = Object.fromEntries(paths.map((p) => [p, digest(p)]));
const results = [];
const browser = await chromium.launch({ channel: 'chrome' });
try {
  for (const runtime of runtimes) {
    let governed;
    const result = await withPublication(
      runtime,
      async (h) => {
        const checks = [],
          pages = [];
        const check = (id) => {
          checks.push({ id, result: 'PASS' });
          console.log(runtime.name + ': ' + id);
        };
        const state = () =>
          h.owner(
            `SELECT json_build_object('domain',(SELECT count(*) FROM clinical.content_releases),'audit',(SELECT count(*) FROM audit.events),'outbox',(SELECT count(*) FROM platform.outbox_events),'receipts',(SELECT count(*) FROM clinical.mutation_receipts),'completed',(SELECT count(*) FROM platform.idempotency_records WHERE state='completed'));`,
          );
        const admit = async (id) => {
          const r = publicationRow(h, id),
            approval = randomUUID();
          sql(
            runtime,
            h.database,
            `INSERT INTO clinical.content_admissibility_evidence(id,release_id,artifact_version,artifact_digest,content_type,governed_content_key,effective_scope_key,policy_ref,policy_version,policy_sha256,source_admission_ref,category_admission_ref,code_admission_ref,test_vector_admission_ref,source_identity,source_evidence_identity,synthetic,status,valid_from,version) VALUES(${q(approval)}::uuid,${q(id)}::uuid,${r.artifactVersion},decode(${q(r.artifactDigest)},'hex'),${q(r.contentType)},${q(r.governedContentKey)},${q(r.effectiveScopeKey)},${q(randomUUID())}::uuid,'synthetic-policy-v1',decode(repeat('b',64),'hex'),${q(randomUUID())}::uuid,${q(randomUUID())}::uuid,${q(randomUUID())}::uuid,${q(randomUUID())}::uuid,'synthetic.exact-admission',${q(randomUUID())},true,'active','2020-01-01',1);`,
          );
          await h.offline.admission(approval);
        };
        async function enter(actor, locale) {
          const context = await browser.newContext({ viewport: { width: 1440, height: 900 } }),
            page = await context.newPage();
          pages.push(context);
          const control = { mode: null, ack: false, posts: [], last: null };
          await page.route('**/v1/**', async (route) => {
            const req = route.request(),
              path = new URL(req.url()).pathname;
            if (path === '/v1/auth/login')
              return route.fulfill({ json: { challenge_id: 'synthetic-existing-login-handoff' } });
            if (path === '/v1/auth/otp/verify')
              return route.fulfill({ json: { access_token: h.actors[actor].token, aal: 2 } });
            if (!path.startsWith('/v1/admin/clinical-content'))
              throw Error('Unexpected browser domain operation ' + path);
            if (control.mode === 'loading') {
              await new Promise((r) => setTimeout(r, 800));
            }
            if (control.mode === 'off' || control.mode === 'kill') {
              return route.fulfill({
                status: 404,
                headers: { 'cache-control': 'private, no-store' },
                json: { code: 'not-found' },
              });
            }
            if (control.mode === 'error')
              return route.fulfill({
                status: 500,
                headers: { 'cache-control': 'private, no-store' },
                json: { code: 'unavailable' },
              });
            if (control.mode === 'denied')
              return route.fulfill({
                status: 403,
                headers: { 'cache-control': 'private, no-store' },
                json: { code: 'forbidden' },
              });
            if (control.mode === 'stale')
              return route.fulfill({
                status: 409,
                headers: { 'cache-control': 'private, no-store' },
                json: { code: 'version-conflict' },
              });
            if (control.mode === 'empty')
              return route.fulfill({
                headers: { 'cache-control': 'private, no-store' },
                json: {
                  projection: 'governance',
                  data: [],
                  meta: {
                    stale: false,
                    nextCursor: null,
                    lastUpdatedAt: '2026-10-09T00:00:00.000000Z',
                  },
                },
              });
            const headers = { ...req.headers() };
            delete headers.host;
            delete headers['content-length'];
            const response = await h.app.inject({
              method: req.method(),
              url: new URL(req.url()).pathname + new URL(req.url()).search,
              headers,
              ...(req.postData() ? { payload: req.postData() } : {}),
            });
            if (req.method() === 'POST') {
              control.posts.push({
                key: headers['idempotency-key'],
                version: headers['if-match'],
                body: req.postData(),
                status: response.statusCode,
                ...(response.statusCode >= 300 ? { problemCode: response.json().code } : {}),
              });
              if (response.statusCode < 300) control.last = response.json();
            }
            if (control.ack && req.method() === 'POST') {
              control.ack = false;
              return route.abort('failed');
            }
            return route.fulfill({
              status: response.statusCode,
              headers: Object.fromEntries(
                Object.entries(response.headers).map(([k, v]) => [k, String(v)]),
              ),
              body: response.body,
            });
          });
          await page.goto('http://127.0.0.1:18219/clinical-content');
          await page
            .getByLabel('وسيلة الدخول', { exact: true })
            .fill('synthetic-existing-native-session');
          await page.getByLabel('كلمة المرور', { exact: true }).fill('synthetic-transport-only');
          await page.getByRole('button', { name: 'متابعة آمنة', exact: true }).click();
          await page.getByLabel('رمز التحقق', { exact: true }).fill('000000');
          await page.getByRole('button', { name: 'تحقق وافتح مساحة الإدارة', exact: true }).click();
          if (locale === 'en-EG')
            await page
              .getByLabel(contentCopy['ar-EG'].locale, { exact: true })
              .selectOption(locale);
          const c = contentCopy[locale];
          await page.getByLabel(c.purpose, { exact: true }).fill('synthetic.feature011');
          await page.getByLabel(c.contentType, { exact: true }).fill('synthetic');
          return { page, context, control, c, locale, actor };
        }
        async function language(ui, locale) {
          await ui.page.getByLabel(ui.c.locale, { exact: true }).selectOption(locale);
          ui.locale = locale;
          ui.c = contentCopy[locale];
        }
        async function load(ui, id) {
          const { page, c } = ui;
          if (id) {
            await page.getByLabel(c.projection, { exact: true }).selectOption('assigned_review');
            await page.getByLabel(c.releaseId, { exact: true }).fill(id);
          }
          const response = page.waitForResponse(
            (r) =>
              r.request().method() === 'GET' &&
              new URL(r.url()).pathname.startsWith('/v1/admin/clinical-content'),
          );
          await page.getByRole('button', { name: c.load, exact: true }).click();
          const resolved = await response;
          if (!ui.control.mode) {
            assert.equal(
              resolved.status(),
              200,
              'Native authorized UI projection ' +
                ui.locale +
                ' ' +
                (id ? 'assigned_review' : 'governance'),
            );
            if (id) {
              const body = await resolved.json();
              assert.equal(body.projection, 'assigned_review');
              assert.equal(body.data.length, 1, 'Exact assigned artifact is required');
            }
            await page.waitForFunction(
              ({ empty, ready }) =>
                Array.from(document.querySelectorAll('[role=status]')).some(
                  (e) => e.textContent === empty || e.textContent === ready,
                ),
              { empty: c.empty, ready: c.reviewFirst },
            );
          }
        }
        async function confirmation(ui, action, confirm) {
          const { page } = ui;
          await page.getByRole('button', { name: action, exact: true }).click();
          await page.getByRole('dialog').waitFor();
          await page
            .getByRole('dialog')
            .getByRole('button', { name: ui.c.cancel, exact: true })
            .click();
          await page.waitForFunction(
            (name) => document.activeElement?.textContent === name,
            action,
          );
          assert.equal(
            await page
              .getByRole('button', { name: action, exact: true })
              .evaluate((e) => e === document.activeElement),
            true,
          );
          await page.getByRole('button', { name: action, exact: true }).click();
          await page.keyboard.press('Tab');
          assert.equal(
            await page.evaluate(() => !!document.activeElement?.closest('dialog[open]')),
            true,
          );
          await page.keyboard.press('Escape');
          await page.waitForFunction(
            (name) => document.activeElement?.textContent === name,
            action,
          );
          assert.equal(
            await page
              .getByRole('button', { name: action, exact: true })
              .evaluate((e) => e === document.activeElement),
            true,
          );
          await page.getByRole('button', { name: action, exact: true }).click();
          assert(
            await page
              .getByRole('dialog')
              .getByRole('button', { name: confirm, exact: true })
              .isVisible(),
          );
          await page
            .getByRole('dialog')
            .getByRole('button', { name: confirm, exact: true })
            .click();
          await page.getByRole('dialog').waitFor({ state: 'hidden' });
          assert(
            ui.control.posts.at(-1)?.status < 300,
            'Native UI mutation failed: ' +
              action +
              ' ' +
              JSON.stringify({
                status: ui.control.posts.at(-1)?.status,
                code: ui.control.posts.at(-1)?.problemCode,
              }),
          );
          check('CONFIRM_CANCEL_ESCAPE_FOCUS_' + action + '_' + ui.locale);
        }
        async function create(ui, body, intent = 'initial', ack = false) {
          const { page, c } = ui;
          await load(ui);
          await page.getByLabel(c.initial, { exact: true }).selectOption(intent);
          for (const [key, value] of Object.entries({
            key: body.governedContentKey,
            scope: body.effectiveScopeKey,
            source: body.source.display,
            effectiveAt: body.effectiveAt,
            contentRef: body.artifact.contentEvidenceRef,
            codeRef: body.artifact.codeEvidenceRef,
            testRef: body.artifact.testVectorEvidenceRef,
            declaredDigest: body.artifact.declaredDigest ?? '',
            ...(intent === 'initial' ? {} : { predecessor: body.predecessor.supersedesReleaseId }),
          }))
            await page.getByLabel(c[key], { exact: true }).fill(value);
          ui.control.ack = ack;
          await confirmation(
            ui,
            c[intent === 'initial' ? 'create' : intent],
            c[
              intent === 'initial'
                ? 'confirmCreate'
                : intent === 'successor'
                  ? 'confirmSuccessor'
                  : 'confirmRollback'
            ],
          );
          if (ack) {
            await page.getByText(c.reconciling, { exact: true }).waitFor();
            const before = state();
            await page.getByRole('button', { name: c.retry, exact: true }).click();
            await page.getByRole('heading', { name: c.success, exact: true }).waitFor();
            assert.deepEqual(state(), before);
            assert.deepEqual(ui.control.posts.at(-1), ui.control.posts.at(-2));
            check('ORIGINAL_RECEIPT_EXPLICIT_SAME_BINDING_REPLAY_' + ui.locale);
          }
          await page.getByRole('heading', { name: c.success, exact: true }).waitFor();
          return ui.control.last.releaseId;
        }
        async function sign(ui, id, decision = 'approved') {
          await load(ui, id);
          const n = ui.actor === 'clinician' ? 2 : 3,
            b = h.issue(id, n, decision);
          await ui.page.getByLabel(ui.c.capacity, { exact: true }).selectOption(b.capacity);
          await ui.page.getByLabel(ui.c.evidence, { exact: true }).fill(b.signingEvidenceRef);
          await ui.page.getByLabel(ui.c.reason, { exact: true }).fill(b.reason);
          await confirmation(
            ui,
            ui.c[decision === 'approved' ? 'approve' : 'reject'],
            ui.c[decision === 'approved' ? 'confirmApprove' : 'confirmReject'],
          );
          await ui.page.getByRole('heading', { name: ui.c.success, exact: true }).waitFor();
        }
        async function publish(ui, id) {
          await load(ui);
          await ui.page.getByLabel(ui.c.reference, { exact: true }).selectOption(id);
          await confirmation(ui, ui.c.publish, ui.c.confirmPublish);
          await ui.page.getByRole('heading', { name: ui.c.success, exact: true }).waitFor();
        }
        try {
          // The shared historical fixture gives the physician separate read authority only.
          // Signing alone must fail before supplying an independently audited, test-only read scope.
          const sample = await h.content(initial);
          assert.equal(sample.statusCode, 201);
          const signingOnly = await h.request('GET', undefined, {
            actor: 'pharmacist',
            url:
              '/v1/admin/clinical-content/synthetic?projection=assigned_review&releaseId=' +
              sample.json().releaseId,
          });
          assert.equal(signingOnly.statusCode, 403);
          check('SIGNING_ALONE_DENIES_DISCLOSURE');
          const readGrant = randomUUID(),
            event = randomUUID();
          sql(
            runtime,
            h.database,
            `BEGIN;
            INSERT INTO clinical.content_governance_authorities
            (id,person_id,action,content_type,governed_content_key,effective_scope_key,facility_id,issued_by,evidence_ref,evidence_producer_id,evidence_verified_at,source_identity,source_evidence_identity,status,valid_from,version)
            SELECT ${q(readGrant)}::uuid,${q(person(3))}::uuid,action,content_type,governed_content_key,effective_scope_key,facility_id,issued_by,${q(randomUUID())}::uuid,evidence_producer_id,clock_timestamp(),'synthetic.k19.separate-read',${q(randomUUID())},'active',valid_from,1
            FROM clinical.content_governance_authorities WHERE id='f011c000-0000-4000-8400-000000000004';
            SELECT * FROM audit.append_event_v1(${q(event)}::uuid,${q(event)},'clinical_content_evidence.provisioned','clinical.content_governance_authorities','success',p_actor_person_id=>${q(person(8))}::uuid,p_resource_id=>${q(readGrant)}::uuid,p_resource_version=>1,p_purpose_code=>'governed.feature011.provision',p_user_agent_class=>'service'); COMMIT;`,
          );
          assert.equal(
            h.owner(
              `SELECT to_json(count(*)) FROM clinical.content_governance_authorities WHERE id=${q(readGrant)}::uuid AND action='listClinicalContent' AND capacity IS NULL;`,
            ),
            1,
          );
          check('SEPARATE_AUDITED_SYNTHETIC_REVIEW_SCOPE');
          const creator = await enter('medical', 'ar-EG'),
            physician = await enter('clinician', 'ar-EG'),
            pharmacist = await enter('pharmacist', 'en-EG'),
            publisher = await enter('publisher', 'en-EG');
          const id = await create(creator, initial, 'initial', true);
          assert.equal(
            h.owner(
              `SELECT to_json(count(*)) FROM clinical.content_artifact_admissibility_bindings WHERE release_id=${q(id)}::uuid;`,
            ),
            0,
          );
          check('DRAFT_BEFORE_PRIVATE_EXACT_ADMISSION');
          await admit(id);
          await sign(physician, id);
          await sign(pharmacist, id);
          await publish(publisher, id);
          check('LIVE_AR_EN_CREATE_TWO_INDEPENDENT_REVIEWERS_PUBLISH');
          for (const ui of [creator, physician, pharmacist, publisher])
            await language(ui, ui.locale === 'ar-EG' ? 'en-EG' : 'ar-EG');
          const successor = {
            ...initial,
            effectiveAt: new Date(Date.now() + 45000).toISOString(),
            artifact: { ...initial.artifact, declaredDigest: undefined },
            predecessor: { initial: false, supersedesReleaseId: id },
          };
          delete successor.artifact.declaredDigest;
          const future = await create(creator, successor, 'successor');
          await admit(future);
          await sign(physician, future);
          await sign(pharmacist, future);
          await publish(publisher, future);
          await load(publisher);
          await publisher.page.getByText(publisher.c.future, { exact: true }).first().waitFor();
          check('FUTURE_SUCCESSOR_SEPARATE_PUBLICATION_AND_EFFECTIVE');
          const untilEffective = Date.parse(successor.effectiveAt) - Date.now();
          assert(untilEffective > 0, 'Future fixture must still be future-effective when shown');
          await new Promise((resolve) => setTimeout(resolve, untilEffective + 25));
          check('REAL_EFFECTIVE_BOUNDARY_BEFORE_NEXT_SUCCESSOR');
          const rejected = await create(
            creator,
            {
              ...successor,
              effectiveAt: new Date().toISOString(),
              predecessor: { initial: false, supersedesReleaseId: future },
              artifact: { ...successor.artifact },
            },
            'successor',
          );
          await sign(physician, rejected, 'rejected');
          const retry = await create(
            creator,
            {
              ...successor,
              effectiveAt: new Date().toISOString(),
              predecessor: { initial: false, supersedesReleaseId: future },
              artifact: { ...successor.artifact },
            },
            'successor',
          );
          assert.notEqual(retry, rejected);
          await admit(retry);
          await sign(physician, retry);
          await sign(pharmacist, retry);
          await publish(publisher, retry);
          check('REJECTION_PRESERVED_AND_FRESH_REVIEWED_DRAFT');
          // A rollback is a fresh separately reviewed successor; it never updates the old release.
          const rollback = await create(
            creator,
            {
              ...initial,
              effectiveAt: new Date().toISOString(),
              artifact: { ...successor.artifact },
              predecessor: { initial: false, supersedesReleaseId: retry },
            },
            'rollback',
          );
          await admit(rollback);
          await sign(physician, rollback);
          await sign(pharmacist, rollback);
          await publish(publisher, rollback);
          check('ROLLBACK_FRESH_SEPARATELY_REVIEWED_SIGNED_SUCCESSOR');
          for (const ui of [creator, publisher]) {
            const loadedFont = await ui.page.evaluate(async (locale) => {
              const family = locale === 'ar-EG' ? 'IBM Plex Sans Arabic' : 'Inter';
              const faces = await document.fonts.load(
                `400 16px "${family}"`,
                locale === 'ar-EG' ? 'عربي' : 'English',
              );
              return faces.length > 0 && faces.every((f) => f.status === 'loaded');
            }, ui.locale);
            assert(loadedFont, 'Approved local font must be rendered');
            check('LOCAL_APPROVED_FONT_RENDERED_' + ui.locale);
            for (const [mode, label] of [
              ['empty', 'empty'],
              ['error', 'error'],
              ['denied', 'permission'],
              ['stale', 'stale'],
              ['off', 'error'],
              ['kill', 'error'],
            ]) {
              ui.control.mode = mode;
              await load(ui);
              await ui.page.getByText(ui.c[label], { exact: true }).waitFor();
              check('DEGRADED_' + mode + '_' + ui.locale);
            }
            ui.control.mode = 'loading';
            await ui.page.getByRole('button', { name: ui.c.load, exact: true }).click();
            await ui.page.getByText(ui.c.loading, { exact: true }).waitFor();
            ui.control.mode = null;
            await ui.page.getByText(ui.c.reviewFirst, { exact: true }).first().waitFor();
            await ui.page.evaluate(() => window.dispatchEvent(new Event('offline')));
            await ui.page.getByText(ui.c.offline, { exact: true }).waitFor();
            assert(
              await ui.page.getByRole('button', { name: ui.c.refresh, exact: true }).isDisabled(),
            );
            await ui.page.evaluate(() => window.dispatchEvent(new Event('online')));
            await ui.page.getByText(ui.c.stale, { exact: true }).waitFor();
            await load(ui);
            check('LOADING_OFFLINE_NO_QUEUE_STALE_RECOVERY_' + ui.locale);
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
              await ui.page.screenshot({
                path: `${a}/${runtime.name}-${ui.locale}-${width}x${height}.png`,
                fullPage: true,
              });
              if (width === 360 || width === 1440)
                await ui.page.screenshot({
                  path: `${a}/${runtime.name}-${ui.locale}-${width}-viewport.png`,
                });
              assert(
                await ui.page
                  .locator(
                    '.f011-content input:visible, .f011-content select:visible, .f011-content textarea:visible, .f011-content button:visible',
                  )
                  .evaluateAll((elements) =>
                    elements.every(
                      (e) =>
                        e.getBoundingClientRect().height >= 44 &&
                        e.getBoundingClientRect().width >= 44,
                    ),
                  ),
              );
              check('REFLOW_' + width + '_' + ui.locale);
            }
            // 1440 CSS px / 400% web zoom = 360 CSS px; same layout/reflow boundary.
            await ui.page.setViewportSize({ width: 360, height: 800 });
            assert(
              await ui.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
            );
            check('400_PERCENT_REFLOW_EQUIVALENT_' + ui.locale);
            await ui.page.evaluate(() => {
              document.documentElement.style.fontSize = '200%';
            });
            assert(
              await ui.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
            );
            await ui.page.evaluate(() => (document.documentElement.style.fontSize = ''));
            await ui.page.emulateMedia({ reducedMotion: 'reduce', forcedColors: 'active' });
            await ui.page.getByRole('button', { name: ui.c.load, exact: true }).focus();
            assert.equal(
              await ui.page.evaluate(() => getComputedStyle(document.activeElement).outlineWidth),
              '3px',
            );
            await ui.page.emulateMedia({ forcedColors: 'none' });
            assert.equal(
              await ui.page.locator('html').getAttribute('dir'),
              ui.locale === 'ar-EG' ? 'rtl' : 'ltr',
            );
            assert((await ui.page.locator('bdi[dir=ltr]').count()) > 0);
            check('KEYBOARD_FOCUS_HIGH_CONTRAST_200_PERCENT_RTL_LTR_' + ui.locale);
          }
          // View-level negatives above are transport fixtures; separately prove real default-off/kill exposure.
          for (const key of ['feature011Enabled', 'feature011KillSwitch']) {
            const previous = h.config[key];
            try {
              h.config[key] = key === 'feature011KillSwitch';
              const before = state();
              const denied = await h.request('GET', undefined, {
                actor: 'medical',
                url: '/v1/admin/clinical-content/synthetic?projection=governance',
              });
              assert.equal(denied.statusCode, 503);
              assert.deepEqual(state(), before);
            } finally {
              h.config[key] = previous;
            }
            check('REAL_API_' + key + '_DENIES');
          }
          assert.equal(h.counters().externalUnderLocks, 0);
          check('ZERO_EXTERNAL_UNDER_LOCKS');
          assert.equal(
            h.owner(
              `SELECT to_json(count(*)) FROM clinical.content_releases WHERE id IN (${[id, future, rejected, retry, rollback].map(q).join(',')});`,
            ),
            5,
          );
          check('DURABLE_DRAFT_HISTORY_PRESERVED');
          return {
            runtime: runtime.name,
            health: h.health,
            checks,
            count: checks.length,
            counters: h.counters(),
            syntheticOnly: true,
            loginHandoff:
              'Existing session shell uses test transport fixture carrying actual Supabase AAL2 token; domain requests verify native session and non-owner SQL. No new auth implementation.',
          };
        } finally {
          for (const context of pages) await context.close();
        }
      },
      (args) => {
        governed = new Feature011Governance({
          ...args.deps,
          repository: args.repository,
          cursorKey: randomBytes(32),
          context: {
            resolve: async (actor) => {
              const n = Number(actor.personId.slice(-12));
              return n === 2
                ? { role: 'CLN', facilityId: 'f0110000-0000-4000-8200-000000000001' }
                : n === 3
                  ? { role: 'PHA', facilityId: 'f0110000-0000-4000-8200-000000000001' }
                  : { role: 'ADM-MEDICAL' };
            },
          },
        });
        return { reading: governed };
      },
    );
    results.push(result);
  }
  assert.deepEqual(currentPhysicalSourceDigests(root), pins);
  for (const [p, sha] of Object.entries(inputs)) assert.equal(digest(p), sha);
  writeFileSync(
    `${e}/us3-demo.json`,
    JSON.stringify(
      {
        result: 'PASS',
        checkpoint: 'K19',
        task: 'T073',
        inputs,
        physicalSourceDigests: pins,
        browser: {
          channel: 'installed Chrome',
          version: browser.version(),
          limitation:
            'Pinned Playwright headless shell absent; installed Chrome engineering evidence, not a reference-environment or final visual acceptance claim',
        },
        runtimes: results,
        clinicalApproval: false,
        productionReady: false,
        shippableMvp: false,
        finalDesignApproval: false,
        openUx002: 'OPEN',
        retainedGates: 'UNCHANGED',
        acceptance: 'PENDING_PRODUCT_OWNER',
        capturedAt: new Date().toISOString(),
      },
      null,
      2,
    ) + '\n',
  );
} finally {
  await browser.close();
}
