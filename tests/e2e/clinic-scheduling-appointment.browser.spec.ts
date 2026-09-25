import { expect, test, type Page } from 'playwright/test';
import { captureFeature009Ui } from './feature009-ui-capture';

const id = '92000000-0000-4000-8000-000000000001';
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
  civilDate: '2030-01-07',
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
  | 'missing'
  | 'recoverable'
  | 'stale'
  | 'delay-active'
  | 'queue-waiting'
  | 'queue-called'
  | 'queue-in-service-readonly'
  | 'queue-completed'
  | 'queue-removed';

async function api(
  page: Page,
  state: State,
  options: { delayMinutes?: number; holdAppointment?: boolean; holdMutation?: boolean } = {},
) {
  let releaseHeldRequest: (() => void) | null = null;
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
      if (options.holdAppointment)
        await new Promise<void>((resolve) => {
          releaseHeldRequest = resolve;
        });
      if (state === 'denied') status = 403;
      else if (state === 'missing') status = 404;
      else if (state === 'recoverable') status = 503;
      body = {
        ...base,
        status:
          state.startsWith('queue-') || state === 'stale'
            ? 'checked_in'
            : ['conflict', 'denied', 'missing', 'recoverable', 'delay-active'].includes(state)
              ? 'confirmed'
              : state,
        ...((options.delayMinutes ?? (state === 'delay-active' ? 20 : undefined)) === undefined
          ? {}
          : { delayMinutes: options.delayMinutes ?? 20 }),
      };
    } else if (p.includes('/queues') && request.method() === 'GET') {
      const queueStates = {
        'queue-waiting': 'waiting',
        'queue-called': 'called',
        'queue-in-service-readonly': 'in_service',
        'queue-completed': 'completed',
        'queue-removed': 'removed',
      } as const;
      const entryState = queueStates[state as keyof typeof queueStates] ?? 'waiting';
      body = {
        facilityId: base.facilityId,
        doctorId: base.doctorId,
        civilDate: base.civilDate,
        version: 1,
        delayMinutes: 0,
        entries: [
          {
            id: '93000000-0000-4000-8000-000000000001',
            appointmentId: id,
            patientId: base.patientId,
            facilityId: base.facilityId,
            doctorId: base.doctorId,
            civilDate: base.civilDate,
            state: entryState,
            queueNumber: 1,
            position: entryState === 'waiting' ? 1 : null,
            estimatedServiceAt: entryState === 'waiting' ? '2030-01-07T09:00:00+02:00' : null,
            version: 1,
          },
        ],
        nextCursor: null,
        freshness: state === 'stale' ? 'stale' : 'fresh',
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
      if (options.holdMutation)
        await new Promise<void>((resolve) => {
          releaseHeldRequest = resolve;
        });
    } else if (p === `/appointments/${id}/cancel` || p === `/appointments/${id}/reschedule`) {
      status = state === 'conflict' ? 412 : 200;
      body = { ...base, status: p.endsWith('cancel') ? 'cancelled' : 'confirmed', version: 2 };
      if (options.holdMutation)
        await new Promise<void>((resolve) => {
          releaseHeldRequest = resolve;
        });
    } else {
      await route.continue();
      return;
    }
    await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
  });
  return {
    releaseHeldRequest() {
      if (!releaseHeldRequest) throw new Error('No held appointment request is pending');
      releaseHeldRequest();
      releaseHeldRequest = null;
    },
  };
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
    await page.setViewportSize({ width: 768, height: 1024 });
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
      const stateName =
        state === 'checked_in'
          ? 'checked-in'
          : state === 'in_queue'
            ? 'in-queue-readonly'
            : state === 'in_consultation'
              ? 'in-consultation-readonly'
              : state === 'completed'
                ? 'completed-readonly'
                : state === 'no_show'
                  ? 'no-show-readonly'
                  : state === 'reschedule_required'
                    ? 'reschedule-required'
                    : state === 'requested'
                      ? 'requested-readonly'
                      : state;
      await captureFeature009Ui(page, 'F009-P0-CLN-APPOINTMENT-001', locale, stateName, status);
      await page.setViewportSize({ width: 1440, height: 900 });
      await captureFeature009Ui(page, 'F009-P0-CLN-APPOINTMENT-001', locale, stateName, status);
      await page.setViewportSize({ width: 768, height: 1024 });
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

test('clinic appointment loading, dialog, conflict, submitting, and success states are captured in both locales and canonical viewports', async ({
  page,
}) => {
  test.setTimeout(180_000);
  for (const locale of ['ar-EG', 'en-EG'] as const) {
    const english = locale === 'en-EG';
    for (const [width, height] of [
      [768, 1024],
      [1440, 900],
    ] as const) {
      await page.unrouteAll({ behavior: 'ignoreErrors' });
      await page.setViewportSize({ width, height });
      await api(page, 'confirmed');
      await signIn(page, english);
      const cancel = page.getByRole('button', {
        name: english ? 'Cancel appointment' : 'إلغاء الموعد',
      });
      await cancel.click();
      const cancelDialog = page.getByRole('dialog');
      await expect(cancelDialog).toBeVisible();
      await captureFeature009Ui(
        page,
        'F009-P0-CLN-APPOINTMENT-001',
        locale,
        'cancel-confirmation',
        cancelDialog,
      );

      await page.unrouteAll({ behavior: 'ignoreErrors' });
      await api(page, 'conflict');
      await page.reload();
      await signIn(page, english);
      await page.getByRole('button', { name: english ? 'Check in' : 'تسجيل الحضور' }).click();
      const conflict = page.getByText(
        english
          ? 'The appointment changed on the server. Review its current state before trying again.'
          : 'تغيّر الموعد على الخادم. راجع الحالة الحالية قبل المحاولة مجددًا.',
      );
      await expect(conflict).toBeVisible();
      await captureFeature009Ui(page, 'F009-P0-CLN-APPOINTMENT-001', locale, 'conflict', conflict);

      await page.unrouteAll({ behavior: 'ignoreErrors' });
      const submittingApi = await api(page, 'confirmed', { holdMutation: true });
      await page.reload();
      await signIn(page, english);
      const cancelForSubmit = page.getByRole('button', {
        name: english ? 'Cancel appointment' : 'إلغاء الموعد',
      });
      await cancelForSubmit.click();
      const submitDialog = page.getByRole('dialog');
      await submitDialog
        .getByRole('textbox', { name: english ? 'Cancellation reason' : 'سبب الإلغاء' })
        .fill(english ? 'Patient request' : 'طلب المريض');
      await submitDialog
        .getByRole('button', {
          name: english ? 'Confirm appointment cancellation' : 'تأكيد إلغاء الموعد',
        })
        .click();
      const submitting = page.getByRole('button', {
        name: english ? 'Submitting action…' : 'جارٍ إرسال الإجراء…',
      });
      await expect(submitting).toBeVisible();
      await captureFeature009Ui(
        page,
        'F009-P0-CLN-APPOINTMENT-001',
        locale,
        'submitting',
        submitting,
      );
      submittingApi.releaseHeldRequest();
      const success = page.getByText(english ? 'Action completed' : 'اكتمل الإجراء');
      await expect(success).toBeVisible();
      await captureFeature009Ui(page, 'F009-P0-CLN-APPOINTMENT-001', locale, 'success', success);

      await page.unrouteAll({ behavior: 'ignoreErrors' });
      const loadingApi = await api(page, 'confirmed', { holdAppointment: true });
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
      const loading = page.getByText(english ? 'Loading appointment…' : 'جارٍ تحميل الموعد…');
      await expect(loading).toBeVisible();
      await captureFeature009Ui(page, 'F009-P0-CLN-APPOINTMENT-001', locale, 'loading', loading);
      loadingApi.releaseHeldRequest();
      await expect(
        page.getByRole('heading', { name: english ? 'Appointment details' : 'تفاصيل الموعد' }),
      ).toBeVisible();
    }
  }
});

test('clinic appointment shows the authoritative current delay in both locales and canonical viewports', async ({
  page,
}) => {
  for (const locale of ['ar-EG', 'en-EG'] as const) {
    for (const [width, height] of [
      [768, 1024],
      [1440, 900],
    ] as const) {
      await page.unrouteAll({ behavior: 'ignoreErrors' });
      await page.setViewportSize({ width, height });
      await api(page, 'confirmed', { delayMinutes: 20 });
      const english = locale === 'en-EG';
      await signIn(page, english);
      const delayState = page.getByRole('region', {
        name: english ? 'Current delay' : 'التأخير الحالي',
      });
      await expect(delayState).toContainText(english ? '20' : '٢٠');
      await expect(delayState).toContainText(
        english
          ? /additional minutes in service estimates only; appointment time and queue order are unchanged/
          : /دقيقة إضافية في تقدير الخدمة فقط؛ وقت الموعد وترتيب القائمة لم يتغيرا/,
      );
      await captureFeature009Ui(
        page,
        'F009-P0-CLN-APPOINTMENT-001',
        locale,
        'delay-active',
        delayState,
      );
    }
  }
});

test('a fresh queue projection clears superseded appointment delay while a stale projection falls back to the appointment GET', async ({
  page,
}) => {
  for (const locale of ['ar-EG', 'en-EG'] as const) {
    const english = locale === 'en-EG';
    await page.unrouteAll({ behavior: 'ignoreErrors' });
    await api(page, 'queue-waiting', { delayMinutes: 20 });
    await signIn(page, english);
    await expect(
      page.getByRole('region', { name: english ? 'Current delay' : 'التأخير الحالي' }),
    ).toHaveCount(0);

    await page.unrouteAll({ behavior: 'ignoreErrors' });
    await api(page, 'stale', { delayMinutes: 20 });
    await page.reload();
    await signIn(page, english);
    const delay = page.getByRole('region', {
      name: english ? 'Current delay' : 'التأخير الحالي',
    });
    await expect(delay).toContainText(english ? '20' : '٢٠');
  }
});

test('clinic appointment offline state is captured in both locales and canonical viewports', async ({
  page,
}) => {
  for (const locale of ['ar-EG', 'en-EG'] as const) {
    const english = locale === 'en-EG';
    for (const [width, height] of [
      [768, 1024],
      [1440, 900],
    ] as const) {
      await page.unrouteAll({ behavior: 'ignoreErrors' });
      await page.setViewportSize({ width, height });
      await api(page, 'confirmed');
      await signIn(page, english);
      await page.context().setOffline(true);
      const offlineState = page.getByText(
        english
          ? /You are offline\. Displayed data may be outdated/
          : /أنت غير متصل\. البيانات المعروضة قديمة/,
      );
      await expect(offlineState).toBeVisible();
      await captureFeature009Ui(
        page,
        'F009-P0-CLN-APPOINTMENT-001',
        locale,
        'offline',
        offlineState,
      );
      await page.context().setOffline(false);
    }
  }
});

test('clinic appointment reflows with 200 percent text and the 320px 400 percent equivalent viewport', async ({
  page,
}) => {
  for (const locale of ['ar-EG', 'en-EG'] as const) {
    const english = locale === 'en-EG';
    await page.unrouteAll({ behavior: 'ignoreErrors' });
    await page.setViewportSize({ width: 768, height: 1024 });
    await api(page, 'confirmed');
    await signIn(page, english);
    const textScale = await page.addStyleTag({
      content:
        'main :is(h1,h2,h3,p,label,li,button,a,input,select,textarea){font-size:2rem!important}',
    });
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
      `${locale} 200% text horizontal reflow`,
    ).toBe(true);
    await expect(
      page.getByRole('heading', { name: english ? 'Appointment details' : 'تفاصيل الموعد' }),
    ).toBeVisible();
    await textScale.evaluate((element) => element.remove());
    await page.setViewportSize({ width: 320, height: 800 });
    expect(1280 / 4).toBe(320);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
      `${locale} 400% equivalent 320 CSS-pixel reflow`,
    ).toBe(true);
  }
});

test('clinic appointment queue projections and failure states are captured in both locales and canonical viewports', async ({
  page,
}) => {
  const stateCases = [
    ['queue-waiting', 'queue-waiting', 'Waiting', 'ينتظر'],
    ['queue-called', 'queue-called', 'Called', 'تم النداء'],
    ['queue-in-service-readonly', 'queue-in-service-readonly', 'In service', 'قيد الخدمة'],
    ['queue-completed', 'queue-completed', 'Completed', 'مكتمل'],
    ['queue-removed', 'queue-removed', 'Removed', 'أزيل'],
    ['stale', 'stale', 'may be stale', 'قد تكون حالة قائمة الانتظار قديمة'],
    [
      'recoverable',
      'error-recoverable',
      'The request could not be completed.',
      'تعذّر إكمال الطلب.',
    ],
    [
      'missing',
      'error-terminal',
      'No appointment data is available.',
      'لا توجد بيانات لهذا الموعد.',
    ],
    [
      'denied',
      'permission-denied',
      'You are not authorized to view this appointment',
      'لا تملك صلاحية عرض هذا الموعد',
    ],
  ] as const;
  test.setTimeout(180_000);
  for (const locale of ['ar-EG', 'en-EG'] as const) {
    const english = locale === 'en-EG';
    for (const [width, height] of [
      [768, 1024],
      [1440, 900],
    ] as const) {
      for (const [fixtureState, captureState, englishText, arabicText] of stateCases) {
        await page.unrouteAll({ behavior: 'ignoreErrors' });
        await page.setViewportSize({ width, height });
        await api(page, fixtureState);
        await signIn(page, english);
        const expectedText = english ? englishText : arabicText;
        const anchor =
          fixtureState.startsWith('queue-') || fixtureState === 'stale'
            ? page
                .getByRole('region', {
                  name: english ? 'Queue' : 'قائمة الانتظار',
                })
                .getByText(new RegExp(expectedText, 'i'))
            : page.getByText(new RegExp(expectedText, 'i'));
        await expect(anchor, `${locale} ${captureState}`).toBeVisible();
        await captureFeature009Ui(
          page,
          'F009-P0-CLN-APPOINTMENT-001',
          locale,
          captureState,
          anchor,
        );
      }
    }
  }
});

async function targets(page: Page, width: number) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
    width,
  );
  for (const control of await page
    .locator(
      'button, a[href], input, select, textarea, [role="button"], [tabindex]:not([tabindex="-1"])',
    )
    .all()) {
    if (!(await control.isVisible())) continue;
    if (await control.getAttribute('data-nextjs-dev-tools-button')) continue;
    if (await control.evaluate((element) => element.closest('nextjs-portal') !== null)) continue;
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
    await page.emulateMedia({ forcedColors: 'none', reducedMotion: 'no-preference' });
    await page.setViewportSize({ width, height });
    await signIn(page, english);
    expect(await page.locator('main').first().getAttribute('dir')).toBe(english ? 'ltr' : 'rtl');
    await expect(
      page.getByRole('heading', {
        name: english ? 'Appointment details' : 'تفاصيل الموعد',
      }),
    ).toBeVisible();
    await targets(page, width);
    await captureFeature009Ui(
      page,
      'F009-P0-CLN-APPOINTMENT-001',
      locale,
      'confirmed',
      page.getByRole('heading', { name: english ? 'Appointment details' : 'تفاصيل الموعد' }),
    );

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
    const offlineState = page.getByText(english ? /You are offline/ : /أنت غير متصل/);
    await expect(offlineState).toBeVisible();
    expect(await offlineCheckIn.isDisabled()).toBe(true);
    await captureFeature009Ui(page, 'F009-P0-CLN-APPOINTMENT-001', locale, 'offline', offlineState);
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
    const cancelledState = page.getByText(english ? 'Action completed' : 'اكتمل الإجراء');
    await expect(cancelledState).toBeVisible();
    await captureFeature009Ui(
      page,
      'F009-P0-CLN-APPOINTMENT-001',
      locale,
      'cancelled',
      cancelledState,
    );

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
    await page.emulateMedia({ forcedColors: 'active', reducedMotion: 'reduce' });
    expect(await page.evaluate(() => matchMedia('(forced-colors: active)').matches)).toBe(true);
    expect(await page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches)).toBe(
      true,
    );
  });
}
