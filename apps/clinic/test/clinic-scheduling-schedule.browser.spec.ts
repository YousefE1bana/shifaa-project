import { expect, test, type Page } from 'playwright/test';

const facilityId = '90000000-0000-4000-8000-000000000001';
const doctorId = '91000000-0000-4000-8000-000000000001';
const scheduleId = '92000000-0000-4000-8000-000000000001';
const affectedIds = [
  '93000000-0000-4000-8000-000000000001',
  '93000000-0000-4000-8000-000000000002',
];
type SeenRequest = {
  path: string;
  method: string;
  body?: Record<string, unknown>;
  headers: Record<string, string>;
};

async function installSyntheticApi(page: Page) {
  const seen: SeenRequest[] = [];
  let scheduleStatus: 'active' | 'paused' | 'retired' = 'active';
  let scheduleVersion = 1;
  let exceptionConflict = false;
  let nextExceptionFailure: 400 | 403 | 404 | null = null;
  let exceptionScopeMismatch = false;
  let holdNextExceptionResponse = false;
  let releaseHeldExceptionResponse: (() => void) | null = null;
  let dropNextExceptionAfterReceipt = false;
  let delayCount = 0;
  await page.route('**/v1/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname.replace(/^\/v1/, '');
    const body = request.postDataJSON() as Record<string, unknown> | undefined;
    seen.push({
      path,
      method: request.method(),
      ...(body ? { body } : {}),
      headers: request.headers(),
    });
    if (path === '/auth/login') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ kind: 'challenge', challenge_id: 'synthetic-challenge' }),
      });
      return;
    }
    if (path === '/auth/otp/verify') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ kind: 'session', access_token: 'synthetic-staff-token' }),
      });
      return;
    }
    if (path === `/clinics/${facilityId}/schedules` && request.method() === 'POST') {
      scheduleStatus = (body?.status as typeof scheduleStatus) ?? 'active';
      scheduleVersion = 1;
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({
          id: scheduleId,
          facilityId,
          doctorId: body?.doctorId,
          timezone: body?.timezone,
          validFrom: body?.validFrom,
          validTo: body?.validTo,
          slotDurationMinutes: body?.slotDurationMinutes,
          feeMinorUnits: body?.feeMinorUnits,
          currency: 'EGP',
          status: scheduleStatus,
          windows: body?.windows,
          version: scheduleVersion,
        }),
      });
      return;
    }
    if (path === `/clinics/${facilityId}/schedules/${scheduleId}` && request.method() === 'PATCH') {
      scheduleStatus = (body?.status as typeof scheduleStatus) ?? scheduleStatus;
      scheduleVersion += 1;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          id: scheduleId,
          facilityId,
          doctorId,
          timezone: 'America/New_York',
          validFrom: '2030-01-01',
          validTo: '2030-12-31',
          slotDurationMinutes: 30,
          feeMinorUnits: 0,
          currency: 'EGP',
          status: scheduleStatus,
          windows: [{ isoWeekday: 1, localStart: '09:00', localEnd: '10:00' }],
          version: scheduleVersion,
        }),
      });
      return;
    }
    if (path === `/clinics/${facilityId}/schedules/${scheduleId}/exceptions`) {
      if (dropNextExceptionAfterReceipt) {
        dropNextExceptionAfterReceipt = false;
        await route.abort('failed');
        return;
      }
      if (holdNextExceptionResponse) {
        holdNextExceptionResponse = false;
        await new Promise<void>((resolve) => {
          releaseHeldExceptionResponse = resolve;
        });
        releaseHeldExceptionResponse = null;
      }
      if (exceptionConflict) {
        await route.fulfill({
          status: 409,
          contentType: 'application/problem+json',
          body: JSON.stringify({
            type: 'about:blank',
            title: 'Conflict',
            status: 409,
            code: 'schedule-overlap',
          }),
        });
      } else if (nextExceptionFailure) {
        const status = nextExceptionFailure;
        nextExceptionFailure = null;
        await route.fulfill({
          status,
          contentType: 'application/problem+json',
          body: JSON.stringify({
            type: 'about:blank',
            title: status === 404 ? 'Not found' : status === 403 ? 'Forbidden' : 'Bad request',
            status,
            code: status === 404 ? 'resource-not-found' : 'invalid-request',
          }),
        });
      } else {
        const mismatch = exceptionScopeMismatch;
        exceptionScopeMismatch = false;
        await route.fulfill({
          status: 201,
          contentType: 'application/json',
          body: JSON.stringify({
            id: mismatch ? '' : '97000000-0000-4000-8000-000000000001',
            scheduleId,
            facilityId,
            doctorId,
            type: body?.type,
            startsAt: body?.startsAt,
            endsAt: body?.endsAt,
            civilDate: body?.civilDate,
            reason: body?.reason,
            version: 2,
          }),
        });
      }
      return;
    }
    if (path === `/clinics/${facilityId}/doctors/${doctorId}/delay`) {
      delayCount += 1;
      await route.fulfill({
        status: 202,
        contentType: 'application/json',
        body: JSON.stringify({
          delayId: `98000000-0000-4000-8000-${String(delayCount).padStart(12, '0')}`,
          facilityId,
          doctorId,
          civilDate: body?.civilDate,
          delayMinutes: body?.delayMinutes,
          version: delayCount,
        }),
      });
      return;
    }
    if (path === `/clinics/${facilityId}/doctors/${doctorId}/absence`) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          absenceId: '99000000-0000-4000-8000-000000000001',
          affectedAppointmentIds: affectedIds,
          removedQueueEntryIds: ['99100000-0000-4000-8000-000000000001'],
          replacementSuggestions: [],
        }),
      });
      return;
    }
    await route.fulfill({
      status: 404,
      contentType: 'application/problem+json',
      body: JSON.stringify({ type: 'about:blank', title: 'Not found', status: 404 }),
    });
  });
  return {
    seen,
    setExceptionConflict(value: boolean) {
      exceptionConflict = value;
    },
    rejectNextException(status: 400 | 403 | 404) {
      nextExceptionFailure = status;
    },
    mismatchNextExceptionScope() {
      exceptionScopeMismatch = true;
    },
    holdNextExceptionResponse() {
      holdNextExceptionResponse = true;
    },
    dropNextExceptionAfterReceipt() {
      dropNextExceptionAfterReceipt = true;
    },
    releaseExceptionResponse() {
      if (!releaseHeldExceptionResponse) throw new Error('No held exception response is pending');
      releaseHeldExceptionResponse();
    },
  };
}

async function login(page: Page, locale: 'ar-EG' | 'en-EG') {
  await page.goto('/schedule');
  if (locale === 'en-EG') await page.getByRole('button', { name: 'English' }).click();
  const words =
    locale === 'en-EG'
      ? {
          handle: 'Sign-in handle',
          password: 'Password',
          next: 'Continue',
          otp: 'Verification code',
          verify: 'Verify',
        }
      : {
          handle: 'وسيلة الدخول',
          password: 'كلمة المرور',
          next: 'متابعة',
          otp: 'رمز التحقق',
          verify: 'تحقق',
        };
  await page.getByLabel(words.handle).fill('synthetic-clinic-staff');
  await page.getByLabel(words.password).fill('synthetic-password');
  await page.getByRole('button', { name: words.next }).click();
  await page.getByLabel(words.otp).fill('123456');
  await page.getByRole('button', { name: words.verify }).click();
  await expect(page.getByRole('main')).toBeVisible();
}

async function enterSchedule(page: Page, locale: 'ar-EG' | 'en-EG') {
  const words =
    locale === 'en-EG'
      ? {
          facility: 'Facility ID',
          doctor: 'Doctor ID',
          timezone: 'IANA time zone',
          from: 'Valid from (Gregorian date)',
          to: 'Valid through (inclusive Gregorian date)',
          fee: 'Fee in minor units (piastres)',
          save: 'Create schedule',
        }
      : {
          facility: 'معرّف المنشأة',
          doctor: 'معرّف الطبيب',
          timezone: 'منطقة زمنية بصيغة IANA',
          from: 'ساري من (تاريخ ميلادي)',
          to: 'ساري حتى (تاريخ ميلادي، شامل)',
          fee: 'الأجر بوحدة القرش',
          save: 'إنشاء الجدول',
        };
  await page.getByLabel(words.facility).fill(facilityId);
  await page.getByLabel(words.doctor).fill(doctorId);
  await page.getByLabel(words.timezone).fill('America/New_York');
  await page.getByLabel(words.from).fill('2030-01-01');
  await page.getByLabel(words.to).fill('2030-12-31');
  await page.getByLabel(words.fee).fill('0');
  const day = page.getByRole('group', { name: locale === 'en-EG' ? 'Monday' : 'الاثنين' });
  await day
    .getByRole('button', { name: locale === 'en-EG' ? 'Add window' : 'إضافة نافذة' })
    .click();
  await day.getByLabel(locale === 'en-EG' ? 'From' : 'من').fill('09:00');
  await day.getByLabel(locale === 'en-EG' ? 'To' : 'إلى').fill('10:00');
  await page.getByRole('button', { name: words.save }).click();
  await expect(
    page.getByRole('heading', { name: locale === 'en-EG' ? 'Action result' : 'نتيجة الإجراء' }),
  ).toBeVisible();
}

test('clinic schedule behavior stays truthful, bilingual, responsive, and keyboard accessible', async ({
  page,
}) => {
  const api = await installSyntheticApi(page);
  const observedDefects: string[] = [];
  await page.setViewportSize({ width: 768, height: 1024 });
  await login(page, 'en-EG');
  await expect(page.locator('[lang="en-EG"][dir="ltr"]')).toBeVisible();
  await expect(
    page.getByText(
      /weekly civil time.*daylight-saving changes.*nonexistent local times.*earlier offset/s,
    ),
  ).toBeVisible();
  await enterSchedule(page, 'en-EG');
  await expect(page.getByLabel('Status').locator('option')).toHaveText([
    'Active',
    'Paused',
    'Retired permanently',
  ]);
  await expect(page.getByLabel('Type').locator('option')).toHaveText([
    'Blocked interval',
    'Additional availability',
  ]);
  const create = api.seen.find(
    (request) => request.method === 'POST' && request.path === `/clinics/${facilityId}/schedules`,
  );
  expect(create?.body).toMatchObject({
    timezone: 'America/New_York',
    validTo: '2030-12-31',
    feeMinorUnits: 0,
    status: 'active',
    windows: [{ isoWeekday: 1, localStart: '09:00:00Z', localEnd: '10:00:00Z' }],
  });
  expect(create?.headers['idempotency-key']).toBeTruthy();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
    ),
  ).toBe(true);
  await page.setViewportSize({ width: 1440, height: 900 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
    ),
  ).toBe(true);
  const undersized = await page
    .locator(
      'button:visible:not([aria-label="Open Next.js Dev Tools"]), input:not([type="radio"]):visible, select:visible, textarea:visible',
    )
    .evaluateAll((items) =>
      items
        .filter((item) => item.getBoundingClientRect().height < 44)
        .map((item) => ({
          tag: item.tagName,
          text: item.textContent,
          ariaLabel: item.getAttribute('aria-label'),
          title: item.getAttribute('title'),
          height: item.getBoundingClientRect().height,
        })),
    );
  expect(undersized).toEqual([]);
  const undersizedRadioLabels = await page
    .locator('input[type="radio"]:visible')
    .evaluateAll(
      (items) =>
        items.filter((item) => (item.closest('label')?.getBoundingClientRect().height ?? 0) < 44)
          .length,
    );
  if (undersizedRadioLabels > 0)
    observedDefects.push(
      `${undersizedRadioLabels} schedule mode radio label target(s) are below 44 CSS pixels`,
    );
  const contrastFailures = await page
    .locator(
      'h1:visible, h2:visible, h3:visible, p:visible, label:visible, button:visible:not([aria-label="Open Next.js Dev Tools"])',
    )
    .evaluateAll((items) => {
      const rgb = (value: string): [number, number, number] | null => {
        const match = value.match(/^rgba?\((\d+),\s*(\d+),\s*(\d+)/);
        return match ? [Number(match[1]), Number(match[2]), Number(match[3])] : null;
      };
      const luminance = (value: [number, number, number]) =>
        value
          .map((channel) => {
            const normalized = channel / 255;
            return normalized <= 0.04045
              ? normalized / 12.92
              : ((normalized + 0.055) / 1.055) ** 2.4;
          })
          .reduce((sum, channel, index) => sum + channel * [0.2126, 0.7152, 0.0722][index]!, 0);
      const failures: string[] = [];
      for (const item of items) {
        const style = getComputedStyle(item);
        let background: Element | null = item;
        let color: [number, number, number] | null = null;
        while (background && !color) {
          const candidate = rgb(getComputedStyle(background).backgroundColor);
          if (candidate && getComputedStyle(background).backgroundColor !== 'rgba(0, 0, 0, 0)')
            color = candidate;
          background = background.parentElement;
        }
        const foreground = rgb(style.color);
        if (!foreground || !color) continue;
        const [high, low] = [luminance(foreground), luminance(color)].sort((a, b) => b - a);
        if ((high + 0.05) / (low + 0.05) < 4.5)
          failures.push(`${item.tagName}:${item.textContent?.trim().slice(0, 48)}`);
      }
      return failures;
    });
  expect(contrastFailures).toEqual([]);
  await page.emulateMedia({ forcedColors: 'active', reducedMotion: 'reduce' });
  await expect(page.getByRole('button', { name: 'Create schedule' })).toBeVisible();

  const exception = page.getByRole('button', { name: 'Create exception' });
  await page.getByLabel('Civil date in the schedule time zone').nth(0).fill('2030-01-07');
  await page.getByLabel('Start (RFC 3339 with offset)').nth(0).fill('2030-01-07T10:00:00+02:00');
  await page
    .getByLabel('End (RFC 3339 with offset, exclusive)')
    .nth(0)
    .fill('2030-01-07T11:00:00+02:00');
  const requestsBeforeInvalidReason = api.seen.length;
  await exception.click();
  await expect(page.locator('#validation-summary')).toBeVisible();
  expect(api.seen).toHaveLength(requestsBeforeInvalidReason);
  const reason = page.getByLabel('Restricted operational reason').nth(0);
  expect(await reason.getAttribute('aria-invalid')).toBe('true');
  expect(await reason.getAttribute('aria-describedby')).toContain('validation-summary');
  const summary = page.locator('#validation-summary');
  if (!(await summary.evaluate((item) => document.activeElement === item)))
    observedDefects.push('validation failure does not move focus to its error summary');
  const overlongReason = 'é'.repeat(501);
  await reason.fill(overlongReason);
  expect(Array.from(await reason.inputValue())).toHaveLength(501);
  const requestsBeforeOverlongReason = api.seen.length;
  await exception.click();
  await expect(summary).toBeVisible();
  expect(await reason.getAttribute('aria-invalid')).toBe('true');
  expect(await reason.getAttribute('aria-describedby')).toContain('validation-summary');
  expect(api.seen).toHaveLength(requestsBeforeOverlongReason);
  const controlCharacterReason = 'boundary review\u0001restricted';
  await reason.fill(controlCharacterReason);
  expect(await reason.inputValue()).toBe(controlCharacterReason);
  const requestsBeforeControlCharacter = api.seen.length;
  await exception.click();
  await expect(summary).toBeVisible();
  expect(await reason.getAttribute('aria-invalid')).toBe('true');
  expect(await reason.getAttribute('aria-describedby')).toContain('validation-summary');
  expect(api.seen).toHaveLength(requestsBeforeControlCharacter);
  await reason.fill('   boundary review   ');
  await exception.click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  const cancelButton = dialog.getByRole('button', { name: 'Cancel' });
  const submitButton = dialog.getByRole('button', { name: 'Submit' });
  await cancelButton.focus();
  await page.keyboard.press('Tab');
  expect(await submitButton.evaluate((item) => document.activeElement === item)).toBe(true);
  await page.keyboard.press('Shift+Tab');
  expect(await cancelButton.evaluate((item) => document.activeElement === item)).toBe(true);
  await cancelButton.click();
  expect(await exception.evaluate((item) => document.activeElement === item)).toBe(true);
  await exception.click();
  await expect(dialog).toBeVisible();
  await submitButton.click();
  await expect(page.getByRole('heading', { name: 'Action result' })).toBeVisible();
  if (
    !(await page
      .locator('section[aria-labelledby="result-heading"]')
      .evaluate((item) => document.activeElement === item))
  )
    observedDefects.push(
      'successful mutation does not move focus to the persistent result heading',
    );
  const exceptionRequest = api.seen.find((request) => request.path.endsWith('/exceptions'));
  expect(exceptionRequest?.body).toMatchObject({
    startsAt: '2030-01-07T10:00:00+02:00',
    endsAt: '2030-01-07T11:00:00+02:00',
    reason: 'boundary review',
  });
  expect(exceptionRequest?.headers['if-match']).toBe('"1"');

  api.setExceptionConflict(true);
  await page.getByLabel('Start (RFC 3339 with offset)').nth(0).fill('2030-01-07T10:30:00+02:00');
  await page
    .getByLabel('End (RFC 3339 with offset, exclusive)')
    .nth(0)
    .fill('2030-01-07T11:30:00+02:00');
  await exception.click();
  await dialog.getByRole('button', { name: 'Submit' }).click();
  await expect(
    page.getByText(/The server rejected the action due to a conflict or stale version/),
  ).toBeVisible();
  expect(await page.getByRole('heading', { name: 'Action result' }).count()).toBe(0);
  api.setExceptionConflict(false);

  const rejectThenRetryException = async (status: 400 | 404) => {
    const priorRequests = api.seen.filter((request) => request.path.endsWith('/exceptions'));
    api.rejectNextException(status);
    await exception.click();
    await dialog.getByRole('button', { name: 'Submit' }).click();
    const rejection = page.locator('#failure-summary');
    await expect(rejection.getByRole('heading', { name: 'Request not accepted' })).toBeVisible();
    await expect(
      rejection.getByText(
        /The server did not accept this request.*does not identify why the target was unavailable/,
      ),
    ).toBeVisible();
    await expect(page.getByRole('button', { name: 'Retry the same request' })).toHaveCount(0);
    await expect(exception).toBeEnabled();
    const rejectedRequest = api.seen
      .filter((request) => request.path.endsWith('/exceptions'))
      .at(-1);
    expect(api.seen.filter((request) => request.path.endsWith('/exceptions'))).toHaveLength(
      priorRequests.length + 1,
    );

    await exception.click();
    await dialog.getByRole('button', { name: 'Submit' }).click();
    await expect(page.getByRole('heading', { name: 'Action result' })).toBeVisible();
    const requestsAfterRetry = api.seen.filter((request) => request.path.endsWith('/exceptions'));
    expect(requestsAfterRetry).toHaveLength(priorRequests.length + 2);
    expect(requestsAfterRetry.at(-1)?.headers['idempotency-key']).not.toBe(
      rejectedRequest?.headers['idempotency-key'],
    );
  };
  await rejectThenRetryException(400);
  await rejectThenRetryException(404);

  await page.getByLabel('Civil date in the schedule time zone').nth(1).fill('2030-01-07');
  await page.getByLabel('Delay minutes (1–1440)').fill('15');
  await page.getByLabel('Published, approved template code').fill('approved-candidate');
  await page.getByLabel('Restricted operational reason').nth(1).fill('traffic');
  await page.getByRole('button', { name: 'Declare delay' }).click();
  await dialog.getByRole('button', { name: 'Submit' }).click();
  await expect(page.getByRole('heading', { name: 'Action result' })).toBeVisible();
  await expect(
    page.getByText(
      /supersedes the current delay.*does not change appointment times, queue order, or availability/,
    ),
  ).toBeVisible();
  const firstDelayRequest = api.seen.find((request) => request.path.endsWith('/delay'));
  expect(firstDelayRequest?.body).toMatchObject({
    delayMinutes: 15,
    templateCode: 'approved-candidate',
    reason: 'traffic',
  });
  await page.getByLabel('Delay minutes (1–1440)').fill('25');
  await page.getByRole('button', { name: 'Declare delay' }).click();
  await dialog.getByRole('button', { name: 'Submit' }).click();
  await expect(page.getByRole('heading', { name: 'Action result' })).toBeVisible();
  const delayRequests = api.seen.filter((request) => request.path.endsWith('/delay'));
  expect(delayRequests).toHaveLength(2);
  expect(delayRequests[1]?.body).toMatchObject({
    delayMinutes: 25,
    templateCode: 'approved-candidate',
    reason: 'traffic',
  });
  expect(delayRequests[0]?.headers['idempotency-key']).not.toBe(
    delayRequests[1]?.headers['idempotency-key'],
  );
  const delayRequest = firstDelayRequest;
  expect(delayRequest?.body).toMatchObject({
    delayMinutes: 15,
    templateCode: 'approved-candidate',
    reason: 'traffic',
  });
  expect(delayRequest?.path).not.toContain('/exceptions');

  await page.getByLabel('Civil date in the schedule time zone').nth(2).fill('2030-01-07');
  await page.getByLabel('Start (RFC 3339 with offset)').nth(1).fill('2030-01-07T09:00:00+02:00');
  await page
    .getByLabel('End (RFC 3339 with offset, exclusive)')
    .nth(1)
    .fill('2030-01-07T12:00:00+02:00');
  await page.getByLabel('Restricted operational reason').nth(2).fill('staffing');
  const reviewAbsence = page.getByRole('button', { name: 'Review absence declaration' });
  await reviewAbsence.click();
  await expect(
    dialog.getByText(
      /The server will identify affected appointments.*count is unknown before submission/,
    ),
  ).toBeVisible();
  await expect(page.getByText(/Affected appointments in authoritative result/)).toHaveCount(0);
  await dialog.getByRole('button', { name: 'Confirm absence declaration' }).click();
  await expect(page.getByText(/Affected appointments in authoritative result: 2/)).toBeVisible();
  await expect(page.getByText(/Queue entries removed in authoritative result: 1/)).toBeVisible();
  expect(
    await page
      .locator('section[aria-labelledby="result-heading"]')
      .evaluate((item) => document.activeElement === item),
  ).toBe(true);
  const absenceRequest = api.seen.find((request) => request.path.endsWith('/absence'));
  expect(absenceRequest?.body).toMatchObject({
    startsAt: '2030-01-07T09:00:00+02:00',
    endsAt: '2030-01-07T12:00:00+02:00',
    reason: 'staffing',
  });

  await page.getByRole('radio', { name: 'Update existing schedule' }).click();
  await page.getByLabel('Status').selectOption('retired');
  const retire = page.getByRole('button', { name: 'Retire permanently' });
  await retire.click();
  await expect(dialog.getByRole('heading', { name: 'Confirm permanent retirement' })).toBeVisible();
  await dialog.getByRole('button', { name: 'Retire permanently' }).click();
  await expect(page.getByText('Retired permanently — read only', { exact: true })).toBeVisible();
  await expect(page.getByLabel('Status')).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Create exception' })).toBeDisabled();
  expect(
    api.seen.find(
      (request) => request.method === 'PATCH' && request.path.endsWith(`/schedules/${scheduleId}`),
    )?.body,
  ).toEqual({ status: 'retired' });
  await page.getByRole('radio', { name: 'Create schedule' }).click();
  await page.getByLabel('Doctor ID').fill('91000000-0000-4000-8000-000000000002');
  await expect(page.getByRole('button', { name: 'Create schedule' })).toBeEnabled();
  await page.setViewportSize({ width: 360, height: 800 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
    ),
  ).toBe(true);

  const arPage = await page.context().newPage();
  await arPage.setViewportSize({ width: 768, height: 1024 });
  const arApi = await installSyntheticApi(arPage);
  await login(arPage, 'ar-EG');
  await expect(arPage.locator('[lang="ar-EG"][dir="rtl"]')).toBeVisible();
  const arabicRecurrenceHelp = arPage.locator('p').filter({ hasText: 'التكرار أسبوعي بوقت مدني' });
  await expect(arabicRecurrenceHelp).toBeVisible();
  await expect(arabicRecurrenceHelp).toContainText('التوقيت الصيفي');
  await expect(arabicRecurrenceHelp).toContainText('غير موجودة');
  await expect(arabicRecurrenceHelp).toContainText('للوقت الملتبس');
  await enterSchedule(arPage, 'ar-EG');
  await arPage.getByLabel('التاريخ المدني في المنطقة الزمنية للجدول').nth(0).fill('2030-01-07');
  await arPage
    .getByLabel('البداية (RFC 3339 مع إزاحة زمنية)')
    .nth(0)
    .fill('2030-01-07T10:00:00+02:00');
  await arPage
    .getByLabel('النهاية (RFC 3339 مع إزاحة زمنية، غير شاملة)')
    .nth(0)
    .fill('2030-01-07T11:00:00+02:00');
  await arPage.getByLabel('السبب التشغيلي المقيد').nth(0).fill('مراجعة تشغيلية');
  arApi.rejectNextException(404);
  const arException = arPage.getByRole('button', { name: 'إنشاء الاستثناء' });
  await arException.click();
  const arDialog = arPage.getByRole('dialog');
  await arDialog.getByRole('button', { name: 'إرسال' }).click();
  const arRejection = arPage.locator('#failure-summary');
  await expect(arRejection.getByRole('heading', { name: 'لم يُقبل الطلب' })).toBeVisible();
  await expect(arRejection).toContainText('لم يقبل الخادم هذا الطلب');
  await expect(arRejection).toContainText('لا تحدد هذه الاستجابة سبب عدم إتاحة الهدف');
  await expect(arPage.getByRole('button', { name: 'إعادة المحاولة بالطلب نفسه' })).toHaveCount(0);
  await expect(arException).toBeEnabled();
  const rejectedArabicRequest = arApi.seen
    .filter((request) => request.path.endsWith('/exceptions'))
    .at(-1);
  await arException.click();
  await arDialog.getByRole('button', { name: 'إرسال' }).click();
  await expect(arPage.getByRole('heading', { name: 'نتيجة الإجراء' })).toBeVisible();
  const acceptedArabicRequest = arApi.seen
    .filter((request) => request.path.endsWith('/exceptions'))
    .at(-1);
  expect(acceptedArabicRequest?.headers['idempotency-key']).not.toBe(
    rejectedArabicRequest?.headers['idempotency-key'],
  );
  expect(
    await arPage.evaluate(
      () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
    ),
  ).toBe(true);
  await arPage.setViewportSize({ width: 1440, height: 900 });
  expect(
    await arPage.evaluate(
      () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
    ),
  ).toBe(true);
  await arPage.close();
  expect(observedDefects).toEqual([]);
});

test('schedule baseline states remain truthful without reads or offline writes', async ({
  page,
}) => {
  const api = await installSyntheticApi(page);
  await page.setViewportSize({ width: 768, height: 1024 });
  await login(page, 'en-EG');
  await expect(page.getByText(/No mutation result is loaded/)).toBeVisible();
  await enterSchedule(page, 'en-EG');

  const createSchedule = page.getByRole('button', { name: 'Create schedule' });
  const requestsBeforeOffline = api.seen.length;
  await page.context().setOffline(true);
  await expect(page.getByText(/You are offline/)).toBeVisible();
  await expect(createSchedule).toBeDisabled();
  await createSchedule.evaluate((element) => (element as HTMLButtonElement).click());
  expect(api.seen).toHaveLength(requestsBeforeOffline);
  await page.context().setOffline(false);
  await expect(createSchedule).toBeEnabled();

  await page.getByRole('radio', { name: 'Update existing schedule' }).click();
  await page.getByLabel('Status').selectOption('paused');
  await page.getByRole('button', { name: 'Submit update' }).click();
  await expect(page.getByText('Status: Paused', { exact: true })).toBeVisible();
  expect(
    api.seen.find(
      (request) => request.method === 'PATCH' && request.path.endsWith(`/schedules/${scheduleId}`),
    )?.body,
  ).toMatchObject({ status: 'paused' });

  const exception = page.getByRole('button', { name: 'Create exception' });
  const dialog = page.getByRole('dialog');
  const fillException = async (date: string, reason: string) => {
    await page.getByLabel('Type').selectOption('added');
    await page.getByLabel('Civil date in the schedule time zone').nth(0).fill(date);
    await page.getByLabel('Start (RFC 3339 with offset)').nth(0).fill(`${date}T10:00:00+02:00`);
    await page
      .getByLabel('End (RFC 3339 with offset, exclusive)')
      .nth(0)
      .fill(`${date}T11:00:00+02:00`);
    await page.getByLabel('Restricted operational reason').nth(0).fill(reason);
  };
  await fillException('2030-01-07', 'additional availability');
  await exception.click();
  await dialog.getByRole('button', { name: 'Submit' }).click();
  await expect(page.locator('section[aria-labelledby="exception-result-heading"]')).toContainText(
    'Additional availability',
  );
  expect(
    api.seen.filter((request) => request.path.endsWith('/exceptions')).at(-1)?.body,
  ).toMatchObject({
    type: 'added',
    reason: 'additional availability',
  });

  await fillException('2030-01-08', 'loading state');
  api.holdNextExceptionResponse();
  await exception.click();
  await dialog.getByRole('button', { name: 'Submit' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Submitting action…' })).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Submit' })).toBeDisabled();
  api.releaseExceptionResponse();
  await expect(page.getByRole('heading', { name: 'Action result' })).toBeVisible();

  await fillException('2030-01-09', 'network outcome uncertain');
  const requestsBeforeNetworkDrop = api.seen.filter((request) =>
    request.path.endsWith('/exceptions'),
  );
  api.dropNextExceptionAfterReceipt();
  await exception.click();
  await dialog.getByRole('button', { name: 'Submit' }).click();
  const recoverable = page.locator('#failure-summary');
  await expect(recoverable).toContainText('The outcome could not be confirmed');
  expect(await recoverable.evaluate((item) => document.activeElement === item)).toBe(true);
  await expect(page.getByRole('button', { name: 'Retry the same request' })).toBeEnabled();
  await expect(exception).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Declare delay' })).toBeDisabled();
  const firstUncertainRequest = api.seen
    .filter((request) => request.path.endsWith('/exceptions'))
    .at(-1);
  expect(api.seen.filter((request) => request.path.endsWith('/exceptions'))).toHaveLength(
    requestsBeforeNetworkDrop.length + 1,
  );
  await page.getByRole('button', { name: 'Retry the same request' }).click();
  await expect(page.getByRole('heading', { name: 'Action result' })).toBeVisible();
  const retriedRequests = api.seen.filter((request) => request.path.endsWith('/exceptions'));
  expect(retriedRequests).toHaveLength(requestsBeforeNetworkDrop.length + 2);
  expect(retriedRequests.at(-1)?.body).toEqual(firstUncertainRequest?.body);
  expect(retriedRequests.at(-1)?.headers['idempotency-key']).toBe(
    firstUncertainRequest?.headers['idempotency-key'],
  );

  await fillException('2030-01-10', 'scope mismatch');
  api.mismatchNextExceptionScope();
  await exception.click();
  await dialog.getByRole('button', { name: 'Submit' }).click();
  const terminal = page.locator('#failure-summary');
  await expect(terminal).toContainText(/server response does not match the requested scope/i);
  await expect(page.getByRole('heading', { name: 'Action result' })).toHaveCount(0);

  await fillException('2030-01-11', 'permission denied');
  api.rejectNextException(403);
  await exception.click();
  await dialog.getByRole('button', { name: 'Submit' }).click();
  await expect(page.locator('#failure-summary')).toContainText(
    'You are not authorized for this scope or action.',
  );
  await expect(page.getByRole('button', { name: 'Retry the same request' })).toHaveCount(0);
});
