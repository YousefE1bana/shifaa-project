import { expect, test, type Locator, type Page } from 'playwright/test';
import { captureFeature009Ui } from './feature009-ui-capture';
const appointmentId = '92000000-0000-4000-8000-000000000001';
const patientId = '91000000-0000-4000-8000-000000000003';
const facilityId = '90000000-0000-4000-8000-000000000001';
const doctorId = '91000000-0000-4000-8000-000000000001';
const appointment = {
  id: appointmentId,
  patientId,
  facilityId,
  doctorId,
  startsAt: '2030-01-07T09:00:00+02:00',
  endsAt: '2030-01-07T09:30:00+02:00',
  civilDate: '2030-01-07',
  timezone: 'Africa/Cairo',
  feeMinorUnits: 35000,
  currency: 'EGP',
  paymentMethod: 'cash_on_arrival',
  version: 1,
};
const replacement = {
  facilityId,
  doctorId,
  startsAt: '2030-01-08T09:00:00+02:00',
  endsAt: '2030-01-08T09:30:00+02:00',
  civilDate: '2030-01-08',
  timezone: 'Africa/Cairo',
};
type AppointmentStatus =
  | 'requested'
  | 'confirmed'
  | 'checked_in'
  | 'in_queue'
  | 'in_consultation'
  | 'completed'
  | 'cancelled'
  | 'no_show'
  | 'reschedule_required';
type Scenario = {
  status: AppointmentStatus;
  mutation: 'success' | 'conflict' | 'recoverable' | 'submitting';
  appointmentError?: number;
  loading?: boolean;
  releaseLoad?: () => void;
  delayMinutes?: number;
  queueDelayMinutes?: number;
  queueState?: 'waiting' | 'called' | 'in_service' | 'completed' | 'removed';
  releaseMutation?: () => void;
  queueStale?: boolean;
  availabilityStale?: boolean;
};

async function syntheticApi(page: Page, scenario: Scenario) {
  await page.route('**/v1/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const apiPath = url.pathname.replace(/^\/v1/, '');
    let status = 200;
    let body: unknown;
    if (apiPath === '/auth/login') body = { challenge_id: 'synthetic-challenge' };
    else if (apiPath === '/auth/otp/verify') body = { access_token: 'synthetic-local-only-token' };
    else if (apiPath === '/auth/session/refresh') {
      body = {
        accessToken: 'synthetic-local-only-token',
        sessionId: '92000000-0000-4000-8000-000000000009',
        assurance: 'aal1',
        expiresAt: '2030-01-07T10:00:00.000Z',
      };
    } else if (apiPath === '/people/me')
      body = { id: patientId, display_name: 'Synthetic Patient', version: 1 };
    else if (apiPath === `/appointments/${appointmentId}` && request.method() === 'GET') {
      if (scenario.loading)
        await new Promise<void>((resolve) => {
          scenario.releaseLoad = resolve;
        });
      if (scenario.appointmentError) status = scenario.appointmentError;
      body = {
        ...appointment,
        status: scenario.status,
        version: scenario.status === 'checked_in' ? 2 : 1,
        ...(scenario.delayMinutes === undefined ? {} : { delayMinutes: scenario.delayMinutes }),
      };
    } else if (apiPath === `/appointments/${appointmentId}/queue-position`) {
      body = {
        appointmentId,
        state: scenario.queueState ?? 'waiting',
        queueNumber: 1,
        position: 1,
        estimatedServiceAt: '2030-01-07T09:15:00+02:00',
        ...(scenario.queueDelayMinutes === undefined
          ? {}
          : { delayMinutes: scenario.queueDelayMinutes }),
        queueVersion: 1,
        updatedAt: '2030-01-07T08:45:00.000Z',
        stale: scenario.queueStale ?? false,
      };
    } else if (apiPath.endsWith('/availability')) {
      body = {
        items: [replacement],
        nextCursor: null,
        freshness: scenario.availabilityStale ? 'stale' : 'fresh',
        generatedAt: '2029-12-01T08:00:00.000Z',
        feeMinorUnits: 35000,
        currency: 'EGP',
        paymentMethod: 'cash_on_arrival',
        version: 1,
      };
    } else if (apiPath === `/appointments/${appointmentId}/check-in`) {
      status =
        scenario.mutation === 'conflict' ? 409 : scenario.mutation === 'recoverable' ? 422 : 200;
      body = {
        appointment: { ...appointment, status: 'checked_in', version: 2 },
        queueEntry: {
          id: '93000000-0000-4000-8000-000000000001',
          appointmentId,
          facilityId,
          doctorId,
          patientId,
          civilDate: '2030-01-07',
          state: 'waiting',
          queueNumber: 1,
          position: 1,
          version: 1,
        },
      };
    } else if (apiPath === `/appointments/${appointmentId}/cancel`) {
      if (scenario.mutation === 'submitting')
        await new Promise<void>((resolve) => {
          scenario.releaseMutation = resolve;
        });
      status =
        scenario.mutation === 'conflict' ? 412 : scenario.mutation === 'recoverable' ? 422 : 200;
      body = { ...appointment, status: 'cancelled', version: 2 };
    } else if (apiPath === `/appointments/${appointmentId}/reschedule`) {
      if (scenario.mutation === 'submitting')
        await new Promise<void>((resolve) => {
          scenario.releaseMutation = resolve;
        });
      status =
        scenario.mutation === 'conflict' ? 412 : scenario.mutation === 'recoverable' ? 422 : 200;
      body = { ...appointment, ...replacement, status: 'confirmed', version: 2 };
    } else {
      await route.continue();
      return;
    }
    await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
  });
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
  await page.evaluate((route) => {
    window.history.pushState({}, '', route);
    window.dispatchEvent(new PopStateEvent('popstate'));
  }, `/appointments/${appointmentId}`);
  await expect(
    page.getByRole('heading', {
      name: locale === 'ar-EG' ? 'تفاصيل الموعد' : 'Appointment details',
    }),
  ).toBeVisible();
}

async function remountAppointment(page: Page) {
  await page.evaluate(() => {
    window.history.pushState({}, '', '/profile');
    window.dispatchEvent(new PopStateEvent('popstate'));
  });
  await expect(page.getByRole('heading', { name: /Patient profile|ملف المريض/ })).toBeVisible();
  await page.evaluate((route) => {
    window.history.pushState({}, '', route);
    window.dispatchEvent(new PopStateEvent('popstate'));
  }, `/appointments/${appointmentId}`);
  await expect(
    page.getByRole('heading', { name: /Appointment details|تفاصيل الموعد/ }),
  ).toBeVisible();
}

async function checkLayout(page: Page, width: number) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
    width,
  );
  const controls = page.getByRole('button').or(page.getByRole('link'));
  for (const control of await controls.all()) {
    if (!(await control.isVisible())) continue;
    if (
      !(await control.evaluate(
        (element) => document.querySelector('#root')?.contains(element) === true,
      ))
    )
      continue;
    const bounds = await control.boundingBox();
    if (bounds) {
      const name = (
        (await control.getAttribute('aria-label')) ?? (await control.innerText())
      ).trim();
      expect(bounds.width, `target width for ${name}`).toBeGreaterThanOrEqual(44);
      expect(bounds.height, `target height for ${name}`).toBeGreaterThanOrEqual(44);
    }
    expect(
      ((await control.getAttribute('aria-label')) ?? (await control.innerText())).trim(),
    ).not.toBe('');
  }
}

async function checkTextContrast(locator: Locator, label: string) {
  const ratio = await locator.evaluate((element) => {
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
  expect(ratio, `${label} normal-palette contrast`).toBeGreaterThanOrEqual(4.5);
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

const appointmentStateCopy: Record<AppointmentStatus, [string, string]> = {
  requested: ['مطلوب', 'Requested'],
  confirmed: ['مؤكّد', 'Confirmed'],
  checked_in: ['تم تسجيل الحضور', 'Checked in'],
  in_queue: ['في قائمة الانتظار', 'In queue'],
  in_consultation: ['قيد الاستشارة', 'In consultation'],
  completed: ['مكتمل', 'Completed'],
  cancelled: ['ملغى', 'Cancelled'],
  no_show: ['لم يحضر', 'No-show'],
  reschedule_required: ['يلزم إعادة الجدولة', 'Reschedule required'],
};

async function capture(
  page: Page,
  locale: 'ar-EG' | 'en-EG',
  state: string,
  visibleState: Locator,
) {
  await expect(visibleState, `${state} rendered before capture`).toBeVisible();
  await captureFeature009Ui(page, 'F009-P0-PAT-APPOINTMENT-001', locale, state, visibleState);
}

const appointmentStatusAnchor = (
  page: Page,
  locale: 'ar-EG' | 'en-EG',
  status: AppointmentStatus,
) =>
  page
    .getByText(new RegExp(`^${appointmentStateCopy[status][locale === 'ar-EG' ? 0 : 1]} ·`))
    .last();
const queueStatusAnchor = (
  page: Page,
  locale: 'ar-EG' | 'en-EG',
  state: 'waiting' | 'called' | 'in_service' | 'completed' | 'removed',
) => {
  const labels = {
    waiting: ['ينتظر', 'Waiting'],
    called: ['تم النداء', 'Called'],
    in_service: ['قيد الخدمة', 'In service'],
    completed: ['مكتملة', 'Completed'],
    removed: ['أزيلت من القائمة', 'Removed'],
  } as const;
  return page.getByText(labels[state][locale === 'ar-EG' ? 0 : 1], { exact: true }).last();
};

const delayText = (page: Page, locale: 'ar-EG' | 'en-EG', minutes: number) =>
  page
    .getByText(
      locale === 'ar-EG'
        ? new RegExp(`تأخير حالي:.*${minutes}.*دقيقة`)
        : new RegExp(`Current delay:.*${minutes}.*minutes`),
    )
    .last();

for (const [locale, width, height] of [
  ['ar-EG', 360, 800],
  ['ar-EG', 412, 915],
  ['en-EG', 360, 800],
  ['en-EG', 412, 915],
] as const) {
  test(`${locale} patient appointment rendered journey ${width}x${height}`, async ({
    page,
    context,
  }) => {
    test.setTimeout(60_000);
    await page.setViewportSize({ width, height });
    await page.addInitScript((value) => {
      localStorage.setItem('shifaa.patient.locale', value);
      document.cookie = 'shifaa_csrf=synthetic-local-only; path=/; SameSite=Lax';
    }, locale);
    await page.emulateMedia({ forcedColors: 'none', reducedMotion: 'reduce' });
    await syntheticApi(page, { status: 'confirmed', mutation: 'success' });
    await signIn(page, locale);
    expect(await page.locator('html').getAttribute('dir')).toBe(locale === 'ar-EG' ? 'rtl' : 'ltr');
    await expect(page.getByRole('main')).toHaveCount(1);
    const contrastSamples: Array<[Locator, string]> = [
      [page.getByRole('heading', { level: 1 }).last(), `${locale} appointment title`],
      [
        page.getByText(
          locale === 'ar-EG'
            ? 'اعرض حالة الموعد وإجراءاتها المسموح بها.'
            : 'View the appointment state and its permitted actions.',
          { exact: true },
        ),
        `${locale} appointment body`,
      ],
      [
        page.getByText(locale === 'ar-EG' ? 'تسجيل الحضور' : 'Check in', { exact: true }),
        `${locale} appointment action`,
      ],
    ];
    expect(contrastSamples).toHaveLength(3);
    for (const [sample, label] of contrastSamples) await checkTextContrast(sample, label);
    console.log(`${locale} appointment normal-palette contrast samples: ${contrastSamples.length}`);
    expect(await page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches)).toBe(
      true,
    );
    await checkLayout(page, width);
    for (const factor of [2, 4] as const) {
      await scaleRenderedText(page, factor);
      await checkLayout(page, width);
      await restoreRenderedText(page);
    }
    await capture(page, locale, 'confirmed', appointmentStatusAnchor(page, locale, 'confirmed'));

    const checkIn = page.getByRole('button', {
      name: locale === 'ar-EG' ? 'تسجيل الحضور' : 'Check in',
    });
    await checkIn.focus();
    await expect(checkIn).toBeFocused();
    await checkIn.press('Enter');
    await expect(
      page.getByRole('button', {
        name: locale === 'ar-EG' ? 'تأكيد تسجيل الحضور' : 'Confirm check-in',
      }),
    ).toBeVisible();
    await page
      .getByRole('button', { name: locale === 'ar-EG' ? 'تأكيد تسجيل الحضور' : 'Confirm check-in' })
      .click();
    await expect(
      page.getByText(locale === 'ar-EG' ? /اكتمل الإجراء/ : /action completed/i),
    ).toBeVisible();
    await expect(
      page.getByText(locale === 'ar-EG' ? /موضعك في الانتظار/ : /Follow your own queue position/),
    ).toBeVisible();
    await capture(page, locale, 'checked-in', queueStatusAnchor(page, locale, 'waiting'));

    await page.unroute('**/v1/**');
    await syntheticApi(page, { status: 'confirmed', mutation: 'success' });
    await signIn(page, locale);
    const cancel = page
      .getByRole('button', {
        name: locale === 'ar-EG' ? 'تأكيد إلغاء الموعد' : 'Confirm appointment cancellation',
      })
      .first();
    await cancel.click();
    const reason = page.getByRole('textbox', {
      name: locale === 'ar-EG' ? 'سبب الإلغاء' : 'Cancellation reason',
    });
    await expect(reason).toBeFocused();
    await reason.fill(locale === 'ar-EG' ? 'طلب المريض' : 'Patient request');
    await page
      .getByRole('button', {
        name: locale === 'ar-EG' ? 'تأكيد إلغاء الموعد' : 'Confirm appointment cancellation',
      })
      .last()
      .click();
    await expect(
      page.getByText(locale === 'ar-EG' ? /اكتمل الإجراء/ : /action completed/i),
    ).toBeVisible();
    await capture(page, locale, 'cancelled', appointmentStatusAnchor(page, locale, 'cancelled'));
    await page.emulateMedia({ forcedColors: 'active', reducedMotion: 'reduce' });
    expect(await page.evaluate(() => matchMedia('(forced-colors: active)').matches)).toBe(true);
    const focusedControl = page.getByRole('button').first();
    await focusedControl.focus();
    await expect(focusedControl).toBeFocused();
    const focusBorderWidth = Number(
      await focusedControl.evaluate((element) =>
        getComputedStyle(element).borderTopWidth.replace('px', ''),
      ),
    );
    expect(focusBorderWidth).toBeGreaterThanOrEqual(3);
    await page.emulateMedia({ forcedColors: 'none', reducedMotion: 'reduce' });

    await page.unroute('**/v1/**');
    await syntheticApi(page, { status: 'confirmed', mutation: 'success' });
    await signIn(page, locale);
    await page
      .getByRole('button', {
        name: locale === 'ar-EG' ? 'تأكيد إعادة الجدولة' : 'Confirm rescheduling',
      })
      .first()
      .click();
    const rescheduleReason = page.getByRole('textbox', {
      name: locale === 'ar-EG' ? 'سبب إعادة الجدولة' : 'Rescheduling reason',
    });
    const reschedulePanel = page.getByRole('alert');
    const slotChoice = reschedulePanel.getByRole('button').first();
    await expect(slotChoice).toBeVisible();
    await slotChoice.click();
    await page
      .getByRole('button', {
        name: locale === 'ar-EG' ? 'تأكيد إعادة الجدولة' : 'Confirm rescheduling',
      })
      .last()
      .click();
    await expect(rescheduleReason).toBeFocused();
    await rescheduleReason.fill(locale === 'ar-EG' ? 'طلب المريض' : 'Patient request');
    const rescheduleRequest = page.waitForRequest(
      (request) =>
        request.url().includes(`/appointments/${appointmentId}/reschedule`) &&
        request.method() === 'POST',
    );
    await page
      .getByRole('button', {
        name: locale === 'ar-EG' ? 'تأكيد إعادة الجدولة' : 'Confirm rescheduling',
      })
      .last()
      .click();
    expect((await rescheduleRequest).postDataJSON().reason).toBe(
      locale === 'ar-EG' ? 'طلب المريض' : 'Patient request',
    );
    await expect(
      page.getByText(locale === 'ar-EG' ? /اكتمل الإجراء/ : /action completed/i),
    ).toBeVisible();

    await page.setViewportSize({ width: 320, height });
    await checkLayout(page, 320);
    await page
      .getByRole('button', {
        name: locale === 'ar-EG' ? 'تأكيد إلغاء الموعد' : 'Confirm appointment cancellation',
      })
      .first()
      .click();
    await page
      .getByRole('textbox', { name: locale === 'ar-EG' ? 'سبب الإلغاء' : 'Cancellation reason' })
      .fill(locale === 'ar-EG' ? 'اختبار دون اتصال' : 'Offline test');
    await context.setOffline(true);
    await page
      .getByRole('button', {
        name: locale === 'ar-EG' ? 'تأكيد إلغاء الموعد' : 'Confirm appointment cancellation',
      })
      .last()
      .click();
    await expect(
      page.getByText(locale === 'ar-EG' ? /لا يوجد اتصال/ : /You are offline/),
    ).toBeVisible();
    await page.setViewportSize({ width, height });
    await capture(
      page,
      locale,
      'offline',
      page.getByText(locale === 'ar-EG' ? /لا يوجد اتصال/ : /You are offline/).last(),
    );
  });
}

for (const [locale, width, height] of [
  ['ar-EG', 360, 800],
  ['ar-EG', 412, 915],
  ['en-EG', 360, 800],
  ['en-EG', 412, 915],
] as const) {
  test(`${locale} patient appointment exceptional and queue states ${width}x${height}`, async ({
    page,
    context,
  }) => {
    test.setTimeout(240_000);
    await page.setViewportSize({ width, height });
    await page.addInitScript((value) => {
      localStorage.setItem('shifaa.patient.locale', value);
      document.cookie = 'shifaa_csrf=synthetic-local-only; path=/; SameSite=Lax';
    }, locale);
    const scenario: Scenario = { status: 'confirmed', mutation: 'success' };
    await syntheticApi(page, scenario);
    await signIn(page, locale);
    const text = (ar: string, en: string) =>
      page.getByText(locale === 'ar-EG' ? ar : en, { exact: true }).last();
    const update = async (patch: Partial<Scenario>) => {
      Object.assign(scenario, {
        loading: undefined,
        releaseLoad: undefined,
        appointmentError: undefined,
        delayMinutes: undefined,
        queueDelayMinutes: undefined,
        queueState: undefined,
        releaseMutation: undefined,
        queueStale: undefined,
        availabilityStale: undefined,
        mutation: 'success',
        ...patch,
      });
      await remountAppointment(page);
    };

    scenario.loading = true;
    await remountAppointment(page);
    await expect(text('جارٍ تحميل بيانات العيادة…', 'Loading clinic data…')).toBeVisible();
    await expect.poll(() => typeof scenario.releaseLoad).toBe('function');
    await capture(
      page,
      locale,
      'loading',
      text('جارٍ تحميل بيانات العيادة…', 'Loading clinic data…'),
    );
    scenario.releaseLoad?.();
    scenario.releaseLoad = undefined;
    scenario.loading = false;
    await expect(appointmentStatusAnchor(page, locale, 'confirmed')).toBeVisible();

    const scheduledStatus = await appointmentStatusAnchor(page, locale, 'confirmed').textContent();
    await update({ status: 'confirmed', delayMinutes: 20 });
    await expect(delayText(page, locale, 20)).toBeVisible();
    await expect(
      text(
        'تغير وقت الانتظار المتوقع فقط؛ لم يتغير ترتيب الدور أو وقت الموعد.',
        'Only the wait estimate changed; queue order and appointment time did not.',
      ),
    ).toBeVisible();
    await expect(
      page.getByText(locale === 'ar-EG' ? /^موضعك الحالي:/ : /^Your current position:/),
    ).toHaveCount(0);
    await expect(appointmentStatusAnchor(page, locale, 'confirmed')).toHaveText(
      scheduledStatus ?? '',
    );
    await capture(page, locale, 'delay-active', delayText(page, locale, 20));

    await update({
      status: 'checked_in',
      delayMinutes: 10,
      queueDelayMinutes: 25,
      queueState: 'waiting',
    });
    await expect(queueStatusAnchor(page, locale, 'waiting')).toBeVisible();
    await expect(delayText(page, locale, 25)).toBeVisible();
    await expect(delayText(page, locale, 10)).toHaveCount(0);
    await update({ status: 'checked_in', delayMinutes: 20, queueState: 'waiting' });
    await expect(queueStatusAnchor(page, locale, 'waiting')).toBeVisible();
    await expect(delayText(page, locale, 20)).toHaveCount(0);
    await update({
      status: 'checked_in',
      delayMinutes: 10,
      queueState: 'waiting',
      queueStale: true,
    });
    await expect(queueStatusAnchor(page, locale, 'waiting')).toBeVisible();
    await expect(delayText(page, locale, 10)).toBeVisible();

    for (const [captureState, status, queueState] of [
      ['queue-waiting', 'checked_in', 'waiting'],
      ['queue-called', 'in_queue', 'called'],
      ['queue-in-service-readonly', 'in_consultation', 'in_service'],
      ['queue-completed', 'completed', 'completed'],
      ['queue-removed', 'no_show', 'removed'],
    ] as const) {
      await update({ status, queueState });
      await expect(queueStatusAnchor(page, locale, queueState)).toBeVisible();
      await expect(
        page.getByText(locale === 'ar-EG' ? /موضعك الحالي: 1/ : /Your current position: 1/),
      ).toBeVisible();
      await capture(page, locale, captureState, queueStatusAnchor(page, locale, queueState));
    }

    await update({ status: 'confirmed' });
    await page
      .getByRole('button', {
        name: locale === 'ar-EG' ? 'تأكيد إلغاء الموعد' : 'Confirm appointment cancellation',
      })
      .first()
      .click();
    const cancelHelp = text(
      'سيؤدي الإلغاء إلى تحرير الوقت ولا يمكن التراجع عنه من هذه الشاشة.',
      'Cancellation releases the time and cannot be undone from this screen.',
    );
    await expect(page.getByRole('alert')).toContainText(
      locale === 'ar-EG' ? 'سيؤدي الإلغاء' : 'Cancellation releases',
    );
    await expect(text('سبب الإلغاء', 'Cancellation reason')).toBeVisible();
    await capture(page, locale, 'cancel-confirmation', cancelHelp);
    await page.getByRole('button', { name: locale === 'ar-EG' ? 'العودة' : 'Back' }).click();

    await update({ status: 'confirmed', availabilityStale: true });
    await page
      .getByRole('button', {
        name: locale === 'ar-EG' ? 'تأكيد إعادة الجدولة' : 'Confirm rescheduling',
      })
      .first()
      .click();
    await expect(
      text(
        'قد تكون البيانات قديمة. أعد التحميل قبل المتابعة.',
        'This data may be outdated. Refresh before continuing.',
      ),
    ).toBeVisible();
    await capture(
      page,
      locale,
      'stale',
      text(
        'قد تكون البيانات قديمة. أعد التحميل قبل المتابعة.',
        'This data may be outdated. Refresh before continuing.',
      ),
    );

    await context.setOffline(true);
    await update({ status: 'confirmed' });
    await expect(
      page.getByText(locale === 'ar-EG' ? /لا يوجد اتصال/ : /You are offline/),
    ).toBeVisible();
    await capture(
      page,
      locale,
      'offline',
      page.getByText(locale === 'ar-EG' ? /لا يوجد اتصال/ : /You are offline/).last(),
    );
    await context.setOffline(false);

    for (const [state, statusCode, expected] of [
      [
        'error-recoverable',
        503,
        [
          'تعذر تحميل البيانات الآن. راجع الحالة ثم حاول مرة أخرى.',
          'The data could not be loaded. Review the state and try again.',
        ],
      ],
      ['error-terminal', 404, ['لا يمكن متابعة المهمة', 'This task cannot continue']],
      [
        'permission-denied',
        403,
        [
          'ليس لديك الصلاحية أو النطاق الحالي لهذا الإجراء.',
          'You do not have permission or the current scope for this action.',
        ],
      ],
    ] as const) {
      await update({ status: 'confirmed', appointmentError: statusCode });
      const anchor = text(expected[0], expected[1]);
      await expect(anchor).toBeVisible();
      if (state === 'error-terminal') {
        await expect(
          page.getByRole('button', { name: locale === 'ar-EG' ? 'حاول مرة أخرى' : 'Try again' }),
        ).toHaveCount(0);
        const safeProfile = page.getByRole('button', {
          name: locale === 'ar-EG' ? 'العودة إلى ملف المريض' : 'Return to patient profile',
        });
        await expect(safeProfile).toBeVisible();
        await capture(page, locale, state, anchor);
        await safeProfile.click();
        await expect(page).toHaveURL(/\/profile$/);
        continue;
      }
      await capture(page, locale, state, anchor);
      if (state === 'error-recoverable') {
        const retry = page.getByRole('button', {
          name: locale === 'ar-EG' ? 'تحديث البيانات الحالية' : 'Refresh current data',
        });
        await expect(retry).toBeVisible();
        await retry.click();
        await expect(anchor).toBeVisible();
      }
    }

    for (const [state, mutation] of [
      ['conflict', 'conflict'],
      ['submitting', 'submitting'],
      ['success', 'success'],
      ['error-recoverable', 'recoverable'],
    ] as const) {
      await update({ status: 'confirmed', mutation });
      await page
        .getByRole('button', {
          name: locale === 'ar-EG' ? 'تأكيد إلغاء الموعد' : 'Confirm appointment cancellation',
        })
        .first()
        .click();
      await page
        .getByRole('textbox', { name: locale === 'ar-EG' ? 'سبب الإلغاء' : 'Cancellation reason' })
        .fill(locale === 'ar-EG' ? 'طلب المريض' : 'Patient request');
      const submit = page
        .getByRole('button', {
          name: locale === 'ar-EG' ? 'تأكيد إلغاء الموعد' : 'Confirm appointment cancellation',
        })
        .last();
      await submit.click();
      if (state === 'submitting') {
        const loading = text('جارٍ تحميل بيانات العيادة…', 'Loading clinic data…');
        await expect(loading).toBeVisible();
        await expect.poll(() => typeof scenario.releaseMutation).toBe('function');
        await capture(page, locale, 'submitting', loading);
        scenario.releaseMutation?.();
        scenario.releaseMutation = undefined;
        await expect(
          text(
            'اكتمل الإجراء وتظهر النتيجة الحالية من الخادم.',
            'The action completed; the current server result is shown.',
          ),
        ).toBeVisible();
      } else {
        const expected =
          state === 'conflict'
            ? [
                'تغيّرت النسخة الحالية. حدّث البيانات ثم حاول بإجراء مقصود جديد.',
                'The current version changed. Refresh and submit a new intentional action.',
              ]
            : state === 'success'
              ? [
                  'اكتمل الإجراء وتظهر النتيجة الحالية من الخادم.',
                  'The action completed; the current server result is shown.',
                ]
              : [
                  'تعذر تحميل البيانات الآن. راجع الحالة ثم حاول مرة أخرى.',
                  'The data could not be loaded. Review the state and try again.',
                ];
        const anchor = text(expected[0], expected[1]);
        await expect(anchor).toBeVisible();
        await capture(page, locale, state === 'error-recoverable' ? state : state, anchor);
      }
    }
  });
}

const appointmentStates = [
  ['requested', 'مطلوب', 'Requested'],
  ['confirmed', 'مؤكّد', 'Confirmed'],
  ['checked_in', 'تم تسجيل الحضور', 'Checked in'],
  ['in_queue', 'في قائمة الانتظار', 'In queue'],
  ['in_consultation', 'قيد الاستشارة', 'In consultation'],
  ['completed', 'مكتمل', 'Completed'],
  ['cancelled', 'ملغى', 'Cancelled'],
  ['no_show', 'لم يحضر', 'No-show'],
  ['reschedule_required', 'يلزم إعادة الجدولة', 'Reschedule required'],
] as const;

for (const [locale, width, height] of [
  ['ar-EG', 360, 800],
  ['ar-EG', 412, 915],
  ['en-EG', 360, 800],
  ['en-EG', 412, 915],
] as const) {
  test(`${locale} patient renders all nine appointment states and permitted actions ${width}x${height}`, async ({
    page,
  }) => {
    test.setTimeout(180_000);
    await page.setViewportSize({ width, height });
    await page.addInitScript((value) => {
      localStorage.setItem('shifaa.patient.locale', value);
      document.cookie = 'shifaa_csrf=synthetic-local-only; path=/; SameSite=Lax';
    }, locale);
    for (const [state, arabic, english] of appointmentStates) {
      await page.unroute('**/v1/**');
      await syntheticApi(page, { status: state, mutation: 'success' });
      await signIn(page, locale);
      const label = locale === 'ar-EG' ? arabic : english;
      await expect(
        page.getByText(new RegExp(`^${label} ·`)),
        `${locale} ${state} status`,
      ).toBeVisible();
      expect(await page.locator('html').getAttribute('dir')).toBe(
        locale === 'ar-EG' ? 'rtl' : 'ltr',
      );
      await expect(
        page.getByRole('button', {
          name: locale === 'ar-EG' ? 'تسجيل الحضور' : 'Check in',
        }),
      ).toHaveCount(state === 'confirmed' ? 1 : 0);
      await expect(
        page.getByRole('button', {
          name: locale === 'ar-EG' ? 'تأكيد إلغاء الموعد' : 'Confirm appointment cancellation',
        }),
      ).toHaveCount(['confirmed', 'reschedule_required'].includes(state) ? 1 : 0);
      await expect(
        page.getByRole('button', {
          name: locale === 'ar-EG' ? 'تأكيد إعادة الجدولة' : 'Confirm rescheduling',
        }),
      ).toHaveCount(['confirmed', 'reschedule_required'].includes(state) ? 1 : 0);
      if (state === 'reschedule_required')
        await expect(
          page.getByText(
            locale === 'ar-EG' ? /يتطلب هذا الموعد إعادة الجدولة/ : /requires rescheduling/i,
          ),
        ).toBeVisible();
      const captureState: Record<AppointmentStatus, string> = {
        requested: 'requested-readonly',
        confirmed: 'confirmed',
        checked_in: 'checked-in',
        in_queue: 'in-queue-readonly',
        in_consultation: 'in-consultation-readonly',
        completed: 'completed-readonly',
        cancelled: 'cancelled',
        no_show: 'no-show-readonly',
        reschedule_required: 'reschedule-required',
      };
      await capture(
        page,
        locale,
        captureState[state],
        appointmentStatusAnchor(page, locale, state),
      );
    }
  });
}
