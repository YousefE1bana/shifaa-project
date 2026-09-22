import { expect, test, type Page } from 'playwright/test';
import path from 'node:path';

const actual = path.resolve(
  process.cwd(),
  'specs/009-clinic-scheduling-appointments-queue/evidence/actual/appointments',
);
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
type Scenario = { status: AppointmentStatus; mutation: 'success' | 'conflict' };

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
      body = {
        ...appointment,
        status: scenario.status,
        version: scenario.status === 'checked_in' ? 2 : 1,
      };
    } else if (apiPath === `/appointments/${appointmentId}/queue-position`) {
      body = {
        appointmentId,
        state: 'waiting',
        queueNumber: 1,
        position: 1,
        estimatedServiceAt: '2030-01-07T09:15:00+02:00',
        queueVersion: 1,
        updatedAt: '2030-01-07T08:45:00.000Z',
        stale: false,
      };
    } else if (apiPath.endsWith('/availability')) {
      body = {
        items: [replacement],
        nextCursor: null,
        freshness: 'fresh',
        generatedAt: '2029-12-01T08:00:00.000Z',
        feeMinorUnits: 35000,
        currency: 'EGP',
        paymentMethod: 'cash_on_arrival',
        version: 1,
      };
    } else if (apiPath === `/appointments/${appointmentId}/check-in`) {
      status = scenario.mutation === 'conflict' ? 409 : 200;
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
      status = scenario.mutation === 'conflict' ? 412 : 200;
      body = { ...appointment, status: 'cancelled', version: 2 };
    } else if (apiPath === `/appointments/${appointmentId}/reschedule`) {
      status = scenario.mutation === 'conflict' ? 412 : 200;
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

async function capture(page: Page, locale: string, state: string) {
  await page.screenshot({
    path: path.join(actual, `patient-${locale}-${state}.png`),
    fullPage: true,
  });
}

for (const [locale, width, height] of [
  ['ar-EG', 360, 800],
  ['en-EG', 412, 915],
] as const) {
  test(`${locale} patient appointment rendered journey`, async ({ page, context }) => {
    test.setTimeout(60_000);
    await page.setViewportSize({ width, height });
    await page.addInitScript((value) => {
      localStorage.setItem('shifaa.patient.locale', value);
      document.cookie = 'shifaa_csrf=synthetic-local-only; path=/; SameSite=Lax';
    }, locale);
    await page.emulateMedia({ forcedColors: 'active', reducedMotion: 'reduce' });
    await syntheticApi(page, { status: 'confirmed', mutation: 'success' });
    await signIn(page, locale);
    expect(await page.locator('html').getAttribute('dir')).toBe(locale === 'ar-EG' ? 'rtl' : 'ltr');
    expect(await page.evaluate(() => matchMedia('(forced-colors: active)').matches)).toBe(true);
    expect(await page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches)).toBe(
      true,
    );
    await checkLayout(page, width);
    await capture(page, locale, 'confirmed');

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
    await capture(page, locale, 'checked-in-queue');

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
    await capture(page, locale, 'cancelled');

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
    await capture(page, locale, 'rescheduled');

    await page.setViewportSize({ width: 320, height });
    await checkLayout(page, 320);
    await capture(page, locale, '320-reflow');
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
    await capture(page, locale, 'offline');
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

for (const locale of ['ar-EG', 'en-EG'] as const) {
  test(`${locale} patient renders all nine appointment states and permitted actions`, async ({
    page,
  }) => {
    test.setTimeout(180_000);
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
    }
  });
}
