import { expect, test, type Locator, type Page } from 'playwright/test';
import { captureFeature009Ui } from './feature009-ui-capture';
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
  discoveryStatus?: number;
  availability?: 'fresh' | 'loading' | 'empty' | 'stale' | 'error' | 'permission' | 'terminal';
  availabilityStatus?: number;
  booking?: 'success' | 'conflict' | 'uncertain' | 'recoverable' | 'terminal' | 'submitting';
  bookings?: Array<{ key: string | null; body: unknown }>;
  searches?: string[];
  releaseDiscovery?: () => void;
  releaseAvailability?: () => void;
  releaseBooking?: () => void;
};

async function syntheticApi(page: Page, fixture: Fixture) {
  await page.route('http://127.0.0.1:18089/**', async (route) => {
    const url = new URL(route.request().url());
    const apiPath = url.pathname.replace(/^\/v1/, '');
    let status = 200;
    let body: unknown;
    if (apiPath === '/discovery/doctors') {
      fixture.searches?.push(url.search);
      if (fixture.discovery === 'loading')
        await new Promise<void>((resolve) => {
          fixture.releaseDiscovery = resolve;
        });
      if (fixture.discovery === 'error') status = fixture.discoveryStatus ?? 503;
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
      if (fixture.availability === 'loading')
        await new Promise<void>((resolve) => {
          fixture.releaseAvailability = resolve;
        });
      if (fixture.availability === 'error') status = fixture.availabilityStatus ?? 503;
      if (fixture.availability === 'permission') status = 403;
      if (fixture.availability === 'terminal') status = 404;
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
      if (fixture.booking === 'submitting')
        await new Promise<void>((resolve) => {
          fixture.releaseBooking = resolve;
        });
      status =
        fixture.booking === 'conflict'
          ? 409
          : fixture.booking === 'uncertain'
            ? 503
            : fixture.booking === 'recoverable'
              ? 422
              : 201;
      body =
        status === 201
          ? fixture.booking === 'terminal'
            ? { ...appointment, patientId: '91000000-0000-4000-8000-000000000099' }
            : appointment
          : { code: status === 409 ? 'slot-conflict' : 'unavailable' };
    } else {
      await route.continue();
      return;
    }
    await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
  });
}

async function capture(page: Page, locale: 'ar-EG' | 'en-EG', sourceState: string) {
  const mapping: Record<string, [string, string]> = {
    'discover-loading': ['F009-P0-PAT-DISCOVER-001', 'loading'],
    'discover-empty': ['F009-P0-PAT-DISCOVER-001', 'empty'],
    'discover-location-denied': ['F009-P0-PAT-DISCOVER-001', 'location-denied'],
    'discover-filtered-success': ['F009-P0-PAT-DISCOVER-001', 'results'],
    'discover-stale': ['F009-P0-PAT-DISCOVER-001', 'stale'],
    'discover-error': ['F009-P0-PAT-DISCOVER-001', 'error-recoverable'],
    'discover-error-terminal': ['F009-P0-PAT-DISCOVER-001', 'error-terminal'],
    'discover-offline': ['F009-P0-PAT-DISCOVER-001', 'offline'],
    'doctor-loading': ['F009-P0-PAT-DOCTOR-001', 'loading'],
    'doctor-current': ['F009-P0-PAT-DOCTOR-001', 'available'],
    'doctor-no-slots': ['F009-P0-PAT-DOCTOR-001', 'no-slots'],
    'doctor-stale': ['F009-P0-PAT-DOCTOR-001', 'stale'],
    'doctor-offline': ['F009-P0-PAT-DOCTOR-001', 'offline'],
    'doctor-error-recoverable': ['F009-P0-PAT-DOCTOR-001', 'error-recoverable'],
    'doctor-error-terminal': ['F009-P0-PAT-DOCTOR-001', 'error-terminal'],
    'doctor-permission-denied': ['F009-P0-PAT-DOCTOR-001', 'permission-denied'],
    'booking-loading': ['F009-P0-PAT-BOOK-001', 'loading'],
    'booking-ready': ['F009-P0-PAT-BOOK-001', 'ready'],
    'booking-submitting': ['F009-P0-PAT-BOOK-001', 'submitting'],
    'booking-error-recoverable': ['F009-P0-PAT-BOOK-001', 'error-recoverable'],
    'booking-error-terminal': ['F009-P0-PAT-BOOK-001', 'error-terminal'],
    'booking-permission-denied': ['F009-P0-PAT-BOOK-001', 'permission-denied'],
    'booking-review': ['F009-P0-PAT-BOOK-001', 'ready'],
    'booking-offline': ['F009-P0-PAT-BOOK-001', 'offline'],
    'booking-conflict': ['F009-P0-PAT-BOOK-001', 'conflict'],
    'booking-uncertain': ['F009-P0-PAT-BOOK-001', 'error-recoverable'],
    'booking-success': ['F009-P0-PAT-BOOK-001', 'success'],
  };
  const descriptor = mapping[sourceState];
  if (!descriptor) return;
  const exactText = (arabic: string, english: string) =>
    page.getByText(locale === 'ar-EG' ? arabic : english, { exact: true }).last();
  let visibleState: Locator;
  switch (sourceState) {
    case 'discover-loading':
    case 'doctor-loading':
    case 'booking-loading':
    case 'booking-submitting':
      visibleState = exactText('جارٍ تحميل بيانات العيادة…', 'Loading clinic data…');
      break;
    case 'discover-empty':
      visibleState = exactText(
        'لا يوجد أطباء مطابقون للفلاتر الحالية.',
        'No doctors match the current filters.',
      );
      break;
    case 'discover-location-denied':
      visibleState = exactText(
        'تعذر استخدام الموقع. البحث اليدوي متاح.',
        'Location is unavailable. Manual search remains available.',
      );
      break;
    case 'discover-filtered-success':
      visibleState = page.getByText('Synthetic Doctor', { exact: true }).last();
      break;
    case 'discover-stale':
    case 'doctor-stale':
      visibleState = exactText(
        'بيانات التوافر قديمة؛ حدثها قبل الحجز',
        'Availability is stale; refresh before booking',
      );
      break;
    case 'discover-error':
    case 'doctor-error-recoverable':
      visibleState = exactText(
        'تعذر تحميل البيانات الآن. راجع الحالة ثم حاول مرة أخرى.',
        'The data could not be loaded. Review the state and try again.',
      );
      break;
    case 'discover-error-terminal':
    case 'doctor-error-terminal':
    case 'booking-error-terminal':
      visibleState = exactText('لا يمكن متابعة المهمة', 'This task cannot continue');
      break;
    case 'discover-offline':
    case 'doctor-offline':
    case 'booking-offline':
      visibleState = page
        .getByText(locale === 'ar-EG' ? /لا يوجد اتصال/ : /You are offline/)
        .last();
      break;
    case 'doctor-current':
      visibleState = page.getByRole('radio', { name: /2030-01-07/ }).first();
      break;
    case 'doctor-no-slots':
      visibleState = exactText(
        'لا توجد أوقات متاحة لهذا التاريخ.',
        'No slots are available on this date.',
      );
      break;
    case 'doctor-permission-denied':
      visibleState = exactText(
        'ليس لديك الصلاحية أو النطاق الحالي لهذا الإجراء.',
        'You do not have permission or the current scope for this action.',
      );
      break;
    case 'booking-ready':
    case 'booking-review':
      visibleState = page
        .getByRole('button', { name: /تأكيد حجز الموعد|Confirm appointment booking/ })
        .last();
      break;
    case 'booking-conflict':
      visibleState = exactText(
        'تغير الوقت أو الرسم. راجع الأوقات الحالية قبل المحاولة مجددًا.',
        'The slot or fee changed. Review current slots before trying again.',
      );
      break;
    case 'booking-uncertain':
      visibleState = exactText(
        'نتيجة الحجز غير مؤكدة. أعد المحاولة بنفس الطلب دون اختيار وقت جديد.',
        'Booking outcome is uncertain. Retry the same request without choosing another slot.',
      );
      break;
    case 'booking-error-recoverable':
      visibleState = exactText(
        'تعذر تحميل البيانات الآن. راجع الحالة ثم حاول مرة أخرى.',
        'The data could not be loaded. Review the state and try again.',
      );
      break;
    case 'booking-permission-denied':
      visibleState = exactText(
        'يلزم تسجيل الدخول وسياق مريض صالح للحجز.',
        'Sign-in and a valid patient context are required to book.',
      );
      break;
    case 'booking-success':
      visibleState = page
        .getByRole('heading', { name: /تم تأكيد الموعد|Appointment confirmed/ })
        .last();
      break;
    default:
      throw new Error(`No visible-state anchor defined for ${sourceState}`);
  }
  await expect(visibleState, `${sourceState} rendered before capture`).toBeVisible();
  await captureFeature009Ui(page, descriptor[0], locale, descriptor[1], visibleState);
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

async function expectIsolatedTimestamp(page: Page, value: string) {
  const timestamps = page.getByText(value, { exact: true }).filter({ visible: true });
  const count = await timestamps.count();
  expect(count, `visible standalone timestamp ${value}`).toBeGreaterThan(0);
  for (let index = 0; index < count; index += 1) {
    const timestamp = timestamps.nth(index);
    await expect(timestamp).toHaveCSS('direction', 'ltr');
    await expect(timestamp).toHaveCSS('text-align', 'left');
    const metrics = await timestamp.evaluate((element) => {
      const style = getComputedStyle(element);
      return {
        height: element.getBoundingClientRect().height,
        lineHeight: parseFloat(style.lineHeight),
      };
    });
    expect(metrics.height, `timestamp ${value} should remain on one line`).toBeLessThanOrEqual(
      metrics.lineHeight * 1.5,
    );
  }
}

async function textContrastRatio(locator: Locator) {
  return locator.evaluate((element) => {
    const rgb = (value: string) => {
      const channels = value
        .match(/[\d.]+/g)
        ?.slice(0, 3)
        .map(Number);
      return channels?.length === 3 ? channels : null;
    };
    const foreground = rgb(getComputedStyle(element).color);
    let background: number[] | null = null;
    for (let node: Element | null = element; node; node = node.parentElement) {
      const color = getComputedStyle(node).backgroundColor;
      if (color !== 'transparent' && !color.endsWith(', 0)')) {
        background = rgb(color);
        if (background) break;
      }
    }
    if (!foreground || !background) return 0;
    const luminance = (channels: number[]) => {
      const linear = channels.map((channel) => {
        const value = channel / 255;
        return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
      });
      return linear[0] * 0.2126 + linear[1] * 0.7152 + linear[2] * 0.0722;
    };
    const [lighter, darker] = [luminance(foreground), luminance(background)].sort(
      (left, right) => right - left,
    );
    return (lighter + 0.05) / (darker + 0.05);
  });
}

async function checkTextContrast(locator: Locator, label: string) {
  expect(
    await textContrastRatio(locator),
    `${label} normal-palette contrast`,
  ).toBeGreaterThanOrEqual(4.5);
}

async function scaleRenderedText(page: Page, factor: 2 | 4) {
  await page.evaluate((scale) => {
    const elements = [...document.querySelectorAll<HTMLElement>('#root *')];
    const sizes = elements.map((element) => {
      const computed = getComputedStyle(element);
      return { element, fontSize: computed.fontSize, lineHeight: computed.lineHeight };
    });
    for (const { element, fontSize, lineHeight } of sizes) {
      element.dataset.t076FontSize = element.style.getPropertyValue('font-size');
      element.dataset.t076FontPriority = element.style.getPropertyPriority('font-size');
      element.dataset.t076LineHeight = element.style.getPropertyValue('line-height');
      element.dataset.t076LinePriority = element.style.getPropertyPriority('line-height');
      element.dataset.t076ScaledText = 'true';
      element.style.setProperty('font-size', `${parseFloat(fontSize) * scale}px`, 'important');
      if (lineHeight !== 'normal' && Number.isFinite(parseFloat(lineHeight)))
        element.style.setProperty(
          'line-height',
          `${parseFloat(lineHeight) * scale}px`,
          'important',
        );
    }
  }, factor);
}

async function restoreRenderedText(page: Page) {
  await page.evaluate(() => {
    for (const element of document.querySelectorAll<HTMLElement>(
      '#root [data-t076-scaled-text="true"]',
    )) {
      const restore = (
        property: 'font-size' | 'line-height',
        value: string | undefined,
        priority: string | undefined,
      ) => {
        if (value) element.style.setProperty(property, value, priority ?? '');
        else element.style.removeProperty(property);
      };
      restore('font-size', element.dataset.t076FontSize, element.dataset.t076FontPriority);
      restore('line-height', element.dataset.t076LineHeight, element.dataset.t076LinePriority);
      delete element.dataset.t076FontSize;
      delete element.dataset.t076FontPriority;
      delete element.dataset.t076LineHeight;
      delete element.dataset.t076LinePriority;
      delete element.dataset.t076ScaledText;
    }
  });
}

async function checkPatientTextScaling(page: Page, width: number) {
  for (const factor of [2, 4] as const) {
    await scaleRenderedText(page, factor);
    await checkLayout(page, width);
    await restoreRenderedText(page);
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
  ['ar-EG', 412, 915],
  ['en-EG', 360, 800],
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
      await expect(page.getByRole('main')).toHaveCount(1);
      const search = page.getByRole('button', {
        name: locale === 'ar-EG' ? 'ابحث عن الأطباء' : 'Search doctors',
      });
      const contrastSamples: Array<[Locator, string]> = [
        [page.getByRole('heading', { level: 1 }).first(), `${locale} discovery title`],
        [
          page.getByText(
            locale === 'ar-EG'
              ? 'ابحث في منشآت نشطة وموثقة باستخدام موقع مؤقت أو منطقة تكتبها بنفسك.'
              : 'Search active verified facilities using a temporary location or an area you enter.',
            { exact: true },
          ),
          `${locale} discovery body`,
        ],
        [
          page.getByText(locale === 'ar-EG' ? 'ابحث عن الأطباء' : 'Search doctors', {
            exact: true,
          }),
          `${locale} discovery action`,
        ],
      ];
      expect(contrastSamples).toHaveLength(3);
      for (const [sample, label] of contrastSamples) await checkTextContrast(sample, label);
      console.log(`${locale} discovery normal-palette contrast samples: ${contrastSamples.length}`);
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
      await expect.poll(() => typeof fixture.releaseDiscovery).toBe('function');
      await capture(page, locale, 'discover-loading');
      fixture.discovery = 'fresh';
      fixture.releaseDiscovery?.();
      await expect(page.getByText('Synthetic Doctor')).toBeVisible();
      expect(fixture.searches?.at(-1)).toContain('specialty=Internal+medicine');
      await expectIsolatedTimestamp(page, slot.startsAt);
      await expectIsolatedTimestamp(page, doctor.updatedAt);
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
      await checkPatientTextScaling(page, width);

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
      await expect(
        page.getByRole('button', { name: locale === 'ar-EG' ? 'حاول مرة أخرى' : 'Try again' }),
      ).toBeVisible();
      await capture(page, locale, 'discover-error');
      await page
        .getByRole('button', { name: locale === 'ar-EG' ? 'حاول مرة أخرى' : 'Try again' })
        .click();
      await expect(
        page.getByText(
          locale === 'ar-EG'
            ? 'تعذر تحميل البيانات الآن. راجع الحالة ثم حاول مرة أخرى.'
            : 'The data could not be loaded. Review the state and try again.',
        ),
      ).toBeVisible();
      fixture.discoveryStatus = 404;
      await search.click();
      await expect(
        page.getByText(locale === 'ar-EG' ? 'لا يمكن متابعة المهمة' : 'This task cannot continue'),
      ).toBeVisible();
      await expect(
        page.getByRole('button', { name: locale === 'ar-EG' ? 'حاول مرة أخرى' : 'Try again' }),
      ).toHaveCount(0);
      await expect(
        page.getByRole('button', {
          name: locale === 'ar-EG' ? 'العودة إلى ملف المريض' : 'Return to patient profile',
        }),
      ).toBeVisible();
      await capture(page, locale, 'discover-error-terminal');
      await page
        .getByRole('button', {
          name: locale === 'ar-EG' ? 'العودة إلى ملف المريض' : 'Return to patient profile',
        })
        .click();
      await expect(page).toHaveURL(/\/profile$/);
      await page.goBack();
      await expect(search).toBeVisible();
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
      fixture.availability = 'loading';
      await page
        .getByRole('button', {
          name: locale === 'ar-EG' ? 'اعرض الأوقات الحالية' : 'Show current slots',
        })
        .click();
      await expect(
        page.getByText(locale === 'ar-EG' ? 'جارٍ تحميل بيانات العيادة…' : 'Loading clinic data…'),
      ).toBeVisible();
      await expect.poll(() => typeof fixture.releaseAvailability).toBe('function');
      await capture(page, locale, 'doctor-loading');
      fixture.availability = 'fresh';
      fixture.releaseAvailability?.();
      await expect(page.getByRole('radio', { name: /2030-01-07/ })).toBeVisible();
      await expect(page.getByRole('radio', { name: /2030-01-07/ })).toBeVisible();
      await expectIsolatedTimestamp(page, slot.startsAt);
      await expectIsolatedTimestamp(page, doctor.updatedAt);
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
      await expectIsolatedTimestamp(page, doctor.updatedAt);
      await capture(page, locale, 'doctor-stale');
      await page.context().setOffline(true);
      await page
        .getByRole('button', {
          name: locale === 'ar-EG' ? 'اعرض الأوقات الحالية' : 'Show current slots',
        })
        .click();
      await expect(
        page.getByText(locale === 'ar-EG' ? /لا يوجد اتصال/ : /You are offline/),
      ).toBeVisible();
      await capture(page, locale, 'doctor-offline');
      await page.context().setOffline(false);
      fixture.availability = 'error';
      fixture.availabilityStatus = 503;
      await page
        .getByRole('button', {
          name: locale === 'ar-EG' ? 'اعرض الأوقات الحالية' : 'Show current slots',
        })
        .click();
      await expect(
        page.getByText(
          locale === 'ar-EG'
            ? 'تعذر تحميل البيانات الآن. راجع الحالة ثم حاول مرة أخرى.'
            : 'The data could not be loaded. Review the state and try again.',
        ),
      ).toBeVisible();
      await expect(
        page.getByRole('button', { name: locale === 'ar-EG' ? 'حاول مرة أخرى' : 'Try again' }),
      ).toBeVisible();
      await capture(page, locale, 'doctor-error-recoverable');
      await page
        .getByRole('button', { name: locale === 'ar-EG' ? 'حاول مرة أخرى' : 'Try again' })
        .click();
      await expect(
        page.getByText(
          locale === 'ar-EG'
            ? 'تعذر تحميل البيانات الآن. راجع الحالة ثم حاول مرة أخرى.'
            : 'The data could not be loaded. Review the state and try again.',
        ),
      ).toBeVisible();
      fixture.availabilityStatus = 404;
      await page
        .getByRole('button', {
          name: locale === 'ar-EG' ? 'اعرض الأوقات الحالية' : 'Show current slots',
        })
        .click();
      await expect(
        page.getByText(locale === 'ar-EG' ? 'لا يمكن متابعة المهمة' : 'This task cannot continue'),
      ).toBeVisible();
      await expect(
        page.getByRole('button', { name: locale === 'ar-EG' ? 'حاول مرة أخرى' : 'Try again' }),
      ).toHaveCount(0);
      await expect(
        page.getByRole('button', {
          name: locale === 'ar-EG' ? 'العودة إلى ملف المريض' : 'Return to patient profile',
        }),
      ).toBeVisible();
      await capture(page, locale, 'doctor-error-terminal');
      await page
        .getByRole('button', {
          name: locale === 'ar-EG' ? 'العودة إلى ملف المريض' : 'Return to patient profile',
        })
        .click();
      await expect(page).toHaveURL(/\/profile$/);
      await page.goto(`/doctors/${doctorId}?facilityId=${facilityId}`);
      fixture.availability = 'permission';
      await page
        .getByRole('button', {
          name: locale === 'ar-EG' ? 'اعرض الأوقات الحالية' : 'Show current slots',
        })
        .click();
      await expect(
        page.getByText(
          locale === 'ar-EG'
            ? 'ليس لديك الصلاحية أو النطاق الحالي لهذا الإجراء.'
            : 'You do not have permission or the current scope for this action.',
        ),
      ).toBeVisible();
      await capture(page, locale, 'doctor-permission-denied');
      fixture.availability = 'fresh';
      await page.emulateMedia({ forcedColors: 'active', reducedMotion: 'reduce' });
      expect(await page.evaluate(() => matchMedia('(forced-colors: active)').matches)).toBe(true);
      expect(
        await page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches),
      ).toBe(true);
      await checkLayout(page, width);
      await capture(page, locale, 'doctor-forced-colors-reduced-motion');
      await page.emulateMedia({ forcedColors: 'none', reducedMotion: 'reduce' });
      await scaleRenderedText(page, 2);
      await checkLayout(page, width);
      await restoreRenderedText(page);
      await scaleRenderedText(page, 4);
      await checkLayout(page, width);
      await restoreRenderedText(page);
      await page.setViewportSize({ width: 320, height });
      await checkLayout(page, 320);
      await capture(page, locale, 'doctor-320-reflow');
    });

    test('Booking validation, conflict, uncertain, and confirmed result', async ({ page }) => {
      const fixture: Fixture = { bookings: [] };
      await syntheticApi(page, fixture);
      await signIn(page, locale);
      const query = new URLSearchParams(slot).toString();
      fixture.availability = 'loading';
      await clientNavigate(page, `/appointments/new?${query}`);
      await expect(
        page.getByText(locale === 'ar-EG' ? 'جارٍ تحميل بيانات العيادة…' : 'Loading clinic data…'),
      ).toBeVisible();
      await expect.poll(() => typeof fixture.releaseAvailability).toBe('function');
      await capture(page, locale, 'booking-loading');
      fixture.availability = 'fresh';
      fixture.releaseAvailability?.();
      await expect(page.getByText('Synthetic Patient').last()).toBeVisible();
      await expect(page.getByText(/350 EGP/)).toBeVisible();
      await expectIsolatedTimestamp(page, slot.startsAt);
      await checkLayout(page, width);
      await checkPatientTextScaling(page, width);
      await capture(page, locale, 'booking-ready');
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
      fixture.booking = 'submitting';
      await page
        .getByRole('button', { name: locale === 'ar-EG' ? 'حاول مرة أخرى' : 'Try again' })
        .click();
      await expect(
        page.getByText(locale === 'ar-EG' ? 'جارٍ تحميل بيانات العيادة…' : 'Loading clinic data…'),
      ).toBeVisible();
      await expect.poll(() => typeof fixture.releaseBooking).toBe('function');
      await capture(page, locale, 'booking-submitting');
      fixture.booking = 'success';
      fixture.releaseBooking?.();
      await expect(
        page.getByText(locale === 'ar-EG' ? 'تم تأكيد الموعد.' : 'Appointment confirmed.'),
      ).toBeVisible();
      await expectIsolatedTimestamp(page, appointment.startsAt);
      await capture(page, locale, 'booking-success');

      await clientNavigate(page, '/discover');
      await clientNavigate(page, `/appointments/new?${query}`);
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
      fixture.booking = 'recoverable';
      await page
        .getByRole('button', {
          name: locale === 'ar-EG' ? 'تأكيد حجز الموعد' : 'Confirm appointment booking',
        })
        .last()
        .click();
      await expect(
        page.getByText(
          locale === 'ar-EG'
            ? 'تعذر تحميل البيانات الآن. راجع الحالة ثم حاول مرة أخرى.'
            : 'The data could not be loaded. Review the state and try again.',
        ),
      ).toBeVisible();
      await expect(
        page.getByRole('button', { name: locale === 'ar-EG' ? 'حاول مرة أخرى' : 'Try again' }),
      ).toBeVisible();
      await capture(page, locale, 'booking-error-recoverable');
      await page
        .getByRole('button', { name: locale === 'ar-EG' ? 'حاول مرة أخرى' : 'Try again' })
        .click();
      await expect(
        page.getByRole('button', {
          name: locale === 'ar-EG' ? 'تأكيد حجز الموعد' : 'Confirm appointment booking',
        }),
      ).toBeVisible();

      await clientNavigate(page, '/discover');
      await clientNavigate(page, `/appointments/new?${query}`);
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
      fixture.booking = 'terminal';
      await page
        .getByRole('button', {
          name: locale === 'ar-EG' ? 'تأكيد حجز الموعد' : 'Confirm appointment booking',
        })
        .last()
        .click();
      await expect(
        page.getByText(locale === 'ar-EG' ? 'لا يمكن متابعة المهمة' : 'This task cannot continue'),
      ).toBeVisible();
      await expect(
        page.getByRole('button', { name: locale === 'ar-EG' ? 'حاول مرة أخرى' : 'Try again' }),
      ).toHaveCount(0);
      await expect(
        page.getByRole('button', {
          name: locale === 'ar-EG' ? 'العودة إلى ملف المريض' : 'Return to patient profile',
        }),
      ).toBeVisible();
      await capture(page, locale, 'booking-error-terminal');
      await page
        .getByRole('button', {
          name: locale === 'ar-EG' ? 'العودة إلى ملف المريض' : 'Return to patient profile',
        })
        .click();
      await expect(page).toHaveURL(/\/profile$/);

      fixture.availability = 'permission';
      await clientNavigate(page, '/discover');
      await clientNavigate(page, `/appointments/new?${query}`);
      await expect(
        page.getByText(
          locale === 'ar-EG'
            ? 'يلزم تسجيل الدخول وسياق مريض صالح للحجز.'
            : 'Sign-in and a valid patient context are required to book.',
        ),
      ).toBeVisible();
      await capture(page, locale, 'booking-permission-denied');
      expect(fixture.bookings?.length).toBe(5);
      expect(fixture.bookings?.[1]?.key).toBe(fixture.bookings?.[2]?.key);
      expect(JSON.stringify(fixture.bookings?.[2]?.body)).not.toMatch(/feeMinorUnits|currency/);
    });
  });
}
