import { expect, test, type Page } from 'playwright/test';

const encounterId = 'a1000000-0000-4000-8000-000000000010';
const encounter = {
  id: encounterId,
  patientId: 'a1000000-0000-4000-8000-000000000011',
  facilityId: 'a1000000-0000-4000-8000-000000000012',
  appointmentId: 'a1000000-0000-4000-8000-000000000013',
  encounterType: 'general',
  responsibleClinicianId: 'a1000000-0000-4000-8000-000000000014',
  status: 'open',
  startedAt: '2030-01-07T09:00:00Z',
  endedAt: undefined as string | undefined,
  version: 1,
  notes: [
    {
      id: 'a1000000-0000-4000-8000-000000000015',
      encounterId,
      authorId: 'a1000000-0000-4000-8000-000000000014',
      noteType: 'assessment',
      visibility: 'patient_visible',
      signedAt: '2030-01-07T09:10:00Z',
      body: 'Released synthetic note',
    },
    {
      id: 'a1000000-0000-4000-8000-000000000016',
      encounterId,
      authorId: 'a1000000-0000-4000-8000-000000000014',
      noteType: 'internal',
      visibility: 'private',
      signedAt: '2030-01-07T09:11:00Z',
      body: 'PRIVATE TEST SECRET',
    },
  ],
};

async function openEncounter(page: Page) {
  const refreshed = page.waitForResponse((response) =>
    response.url().endsWith('/v1/auth/session/refresh'),
  );
  await page.goto(`/encounters/${encounterId}`);
  const refreshResponse = await refreshed;
  expect(refreshResponse.status()).toBe(200);
  // The route's first read can precede session refresh. Reconcile once the new bearer is installed.
  await page.waitForTimeout(50);
  await page.evaluate(() => window.dispatchEvent(new Event('online')));
  const denied = page.getByText(
    'This encounter cannot be shown because current access is unavailable.',
  );
  if (await denied.isVisible().catch(() => false))
    await page.getByRole('button', { name: 'Try again' }).click();
}

async function reconcileEncounter(page: Page) {
  const refreshed = page.waitForResponse(
    (response) => new URL(response.url()).pathname === `/v1/encounters/${encounterId}`,
  );
  await page.evaluate(() => window.dispatchEvent(new Event('online')));
  await expect(
    page.getByText(/Loading encounter details…|جارٍ تحميل تفاصيل الزيارة…/),
  ).toBeVisible();
  return refreshed;
}

async function wireSyntheticApi(page: Page) {
  let status = 200;
  let projection = encounter;
  let resolveRefresh!: () => void;
  const refreshDone = new Promise<void>((resolve) => {
    resolveRefresh = resolve;
  });
  await page.context().addCookies([
    {
      name: 'shifaa_csrf',
      value: 'synthetic-csrf',
      domain: '127.0.0.1',
      path: '/',
      sameSite: 'Lax',
      httpOnly: false,
      secure: false,
    },
  ]);
  await page.route('**/v1/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/v1/auth/session/refresh') {
      await route.fulfill({
        status: 200,
        json: {
          accessToken: 'synthetic-local-only-token',
          sessionId: 'a1000000-0000-4000-8000-000000000099',
          assurance: 'aal1',
          expiresAt: '2030-01-07T10:00:00Z',
        },
        headers: { 'cache-control': 'private, no-store' },
      });
      resolveRefresh();
      return;
    }
    if (path === `/v1/encounters/${encounterId}`) {
      await refreshDone;
      await page.waitForTimeout(50);
      await route.fulfill({
        status,
        json:
          status === 200
            ? projection
            : { code: status === 403 ? 'forbidden' : 'temporarily-unavailable' },
        headers: { 'cache-control': 'private, no-store' },
      });
      return;
    }
    await route.fulfill({
      status: 200,
      json: {},
      headers: { 'cache-control': 'private, no-store' },
    });
  });
  return {
    deny: () => {
      status = 403;
    },
    stale: () => {
      status = 503;
    },
    empty: () => {
      status = 404;
    },
    removePrivateNote: () => {
      projection = { ...encounter, notes: encounter.notes.slice(0, 1) };
    },
    complete: () => {
      projection = { ...encounter, status: 'completed', endedAt: '2030-01-07T10:00:00Z' };
    },
    visible: () => {
      status = 200;
      projection = encounter;
    },
  };
}

for (const locale of ['ar-EG', 'en-EG'] as const) {
  test(`${locale} encounter keyboard semantics and scaled reflow`, async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 800 });
    await page.addInitScript(
      (value) => localStorage.setItem('shifaa.patient.locale', value),
      locale,
    );
    await wireSyntheticApi(page);
    await openEncounter(page);
    await expect(page.getByText('Released synthetic note')).toBeVisible();
    const main = page.getByRole('main');
    await expect(main.getByRole('heading', { level: 1 })).toHaveCount(1);
    const language = main.getByRole('button', {
      name: locale === 'ar-EG' ? 'English' : 'العربية',
    });
    await page.keyboard.press('Tab');
    await expect(language).toBeFocused();
    expect(
      await language.evaluate((node) => {
        const style = getComputedStyle(node);
        return parseFloat(style.borderTopWidth) >= 3 && style.borderTopColor !== 'transparent';
      }),
    ).toBe(true);
    await page.evaluate(() => {
      for (const node of document.querySelectorAll('main span, main p')) {
        const element = node as HTMLElement;
        element.style.fontSize = `${parseFloat(getComputedStyle(element).fontSize) * 2}px`;
      }
    });
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      360,
    );
    await expect(language).toBeVisible();
    await page.setViewportSize({ width: 320, height: 800 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      320,
    );
  });
  for (const viewport of [
    { width: 360, height: 800 },
    { width: 412, height: 915 },
    { width: 768, height: 1024 },
  ]) {
    test(`${locale} patient encounter projection ${viewport.width}x${viewport.height}`, async ({
      page,
    }) => {
      await page.setViewportSize(viewport);
      await page.addInitScript(
        (value) => localStorage.setItem('shifaa.patient.locale', value),
        locale,
      );
      const api = await wireSyntheticApi(page);
      await openEncounter(page);
      await expect(page.getByText('Released synthetic note')).toBeVisible();
      await expect(page.getByText(/PRIVATE TEST SECRET|private note|ملاحظة خاصة/i)).toHaveCount(0);
      expect(await page.locator('html').getAttribute('dir')).toBe(
        locale === 'ar-EG' ? 'rtl' : 'ltr',
      );
      expect(await page.locator('body').evaluate((node) => node.scrollWidth)).toBeLessThanOrEqual(
        viewport.width,
      );
      const withPrivateNote = await page.getByRole('main').innerText();
      api.removePrivateNote();
      const withoutPrivateResponse = await reconcileEncounter(page);
      expect(withoutPrivateResponse.status()).toBe(200);
      await expect.poll(() => page.getByRole('main').innerText()).toBe(withPrivateNote);
      api.complete();
      await reconcileEncounter(page);
      await expect(
        page.getByText(locale === 'ar-EG' ? 'اكتملت الزيارة' : 'Encounter completed'),
      ).toBeVisible();
      api.empty();
      await reconcileEncounter(page);
      await expect(
        page.getByText(
          locale === 'ar-EG' ? 'لا تتوفر تفاصيل زيارة.' : 'No encounter details are available.',
        ),
      ).toBeVisible();
      api.visible();
      await reconcileEncounter(page);
      await expect(page.getByText('Released synthetic note')).toBeVisible();
      api.stale();
      await reconcileEncounter(page);
      await expect(
        page.getByText(
          locale === 'ar-EG'
            ? 'تعذّر تحديث السجل. أعد المحاولة للحصول على أحدث المعلومات.'
            : 'The record could not be refreshed. Try again to get current information.',
        ),
      ).toBeVisible();
      api.deny();
      await reconcileEncounter(page);
      await expect(
        page.getByText(
          locale === 'ar-EG'
            ? 'تعذّر عرض هذه الزيارة بسبب عدم توفر صلاحية حالية.'
            : 'This encounter cannot be shown because current access is unavailable.',
        ),
      ).toBeVisible();
      await expect(page.getByText('Released synthetic note')).toHaveCount(0);
      await page.context().setOffline(true);
      await expect(
        page.getByText(
          locale === 'ar-EG'
            ? 'لا يوجد اتصال. أعد الاتصال لتحميل السجل من جديد.'
            : 'You are offline. Reconnect to load the record again.',
        ),
      ).toBeVisible();
      await expect(page.getByText('Released synthetic note')).toHaveCount(0);
      const retry = page.getByRole('button', {
        name: locale === 'ar-EG' ? 'إعادة المحاولة' : 'Try again',
      });
      await retry.focus();
      await expect(retry).toBeFocused();
      await page.keyboard.press('Enter');
      await expect(
        page.getByText(
          locale === 'ar-EG'
            ? 'لا يوجد اتصال. أعد الاتصال لتحميل السجل من جديد.'
            : 'You are offline. Reconnect to load the record again.',
        ),
      ).toBeVisible();
    });
  }
}
