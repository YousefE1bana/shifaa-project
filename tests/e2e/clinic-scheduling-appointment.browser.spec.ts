import { expect, test, type Page } from 'playwright/test';
import path from 'node:path';

const id = '92000000-0000-4000-8000-000000000001';
const actual = path.resolve(
  process.cwd(),
  'specs/009-clinic-scheduling-appointments-queue/evidence/actual/appointments',
);
const base = {
  id,
  patientId: '91000000-0000-4000-8000-000000000003',
  facilityId: '90000000-0000-4000-8000-000000000001',
  doctorId: '91000000-0000-4000-8000-000000000001',
  startsAt: '2030-01-07T09:00:00+02:00',
  endsAt: '2030-01-07T09:30:00+02:00',
  timezone: 'Africa/Cairo',
  feeMinorUnits: 35000,
  currency: 'EGP',
  paymentMethod: 'cash_on_arrival',
  version: 1,
};
type State =
  | 'requested'
  | 'confirmed'
  | 'checked_in'
  | 'in_queue'
  | 'in_consultation'
  | 'reschedule_required'
  | 'completed'
  | 'cancelled'
  | 'no_show'
  | 'conflict'
  | 'denied'
  | 'missing';

async function api(page: Page, state: State) {
  await page.route('**/v1/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const p = url.pathname.replace(/^\/v1/, '');
    let status = 200;
    let body: unknown = {};
    if (p === '/auth/login') body = { kind: 'challenge', challenge_id: 'synthetic-challenge' };
    else if (p === '/auth/otp/verify')
      body = { kind: 'session', access_token: 'synthetic-staff-token' };
    else if (p === `/appointments/${id}` && request.method() === 'GET') {
      if (state === 'denied') status = 403;
      else if (state === 'missing') status = 404;
      body = {
        ...base,
        status: ['conflict', 'denied', 'missing'].includes(state) ? 'confirmed' : state,
      };
    } else if (p.includes('/availability') && request.method() === 'GET') {
      body = {
        items: [
          {
            facilityId: base.facilityId,
            doctorId: base.doctorId,
            startsAt: '2030-01-08T09:00:00+02:00',
            endsAt: '2030-01-08T09:30:00+02:00',
            civilDate: '2030-01-08',
            timezone: 'Africa/Cairo',
          },
        ],
        nextCursor: null,
        freshness: 'fresh',
        generatedAt: '2029-12-01T08:00:00.000Z',
        feeMinorUnits: 35000,
        currency: 'EGP',
        paymentMethod: 'cash_on_arrival',
        version: 1,
      };
    } else if (p === `/appointments/${id}/check-in`) {
      status = state === 'conflict' ? 409 : 200;
      body = { appointment: { ...base, status: 'checked_in', version: 2 }, queuePosition: 1 };
    } else if (p === `/appointments/${id}/cancel` || p === `/appointments/${id}/reschedule`) {
      status = state === 'conflict' ? 412 : 200;
      body = { ...base, status: p.endsWith('cancel') ? 'cancelled' : 'confirmed', version: 2 };
    } else {
      await route.continue();
      return;
    }
    await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
  });
}

const appointmentStates = [
  ['requested', 'مطلوب — للعرض فقط', 'Requested — read only'],
  ['confirmed', 'مؤكد', 'Confirmed'],
  ['checked_in', 'تم تسجيل الحضور', 'Checked in'],
  ['in_queue', 'في قائمة الانتظار — للعرض فقط', 'In queue — read only'],
  ['in_consultation', 'قيد الاستشارة — للعرض فقط', 'In consultation — read only'],
  ['completed', 'مكتمل — للعرض فقط', 'Completed — read only'],
  ['cancelled', 'ملغى', 'Cancelled'],
  ['no_show', 'لم يحضر — للعرض فقط', 'No show — read only'],
  ['reschedule_required', 'تجب إعادة الجدولة', 'Reschedule required'],
] as const;

for (const locale of ['ar-EG', 'en-EG'] as const) {
  test(`${locale} clinic renders all nine appointment states and permitted actions`, async ({
    page,
  }) => {
    test.setTimeout(180_000);
    const english = locale === 'en-EG';
    for (const [state, arabic, translated] of appointmentStates) {
      await page.unroute('**/v1/**');
      await api(page, state);
      await signIn(page, english);
      const status = page
        .locator('section[aria-label]')
        .getByText(`${english ? 'Status' : 'الحالة'}: ${english ? translated : arabic}`, {
          exact: true,
        });
      await expect(status, `${locale} ${state} status`).toBeVisible();
      expect(await page.locator('main').first().getAttribute('dir')).toBe(english ? 'ltr' : 'rtl');
      const actions = page.locator('nav[aria-label]').getByRole('button');
      const expected = state === 'confirmed' ? 4 : state === 'reschedule_required' ? 3 : 1;
      await expect(actions, `${locale} ${state} action count`).toHaveCount(expected);
      await expect(
        page.getByRole('button', { name: english ? 'Check in' : 'تسجيل الحضور' }),
      ).toHaveCount(state === 'confirmed' ? 1 : 0);
      await expect(
        page.getByRole('button', { name: english ? 'Reschedule' : 'إعادة الجدولة' }),
      ).toHaveCount(['confirmed', 'reschedule_required'].includes(state) ? 1 : 0);
      await expect(
        page.getByRole('button', { name: english ? 'Cancel appointment' : 'إلغاء الموعد' }),
      ).toHaveCount(['confirmed', 'reschedule_required'].includes(state) ? 1 : 0);
      if (state === 'reschedule_required')
        await expect(
          page.getByText(
            english ? /future replacement slot is required/ : /يلزم موعد بديل مستقبلي/,
          ),
        ).toBeVisible();
      if (['checked_in', 'in_queue', 'in_consultation'].includes(state))
        await expect(
          page.getByRole('region', { name: english ? 'Queue' : 'قائمة الانتظار' }),
        ).toBeVisible();
    }
  });
}

async function signIn(page: Page, english = false) {
  await page.goto(`/appointments/${id}`);
  if (english) await page.getByRole('button', { name: 'English' }).click();
  await page
    .getByRole('textbox', { name: english ? 'Sign-in handle' : 'وسيلة الدخول' })
    .fill('staff@example.invalid');
  await page.locator('input[type=password]').fill('synthetic-local-only');
  await page.getByRole('button', { name: english ? 'Continue' : 'متابعة' }).click();
  await page
    .getByRole('textbox', { name: english ? 'Verification code' : 'رمز التحقق' })
    .fill('123456');
  await page.getByRole('button', { name: english ? 'Verify' : 'تحقق' }).click();
  await expect(
    page.getByRole('heading', { name: english ? 'Appointment details' : 'تفاصيل الموعد' }),
  ).toBeVisible();
}

async function targets(page: Page, width: number) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
    width,
  );
  for (const control of await page
    .locator('button:not([data-nextjs-dev-tools-button]), a[href]')
    .all()) {
    if (!(await control.isVisible())) continue;
    const box = await control.boundingBox();
    if (box) {
      expect(box.height).toBeGreaterThanOrEqual(44);
      expect(box.width).toBeGreaterThanOrEqual(44);
    }
    expect(
      Boolean((await control.getAttribute('aria-label')) || (await control.innerText()).trim()),
    ).toBe(true);
  }
}

for (const [locale, width, height] of [
  ['ar-EG', 768, 1024],
  ['en-EG', 1440, 900],
] as const) {
  test(`${locale} clinic appointment behavior`, async ({ page, context }) => {
    const english = locale === 'en-EG';
    test.setTimeout(60_000);
    await api(page, 'confirmed');
    await page.emulateMedia({ forcedColors: 'active', reducedMotion: 'reduce' });
    await page.setViewportSize({ width, height });
    await signIn(page, english);
    expect(await page.locator('main').first().getAttribute('dir')).toBe(english ? 'ltr' : 'rtl');
    expect(await page.evaluate(() => matchMedia('(forced-colors: active)').matches)).toBe(true);
    expect(await page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches)).toBe(
      true,
    );
    await targets(page, width);
    await page.screenshot({
      path: path.join(actual, `${locale}-clinic-confirmed.png`),
      fullPage: true,
    });

    const checkIn = page.getByRole('button', { name: english ? 'Check in' : 'تسجيل الحضور' });
    await checkIn.focus();
    await expect(checkIn).toBeFocused();
    await checkIn.press('Enter');
    await expect(page.getByText(english ? 'Action completed' : 'اكتمل الإجراء')).toBeVisible();
    await expect(page.getByRole('status')).toBeFocused();

    await page.unroute('**/v1/**');
    await api(page, 'confirmed');
    await page.reload();
    await signIn(page, english);
    const offlineCheckIn = page.getByRole('button', {
      name: english ? 'Check in' : 'تسجيل الحضور',
    });
    await context.setOffline(true);
    await expect(page.getByText(english ? /You are offline/ : /أنت غير متصل/)).toBeVisible();
    expect(await offlineCheckIn.isDisabled()).toBe(true);
    await page.screenshot({
      path: path.join(actual, `${locale}-clinic-offline.png`),
      fullPage: true,
    });
    await context.setOffline(false);
    await page.waitForFunction(() => navigator.onLine);

    await page.unroute('**/v1/**');
    await api(page, 'confirmed');
    await page.reload();
    await signIn(page, english);
    const cancel = page.getByRole('button', {
      name: english ? 'Cancel appointment' : 'إلغاء الموعد',
    });
    await cancel.click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await expect(dialog.locator('input')).toBeFocused();
    await page.keyboard.press('Tab');
    await page.keyboard.press('Shift+Tab');
    await expect(dialog.locator('input')).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await expect(cancel).toBeFocused();

    await cancel.click();
    await dialog.locator('input').fill(english ? 'Patient request' : 'طلب المريض');
    await dialog
      .getByRole('button', {
        name: english ? 'Confirm appointment cancellation' : 'تأكيد إلغاء الموعد',
      })
      .click();
    await expect(page.getByText(english ? 'Action completed' : 'اكتمل الإجراء')).toBeVisible();
    await page.screenshot({
      path: path.join(actual, `${locale}-clinic-cancelled.png`),
      fullPage: true,
    });

    await page.unroute('**/v1/**');
    await api(page, 'conflict');
    await page.reload();
    await signIn(page, english);
    const reschedule = page.getByRole('button', { name: english ? 'Reschedule' : 'إعادة الجدولة' });
    await reschedule.click();
    const resDialog = page.getByRole('dialog');
    await expect(
      resDialog.getByText(english ? 'Current replacement slots' : 'المواعيد البديلة الحالية'),
    ).toBeVisible();
    const rescheduleReason = resDialog.getByRole('textbox', {
      name: english ? 'Rescheduling reason' : 'سبب إعادة الجدولة',
    });
    await resDialog.locator('select').selectOption({ value: '2030-01-08T09:00:00+02:00' });
    await resDialog
      .getByRole('button', { name: english ? 'Confirm reschedule' : 'تأكيد إعادة الجدولة' })
      .click();
    await expect(rescheduleReason).toBeFocused();
    await rescheduleReason.fill(english ? 'Patient request' : 'طلب المريض');
    const rescheduleRequest = page.waitForRequest(
      (request) =>
        request.url().includes(`/appointments/${id}/reschedule`) && request.method() === 'POST',
    );
    await resDialog
      .getByRole('button', { name: english ? 'Confirm reschedule' : 'تأكيد إعادة الجدولة' })
      .click();
    expect((await rescheduleRequest).postDataJSON().reason).toBe(
      english ? 'Patient request' : 'طلب المريض',
    );
    await expect(
      page.getByText(
        english ? 'The appointment changed on the server.' : 'تغيّر الموعد على الخادم.',
      ),
    ).toBeVisible();
  });
}
