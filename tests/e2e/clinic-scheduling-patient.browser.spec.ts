import { expect, test, type Page } from 'playwright/test';
import path from 'node:path';

const actual = path.resolve(
  process.cwd(),
  'specs/009-clinic-scheduling-appointments-queue/evidence/actual/patient',
);
const facilityId = '90000000-0000-4000-8000-000000000001';
const doctorId = '91000000-0000-4000-8000-000000000001';
const patientId = '91000000-0000-4000-8000-000000000003';
const slot = {
  facilityId,
  doctorId,
  startsAt: '2030-01-07T09:00:00+02:00',
  endsAt: '2030-01-07T09:30:00+02:00',
  civilDate: '2030-01-07',
  timezone: 'Africa/Cairo',
};
const doctor = {
  doctorId,
  doctorDisplayName: 'Synthetic Doctor',
  specialty: 'Internal medicine',
  professionalLicenseVerified: true,
  facilityId,
  facilityDisplayName: 'Synthetic Clinic',
  facilityVerified: true,
  feeMinorUnits: 35000,
  currency: 'EGP',
  paymentMethod: 'cash_on_arrival',
  nextAvailableSlot: slot,
  distanceMeters: null,
  availabilityVersion: 1,
  updatedAt: '2029-12-01T08:00:00.000Z',
  stale: false,
};
const appointment = {
  id: '92000000-0000-4000-8000-000000000001',
  patientId,
  ...slot,
  status: 'confirmed',
  feeMinorUnits: 35000,
  currency: 'EGP',
  paymentMethod: 'cash_on_arrival',
  version: 1,
};
type Fixture = {
  discovery?: 'fresh' | 'loading' | 'empty' | 'stale' | 'unknown' | 'error';
  availability?: 'fresh' | 'empty' | 'stale' | 'error';
  booking?: 'success' | 'conflict' | 'uncertain';
  bookings?: Array<{ key: string | null; body: unknown }>;
  searches?: string[];
};

async function syntheticApi(page: Page, fixture: Fixture) {
  await page.route('http://127.0.0.1:18089/**', async (route) => {
    const url = new URL(route.request().url());
    const apiPath = url.pathname.replace(/^\/v1/, '');
    let status = 200;
    let body: unknown;
    if (apiPath === '/discovery/doctors') {
      fixture.searches?.push(url.search);
      if (fixture.discovery === 'loading') await new Promise((resolve) => setTimeout(resolve, 900));
      if (fixture.discovery === 'error') status = 503;
      body = {
        items:
          fixture.discovery === 'empty'
            ? []
            : [{ ...doctor, stale: fixture.discovery === 'stale' }],
        nextCursor: null,
        freshness:
          fixture.discovery === 'unknown'
            ? 'unknown'
            : fixture.discovery === 'stale'
              ? 'stale'
              : 'fresh',
        generatedAt: '2029-12-01T08:00:00.000Z',
      };
    } else if (apiPath.endsWith('/availability')) {
      if (fixture.availability === 'error') status = 503;
      body = {
        items: fixture.availability === 'empty' ? [] : [slot],
        feeMinorUnits: 35000,
        currency: 'EGP',
        paymentMethod: 'cash_on_arrival',
        version: 1,
        freshness: fixture.availability === 'stale' ? 'stale' : 'fresh',
        generatedAt: '2029-12-01T08:00:00.000Z',
      };
    } else if (apiPath === '/auth/login') {
      body = { challenge_id: 'synthetic-challenge' };
    } else if (apiPath === '/auth/otp/verify') {
      body = { access_token: 'synthetic-local-only-token' };
    } else if (apiPath === '/auth/session/refresh') {
      body = {
        accessToken: 'synthetic-local-only-token',
        sessionId: '92000000-0000-4000-8000-000000000009',
        assurance: 'aal1',
        expiresAt: '2030-01-07T10:00:00.000Z',
      };
    } else if (apiPath === '/people/me') {
      body = { id: patientId, display_name: 'Synthetic Patient', version: 1 };
    } else if (apiPath === '/appointments' && route.request().method() === 'POST') {
      fixture.bookings?.push({
        key: route.request().headers()['idempotency-key'] ?? null,
        body: route.request().postDataJSON(),
      });
      status = fixture.booking === 'conflict' ? 409 : fixture.booking === 'uncertain' ? 503 : 201;
      body =
        status === 201 ? appointment : { code: status === 409 ? 'slot-conflict' : 'unavailable' };
    } else {
      await route.continue();
      return;
    }
    await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
  });
}

async function capture(page: Page, locale: string, state: string) {
  const anchor = state.startsWith('discover-')
    ? page.getByRole('heading', { name: /نتائج الأطباء|Doctor results/ }).last()
    : state.startsWith('doctor-')
      ? page.getByRole('heading', { name: /الأوقات المتاحة|Available slots/ }).last()
      : state === 'booking-success'
        ? page.getByRole('heading', { name: /تم تأكيد الموعد|Appointment confirmed/ }).last()
        : state === 'booking-review'
          ? page
              .getByRole('button', { name: /تأكيد حجز الموعد|Confirm appointment booking/ })
              .last()
          : page
              .locator('[aria-live]')
              .filter({
                hasText:
                  /أكد سياق المريض|Confirm patient context|تغير الوقت|The slot or fee|نتيجة الحجز|booking outcome|لا يوجد اتصال|You are offline/,
              })
              .last();
  if (await anchor.count())
    await anchor.evaluate((element) => element.scrollIntoView({ block: 'start' }));
  await page.screenshot({ path: path.join(actual, `${locale}-${state}.png`), fullPage: true });
}

async function checkLayout(page: Page, width: number) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
    width,
  );
  const controls = page.getByRole('button').or(page.getByRole('link')).or(page.getByRole('radio'));
  for (const control of await controls.all()) {
    if (!(await control.isVisible())) continue;
    const bounds = await control.boundingBox();
    if (bounds) {
      expect(
        bounds.width,
        `interactive target width: ${(await control.getAttribute('aria-label')) ?? (await control.innerText())}`,
      ).toBeGreaterThanOrEqual(44);
      expect(bounds.height, 'interactive target height').toBeGreaterThanOrEqual(44);
    }
    expect((await control.getAttribute('aria-label')) ?? (await control.innerText())).not.toBe('');
  }
}

async function signIn(page: Page, locale: 'ar-EG' | 'en-EG') {
  await page.goto('/login');
  await page.getByRole('textbox').first().fill('synthetic@example.invalid');
  await page.locator('input[type="password"]').fill('synthetic-local-only');
  await page.getByRole('button', { name: locale === 'ar-EG' ? 'تسجيل الدخول' : 'Log in' }).click();
  await page.getByRole('textbox').first().fill('123456');
  await page
    .getByRole('button', { name: locale === 'ar-EG' ? 'تأكيد الرمز' : 'Confirm code' })
    .click();
  await expect(
    page.getByRole('heading', { name: locale === 'ar-EG' ? 'ملف المريض' : 'Patient profile' }),
  ).toBeVisible();
}

async function clientNavigate(page: Page, destination: string) {
  await page.evaluate((route) => {
    window.history.pushState({}, '', route);
    window.dispatchEvent(new PopStateEvent('popstate'));
  }, destination);
}

for (const [locale, width, height] of [
  ['ar-EG', 360, 800],
  ['en-EG', 412, 915],
] as const) {
  test.describe(`${locale} patient journey ${width}x${height}`, () => {
    test.use({ viewport: { width, height }, reducedMotion: 'reduce' });
    test.beforeEach(async ({ page }) => {
      await page.addInitScript((value) => {
        localStorage.setItem('shifaa.patient.locale', value);
        document.cookie = 'shifaa_csrf=synthetic-local-only; path=/; SameSite=Lax';
      }, locale);
    });

    test('Discover public states, keyboard names, direction, responsive targets', async ({
      page,
      context,
    }) => {
      const fixture: Fixture = { searches: [] };
      await syntheticApi(page, fixture);
      await page.goto('/discover');
      await expect(page.locator('html')).toHaveAttribute('dir', locale === 'ar-EG' ? 'rtl' : 'ltr');
      const search = page.getByRole('button', {
        name: locale === 'ar-EG' ? 'ابحث عن الأطباء' : 'Search doctors',
      });
      await page.keyboard.press('Tab');
      expect(await page.evaluate(() => document.activeElement?.tagName)).not.toBe('BODY');
      await page
        .getByRole('textbox', { name: locale === 'ar-EG' ? 'التخصص' : 'Specialty' })
        .fill('Internal medicine');
      fixture.discovery = 'loading';
      await search.focus();
      await expect(search).toBeFocused();
      await page.keyboard.press('Enter');
      await expect(
        page.getByText(locale === 'ar-EG' ? 'جارٍ تحميل بيانات العيادة…' : 'Loading clinic data…'),
      ).toBeVisible();
      await capture(page, locale, 'discover-loading');
      await expect(page.getByText('Synthetic Doctor')).toBeVisible();
      expect(fixture.searches?.at(-1)).toContain('specialty=Internal+medicine');
      fixture.discovery = 'fresh';
      await search.click();
      await expect(page.getByText('Synthetic Doctor')).toBeVisible();
      expect(
        await page
          .getByRole('link', { name: locale === 'ar-EG' ? 'اعرض الطبيب' : 'View doctor' })
          .count(),
      ).toBe(1);
      await checkLayout(page, width);
      await capture(page, locale, 'discover-filtered-success');

      fixture.discovery = 'empty';
      await search.click();
      await expect(
        page.getByText(
          locale === 'ar-EG'
            ? 'لا يوجد أطباء مطابقون للفلاتر الحالية.'
            : 'No doctors match the current filters.',
        ),
      ).toBeVisible();
      await capture(page, locale, 'discover-empty');
      fixture.discovery = 'stale';
      await search.click();
      await expect(
        page
          .getByText(
            locale === 'ar-EG'
              ? 'بيانات التوافر قديمة؛ حدثها قبل الحجز'
              : 'Availability is stale; refresh before booking',
          )
          .first(),
      ).toBeVisible();
      await capture(page, locale, 'discover-stale');
      fixture.discovery = 'unknown';
      await search.click();
      await expect(
        page
          .getByText(
            locale === 'ar-EG' ? 'التوافر الحالي غير معروف' : 'Current availability is unknown',
          )
          .first(),
      ).toBeVisible();
      await capture(page, locale, 'discover-unknown');
      fixture.discovery = 'error';
      await search.click();
      await expect(
        page.getByText(
          locale === 'ar-EG'
            ? 'تعذر تحميل البيانات الآن. راجع الحالة ثم حاول مرة أخرى.'
            : 'The data could not be loaded. Review the state and try again.',
        ),
      ).toBeVisible();
      await capture(page, locale, 'discover-error');
      await context.setOffline(true);
      await search.click();
      await expect(
        page.getByText(locale === 'ar-EG' ? /لا يوجد اتصال/ : /You are offline/),
      ).toBeVisible();
      await capture(page, locale, 'discover-offline');
      await context.setOffline(false);
      await page
        .getByRole('button', {
          name:
            locale === 'ar-EG'
              ? 'استخدم موقعي للبحث عن طبيب'
              : 'Use my location to search for a doctor',
        })
        .click();
      await expect(
        page.getByText(locale === 'ar-EG' ? /تعذر استخدام الموقع/ : /Location is unavailable/),
      ).toBeVisible();
      await capture(page, locale, 'discover-location-denied');
    });

    test('Doctor current/empty/stale, focus, forced colors and reflow', async ({ page }) => {
      const fixture: Fixture = {};
      await syntheticApi(page, fixture);
      await page.goto(`/doctors/${doctorId}?facilityId=${facilityId}`);
      await expect(page.getByText('Synthetic Doctor')).toBeVisible();
      await expect(page.getByRole('radio', { name: /2030-01-07/ })).toBeVisible();
      await checkLayout(page, width);
      await capture(page, locale, 'doctor-current');
      await page.getByRole('radio', { name: /2030-01-07/ }).click();
      await expect(
        page.getByRole('button', {
          name: locale === 'ar-EG' ? 'تابع إلى مراجعة الحجز' : 'Continue to booking review',
        }),
      ).toBeEnabled();
      await expect(
        page.locator('[aria-live="polite"]').filter({ hasText: /2030-01-07/ }),
      ).toBeVisible();
      await capture(page, locale, 'doctor-selected');

      fixture.availability = 'empty';
      await page
        .getByRole('button', {
          name: locale === 'ar-EG' ? 'اعرض الأوقات الحالية' : 'Show current slots',
        })
        .click();
      await expect(
        page.getByText(
          locale === 'ar-EG'
            ? 'لا توجد أوقات متاحة لهذا التاريخ.'
            : 'No slots are available on this date.',
        ),
      ).toBeVisible();
      await capture(page, locale, 'doctor-no-slots');
      fixture.availability = 'stale';
      await page
        .getByRole('button', {
          name: locale === 'ar-EG' ? 'اعرض الأوقات الحالية' : 'Show current slots',
        })
        .click();
      await expect(page.getByRole('radio', { name: /2030-01-07/ })).toBeDisabled();
      await capture(page, locale, 'doctor-stale');
      await page.emulateMedia({ forcedColors: 'active', reducedMotion: 'reduce' });
      expect(await page.evaluate(() => matchMedia('(forced-colors: active)').matches)).toBe(true);
      expect(
        await page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches),
      ).toBe(true);
      await checkLayout(page, width);
      await capture(page, locale, 'doctor-forced-colors-reduced-motion');
      await page.emulateMedia({ forcedColors: 'none', reducedMotion: 'reduce' });
      const textScale = await page.addStyleTag({
        content:
          '[class*="css-text"] { font-size: 200% !important; line-height: normal !important; }',
      });
      await checkLayout(page, width);
      await capture(page, locale, 'doctor-synthetic-200-percent-text');
      await textScale.evaluate((element) => element.remove());
      await page.setViewportSize({ width: 320, height });
      await checkLayout(page, 320);
      await capture(page, locale, 'doctor-320-reflow');
    });

    test('Booking validation, conflict, uncertain, and confirmed result', async ({ page }) => {
      const fixture: Fixture = { bookings: [] };
      await syntheticApi(page, fixture);
      await signIn(page, locale);
      const query = new URLSearchParams(slot).toString();
      await clientNavigate(page, `/appointments/new?${query}`);
      await expect(page.getByText('Synthetic Patient').last()).toBeVisible();
      await expect(page.getByText(/350 EGP/)).toBeVisible();
      await checkLayout(page, width);
      await capture(page, locale, 'booking-review');
      const submit = page
        .getByRole('button', {
          name: locale === 'ar-EG' ? 'تأكيد حجز الموعد' : 'Confirm appointment booking',
        })
        .last();
      await submit.click();
      await expect(
        page.getByText(
          locale === 'ar-EG'
            ? 'أكد سياق المريض قبل الحجز.'
            : 'Confirm patient context before booking.',
        ),
      ).toBeVisible();
      await expect(
        page
          .locator('[aria-live="assertive"]')
          .filter({ hasText: locale === 'ar-EG' ? /أكد سياق المريض/ : /Confirm patient context/ }),
      ).toBeVisible();
      await expect(
        page
          .getByRole('checkbox', {
            name:
              locale === 'ar-EG'
                ? 'أؤكد أن هذا الموعد للمريض المعروض'
                : 'I confirm this appointment is for the patient shown',
          })
          .first(),
      ).toBeFocused();
      await capture(page, locale, 'booking-validation');
      await page
        .getByRole('checkbox', {
          name:
            locale === 'ar-EG'
              ? 'أؤكد أن هذا الموعد للمريض المعروض'
              : 'I confirm this appointment is for the patient shown',
        })
        .last()
        .click();
      await page.context().setOffline(true);
      await submit.click();
      await expect(
        page.getByText(locale === 'ar-EG' ? /لا يوجد اتصال/ : /You are offline/),
      ).toBeVisible();
      await capture(page, locale, 'booking-offline');
      await page.context().setOffline(false);
      await page
        .getByRole('link', {
          name: locale === 'ar-EG' ? 'العودة إلى الأوقات الحالية' : 'Return to current slots',
        })
        .click();
      await expect(page.getByRole('radio', { name: /2030-01-07/ })).toBeVisible();
      await page.getByRole('radio', { name: /2030-01-07/ }).click();
      await page
        .getByRole('button', {
          name: locale === 'ar-EG' ? 'تابع إلى مراجعة الحجز' : 'Continue to booking review',
        })
        .click();
      await expect(page.getByText('Synthetic Patient').last()).toBeVisible();
      await page
        .getByRole('checkbox', {
          name:
            locale === 'ar-EG'
              ? 'أؤكد أن هذا الموعد للمريض المعروض'
              : 'I confirm this appointment is for the patient shown',
        })
        .last()
        .click();
      fixture.booking = 'conflict';
      await submit.click();
      await expect(
        page.getByText(locale === 'ar-EG' ? /تغير الوقت أو الرسم/ : /The slot or fee changed/),
      ).toBeVisible();
      await capture(page, locale, 'booking-conflict');
      fixture.booking = 'uncertain';
      await page
        .getByRole('link', {
          name: locale === 'ar-EG' ? 'العودة إلى الأوقات الحالية' : 'Return to current slots',
        })
        .click();
      await expect(page.getByRole('radio', { name: /2030-01-07/ })).toBeVisible();
      await page.getByRole('radio', { name: /2030-01-07/ }).click();
      await page
        .getByRole('button', {
          name: locale === 'ar-EG' ? 'تابع إلى مراجعة الحجز' : 'Continue to booking review',
        })
        .click();
      await expect(page.getByText('Synthetic Patient').last()).toBeVisible();
      await page
        .getByRole('checkbox', {
          name:
            locale === 'ar-EG'
              ? 'أؤكد أن هذا الموعد للمريض المعروض'
              : 'I confirm this appointment is for the patient shown',
        })
        .last()
        .click();
      await submit.click();
      await expect(
        page.getByText(
          locale === 'ar-EG' ? /نتيجة الحجز غير مؤكدة/ : /booking outcome is uncertain/i,
        ),
      ).toBeVisible();
      await capture(page, locale, 'booking-uncertain');
      fixture.booking = 'success';
      await page
        .getByRole('button', { name: locale === 'ar-EG' ? 'حاول مرة أخرى' : 'Try again' })
        .click();
      await expect(
        page.getByText(locale === 'ar-EG' ? 'تم تأكيد الموعد.' : 'Appointment confirmed.'),
      ).toBeVisible();
      await capture(page, locale, 'booking-success');
      expect(fixture.bookings?.length).toBe(3);
      expect(fixture.bookings?.[1]?.key).toBe(fixture.bookings?.[2]?.key);
      expect(JSON.stringify(fixture.bookings?.[2]?.body)).not.toMatch(/feeMinorUnits|currency/);
    });
  });
}
