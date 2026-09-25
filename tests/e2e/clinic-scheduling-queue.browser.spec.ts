import { expect, test, type Locator, type Page } from 'playwright/test';
import { captureFeature009Ui } from './feature009-ui-capture';

const facilityId = '90000000-0000-4000-8000-000000000001';
const doctorId = '91000000-0000-4000-8000-000000000001';
const date = '2030-01-07';
const entryId = (n: number) => `93000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const patientId = (n: number) => `94000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
type Scenario = {
  denied?: boolean;
  error?: boolean;
  stale?: boolean;
  delay?: number;
  absence?: boolean;
  empty?: boolean;
  conflict?: boolean;
  readConflict?: boolean;
  terminal?: boolean;
  loading?: boolean;
  mutationDelay?: number;
  calls?: string[];
  appointments?: Array<Record<string, unknown>>;
};

function queueEntry(
  n: number,
  state: 'waiting' | 'called' | 'in_service' | 'completed' | 'removed',
) {
  return {
    id: entryId(n),
    appointmentId: `92000000-0000-4000-8000-${String(n).padStart(12, '0')}`,
    patientId: patientId(n),
    facilityId,
    doctorId,
    civilDate: date,
    state,
    queueNumber: n,
    position: state === 'waiting' ? n : null,
    estimatedServiceAt:
      state === 'waiting' ? `2030-01-07T09:${String(n * 10).padStart(2, '0')}:00+02:00` : null,
    version: 1,
  };
}

const defaultAppointments = [
  {
    id: '92000000-0000-4000-8000-000000000001',
    patientId: patientId(1),
    facilityId,
    doctorId,
    startsAt: '2030-01-07T09:00:00+02:00',
    endsAt: '2030-01-07T09:30:00+02:00',
    civilDate: date,
    timezone: 'Africa/Cairo',
    feeMinorUnits: 35000,
    currency: 'EGP',
    paymentMethod: 'cash_on_arrival',
    status: 'confirmed',
    version: 1,
  },
  {
    id: '92000000-0000-4000-8000-000000000002',
    patientId: patientId(2),
    facilityId,
    doctorId,
    startsAt: '2030-01-07T09:30:00+02:00',
    endsAt: '2030-01-07T10:00:00+02:00',
    civilDate: date,
    timezone: 'Africa/Cairo',
    feeMinorUnits: 35000,
    currency: 'EGP',
    paymentMethod: 'cash_on_arrival',
    status: 'reschedule_required',
    version: 2,
  },
];

async function routeApi(page: Page, scenario: Scenario = {}) {
  const calls = scenario.calls ?? [];
  let mutationOccurred = false;
  await page.route('**/v1/**', async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const path = url.pathname.replace(/^\/v1/, '');
    const query = url.searchParams;
    let status = 200;
    let body: unknown = {};
    if (path === '/auth/login')
      body = { kind: 'challenge', challenge_id: 'synthetic-clinic-challenge' };
    else if (path === '/auth/otp/verify')
      body = { kind: 'session', access_token: 'synthetic-clinic-token', aal: 2 };
    else if (path.includes('/queues') && req.method() === 'GET') {
      calls.push(`queue:${query.get('doctorId')}:${query.get('date')}`);
      if (scenario.loading) await new Promise((resolve) => setTimeout(resolve, 1200));
      if (scenario.denied) status = 403;
      else if (scenario.error) status = 503;
      else if (scenario.readConflict) status = 409;
      const entries = scenario.empty
        ? []
        : [
            queueEntry(1, 'waiting'),
            queueEntry(2, 'called'),
            queueEntry(3, 'in_service'),
            queueEntry(4, 'completed'),
            queueEntry(5, 'removed'),
          ];
      body = {
        facilityId: scenario.terminal ? '90000000-0000-4000-8000-000000009999' : facilityId,
        doctorId,
        civilDate: date,
        version: mutationOccurred ? 2 : 1,
        delayMinutes: scenario.delay ?? 0,
        entries,
        nextCursor: null,
        freshness: scenario.stale ? 'stale' : 'fresh',
      };
    } else if (path === '/appointments' && req.method() === 'GET') {
      calls.push(`appointments:${query.get('doctorId')}:${query.get('date')}`);
      body = {
        items:
          scenario.appointments ??
          (scenario.empty
            ? []
            : scenario.absence
              ? defaultAppointments
              : defaultAppointments.slice(0, 1)),
        nextCursor: null,
        freshness: scenario.stale ? 'stale' : 'fresh',
      };
    } else if (/\/queue-entries\/[^/]+\/call$/.test(path)) {
      calls.push('call');
      if (scenario.mutationDelay)
        await new Promise((resolve) => setTimeout(resolve, scenario.mutationDelay));
      if (scenario.conflict && !mutationOccurred) {
        status = 409;
        mutationOccurred = true;
      } else {
        mutationOccurred = true;
        body = { ...queueEntry(1, 'called'), version: 2 };
      }
    } else if (/\/queue-entries\/[^/]+\/reorder$/.test(path)) {
      calls.push('reorder');
      if (scenario.mutationDelay)
        await new Promise((resolve) => setTimeout(resolve, scenario.mutationDelay));
      const data = req.postDataJSON() as { targetPosition?: number; reason?: string };
      calls.push(`reason:${data.reason ?? ''}`);
      if (scenario.conflict && !mutationOccurred) {
        status = 412;
        mutationOccurred = true;
      } else {
        mutationOccurred = true;
        body = {
          facilityId,
          doctorId,
          civilDate: date,
          version: 2,
          delayMinutes: 0,
          entries: [
            queueEntry(1, 'waiting'),
            queueEntry(2, 'called'),
            queueEntry(3, 'in_service'),
            queueEntry(4, 'completed'),
            queueEntry(5, 'removed'),
          ],
          nextCursor: null,
          freshness: 'fresh',
        };
      }
    } else if (/\/queue-entries\/[^/]+\/complete$/.test(path)) {
      calls.push('complete');
      if (scenario.mutationDelay)
        await new Promise((resolve) => setTimeout(resolve, scenario.mutationDelay));
      mutationOccurred = true;
      body = { ...queueEntry(2, 'completed'), version: 2 };
    } else {
      await route.continue();
      return;
    }
    await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
  });
  return calls;
}

async function open(
  page: Page,
  mode: 'today' | 'queue',
  locale: 'ar-EG' | 'en-EG',
  scenario: Scenario = {},
) {
  const calls = await routeApi(page, scenario);
  await page.goto(`/${mode}`);
  const en = locale === 'en-EG';
  if (en) await page.getByRole('button', { name: 'English' }).click();
  await page
    .getByRole('textbox', { name: en ? 'Sign-in handle' : 'وسيلة الدخول' })
    .fill('synthetic@example.invalid');
  await page.locator('input[type=password]').fill('synthetic-local-only');
  await page.getByRole('button', { name: en ? 'Continue' : 'متابعة' }).click();
  await page.getByRole('textbox', { name: en ? 'Verification code' : 'رمز التحقق' }).fill('123456');
  await page.getByRole('button', { name: en ? 'Verify' : 'تحقق' }).click();
  await page.getByLabel(en ? 'Facility ID' : 'معرّف المنشأة').fill(facilityId);
  await page.getByLabel(en ? 'Doctor ID' : 'معرّف الطبيب').fill(doctorId);
  await page.getByLabel(en ? 'Civil date' : 'التاريخ الميلادي').fill(date);
  await page.getByRole('button', { name: en ? 'Show scope' : 'اعرض النطاق' }).click();
  await expect(page.locator('h1')).toHaveText(
    en
      ? mode === 'today'
        ? "Today's clinic worklist"
        : 'Queue'
      : mode === 'today'
        ? 'عمل اليوم في العيادة'
        : 'قائمة الانتظار',
  );
  return calls;
}

for (const locale of ['ar-EG', 'en-EG'] as const) {
  const en = locale === 'en-EG';
  test(`${locale} rendered clinic queue projects exactly five states and restricts actions`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: 768, height: 1024 });
    await open(page, 'queue', locale);
    expect(await page.locator('main').getAttribute('dir')).toBe(en ? 'ltr' : 'rtl');
    for (const label of en
      ? [
          'Waiting',
          'Called',
          'In service — read only',
          'Completed',
          'Removed due to doctor absence',
        ]
      : ['ينتظر', 'تم النداء', 'قيد الخدمة — للعرض فقط', 'مكتمل', 'أزيل بسبب غياب الطبيب'])
      await expect(page.getByText(label, { exact: false }).first()).toBeVisible();
    await expect(page.locator('li[id^="queue-"]')).toHaveCount(5);
    const renderedQueue = await page.locator('main').innerText();
    for (const privateId of [
      patientId(1),
      patientId(2),
      '92000000-0000-4000-8000-000000000001',
      '92000000-0000-4000-8000-000000000002',
    ])
      expect(renderedQueue).not.toContain(privateId);
    await expect(page.getByRole('button', { name: en ? 'Call 1' : 'نداء 1' })).toBeVisible();
    await expect(
      page.getByRole('button', { name: en ? 'Reorder 1' : 'إعادة ترتيب 1' }),
    ).toBeVisible();
    await expect(page.getByRole('button', { name: en ? 'Complete 2' : 'إكمال 2' })).toBeVisible();
    for (const forbidden of en
      ? ['Call 2', 'Reorder 2', 'Complete 3', 'Call 4', 'Reorder 5']
      : ['نداء 2', 'إعادة ترتيب 2', 'إكمال 3', 'نداء 4', 'إعادة ترتيب 5'])
      await expect(page.getByRole('button', { name: forbidden })).toHaveCount(0);
  });

  test(`${locale} rendered Today preserves delay, absence and empty truth`, async ({ page }) => {
    await page.setViewportSize({ width: 768, height: 1024 });
    await open(page, 'today', locale, { delay: 20, absence: true });
    const delayState = page
      .getByRole('region', { name: en ? 'Current delay' : 'التأخير الحالي' })
      .getByText(
        en
          ? /20 additional minutes in service estimates only/
          : /20 دقيقة إضافية في تقدير الخدمة فقط/,
      );
    await expect(delayState).toBeVisible();
    const absenceState = page
      .getByRole('region', {
        name: en
          ? 'Appointments requiring rescheduling due to doctor absence'
          : 'مواعيد تتطلب إعادة الجدولة بسبب غياب الطبيب',
      })
      .getByText('1', { exact: true });
    await expect(absenceState).toBeVisible();
    const worklistState = page.getByText(en ? /Reschedule required/ : /يلزم إعادة الجدولة/, {
      exact: false,
    });
    await expect(worklistState).toBeVisible();
    await captureFeature009Ui(page, 'F009-P0-CLN-TODAY-001', locale, 'worklist', worklistState);
    await captureFeature009Ui(page, 'F009-P0-CLN-TODAY-001', locale, 'delay-active', delayState);
    await captureFeature009Ui(
      page,
      'F009-P0-CLN-TODAY-001',
      locale,
      'absence-active',
      absenceState,
    );
    const refreshedState = page.getByText(
      en
        ? /Today's worklist refreshed from the server\. Queue version:/
        : /تم تحديث قائمة عمل اليوم من الخادم\. نسخة قائمة الانتظار:/,
    );
    await page
      .getByRole('button', { name: en ? 'Refresh from server' : 'تحديث من الخادم' })
      .click();
    await expect(refreshedState).toBeVisible();
    await captureFeature009Ui(page, 'F009-P0-CLN-TODAY-001', locale, 'success', refreshedState);
    await page.setViewportSize({ width: 1440, height: 900 });
    await captureFeature009Ui(page, 'F009-P0-CLN-TODAY-001', locale, 'worklist', worklistState);
    await captureFeature009Ui(page, 'F009-P0-CLN-TODAY-001', locale, 'delay-active', delayState);
    await captureFeature009Ui(
      page,
      'F009-P0-CLN-TODAY-001',
      locale,
      'absence-active',
      absenceState,
    );
    await captureFeature009Ui(page, 'F009-P0-CLN-TODAY-001', locale, 'success', refreshedState);
    await page.unroute('**/v1/**');
    await routeApi(page, { empty: true });
    await page.getByRole('button', { name: en ? 'Show scope' : 'اعرض النطاق' }).click();
    const emptyState = page.getByText(
      en ? 'No items in the current scope.' : 'لا توجد عناصر في النطاق الحالي.',
    );
    await expect(emptyState).toBeVisible();
    await page.setViewportSize({ width: 768, height: 1024 });
    await captureFeature009Ui(page, 'F009-P0-CLN-TODAY-001', locale, 'empty', emptyState);
    await page.setViewportSize({ width: 1440, height: 900 });
    await captureFeature009Ui(page, 'F009-P0-CLN-TODAY-001', locale, 'empty', emptyState);
  });
}

test('rendered queue handles permission, stale, error, offline and reconnect without queued writes', async ({
  page,
  context,
}) => {
  await open(page, 'queue', 'en-EG', { denied: true });
  await expect(
    page.getByText('You are not authorized to view this scope or perform this action.'),
  ).toBeVisible();
  await page.unroute('**/v1/**');
  await routeApi(page, { stale: true });
  await page.getByRole('button', { name: 'Show scope' }).click();
  await expect(page.getByText('May be outdated; actions unavailable until refresh')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Call 1' })).toBeDisabled();
  await page.unroute('**/v1/**');
  await routeApi(page, { error: true });
  await page.getByRole('button', { name: 'Show scope' }).click();
  await expect(
    page.getByText('Data could not be loaded. Check the connection and refresh this scope.'),
  ).toBeVisible();
  await page.unroute('**/v1/**');
  await routeApi(page);
  await page.getByRole('button', { name: 'Show scope' }).click();
  await expect(page.getByRole('button', { name: 'Call 1' })).toBeEnabled();
  await context.setOffline(true);
  await expect(page.getByText(/You are offline\. Displayed data is stale/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Call 1' })).toBeDisabled();
  await context.setOffline(false);
  await expect(page.getByText('Fresh according to server')).toBeVisible();
});

test('Today loading, stale, offline, conflict, error and denied states map to approved evidence rows', async ({
  page,
}) => {
  test.setTimeout(300_000);
  const states: Array<{ state: string; scenario: Scenario }> = [
    { state: 'loading', scenario: { loading: true } },
    { state: 'stale', scenario: { stale: true } },
    { state: 'offline', scenario: {} },
    { state: 'conflict', scenario: { readConflict: true } },
    { state: 'error-recoverable', scenario: { error: true } },
    { state: 'error-terminal', scenario: { terminal: true } },
    { state: 'permission-denied', scenario: { denied: true } },
  ];
  for (const locale of ['ar-EG', 'en-EG'] as const) {
    const english = locale === 'en-EG';
    for (const [width, height] of [
      [768, 1024],
      [1440, 900],
    ] as const) {
      for (const { state, scenario } of states) {
        await page.unrouteAll({ behavior: 'ignoreErrors' });
        await page.context().setOffline(false);
        await page.setViewportSize({ width, height });
        const calls = await open(page, 'today', locale, scenario);
        let anchor: Locator;
        if (state === 'loading')
          anchor = page.getByText(english ? 'Loading data…' : 'جارٍ تحميل البيانات…');
        else if (state === 'stale')
          anchor = page.getByText(
            english
              ? 'May be outdated; actions unavailable until refresh'
              : 'قد تكون قديمة؛ الإجراءات غير متاحة حتى التحديث',
          );
        else if (state === 'offline') {
          await page.context().setOffline(true);
          anchor = page.getByText(
            english
              ? /You are offline\. Displayed data is stale/
              : /لا يوجد اتصال\. البيانات المعروضة قديمة/,
          );
        } else if (state === 'conflict') {
          anchor = page.getByText(
            english
              ? 'The server could not return this worklist because the current scope conflicts. Refresh the scope and review its current response.'
              : 'تعذّر على الخادم إرجاع قائمة العمل بسبب تعارض في النطاق الحالي. حدّث النطاق وراجع الاستجابة الحالية.',
          );
        } else if (state === 'error-recoverable')
          anchor = page.getByText(
            english
              ? 'Data could not be loaded. Check the connection and refresh this scope.'
              : 'تعذّر تحميل البيانات. تحقق من الاتصال وحدّث النطاق.',
          );
        else if (state === 'error-terminal')
          anchor = page.getByText(
            english
              ? 'The response does not match this scope. Choose the scope again and retry.'
              : 'الاستجابة الحالية غير متسقة مع النطاق. أعد اختيار النطاق وحاول مجددًا.',
          );
        else
          anchor = page.getByText(
            english
              ? 'You are not authorized to view this scope or perform this action.'
              : 'ليس لديك صلاحية عرض هذا النطاق أو تنفيذ هذا الإجراء.',
          );
        await expect(anchor, `${locale} Today ${state}`).toBeVisible();
        if (state === 'conflict') expect(calls.some((call) => call === 'call')).toBe(false);
        await captureFeature009Ui(page, 'F009-P0-CLN-TODAY-001', locale, state, anchor);
        if (state === 'offline') await page.context().setOffline(false);
      }
    }
  }
});

test('rendered call, restricted reorder validation, conflict refresh, completion and focus return', async ({
  page,
}) => {
  const calls = await open(page, 'queue', 'en-EG', { conflict: true });
  const call = page.getByRole('button', { name: 'Call 1' });
  await call.click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: 'Confirm action' }).click();
  await expect(
    page.getByText(/Queue version changed\. The full queue was reloaded from the server/),
  ).toBeVisible();
  expect(calls.filter((call) => call.startsWith('queue:')).length).toBeGreaterThanOrEqual(2);
  await page.getByRole('button', { name: 'Refresh from server' }).click();

  await page.getByRole('button', { name: 'Reorder 1' }).click();
  const reorder = page.getByRole('dialog');
  await reorder.getByRole('spinbutton', { name: 'Target position' }).fill('1');
  const reason = reorder.getByRole('textbox', { name: 'Restricted reorder reason' });
  await expect(reason).toHaveAttribute('maxlength', '1000');
  await reason.fill('line one\nline two');
  await reorder.getByRole('button', { name: 'Confirm action' }).click();
  await expect(reorder.getByRole('alert')).toBeVisible();
  await reason.fill('Operational correction');
  await reorder.getByRole('button', { name: 'Confirm action' }).click();
  await expect(page.getByText(/Action result: Waiting/)).toBeVisible();
  expect(calls).toContain('reason:Operational correction');

  const callAgain = page.getByRole('button', { name: 'Call 1' });
  await callAgain.click();
  await page.getByRole('dialog').getByRole('button', { name: 'Confirm action' }).click();
  await expect(page.getByText(/Action result: Called/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Complete 2' })).toBeVisible();
  await page.getByRole('button', { name: 'Complete 2' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Confirm action' }).click();
  await expect(page.getByText(/Action result: Completed/)).toBeVisible();
});

test('rendered bilingual staff UI meets target, viewport, focus, forced-colors and reduced-motion checks', async ({
  page,
}) => {
  for (const locale of ['ar-EG', 'en-EG'] as const) {
    const en = locale === 'en-EG';
    for (const [width, height] of [
      [768, 1024],
      [1440, 900],
    ] as const) {
      await page.unrouteAll({ behavior: 'ignoreErrors' });
      await page.setViewportSize({ width, height });
      await page.emulateMedia({ forcedColors: 'none', reducedMotion: 'no-preference' });
      await open(page, 'queue', locale);
      const queueRows = page.locator('li[id^="queue-"]');
      const queueStateRows = [
        ['waiting', en ? 'Waiting' : 'ينتظر'],
        ['called', en ? 'Called' : 'تم النداء'],
        ['in-service-readonly', en ? 'In service — read only' : 'قيد الخدمة — للعرض فقط'],
        ['completed', en ? 'Completed' : 'مكتمل'],
        ['removed', en ? 'Removed due to doctor absence' : 'أزيل بسبب غياب الطبيب'],
      ] as const;
      for (const [index, [state, label]] of queueStateRows.entries()) {
        const row = queueRows.nth(index);
        await expect(row).toContainText(label);
        await captureFeature009Ui(page, 'F009-P0-CLN-QUEUE-001', locale, state, row);
      }
      const refreshedState = page.getByText(
        locale === 'en-EG'
          ? /Queue refreshed from the server\. Version:/
          : /تم تحديث قائمة الانتظار من الخادم\. النسخة:/,
      );
      await page
        .getByRole('button', {
          name: locale === 'en-EG' ? 'Refresh from server' : 'تحديث من الخادم',
        })
        .click();
      await expect(refreshedState).toBeVisible();
      await expect(page.getByRole('status').filter({ has: refreshedState })).toHaveAttribute(
        'aria-live',
        'polite',
      );
      await captureFeature009Ui(page, 'F009-P0-CLN-QUEUE-001', locale, 'success', refreshedState);
      await page.emulateMedia({ forcedColors: 'active', reducedMotion: 'reduce' });
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
        width,
      );
      expect(await page.evaluate(() => matchMedia('(forced-colors: active)').matches)).toBe(true);
      expect(
        await page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches),
      ).toBe(true);
      await page.emulateMedia({ forcedColors: 'none', reducedMotion: 'no-preference' });
      const contrastFailures = await page
        .locator(
          'main :is(h1,h2,h3,p,span,strong,label,li,a,button,input,select,textarea,[role="button"])',
        )
        .evaluateAll((items) => {
          const parse = (value: string) => {
            const channels = value.match(/[\d.]+/g);
            return channels && channels.length >= 3 ? channels.slice(0, 3).map(Number) : null;
          };
          const luminance = (channels: number[]) => {
            const linear = channels.map((channel) => {
              const normalized = channel / 255;
              return normalized <= 0.04045
                ? normalized / 12.92
                : ((normalized + 0.055) / 1.055) ** 2.4;
            });
            return linear[0]! * 0.2126 + linear[1]! * 0.7152 + linear[2]! * 0.0722;
          };
          const failures: string[] = [];
          let measured = 0;
          for (const item of items) {
            if (item.getClientRects().length === 0) continue;
            const foreground = parse(getComputedStyle(item).color);
            let ancestor: Element | null = item;
            let background: number[] | null = null;
            while (ancestor && !background) {
              const raw = getComputedStyle(ancestor).backgroundColor;
              const channels = parse(raw);
              if (channels && raw !== 'rgba(0, 0, 0, 0)' && raw !== 'transparent')
                background = channels;
              ancestor = ancestor.parentElement;
            }
            if (!foreground || !background) continue;
            measured += 1;
            const [high, low] = [luminance(foreground), luminance(background)].sort(
              (a, b) => b - a,
            );
            if ((high + 0.05) / (low + 0.05) < 4.5)
              failures.push(`${item.tagName}:${item.textContent?.trim().slice(0, 48)}`);
          }
          return { failures, measured };
        });
      expect(
        contrastFailures.measured,
        `${locale} rendered nodes with measurable foreground/background`,
      ).toBeGreaterThan(0);
      expect(
        contrastFailures.failures,
        `${locale} normal-palette 4.5:1 text and control contrast`,
      ).toEqual([]);
      console.info(
        `f009_ui_contrast locale=${locale} viewport=${width}x${height} measured=${contrastFailures.measured} failures=${contrastFailures.failures.length}`,
      );
      for (const control of await page
        .locator(
          'a[href], button, input, select, textarea, [role="button"], [tabindex]:not([tabindex="-1"])',
        )
        .all()) {
        if (!(await control.isVisible())) continue;
        if (await control.getAttribute('data-nextjs-dev-tools-button')) continue;
        if (await control.evaluate((element) => element.closest('nextjs-portal') !== null))
          continue;
        const box = await control.boundingBox();
        expect(
          box?.height ?? 0,
          await control.evaluate((element) => element.outerHTML),
        ).toBeGreaterThanOrEqual(44);
        expect(box?.width ?? 0).toBeGreaterThanOrEqual(44);
      }
      const reorder = page.getByRole('button', {
        name: locale === 'en-EG' ? 'Reorder 1' : 'إعادة ترتيب 1',
      });
      let reorderReachedByTab = false;
      for (let step = 0; step < 32 && !reorderReachedByTab; step += 1) {
        await page.keyboard.press('Tab');
        reorderReachedByTab = await reorder.evaluate(
          (element) => element === document.activeElement,
        );
      }
      expect(reorderReachedByTab, `${locale} keyboard reaches reorder action`).toBe(true);
      expect(
        await reorder.evaluate((element) => getComputedStyle(element).outlineColor),
        `${locale} semantic focus token`,
      ).toBe('rgb(109, 74, 255)');
      await page.keyboard.press('Enter');
      const dialog = page.getByRole('dialog');
      await expect(dialog).toHaveAttribute('aria-modal', 'true');
      await page.keyboard.press('Escape');
      await expect(dialog).toBeHidden();
      await expect(reorder).toBeFocused();
      await page.emulateMedia({ forcedColors: 'active', reducedMotion: 'reduce' });
      expect(await page.evaluate(() => matchMedia('(forced-colors: active)').matches)).toBe(true);
      expect(
        await page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches),
      ).toBe(true);
    }
  }
});

test('queue loading, empty, delay, review, stale, offline, conflict, errors, denied, and submitting states capture in both locales and canonical viewports', async ({
  page,
}) => {
  test.setTimeout(300_000);
  const stateCases: Array<{ state: string; scenario: Scenario }> = [
    { state: 'loading', scenario: { loading: true } },
    { state: 'empty', scenario: { empty: true } },
    { state: 'delay-active', scenario: { delay: 20 } },
    { state: 'reorder-review', scenario: {} },
    { state: 'stale', scenario: { stale: true } },
    { state: 'offline', scenario: {} },
    { state: 'conflict', scenario: { conflict: true } },
    { state: 'error-recoverable', scenario: { error: true } },
    { state: 'error-terminal', scenario: { terminal: true } },
    { state: 'permission-denied', scenario: { denied: true } },
    { state: 'submitting', scenario: { mutationDelay: 1600 } },
  ];
  for (const locale of ['ar-EG', 'en-EG'] as const) {
    const english = locale === 'en-EG';
    for (const [width, height] of [
      [768, 1024],
      [1440, 900],
    ] as const) {
      for (const { state, scenario } of stateCases) {
        await page.unrouteAll({ behavior: 'ignoreErrors' });
        await page.setViewportSize({ width, height });
        await open(page, 'queue', locale, scenario);
        let anchor: Locator;
        if (state === 'loading')
          anchor = page.getByText(english ? 'Loading data…' : 'جارٍ تحميل البيانات…');
        else if (state === 'empty')
          anchor = page.getByText(
            english ? 'No items in the current scope.' : 'لا توجد عناصر في النطاق الحالي.',
          );
        else if (state === 'delay-active')
          anchor = page
            .getByRole('region', { name: english ? 'Current delay' : 'التأخير الحالي' })
            .getByText(english ? /20 additional minutes/ : /20 دقيقة إضافية/);
        else if (state === 'reorder-review') {
          await page.getByRole('button', { name: english ? 'Reorder 1' : 'إعادة ترتيب 1' }).click();
          const dialog = page.getByRole('dialog');
          await dialog
            .getByRole('spinbutton', { name: english ? 'Target position' : 'الموضع المستهدف' })
            .fill('2');
          await dialog
            .getByRole('textbox', {
              name: english ? 'Restricted reorder reason' : 'سبب إعادة الترتيب المقيد',
            })
            .fill(english ? 'Operational correction' : 'تصحيح تشغيلي');
          anchor = dialog;
        } else if (state === 'stale')
          anchor = page.getByText(
            english
              ? 'May be outdated; actions unavailable until refresh'
              : 'قد تكون قديمة؛ الإجراءات غير متاحة حتى التحديث',
          );
        else if (state === 'offline') {
          await page.context().setOffline(true);
          anchor = page.getByText(
            english
              ? /You are offline\. Displayed data is stale/
              : /لا يوجد اتصال\. البيانات المعروضة قديمة/,
          );
        } else if (state === 'conflict') {
          await page.getByRole('button', { name: english ? 'Call 1' : 'نداء 1' }).click();
          await page
            .getByRole('dialog')
            .getByRole('button', { name: english ? 'Confirm action' : 'تأكيد الإجراء' })
            .click();
          anchor = page.getByText(
            english
              ? /Queue version changed\. The full queue was reloaded from the server/
              : /تغيّرت نسخة القائمة\. أُعيد تحميل القائمة كاملة من الخادم/,
          );
        } else if (state === 'error-recoverable')
          anchor = page.getByText(
            english
              ? 'Data could not be loaded. Check the connection and refresh this scope.'
              : 'تعذّر تحميل البيانات. تحقق من الاتصال وحدّث النطاق.',
          );
        else if (state === 'error-terminal')
          anchor = page.getByText(
            english
              ? 'The response does not match this scope. Choose the scope again and retry.'
              : 'الاستجابة الحالية غير متسقة مع النطاق. أعد اختيار النطاق وحاول مجددًا.',
          );
        else if (state === 'permission-denied')
          anchor = page.getByText(
            english
              ? 'You are not authorized to view this scope or perform this action.'
              : 'ليس لديك صلاحية عرض هذا النطاق أو تنفيذ هذا الإجراء.',
          );
        else {
          await page.getByRole('button', { name: english ? 'Call 1' : 'نداء 1' }).click();
          const dialog = page.getByRole('dialog');
          await dialog
            .getByRole('button', { name: english ? 'Confirm action' : 'تأكيد الإجراء' })
            .click();
          anchor = dialog.getByRole('button', {
            name: english ? 'Submitting action…' : 'جارٍ إرسال الإجراء…',
          });
        }
        await expect(anchor, `${locale} ${state}`).toBeVisible();
        await captureFeature009Ui(page, 'F009-P0-CLN-QUEUE-001', locale, state, anchor);
        if (state === 'offline') await page.context().setOffline(false);
      }
    }
  }
});

test('rendered queue survives 200 percent text and the 320px 400 percent reflow viewport', async ({
  page,
}) => {
  for (const locale of ['ar-EG', 'en-EG'] as const) {
    await page.setViewportSize({ width: 768, height: 1024 });
    await open(page, 'queue', locale);
    await expect(page.locator('main')).toHaveAttribute('lang', locale);
    const textScale = await page.addStyleTag({
      content:
        'main :is(h1,h2,h3,p,label,li,button,a,input,select,textarea){font-size:2rem!important}',
    });
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
      `${locale} 200% text horizontal reflow`,
    ).toBe(true);
    expect(await page.locator('li[id^="queue-"]').count()).toBe(5);
    await textScale.evaluate((element) => element.remove());

    await page.setViewportSize({ width: 320, height: 800 });
    expect(1280 / 4).toBe(320);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
      `${locale} 400% equivalent 320 CSS-pixel reflow`,
    ).toBe(true);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  }
});
