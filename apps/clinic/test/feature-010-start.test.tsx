import { expect, test, type Page } from 'playwright/test';

const patientId = '92000000-0000-4000-8000-000000000001';
const facilityId = '90000000-0000-4000-8000-000000000001';
const doctorId = '91000000-0000-4000-8000-000000000001';
const appointmentId = '93000000-0000-4000-8000-000000000001';
const queueEntryId = '94000000-0000-4000-8000-000000000001';
const encounterId = '95000000-0000-4000-8000-000000000001';
const date = '2026-09-29';

type Eligibility = 'eligible' | 'missing' | 'non-called' | 'stale' | 'denied';

async function enterSummary(
  page: Page,
  locale: 'ar-EG' | 'en-EG',
  eligibility: Eligibility,
  viewport: { width: number; height: number } = { width: 768, height: 1024 },
) {
  const seen: Array<{
    path: string;
    method: string;
    query: URLSearchParams;
    body?: Record<string, unknown>;
  }> = [];
  let staleOnNextAppointmentRead = false;
  let switchOnNextAppointmentRead = false;
  let rejectNextCreate = false;
  let activeAppointmentId = appointmentId;
  let activeQueueEntryId = queueEntryId;
  await page.route('**/v1/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname.replace(/^\/v1/, '');
    const body = request.postDataJSON() as Record<string, unknown> | undefined;
    seen.push({
      path,
      method: request.method(),
      query: url.searchParams,
      ...(body ? { body } : {}),
    });
    const staleThisAppointmentRead = path === '/appointments' && staleOnNextAppointmentRead;
    if (staleThisAppointmentRead) staleOnNextAppointmentRead = false;
    if (path === '/appointments' && switchOnNextAppointmentRead) {
      switchOnNextAppointmentRead = false;
      activeAppointmentId = '93000000-0000-4000-8000-000000000002';
      activeQueueEntryId = '94000000-0000-4000-8000-000000000002';
    }
    const currentIsStale = eligibility === 'stale' || staleThisAppointmentRead;
    const json = (status: number, value: unknown) =>
      route.fulfill({
        status,
        contentType: 'application/json',
        headers: { 'Cache-Control': 'private, no-store' },
        body: JSON.stringify(value),
      });
    if (path === '/auth/login')
      return json(200, { kind: 'challenge', challenge_id: 'synthetic-challenge' });
    if (path === '/auth/otp/verify')
      return json(200, { kind: 'session', access_token: 'synthetic-staff-token', aal: 2 });
    if (path === '/appointments') {
      if (eligibility === 'denied')
        return json(403, { type: 'about:blank', title: 'Forbidden', status: 403 });
      return json(200, {
        items:
          eligibility === 'missing'
            ? []
            : [
                {
                  id: activeAppointmentId,
                  patientId,
                  facilityId,
                  doctorId,
                  startsAt: `${date}T09:00:00+03:00`,
                  endsAt: `${date}T09:30:00+03:00`,
                  timezone: 'Africa/Cairo',
                  civilDate: date,
                  status: 'checked_in',
                  version: 1,
                },
              ],
        freshness: eligibility === 'stale' || currentIsStale ? 'stale' : 'fresh',
      });
    }
    if (path.startsWith(`/clinics/${facilityId}/queues`))
      return json(200, {
        facilityId,
        doctorId,
        civilDate: date,
        version: 1,
        freshness: eligibility === 'stale' ? 'stale' : 'fresh',
        entries:
          eligibility === 'missing'
            ? []
            : [
                {
                  id: activeQueueEntryId,
                  appointmentId: activeAppointmentId,
                  facilityId,
                  doctorId,
                  civilDate: date,
                  state: eligibility === 'eligible' ? 'called' : 'waiting',
                  queueNumber: 14,
                  position: 1,
                  version: 1,
                },
              ],
      });
    if (
      path === '/encounters' &&
      (!request.headers()['x-purpose'] || request.headers()['x-aal'] !== '2')
    )
      return json(403, { status: 403 });
    if (path === '/encounters' && request.method() === 'POST')
      if (rejectNextCreate) {
        rejectNextCreate = false;
        return json(409, {
          type: 'about:blank',
          title: 'Conflict',
          status: 409,
          code: 'encounter-start-eligibility-changed',
        });
      }
    if (
      path === '/encounters' &&
      (!request.headers()['x-purpose'] || request.headers()['x-aal'] !== '2')
    )
      return json(403, { status: 403 });
    if (path === '/encounters' && request.method() === 'POST')
      return json(201, {
        encounter: {
          id: encounterId,
          appointmentId,
          patientId,
          facilityId,
          responsibleClinicianId: '96000000-0000-4000-8000-000000000001',
          encounterType: 'consultation',
          status: 'open',
          openedAt: `${date}T09:00:00+03:00`,
          version: 1,
        },
        appointmentStatus: 'in_consultation',
        queueStatus: 'in_service',
        queueEntryId,
      });
    return json(404, { type: 'about:blank', title: 'Not found', status: 404 });
  });

  await page.setViewportSize(viewport);
  await page.goto(`/patients/${patientId}/summary`);
  const en = locale === 'en-EG';
  const login = en
    ? {
        toggle: 'English',
        handle: 'Sign-in handle',
        password: 'Password',
        next: 'Continue',
        otp: 'Verification code',
        verify: 'Verify',
      }
    : {
        toggle: 'العربية',
        handle: 'وسيلة الدخول',
        password: 'كلمة المرور',
        next: 'متابعة',
        otp: 'رمز التحقق',
        verify: 'تحقق',
      };
  if (en) await page.getByRole('button', { name: login.toggle }).click();
  await page.getByLabel(login.handle).fill('synthetic-clinic-staff');
  await page.getByLabel(login.password).fill('synthetic-password');
  await page.getByRole('button', { name: login.next }).click();
  await page.getByLabel(login.otp).fill('123456');
  await page.getByRole('button', { name: login.verify }).click();
  await expect(page.getByRole('main')).toBeVisible();
  return {
    seen,
    staleNextAppointmentRead: () => (staleOnNextAppointmentRead = true),
    switchNextAppointmentRead: () => (switchOnNextAppointmentRead = true),
    rejectNextCreate: () => (rejectNextCreate = true),
  };
}

test('eligible checked-in appointment and called queue require review before the API recheck', async ({
  page,
}) => {
  const { seen } = await enterSummary(page, 'en-EG', 'eligible');
  await expect(page.locator('div[lang="en-EG"][dir="ltr"]')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Current patient context' })).toBeVisible();
  await expect(
    page.getByText(/Al Noor Test Clinic|Treating clinician|AAL2|Test environment/),
  ).toHaveCount(0);
  await expect(page.getByText(facilityId)).toBeVisible();
  await expect(page.getByText(appointmentId)).toBeVisible();
  await expect(page.getByText(queueEntryId)).toBeVisible();
  const start = page.getByRole('button', { name: 'Start encounter' });
  await expect(start).toBeVisible();
  await start.focus();
  await expect(start).toBeFocused();
  await page.keyboard.press('Enter');
  const review = page.getByRole('dialog', { name: /Review encounter start/ });
  await expect(review).toBeVisible();
  await expect(review.getByText(/API rechecks/)).toBeVisible();
  await expect(review.getByText(queueEntryId)).toBeVisible();
  await expect(review.getByText('Called')).toBeVisible();
  await expect(review.getByRole('button', { name: 'Back' })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(review.getByRole('button', { name: 'Start encounter' })).toBeFocused();
  await expect(page.getByRole('button', { name: 'Start encounter' })).toHaveCount(2);
  await expect
    .poll(() => seen.some((item) => item.path === '/appointments' && item.method === 'GET'))
    .toBe(true);
  const list = seen.find((item) => item.path === '/appointments');
  expect(list?.query.get('patientId')).toBe(patientId);
  expect(list?.query.get('status')).toBe('checked_in');
});

test('confirmed start uses generated createEncounter and navigates to the existing encounter route', async ({
  page,
}) => {
  const { seen } = await enterSummary(page, 'en-EG', 'eligible');
  await page.getByRole('button', { name: 'Start encounter' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Start encounter' }).click();
  await expect(page).toHaveURL(new RegExp(`/encounters/${encounterId}$`));
  const create = seen.find((item) => item.path === '/encounters' && item.method === 'POST');
  expect(create?.body).toEqual({ appointmentId, patientId, encounterType: 'consultation' });
});

test('absent, non-called, denied and stale eligibility never show a successful start', async ({
  page,
}) => {
  for (const eligibility of ['missing', 'non-called', 'stale', 'denied'] as const) {
    await enterSummary(page, 'ar-EG', eligibility);
    await expect(page.locator('div[lang="ar-EG"][dir="rtl"]')).toBeVisible();
    await expect(page.getByRole('button', { name: 'بدء الزيارة' })).toHaveCount(0);
    await expect(page.getByText(/لم تُنشأ زيارة|تعذّر|الحالة/)).toBeVisible();
    await expect(page.getByText(facilityId)).toHaveCount(0);
    await expect(page).toHaveURL(new RegExp(`/patients/${patientId}/summary$`));
  }
});

test('Arabic review at wide viewport returns focus and blocks a stale API recheck', async ({
  page,
}) => {
  const { seen, staleNextAppointmentRead } = await enterSummary(page, 'ar-EG', 'eligible', {
    width: 1440,
    height: 900,
  });
  await expect(page.locator('div[lang="ar-EG"][dir="rtl"]')).toBeVisible();
  await page.getByRole('button', { name: 'بدء الزيارة' }).click();
  const confirm = page.getByRole('dialog').getByRole('button', { name: 'بدء الزيارة' });
  await confirm.focus();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: 'بدء الزيارة' })).toBeFocused();
  await page.getByRole('button', { name: 'بدء الزيارة' }).click();
  staleNextAppointmentRead();
  await page.getByRole('dialog').getByRole('button', { name: 'بدء الزيارة' }).click();
  await expect(page).toHaveURL(new RegExp(`/patients/${patientId}/summary$`));
  await expect(page.getByText(/تغيّر|تحديث/)).toBeVisible();
  expect(seen.filter((item) => item.path === '/encounters' && item.method === 'POST')).toHaveLength(
    0,
  );
});

test('confirmation blocks if the fresh appointment and queue differ from the reviewed context', async ({
  page,
}) => {
  const { seen, switchNextAppointmentRead } = await enterSummary(page, 'en-EG', 'eligible', {
    width: 768,
    height: 1024,
  });
  await page.getByRole('button', { name: 'Start encounter' }).click();
  switchNextAppointmentRead();
  await page.getByRole('dialog').getByRole('button', { name: 'Start encounter' }).click();
  await expect(
    page.getByText(/Appointment and queue eligibility could not be confirmed/),
  ).toBeVisible();
  await expect(page).toHaveURL(new RegExp(`/patients/${patientId}/summary$`));
  expect(seen.filter((item) => item.path === '/encounters' && item.method === 'POST')).toHaveLength(
    0,
  );
});

test('API conflict after a fresh re-read never renders success or navigates', async ({ page }) => {
  const { seen, rejectNextCreate } = await enterSummary(page, 'en-EG', 'eligible', {
    width: 1440,
    height: 900,
  });
  await page.getByRole('button', { name: 'Start encounter' }).click();
  rejectNextCreate();
  await page.getByRole('dialog').getByRole('button', { name: 'Start encounter' }).click();
  await expect(page).toHaveURL(new RegExp(`/patients/${patientId}/summary$`));
  await expect(page.getByText(/eligibility changed|Review the current state/)).toBeVisible();
  await expect(page.getByText(/Encounter opened|Action result/)).toHaveCount(0);
  expect(seen.filter((item) => item.path === '/encounters' && item.method === 'POST')).toHaveLength(
    1,
  );
});
