import { expect, test, type Page } from 'playwright/test';

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
      if (scenario.denied) status = 403;
      else if (scenario.error) status = 503;
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
        facilityId,
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
      if (scenario.conflict && !mutationOccurred) {
        status = 409;
        mutationOccurred = true;
      } else {
        mutationOccurred = true;
        body = { ...queueEntry(1, 'called'), version: 2 };
      }
    } else if (/\/queue-entries\/[^/]+\/reorder$/.test(path)) {
      calls.push('reorder');
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
    await open(page, 'today', locale, { delay: 20, absence: true });
    await expect(
      page
        .getByRole('region', { name: en ? 'Current delay' : 'التأخير الحالي' })
        .getByText(
          en
            ? /20 additional minutes in service estimates only/
            : /20 دقيقة إضافية في تقدير الخدمة فقط/,
        ),
    ).toBeVisible();
    await expect(
      page
        .getByRole('region', {
          name: en
            ? 'Appointments requiring rescheduling due to doctor absence'
            : 'مواعيد تتطلب إعادة الجدولة بسبب غياب الطبيب',
        })
        .getByText('1', { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByText(en ? /Reschedule required/ : /يلزم إعادة الجدولة/, { exact: false }),
    ).toBeVisible();
    await page
      .getByRole('button', { name: en ? 'Refresh from server' : 'تحديث من الخادم' })
      .click();
    await page.unroute('**/v1/**');
    await routeApi(page, { empty: true });
    await page.getByRole('button', { name: en ? 'Show scope' : 'اعرض النطاق' }).click();
    await expect(
      page.getByText(en ? 'No items in the current scope.' : 'لا توجد عناصر في النطاق الحالي.'),
    ).toBeVisible();
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
    for (const [width, height] of [
      [768, 1024],
      [1440, 900],
    ] as const) {
      await page.unrouteAll({ behavior: 'ignoreErrors' });
      await page.setViewportSize({ width, height });
      await page.emulateMedia({ forcedColors: 'active', reducedMotion: 'reduce' });
      await open(page, 'queue', locale);
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
        width,
      );
      expect(await page.evaluate(() => matchMedia('(forced-colors: active)').matches)).toBe(true);
      expect(
        await page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches),
      ).toBe(true);
      const contrast = await page.locator('main').evaluate((element) => {
        const parse = (value: string) =>
          value
            .match(/[\d.]+/g)!
            .slice(0, 3)
            .map(Number);
        const luminance = (value: string) => {
          const linear = parse(value).map((channel) => {
            const normalized = channel / 255;
            return normalized <= 0.04045
              ? normalized / 12.92
              : ((normalized + 0.055) / 1.055) ** 2.4;
          });
          return linear[0]! * 0.2126 + linear[1]! * 0.7152 + linear[2]! * 0.0722;
        };
        const style = getComputedStyle(element);
        const foreground = luminance(style.color);
        const background = luminance(style.backgroundColor);
        return (
          (Math.max(foreground, background) + 0.05) / (Math.min(foreground, background) + 0.05)
        );
      });
      expect(contrast, `${locale} main text contrast`).toBeGreaterThanOrEqual(4.5);
      for (const control of await page.locator('button, input, textarea').all()) {
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
      await reorder.focus();
      await page.keyboard.press('Enter');
      const dialog = page.getByRole('dialog');
      await page.keyboard.press('Escape');
      await expect(dialog).toBeHidden();
      await expect(reorder).toBeFocused();
    }
  }
});
