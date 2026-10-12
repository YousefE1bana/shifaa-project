import { test, expect, type Page } from 'playwright/test';
import { mkdirSync } from 'node:fs';
import { allergyCopy } from '../../packages/i18n/src/feature-011';
const app = process.env['SHIFAA_F011_UI_APP'] ?? 'patient';
const person = 'f0110000-0000-4000-8000-000000000001',
  patient = 'f0110000-0000-4000-8100-000000000001',
  facility = 'f0110000-0000-4000-8200-000000000001',
  encounter = 'f0110000-0000-4000-8400-000000000001';
const revision = {
  revisionId: 'f0110000-0000-4000-8500-000000000001',
  allergyId: 'f0110000-0000-4000-8500-000000000002',
  patientId: patient,
  version: 1,
  previousRevisionId: null,
  status: 'self_reported',
  substance: { identity: 'synthetic-neutral', display: 'Neutral / مادة اختبار' },
  source: { display: 'Synthetic self report / بلاغ تجريبي' },
  coding: { knowledge: 'unknown' },
  reaction: { knowledge: 'unknown' },
  severity: { knowledge: 'unknown' },
  onset: { knowledge: 'unknown' },
  recorderPersonId: person,
  recordedAt: '2026-10-08T00:00:00Z',
  actionActorPersonId: person,
  actionAt: '2026-10-08T00:00:00Z',
  verification: null,
  correctsAllergyId: null,
};
type Mode = 'ready' | 'empty' | 'denied' | 'error' | 'stale' | 'loading' | 'default-off' | 'kill';
test.beforeEach(async ({ page }) => {
  page.on('console', (message) => {
    if (message.type() === 'error' && message.text().includes('Unexpected text node'))
      throw Error(message.text());
  });
});
async function enter(
  page: Page,
  locale: 'ar-EG' | 'en-EG',
  initial: Mode = 'ready',
  pairMismatch = false,
) {
  let mode = initial,
    ackLoss = false,
    reads = 0,
    postCount = 0;
  const posts: { key: string | undefined; body: string | null }[] = [],
    paths: string[] = [];
  let release!: () => void;
  const barrier = new Promise<void>((resolve) => (release = resolve));
  await page.context().addCookies([
    {
      name: 'shifaa_csrf',
      value: 'synthetic-csrf',
      domain: new URL(String(test.info().project.use.baseURL)).hostname,
      path: '/',
    },
  ]);
  await page.addInitScript((value) => localStorage.setItem('shifaa.patient.locale', value), locale);
  await page.route('**/v1/**', async (route) => {
    const req = route.request(),
      url = new URL(req.url()),
      path = url.pathname;
    paths.push(path);
    const send = (status: number, json: unknown) =>
      route.fulfill({ status, json, headers: { 'cache-control': 'private, no-store' } });
    if (path === '/v1/auth/session/refresh')
      return send(200, {
        accessToken: 'synthetic-browser-only',
        sessionId: encounter,
        assurance: 'aal2',
        expiresAt: '2027-01-01T00:00:00Z',
      });
    if (path === '/v1/auth/login')
      return send(200, { kind: 'challenge', challenge_id: 'synthetic-challenge' });
    if (path === '/v1/auth/otp/verify')
      return send(200, { kind: 'session', access_token: 'synthetic-browser-only', aal: 2 });
    if (path === '/v1/people/me')
      return send(200, {
        id: person,
        managedPatientId: patient,
        display_name: 'Synthetic Patient',
        birth_date: null,
        nationality_code: 'EG',
        preferred_locale: locale,
        verification_status: 'unverified',
        version: 1,
      });
    if (path.endsWith('/referrals'))
      return send(200, {
        data: [],
        meta: { nextCursor: null, stale: false, lastUpdatedAt: '2026-10-08T00:00:00Z' },
      });
    if (path === '/v1/appointments') return send(200, { items: [], freshness: 'fresh' });
    if (path === `/v1/encounters/${encounter}`)
      return send(200, {
        id: encounter,
        patientId: person,
        patientPersonId: pairMismatch ? patient : person,
        managedPatientId: patient,
        facilityId: facility,
        appointmentId: encounter,
        encounterType: 'general',
        responsibleClinicianId: person,
        status: 'open',
        startedAt: '2026-10-08T00:00:00Z',
        version: 1,
        notes: [],
        participants: [],
      });
    if (path === `/v1/patients/${patient}/allergies`) {
      expect(req.headers()['authorization']).toBe('Bearer synthetic-browser-only');
      expect(req.headers()['x-purpose']).toBe('care');
      if (req.method() === 'POST') {
        posts.push({ key: req.headers()['idempotency-key'], body: req.postData() });
        postCount++;
        if (ackLoss) {
          ackLoss = false;
          return route.abort('failed');
        }
        if (mode === 'kill' || mode === 'denied') return send(403, { status: 403 });
        return send(201, revision);
      }
      reads++;
      if (mode === 'loading') await barrier;
      if (['denied', 'kill', 'default-off', 'error'].includes(mode))
        return send(mode === 'error' ? 500 : mode === 'default-off' ? 404 : 403, {
          status: mode === 'error' ? 500 : 403,
        });
      return send(200, {
        view: url.searchParams.get('view') ?? 'current',
        data: mode === 'empty' ? [] : [revision],
        meta: { nextCursor: null, stale: mode === 'stale', lastUpdatedAt: '2026-10-08T00:00:00Z' },
      });
    }
    return send(404, { status: 404 });
  });
  if (app === 'patient') {
    await page.goto('/records');
    await expect(page.getByRole('heading', { name: allergyCopy[locale].title })).toBeVisible();
    await page.evaluate(() => window.dispatchEvent(new Event('online')));
  } else {
    await page.goto(`/patients/${person}/summary?encounterId=${encounter}`);
    if (locale === 'en-EG')
      await page.getByRole('button', { name: 'English', exact: true }).click();
    await page.getByLabel(locale === 'en-EG' ? 'Sign-in handle' : 'وسيلة الدخول').fill('synthetic');
    await page
      .getByLabel(locale === 'en-EG' ? 'Password' : 'كلمة المرور', { exact: true })
      .fill('synthetic');
    await page
      .getByRole('button', { name: locale === 'en-EG' ? 'Continue' : 'متابعة', exact: true })
      .click();
    await page
      .getByLabel(locale === 'en-EG' ? 'Verification code' : 'رمز التحقق', { exact: true })
      .fill('123456');
    await page
      .getByRole('button', { name: locale === 'en-EG' ? 'Verify' : 'تحقق', exact: true })
      .click();
  }
  return {
    panel: page.getByTestId('f011-allergy-panel'),
    posts,
    paths,
    setMode: (v: Mode) => (mode = v),
    setAckLoss: () => (ackLoss = true),
    release: () => {
      mode = 'ready';
      release();
    },
    reads: () => reads,
    postCount: () => postCount,
  };
}
for (const locale of ['ar-EG', 'en-EG'] as const) {
  const copy = allergyCopy[locale];
  test(`${locale} report, explicit review, original receipt, keyboard and source/history`, async ({
    page,
  }) => {
    const f = await enter(page, locale);
    await expect(f.panel.getByText(copy.ready, { exact: true })).toBeVisible();
    await expect(
      f.panel.getByText(`${copy.coding}: ${copy.unknown}`, { exact: true }),
    ).toBeVisible();
    await f.panel.getByLabel(copy.substance, { exact: true }).fill('Synthetic neutral / اختبار');
    await f.panel.getByLabel(copy.source, { exact: true }).fill('Synthetic source');
    const report = f.panel.getByRole('button', { name: copy.report, exact: true });
    await report.focus();
    await expect(report).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(f.panel.getByText(copy.review, { exact: true })).toBeVisible();
    expect(f.posts).toHaveLength(0);
    expect(await f.panel.evaluate((el) => el.contains(document.activeElement))).toBe(true);
    await f.panel.getByRole('button', { name: copy.cancel, exact: true }).click();
    await expect(report).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(f.panel.getByText(copy.review, { exact: true })).toBeVisible();
    expect(f.posts).toHaveLength(0);
    const confirm = f.panel.getByRole('button', { name: copy.confirm, exact: true });
    await confirm.focus();
    await page.keyboard.press('Enter');
    await expect(f.panel.getByText(copy.success, { exact: true })).toBeVisible();
    await expect(f.panel.getByText(copy.next, { exact: true })).toBeVisible();
    expect(f.posts).toHaveLength(1);
    expect(JSON.parse(f.posts[0]!.body!)).not.toHaveProperty('managedPatientId');
    if (app === 'clinic') expect(JSON.parse(f.posts[0]!.body!).encounterId).toBe(encounter);
    await f.panel.getByRole('button', { name: copy.history, exact: true }).click();
    await expect
      .poll(() => f.paths.filter((p) => p.endsWith('/allergies')).length)
      .toBeGreaterThan(1);
    await expect(f.panel.getByText(/Synthetic self report/)).toBeVisible();
    expect(await f.panel.evaluate((el) => getComputedStyle(el).direction)).toBe(
      locale === 'ar-EG' ? 'rtl' : 'ltr',
    );
    expect(f.paths.some((p) => p === `/v1/patients/${person}/allergies`)).toBe(false);
    if (app === 'clinic') await expect(f.panel.locator('bdi[dir="ltr"]').first()).toBeVisible();
    else await expect(f.panel).toContainText('\u2066');
    const directory =
      process.env['SHIFAA_F011_UI_EVIDENCE'] ??
      'specs/011-allergies-clinical-content-governance/evidence/fresh-implementation/K12/browser';
    mkdirSync(directory, { recursive: true });
    if (app === 'patient') {
      await page.setViewportSize({ width: 1280, height: 2000 });
      await page.evaluate(() =>
        document.querySelectorAll('*').forEach((el) => {
          if (el.scrollTop > 0) el.scrollTop = 0;
        }),
      );
    }
    await page.screenshot({
      path: `${directory}/${app}-${locale}-source-history.png`,
      fullPage: true,
    });
  });
  for (const mode of ['empty', 'denied', 'stale', 'error', 'default-off', 'kill'] as const) {
    test(`${locale} ${mode} clears sensitive rows and enforces access`, async ({ page }) => {
      const f = await enter(page, locale, mode);
      await expect(
        f.panel.getByText(copy[mode === 'default-off' || mode === 'kill' ? 'denied' : mode], {
          exact: true,
        }),
      ).toBeVisible();
      if (mode !== 'empty') {
        await expect(f.panel.getByLabel(copy.substance, { exact: true })).toHaveCount(0);
        await expect(f.panel.getByText(/Neutral \/ مادة/)).toHaveCount(0);
      }
      expect(f.posts).toHaveLength(0);
    });
  }
  test(`${locale} loading barrier, offline, manual reconciliation preserves original key/body`, async ({
    page,
  }) => {
    const f = await enter(page, locale, 'loading');
    await expect(f.panel.getByText(copy.loading, { exact: true })).toBeVisible();
    f.release();
    await expect(f.panel.getByText(copy.ready, { exact: true })).toBeVisible();
    await page.context().setOffline(true);
    await page.evaluate(() => window.dispatchEvent(new Event('offline')));
    await expect(f.panel.getByText(copy.offline, { exact: true })).toBeVisible();
    expect(f.postCount()).toBe(0);
    await page.context().setOffline(false);
    await page.evaluate(() => window.dispatchEvent(new Event('online')));
    await f.panel.getByRole('button', { name: copy.refresh, exact: true }).click();
    await expect(f.panel.getByText(copy.ready, { exact: true })).toBeVisible();
    await f.panel.getByLabel(copy.substance, { exact: true }).fill('Synthetic');
    await f.panel.getByLabel(copy.source, { exact: true }).fill('Source');
    await f.panel.getByRole('button', { name: copy.report, exact: true }).click();
    f.setAckLoss();
    await f.panel.getByRole('button', { name: copy.confirm, exact: true }).click();
    await expect(f.panel.getByText(copy.reconciling, { exact: true })).toBeVisible();
    expect(f.postCount()).toBe(1);
    await f.panel.getByRole('button', { name: copy.retry, exact: true }).click();
    await expect(f.panel.getByText(copy.success, { exact: true })).toBeVisible();
    expect(f.posts[0]).toEqual(f.posts[1]);
  });
  test(`${locale} responsive 360/412/768/1440, 200% text and 400% reflow`, async ({ page }) => {
    const f = await enter(page, locale);
    await expect(f.panel.getByText(copy.ready, { exact: true })).toBeVisible();
    for (const width of [360, 412, 768, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      expect(await f.panel.evaluate((el) => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
    }
    await page.addStyleTag({
      content:
        '[data-testid="f011-allergy-panel"] * {font-size:200% !important;line-height:1.6 !important;}',
    });
    await page.setViewportSize({ width: 360, height: 900 });
    expect(await f.panel.evaluate((el) => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
    await expect(f.panel.getByLabel(copy.substance, { exact: true })).toBeVisible();
    await page.emulateMedia({ reducedMotion: 'reduce', forcedColors: 'active' });
    await f.panel.getByRole('button', { name: copy.refresh, exact: true }).focus();
    await expect(f.panel.getByRole('button', { name: copy.refresh, exact: true })).toBeFocused();
    const directory =
      process.env['SHIFAA_F011_UI_EVIDENCE'] ??
      'specs/011-allergies-clinical-content-governance/evidence/fresh-implementation/K12/browser';
    mkdirSync(directory, { recursive: true });
    await page.screenshot({
      path: `${directory}/${app}-${locale}-reflow-contrast.png`,
      fullPage: true,
    });
    expect(
      await page.evaluate(() =>
        [...Object.values(localStorage), ...Object.values(sessionStorage)].join(' '),
      ),
    ).not.toMatch(/Synthetic neutral|synthetic-browser-only|Neutral \/ مادة/);
  });
}
if (app === 'clinic')
  test('route person / server pair mismatch never starts allergy requests', async ({ page }) => {
    const f = await enter(page, 'en-EG', 'ready', true);
    await expect(page.getByRole('main')).toBeVisible();
    await expect(f.panel).toHaveCount(0);
    expect(f.paths.some((p) => p.endsWith('/allergies'))).toBe(false);
  });
if (app === 'patient')
  for (const locale of ['ar-EG', 'en-EG'] as const)
    test(`${locale} F004 accepted server context survives care switcher; revoked delegate loses read-only records`, async ({
      page,
    }) => {
      const actor = 'f0110000-0000-4000-8000-000000000004',
        relationship = 'f0110000-0000-4000-8600-000000000001';
      let revoked = false;
      const reads: string[] = [],
        writes: string[] = [];
      const row = {
        id: relationship,
        managed_patient_id: patient,
        actor_person_id: actor,
        relationship_type: 'delegation',
        status: 'active',
        permissions: ['record.view'],
        purpose_code: 'family_support',
        valid_from: '2020-01-01T00:00:00Z',
        valid_until: '2099-12-31T00:00:00Z',
        version: 1,
      };
      await page.context().addCookies([
        {
          name: 'shifaa_csrf',
          value: 'synthetic-csrf',
          domain: new URL(String(test.info().project.use.baseURL)).hostname,
          path: '/',
        },
      ]);
      await page.addInitScript(
        (value) => localStorage.setItem('shifaa.patient.locale', value),
        locale,
      );
      await page.route('**/v1/**', async (route) => {
        const req = route.request(),
          url = new URL(req.url()),
          path = url.pathname;
        const send = (status: number, json: unknown) =>
          route.fulfill({ status, json, headers: { 'cache-control': 'private, no-store' } });
        if (req.method() === 'POST') writes.push(path);
        if (path === '/v1/auth/session/refresh')
          return send(200, {
            accessToken: 'synthetic-browser-only',
            sessionId: encounter,
            assurance: 'aal2',
            expiresAt: '2027-01-01T00:00:00Z',
          });
        if (path === '/v1/people/me')
          return send(200, {
            id: actor,
            managedPatientId: null,
            display_name: 'Synthetic Delegate',
            birth_date: null,
            nationality_code: 'EG',
            preferred_locale: locale,
            verification_status: 'unverified',
            version: 1,
          });
        if (path === `/v1/delegations/${relationship}/accept`) {
          expect(req.headers()['authorization']).toBe('Bearer synthetic-browser-only');
          return send(200, row);
        }
        if (path.endsWith('/relationships'))
          return send(200, {
            items: path.includes(patient)
              ? [{ ...row, status: revoked ? 'revoked' : 'active' }]
              : [],
            next_cursor: null,
            dependentTransition: {
              relationshipId: null,
              transitionCaseId: null,
              status: 'not_eligible',
              continuityCaseVersion: null,
              updatedAt: null,
              recordConsequence: 'unchanged_before_decision',
              priorAuthorityConsequence: 'current_until_decision',
            },
          });
        if (path.endsWith('/allergies')) {
          reads.push(path);
          expect(path).toBe(`/v1/patients/${patient}/allergies`);
          expect(req.headers()['x-purpose']).toBe('family_support');
          expect(req.headers()['authorization']).toBe('Bearer synthetic-browser-only');
          return send(200, {
            view: 'current',
            data: [revision],
            meta: { nextCursor: null, stale: false, lastUpdatedAt: '2026-10-08T00:00:00Z' },
          });
        }
        return send(404, { status: 404 });
      });
      await page.goto(`/relationships#invite=synthetic-invite&relationshipId=${relationship}`);
      await expect(
        page.getByRole('heading', {
          name:
            locale === 'ar-EG'
              ? 'لا يوجد انتقال حساب تلقائي عند 18 أو 21 عامًا.'
              : 'SHIFAA does not transfer an account automatically at age 18 or 21.',
          exact: true,
        }),
      ).toBeVisible();
      await page
        .getByRole('button', {
          name: locale === 'ar-EG' ? 'قبول التفويض' : 'Accept delegation',
          exact: true,
        })
        .click();
      await page
        .getByRole('button', {
          name: locale === 'ar-EG' ? 'عرض سياق الرعاية' : 'View care context',
          exact: true,
        })
        .click();
      await page
        .getByRole('button', {
          name: locale === 'ar-EG' ? 'تأكيد هذا المريض' : 'Confirm this patient',
          exact: true,
        })
        .click();
      await page
        .getByRole('button', {
          name: locale === 'ar-EG' ? 'عرض السجل للتابع' : 'View managed records',
          exact: true,
        })
        .click();
      const panel = page.getByTestId('f011-allergy-panel');
      await expect(panel.getByText(allergyCopy[locale].ready, { exact: true })).toBeVisible();
      await expect(panel.getByText(allergyCopy[locale].readonly, { exact: true })).toBeVisible();
      await expect(panel.getByLabel(allergyCopy[locale].substance, { exact: true })).toHaveCount(0);
      expect(reads.length).toBeGreaterThan(0);
      expect(writes.some((p) => p.endsWith('/allergies'))).toBe(false);
      revoked = true;
      await panel.getByRole('button', { name: allergyCopy[locale].refresh, exact: true }).click();
      await expect(panel.getByText(allergyCopy[locale].denied, { exact: true })).toBeVisible();
      await expect(panel.getByText(/Neutral \/ مادة/)).toHaveCount(0);
      expect(writes.some((p) => p.endsWith('/allergies'))).toBe(false);
    });
