import { expect, test, type Page } from 'playwright/test';

const encounterId = '95000000-0000-4000-8000-000000000001';
const referralId = '97000000-0000-4000-8000-000000000001';
const appointmentId = '93000000-0000-4000-8000-000000000001';
const updatedAt = '2026-09-29T09:30:00+03:00';
type Locale = 'ar-EG' | 'en-EG';
type Seen = {
  path: string;
  method: string;
  body?: Record<string, unknown>;
  headers: Record<string, string>;
};

function sourceReferral(status: 'pending' | 'accepted' = 'pending') {
  return {
    id: referralId,
    sourceEncounterId: encounterId,
    status,
    version: status === 'accepted' ? 2 : 1,
    targetSpecialty: 'Cardiology',
    reasonSummary: 'Synthetic referral reason for browser verification.',
    privateNote: 'SYNTHETIC_PRIVATE_NOTE_CANARY',
    targetFacilityName: 'MUST_NOT_RENDER_FACILITY_NAME',
    ...(status === 'accepted'
      ? {
          targetFacilityId: '90000000-0000-4000-8000-000000000002',
          targetDoctorId: '91000000-0000-4000-8000-000000000002',
          acceptedFieldCodes: ['reason_summary'],
          resultingAppointmentId: appointmentId,
        }
      : {}),
  };
}

async function installApi(page: Page) {
  const seen: Seen[] = [];
  let status: 'empty' | 'pending' | 'accepted' = 'empty';
  let createStatus: 201 | 403 | 409 | 412 | 422 | 503 | 'offline' = 201;
  let listStatus: 200 | 403 | 503 = 200;
  let acceptedOnRefresh = false;
  let staleSecondPage = false;
  let holdNextPendingList = false;
  let pendingListStarted: (() => void) | undefined;
  let releasePendingList: (() => void) | undefined;
  await page.route('**/v1/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname.replace(/^\/v1/, '');
    const body = request.postDataJSON() as Record<string, unknown> | undefined;
    seen.push({
      path,
      method: request.method(),
      headers: request.headers(),
      ...(body ? { body } : {}),
    });
    const json = (responseStatus: number, value: unknown) =>
      route.fulfill({
        status: responseStatus,
        contentType: 'application/json',
        headers: { 'Cache-Control': 'private, no-store' },
        body: JSON.stringify(value),
      });
    if (path === '/auth/login')
      return json(200, { kind: 'challenge', challenge_id: 'synthetic-challenge' });
    if (path === '/auth/otp/verify')
      return json(200, { kind: 'session', access_token: 'synthetic-clinic-token', aal: 2 });
    if (path === `/encounters/${encounterId}/referrals` && request.method() === 'POST') {
      const result = createStatus;
      createStatus = 201;
      if (result === 'offline') return route.abort('failed');
      if (result !== 201)
        return json(result, {
          type: 'about:blank',
          title: result === 409 ? 'Conflict' : result === 403 ? 'Forbidden' : 'Request failed',
          status: result,
          code:
            result === 409
              ? 'idempotency-key-reused'
              : result === 412
                ? 'stale-state'
                : 'invalid-request',
        });
      status = 'pending';
      return json(201, sourceReferral('pending'));
    }
    if (path === '/referrals' && request.method() === 'GET') {
      const result = listStatus;
      if (result !== 200)
        return json(result, { type: 'about:blank', title: 'Unavailable', status: result });
      if (staleSecondPage && url.searchParams.has('cursor')) {
        staleSecondPage = false;
        return json(200, {
          data: [],
          meta: { nextCursor: null, lastUpdatedAt: updatedAt, stale: true },
        });
      }
      if (acceptedOnRefresh) status = 'accepted';
      const responseStatus = status;
      if (holdNextPendingList && responseStatus === 'pending') {
        holdNextPendingList = false;
        pendingListStarted?.();
        await new Promise<void>((resolve) => {
          releasePendingList = resolve;
        });
        releasePendingList = undefined;
      }
      return json(200, {
        data:
          responseStatus === 'empty'
            ? []
            : responseStatus === 'accepted'
              ? [sourceReferral('accepted')]
              : [sourceReferral('pending')],
        meta: {
          nextCursor: staleSecondPage ? 'stale-second-page' : null,
          lastUpdatedAt: updatedAt,
          stale: false,
        },
      });
    }
    return json(404, { type: 'about:blank', title: 'Not found', status: 404 });
  });
  return {
    seen,
    failCreate(value: 403 | 409 | 412 | 422 | 503 | 'offline') {
      createStatus = value;
    },
    failList(value: 403 | 503) {
      listStatus = value;
    },
    acceptOnRefresh() {
      acceptedOnRefresh = true;
    },
    staleSecondPageOnNextList() {
      staleSecondPage = true;
    },
    restoreList() {
      listStatus = 200;
    },
    reset() {
      status = 'empty';
      acceptedOnRefresh = false;
      listStatus = 200;
    },
    holdNextPendingList() {
      holdNextPendingList = true;
    },
    waitForPendingList() {
      return new Promise<void>((resolve) => {
        pendingListStarted = resolve;
      });
    },
    releasePendingList() {
      if (!releasePendingList) throw new Error('No pending list response is held');
      releasePendingList();
    },
  };
}

async function openReferrals(
  page: Page,
  locale: Locale,
  viewport: { width: number; height: number },
  discoverFromToday = false,
) {
  await page.setViewportSize(viewport);
  if (discoverFromToday) {
    await page.goto('/today');
    if (locale === 'en-EG') await page.getByRole('button', { name: 'English' }).click();
    await page.getByRole('link', { name: locale === 'en-EG' ? 'Referrals' : 'الإحالات' }).click();
  } else {
    await page.goto('/referrals');
  }
  if (locale === 'en-EG') await page.getByRole('button', { name: 'English' }).click();
  const copy =
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
  await page.getByLabel(copy.handle).fill('synthetic-clinic-staff');
  await page.getByLabel(copy.password).fill('synthetic-password');
  await page.getByRole('button', { name: copy.next }).click();
  await page.getByLabel(copy.otp).fill('123456');
  await page.getByRole('button', { name: copy.verify }).click();
  await expect(page.getByRole('main')).toBeVisible();
}

async function createSyntheticReferral(page: Page) {
  await page.getByRole('button', { name: 'Create referral' }).click();
  await page.getByRole('textbox', { name: 'Source encounter ID' }).fill(encounterId);
  await page
    .getByLabel('I confirm that I reviewed this source encounter ID before creating the referral.')
    .check();
  await page.getByLabel('Target specialty').fill('Cardiology');
  await page
    .getByLabel('Referral reason summary')
    .fill('Synthetic referral reason for browser verification.');
  await page.getByRole('button', { name: 'Review referral' }).click();
  await page
    .getByRole('dialog', { name: 'Review internal referral' })
    .getByRole('button', { name: 'Create pending referral' })
    .click();
  await expect(page.getByText(referralId)).toBeVisible();
}

test('clinic referrals create and track only authorized source fields across locales and viewports', async ({
  page,
}) => {
  const api = await installApi(page);
  for (const [locale, viewport] of [
    ['ar-EG', { width: 768, height: 1024 }],
    ['en-EG', { width: 768, height: 1024 }],
    ['ar-EG', { width: 1440, height: 900 }],
    ['en-EG', { width: 1440, height: 900 }],
  ] as const) {
    api.reset();
    await openReferrals(page, locale, viewport);
    const en = locale === 'en-EG';
    const direction = en ? 'ltr' : 'rtl';
    await expect(page.locator(`div[lang="${locale}"][dir="${direction}"]`)).toBeVisible();
    await expect(
      page.getByRole('navigation', { name: en ? 'Clinic navigation' : 'تنقل العيادة' }),
    ).toBeVisible();
    const navReferral = page
      .getByRole('navigation')
      .getByRole('link', { name: en ? 'Referrals' : 'الإحالات' });
    await expect(navReferral).toHaveAttribute('aria-current', 'page');
    await page.getByRole('button', { name: en ? 'Create referral' : 'إنشاء إحالة' }).click();
    const sourceLabel = en ? 'Source encounter ID' : 'معرّف الزيارة المصدر';
    const specialtyLabel = en ? 'Target specialty' : 'التخصص المستهدف';
    const reasonLabel = en ? 'Referral reason summary' : 'ملخص سبب الإحالة';
    const encounterTypeLabel = en ? 'Source encounter type' : 'نوع الزيارة المصدر';
    await page.getByRole('textbox', { name: sourceLabel }).fill(encounterId);
    await page.getByLabel(specialtyLabel).fill('Cardiology');
    await page.getByLabel(reasonLabel).fill('Synthetic referral reason for browser verification.');
    await page
      .getByLabel(
        en
          ? 'Include source encounter type among the fields proposed for sharing after patient authorization.'
          : 'تضمين نوع الزيارة المصدر ضمن المعلومات المقترح مشاركتها بعد موافقة المريض.',
      )
      .check();
    await page.getByRole('textbox', { name: encounterTypeLabel }).fill('consultation');
    await page.getByRole('button', { name: en ? 'Review referral' : 'مراجعة الإحالة' }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await page
      .getByLabel(
        en
          ? 'I confirm that I reviewed this source encounter ID before creating the referral.'
          : 'أؤكد أنني راجعت معرّف الزيارة المصدر قبل إنشاء الإحالة.',
      )
      .check();
    await page.getByRole('button', { name: en ? 'Review referral' : 'مراجعة الإحالة' }).click();
    const review = page.getByRole('dialog', {
      name: en ? 'Review internal referral' : 'مراجعة إحالة داخلية',
    });
    await page.keyboard.press('Escape');
    await expect(review).toHaveCount(0);
    const reviewButton = page.getByRole('button', {
      name: en ? 'Review referral' : 'مراجعة الإحالة',
    });
    await expect(reviewButton).toBeFocused();
    await reviewButton.click();
    await expect(review.getByText(encounterId)).toBeVisible();
    await expect(review.getByText('consultation')).toBeVisible();
    await expect(review.getByText(referralId)).toHaveCount(0);
    await expect(page.getByRole('article')).toHaveCount(0);
    await expect(
      review.getByText('Synthetic referral reason for browser verification.'),
    ).toBeVisible();
    await review
      .getByRole('button', { name: en ? 'Create pending referral' : 'إنشاء إحالة معلّقة' })
      .click();
    await expect(page.getByText(referralId)).toBeVisible();
    await expect(page.getByRole('heading', { name: en ? /^Pending/ : /^معلّقة/ })).toBeVisible();
    await expect(page.getByText('SYNTHETIC_PRIVATE_NOTE_CANARY')).toHaveCount(0);
    await expect(page.getByText('MUST_NOT_RENDER_FACILITY_NAME')).toHaveCount(0);
    expect(api.seen.some((item) => item.method === 'GET' && item.path === '/referrals')).toBe(true);
    const create = api.seen.find(
      (item) => item.method === 'POST' && item.path === `/encounters/${encounterId}/referrals`,
    );
    expect(create?.body).toMatchObject({
      targetSpecialty: 'Cardiology',
      reasonSummary: 'Synthetic referral reason for browser verification.',
      encounterType: 'consultation',
    });
    expect(create?.headers['idempotency-key']).toBeTruthy();
    expect(
      api.seen.some(
        (item) => item.path.includes('/getEncounter') || item.path === `/encounters/${encounterId}`,
      ),
    ).toBe(false);
    expect(
      api.seen.some((item) => item.path.includes('/appointments') || item.path.includes('/queue')),
    ).toBe(false);
    await expect(page.getByRole('button', { name: /accept|قبول/i })).toHaveCount(0);
    await expect(
      page.getByText(en ? 'Last authoritative update:' : 'آخر تحديث موثوق:'),
    ).toBeVisible();
    if (!en) await expect(page.getByText(/٢٩|٢٨|٢٠٢٦/)).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
      ),
    ).toBe(true);
    const refresh = page.getByRole('button', { name: en ? /refresh/i : /تحديث/ });
    await refresh.focus();
    await expect(refresh).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('heading', { name: en ? /^Pending/ : /^معلّقة/ })).toBeVisible();
    api.acceptOnRefresh();
    await refresh.click();
    await expect(page.getByRole('heading', { name: en ? /^Accepted/ : /^مقبولة/ })).toBeVisible();
    await expect(page.getByText(appointmentId)).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
      ),
    ).toBe(true);
  }
});

test('clinic referrals are discoverable from the existing today navigation', async ({ page }) => {
  await page.setViewportSize({ width: 768, height: 1024 });
  await page.goto('/today');
  await page.getByRole('link', { name: 'الإحالات' }).click();
  await expect(page.getByRole('heading', { name: 'دخول موظف العيادة' })).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'تنقل العيادة' })).toBeVisible();
});

test('referral form requires specialty and nonblank reason and review stays proposed only', async ({
  page,
}) => {
  await installApi(page);
  await openReferrals(page, 'en-EG', { width: 768, height: 1024 });
  await page.getByRole('button', { name: 'Create referral' }).click();
  await page.getByRole('textbox', { name: 'Source encounter ID' }).fill(encounterId);
  await page
    .getByLabel('I confirm that I reviewed this source encounter ID before creating the referral.')
    .check();
  await page.getByLabel('Target specialty').fill('Cardiology');
  const review = page.getByRole('button', { name: 'Review referral' });
  await page.getByLabel('Referral reason summary').fill('   ');
  await review.click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByRole('alert').first()).toBeVisible();
  await page.getByLabel('Referral reason summary').fill('Synthetic reason');
  await review.click();
  await expect(page.getByRole('dialog', { name: 'Review internal referral' })).toBeVisible();
  await expect(page.getByText(referralId)).toHaveCount(0);
  await expect(page.getByRole('button', { name: /accept/i })).toHaveCount(0);
});

test('create failures remain explicit and never report a saved referral', async ({ page }) => {
  const api = await installApi(page);
  await openReferrals(page, 'en-EG', { width: 768, height: 1024 });
  await page.getByRole('button', { name: 'Create referral' }).click();
  await page.getByRole('textbox', { name: 'Source encounter ID' }).fill(encounterId);
  await page
    .getByLabel('I confirm that I reviewed this source encounter ID before creating the referral.')
    .check();
  await page.getByLabel('Target specialty').fill('Cardiology');
  await page.getByLabel('Referral reason summary').fill('Synthetic failure reason');
  for (const failure of [422, 403, 412, 409, 503, 'offline'] as const) {
    api.failCreate(failure);
    if (!(await page.getByRole('dialog').count()))
      await page.getByRole('button', { name: 'Review referral' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Create pending referral' }).click();
    await expect(page.getByText(referralId)).toHaveCount(0);
    await expect(page.getByRole('alert')).toBeVisible();
  }
  expect(
    api.seen.filter(
      (item) => item.method === 'POST' && item.path === `/encounters/${encounterId}/referrals`,
    ),
  ).toHaveLength(6);
  const failedPosts = api.seen.filter(
    (item) => item.method === 'POST' && item.path === `/encounters/${encounterId}/referrals`,
  );
  expect(new Set(failedPosts.map((item) => item.headers['idempotency-key'])).size).toBe(1);
});

test('denied or offline referral reads clear protected content and recover by authoritative refresh', async ({
  page,
}) => {
  const api = await installApi(page);
  await openReferrals(page, 'en-EG', { width: 1440, height: 900 });
  await createSyntheticReferral(page);
  await expect(page.getByText(referralId)).toBeVisible();
  api.staleSecondPageOnNextList();
  await page.getByRole('button', { name: /refresh/i }).click();
  await expect(page.getByText(referralId)).toHaveCount(0);
  await expect(page.getByRole('alert')).toBeVisible();
  await page.getByRole('button', { name: /refresh/i }).click();
  await expect(page.getByText(referralId)).toBeVisible();
  api.failList(403);
  await page.getByRole('button', { name: /refresh/i }).click();
  await expect(page.getByText(referralId)).toHaveCount(0);
  await expect(page.getByRole('alert')).toBeVisible();
  await page.context().setOffline(true);
  await expect(page.getByText(referralId)).toHaveCount(0);
  await expect(page.getByRole('alert')).toBeVisible();
  await page.context().setOffline(false);
  api.failList(503);
  await page.getByRole('button', { name: /retry|refresh/i }).click();
  await expect(page.getByText(referralId)).toHaveCount(0);
  await expect(page.getByRole('alert')).toBeVisible();
  api.restoreList();
  await page.getByRole('button', { name: /retry|refresh/i }).click();
  await expect(page.getByText(referralId)).toBeVisible();
  api.holdNextPendingList();
  const pendingResponseStarted = api.waitForPendingList();
  await page.getByRole('button', { name: /refresh/i }).click();
  await pendingResponseStarted;
  api.acceptOnRefresh();
  await page.getByRole('button', { name: /refresh/i }).click();
  await expect(page.getByText('Accepted')).toBeVisible();
  api.releasePendingList();
  await expect(page.getByText('Accepted')).toBeVisible();
  await expect(page.getByText(appointmentId)).toBeVisible();
  await expect(page.getByText('90000000-0000-4000-8000-000000000002')).toBeVisible();
  await expect(page.getByText('91000000-0000-4000-8000-000000000002')).toBeVisible();
  await expect(page.getByText(/private note body|private note/i)).toHaveCount(0);
  await expect(page.getByRole('button', { name: /accept/i })).toHaveCount(0);
});
