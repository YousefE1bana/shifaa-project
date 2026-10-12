import { test, expect, type Page } from 'playwright/test';
import { mkdirSync } from 'node:fs';
import { allergyCopy, verificationCopy } from '../../packages/i18n/src/feature-011';
const app = process.env['SHIFAA_F011_UI_APP'] ?? 'patient';
const person = 'f0110000-0000-4000-8000-000000000001',
  patient = 'f0110000-0000-4000-8100-000000000001',
  facility = 'f0110000-0000-4000-8200-000000000001',
  encounter = 'f0110000-0000-4000-8400-000000000001',
  assertion = 'f0110000-0000-4000-8500-000000000002',
  support = 'f0110000-0000-4000-8500-000000000003';
const base = {
  revisionId: 'f0110000-0000-4000-8500-000000000001',
  allergyId: assertion,
  patientId: patient,
  version: 1,
  previousRevisionId: null,
  status: 'self_reported',
  substance: { identity: 'synthetic-neutral', display: 'Neutral / مادة اختبار' },
  source: { display: 'Synthetic source / مصدر تجريبي' },
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
type Mode =
  | 'ready'
  | 'empty'
  | 'loading'
  | 'error'
  | 'denied'
  | 'stale'
  | 'default-off'
  | 'kill'
  | 'provenance';
async function enter(
  page: Page,
  locale: 'ar-EG' | 'en-EG',
  initial: Mode = 'ready',
  historyFixture = false,
) {
  let mode = initial,
    ack = false,
    rows: any[] = [structuredClone(base)];
  const posts: any[] = [],
    receipts = new Map<string, unknown>();
  // Test-only offline private support; the UI receives selectors, never authority.
  const supports = new Map<
    string,
    { head: string; version: number; target: string; used: boolean }
  >();
  const provisionSupport = (target: string) => {
    const previous = rows.filter((row) => row.allergyId === assertion).at(-1),
      ref = crypto.randomUUID();
    supports.set(ref, {
      head: previous.revisionId,
      version: previous.version,
      target,
      used: false,
    });
    return ref;
  };
  if (historyFixture)
    for (const status of [
      'clinician_confirmed',
      'refuted',
      'clinician_confirmed',
      'entered_in_error',
    ]) {
      const prev = rows.at(-1);
      rows.push({
        ...prev,
        revisionId: crypto.randomUUID(),
        previousRevisionId: prev.revisionId,
        version: prev.version + 1,
        status,
        actionAt: '2026-10-08T01:00:00Z',
        verification: {
          reason: 'Synthetic decision / قرار تجريبي',
          evidenceRef: crypto.randomUUID(),
          verifierPersonId: person,
        },
      });
    }
  if (historyFixture)
    rows.push({
      ...base,
      allergyId: crypto.randomUUID(),
      revisionId: crypto.randomUUID(),
      correctsAllergyId: assertion,
      substance: { identity: 'synthetic-correction', display: 'Corrected synthetic / تصحيح' },
    });
  let release!: () => void;
  const barrier = new Promise<void>((r) => (release = r));
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
      path = url.pathname,
      send = (status: number, json: unknown) =>
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
        patientPersonId: person,
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
    if (
      path === `/v1/patients/${patient}/allergies` ||
      path === `/v1/allergies/${assertion}/verification`
    ) {
      expect(req.headers()['authorization']).toBe('Bearer synthetic-browser-only');
      expect(req.headers()['x-purpose']).toBe('care');
      if (req.method() === 'POST') {
        const body = req.postDataJSON(),
          key = req.headers()['idempotency-key'];
        posts.push({ path, body, key, version: req.headers()['if-match'] });
        if (['denied', 'kill', 'default-off', 'stale', 'provenance'].includes(mode))
          return send(
            mode === 'stale'
              ? 409
              : mode === 'provenance'
                ? 422
                : mode === 'default-off'
                  ? 404
                  : 403,
            { status: mode === 'stale' ? 409 : 422 },
          );
        if (!receipts.has(key)) {
          const prev = rows.filter((r) => r.allergyId === assertion).at(-1);
          if (path.endsWith('/verification')) {
            const support = supports.get(body.verificationEvidenceRef);
            if (
              !support ||
              support.used ||
              support.head !== prev.revisionId ||
              support.target !== body.targetStatus ||
              req.headers()['if-match'] !== `"${support.version}"`
            )
              return send(422, { status: 422 });
            support.used = true;
          }
          const revision = path.endsWith('/verification')
            ? {
                ...prev,
                revisionId: crypto.randomUUID(),
                previousRevisionId: prev.revisionId,
                version: prev.version + 1,
                status: body.targetStatus,
                actionAt: '2026-10-08T01:00:00Z',
                verification: {
                  reason: body.reason,
                  evidenceRef: body.verificationEvidenceRef,
                  verifierPersonId: person,
                },
              }
            : {
                ...base,
                revisionId: crypto.randomUUID(),
                allergyId: crypto.randomUUID(),
                substance: body.substance,
                source: body.source,
                correctsAllergyId: body.correctsAllergyId ?? null,
              };
          rows.push(revision);
          receipts.set(key, revision);
        }
        if (ack) {
          ack = false;
          return route.abort('failed');
        }
        return send(path.endsWith('/verification') ? 200 : 201, receipts.get(key));
      }
      if (mode === 'loading') await barrier;
      if (['denied', 'kill', 'default-off', 'error'].includes(mode))
        return send(mode === 'error' ? 500 : mode === 'default-off' ? 404 : 403, { status: 403 });
      const history = url.searchParams.get('view') === 'history';
      const current = [...new Map(rows.map((row) => [row.allergyId, row])).values()];
      return send(200, {
        view: history ? 'history' : 'current',
        data: mode === 'empty' ? [] : history ? rows : current,
        meta: { nextCursor: null, stale: mode === 'stale' },
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
    rows,
    mode: (value: Mode) => (mode = value),
    ack: () => (ack = true),
    provisionSupport,
    release: () => {
      mode = 'ready';
      release();
    },
  };
}
async function capture(page: Page, name: string) {
  const dir =
    process.env['SHIFAA_F011_UI_EVIDENCE'] ??
    'specs/011-allergies-clinical-content-governance/evidence/fresh-implementation/K14/browser';
  mkdirSync(dir, { recursive: true });
  await page.screenshot({ path: `${dir}/${app}-${name}.png`, fullPage: true });
}
for (const locale of ['ar-EG', 'en-EG'] as const) {
  const report = allergyCopy[locale],
    copy = verificationCopy[locale];
  test(`${locale} J-02 preserved four-state history, attribution, unknown and read boundary`, async ({
    page,
  }) => {
    const f = await enter(page, locale, 'ready', true);
    await expect(f.panel.getByText(report.ready, { exact: true })).toBeVisible();
    await f.panel.getByRole('button', { name: report.history, exact: true }).click();
    await expect(f.panel.getByText(copy.history, { exact: true })).toBeVisible();
    for (const state of [
      'self_reported',
      'clinician_confirmed',
      'refuted',
      'entered_in_error',
    ] as const) {
      const entry = f.panel.getByText(new RegExp(report[state])).first();
      await expect(entry).toBeVisible();
      // Expo scrolls inside its document surface; clinic full-page capture already includes every entry.
      if (app === 'patient') await entry.scrollIntoViewIfNeeded();
      await capture(page, `${locale}-history-${state}`);
    }
    await expect(f.panel.getByText(copy.history, { exact: true })).toBeVisible();
    await expect(f.panel.getByText(new RegExp(copy.correction)).first()).toBeVisible();
    await expect(f.panel.getByText(copy.terminal, { exact: true }).first()).toBeVisible();
    await expect(f.panel.getByText(new RegExp(copy.reason)).first()).toBeVisible();
    await expect(f.panel.getByText(new RegExp(copy.originalRecorder)).first()).toBeVisible();
    for (const target of ['clinician_confirmed', 'refuted', 'entered_in_error'] as const)
      await expect(f.panel.getByRole('button', { name: copy[target], exact: true })).toHaveCount(0);
    expect(f.posts).toHaveLength(0);
    await capture(page, `${locale}-history`);
  });
  if (app === 'clinic') {
    test(`${locale} selected correction clears after authority loss`, async ({ page }) => {
      const f = await enter(page, locale, 'ready', true);
      await expect(f.panel.getByText(report.ready, { exact: true })).toBeVisible();
      await f.panel.getByRole('button', { name: copy.corrected, exact: true }).click();
      f.mode('denied');
      await f.panel.getByRole('button', { name: report.refresh, exact: true }).click();
      await expect(f.panel.getByText(report.denied, { exact: true })).toBeVisible();
      await expect(f.panel.getByText(assertion, { exact: true })).toHaveCount(0);
      await expect(f.panel.getByLabel(report.substance, { exact: true })).toHaveCount(0);
    });
    test(`${locale} J-02 confirm, reversal, refute, terminal and linked corrected assertion`, async ({
      page,
    }) => {
      const f = await enter(page, locale);
      await expect(f.panel.getByText(report.ready, { exact: true })).toBeVisible();
      for (const target of [
        'clinician_confirmed',
        'refuted',
        'clinician_confirmed',
        'entered_in_error',
      ] as const) {
        const decisionSupport = f.provisionSupport(target);
        const action = f.panel.getByRole('button', { name: copy[target], exact: true });
        await action.focus();
        await page.keyboard.press('Enter');
        const reason = f.panel.getByLabel(copy.reason, { exact: true });
        await expect(reason).toBeFocused();
        await reason.fill('Synthetic decision / قرار تجريبي');
        await f.panel.getByLabel(copy.evidence, { exact: true }).fill(decisionSupport);
        await f.panel.getByRole('button', { name: copy.review, exact: true }).click();
        await expect(f.panel.getByTestId('f011-state')).toBeFocused();
        await f.panel.getByRole('button', { name: copy.cancel, exact: true }).click();
        await expect(action).toBeFocused();
        await page.keyboard.press('Enter');
        await reason.fill('Synthetic decision / قرار تجريبي');
        await f.panel.getByLabel(copy.evidence, { exact: true }).fill(decisionSupport);
        await f.panel.getByRole('button', { name: copy.review, exact: true }).click();
        await f.panel.getByRole('button', { name: copy[target], exact: true }).click();
        await expect(f.panel.getByText(copy.success, { exact: true })).toBeVisible();
        await f.panel.getByRole('button', { name: report.refresh, exact: true }).click();
        await expect(f.panel.getByText(report.ready, { exact: true })).toBeVisible();
        await capture(page, `${locale}-decision-${f.posts.length}-${target}`);
      }
      expect(f.posts.map((p) => p.version)).toEqual(['"1"', '"2"', '"3"', '"4"']);
      expect(f.rows.filter((r) => r.allergyId === assertion)).toHaveLength(5);
      await expect(
        f.panel.getByRole('button', { name: copy.clinician_confirmed, exact: true }),
      ).toHaveCount(0);
      await f.panel.getByRole('button', { name: copy.corrected, exact: true }).click();
      await expect(f.panel.getByLabel(report.substance, { exact: true })).toBeFocused();
      await f.panel
        .getByLabel(report.substance, { exact: true })
        .fill('Corrected synthetic / تصحيح');
      await f.panel.getByLabel(report.source, { exact: true }).fill('Synthetic correction');
      await f.panel.getByRole('button', { name: report.report, exact: true }).click();
      await f.panel.getByRole('button', { name: report.confirm, exact: true }).click();
      await expect(f.panel.getByText(report.success, { exact: true })).toBeVisible();
      expect(f.posts.at(-1).body.correctsAllergyId).toBe(assertion);
      expect(f.rows.at(-1).allergyId).not.toBe(assertion);
      expect(f.rows.at(-1).status).toBe('self_reported');
      await f.panel.getByRole('button', { name: report.history, exact: true }).click();
      await expect(f.panel.getByTestId('f011-history-entry')).toHaveCount(6);
      await capture(page, `${locale}-j02`);
    });
    for (const [mode, phase] of [
      ['stale', 'stale'],
      ['denied', 'denied'],
      ['provenance', 'error'],
    ] as const)
      test(`${locale} ${mode} verification denial clears protected projection`, async ({
        page,
      }) => {
        const f = await enter(page, locale);
        await expect(f.panel.getByText(report.ready, { exact: true })).toBeVisible();
        await f.panel.getByRole('button', { name: copy.clinician_confirmed, exact: true }).click();
        await f.panel.getByLabel(copy.reason, { exact: true }).fill('Synthetic reason');
        await f.panel
          .getByLabel(copy.evidence, { exact: true })
          .fill(mode === 'provenance' ? support : f.provisionSupport('clinician_confirmed'));
        await f.panel.getByRole('button', { name: copy.review, exact: true }).click();
        f.mode(mode);
        await f.panel.getByRole('button', { name: copy.clinician_confirmed, exact: true }).click();
        await expect(f.panel.getByText(report[phase], { exact: true })).toBeVisible();
        await expect(f.panel.getByTestId('f011-history-entry')).toHaveCount(0);
        expect(f.rows).toHaveLength(1);
        await capture(page, `${locale}-${mode}`);
      });
    test(`${locale} ACK-loss manual original verification settlement`, async ({ page }) => {
      const f = await enter(page, locale);
      await expect(f.panel.getByText(report.ready, { exact: true })).toBeVisible();
      await f.panel.getByRole('button', { name: copy.refuted, exact: true }).click();
      await f.panel.getByLabel(copy.reason, { exact: true }).fill('Synthetic refutation');
      await f.panel.getByLabel(copy.evidence, { exact: true }).fill(f.provisionSupport('refuted'));
      await f.panel.getByRole('button', { name: copy.review, exact: true }).click();
      f.ack();
      await f.panel.getByRole('button', { name: copy.refuted, exact: true }).click();
      await expect(f.panel.getByText(report.reconciling, { exact: true })).toBeVisible();
      expect(f.posts).toHaveLength(1);
      await f.panel.getByRole('button', { name: report.retry, exact: true }).click();
      await expect(f.panel.getByText(copy.success, { exact: true })).toBeVisible();
      expect(f.posts[1]).toEqual(f.posts[0]);
      expect(f.rows).toHaveLength(2);
      await capture(page, `${locale}-receipt`);
    });
  }
  for (const mode of [
    'empty',
    'loading',
    'error',
    'denied',
    'stale',
    'default-off',
    'kill',
  ] as const)
    test(`${locale} ${mode} degraded/isolation`, async ({ page }) => {
      const f = await enter(page, locale, mode);
      const phase = mode === 'kill' || mode === 'default-off' ? 'denied' : mode;
      await expect(f.panel.getByText(report[phase], { exact: true })).toBeVisible();
      expect(f.posts).toHaveLength(0);
      await capture(page, `${locale}-${mode}`);
      if (mode === 'loading') f.release();
    });
  test(`${locale} offline, labels, bidi, keyboard, reflow and forced colors`, async ({ page }) => {
    const f = await enter(page, locale, 'ready', true);
    await expect(f.panel.getByText(report.ready, { exact: true })).toBeVisible();
    for (const width of [360, 412, 768, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      await page.evaluate(() => (document.documentElement.style.fontSize = '200%'));
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1),
      ).toBe(true);
    }
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.evaluate(() => (document.documentElement.style.fontSize = '400%'));
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1),
    ).toBe(true);
    await page.emulateMedia({ forcedColors: 'active', reducedMotion: 'reduce' });
    await f.panel.getByRole('button', { name: report.history, exact: true }).focus();
    await page.keyboard.press('Enter');
    await expect(f.panel.getByText(copy.history, { exact: true })).toBeVisible();
    await expect(f.panel.getByText(copy.terminal, { exact: true }).first()).toBeVisible();
    const direction = await f.panel.evaluate((el) => getComputedStyle(el).direction);
    expect(direction).toBe(locale === 'ar-EG' ? 'rtl' : 'ltr');
    if (app === 'clinic') {
      await expect(f.panel.getByTestId('f011-history-entry')).toHaveCount(6);
      await expect.poll(() => f.panel.locator('bdi[dir="ltr"]').count()).toBeGreaterThan(5);
    }
    await capture(page, `${locale}-accessibility`);
    await page.context().setOffline(true);
    await page.evaluate(() => window.dispatchEvent(new Event('offline')));
    await expect(f.panel.getByText(report.offline, { exact: true })).toBeVisible();
    expect(f.posts).toHaveLength(0);
    await capture(page, `${locale}-offline`);
  });
}
