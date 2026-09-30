import { expect, type Locator, type Page, type Route } from 'playwright/test';

export type Feature010Locale = 'ar-EG' | 'en-EG';
export type Feature010Viewport = { width: number; height: number };

const viewportDefault = { width: 768, height: 1024 };
const privateHeaders = { 'cache-control': 'private, no-store' };
const json = (route: Route, status: number, value: unknown) =>
  route.fulfill({
    status,
    contentType: 'application/json',
    headers: privateHeaders,
    body: JSON.stringify(value),
  });

async function installClinicRoute(
  page: Page,
  response: (path: string, method: string, url: URL) => Promise<unknown> | unknown,
) {
  await page.route('**/v1/**', async (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname.replace(/^\/v1/, '');
    const result = await response(path, route.request().method(), url);
    if (result === undefined) return json(route, 404, { status: 404, title: 'Not found' });
    return json(route, 200, result);
  });
}

async function openClinicRoute(
  page: Page,
  locale: Feature010Locale,
  viewport: Feature010Viewport | undefined,
  path: string,
  activeView: () => Locator,
) {
  await page.setViewportSize(viewport ?? viewportDefault);
  await page.goto(path);
  if (locale === 'en-EG') {
    const english = page.getByRole('button', { name: 'English' });
    await english.click();
    await expect(page.locator('html')).toHaveAttribute('lang', 'en-EG');
    await expect(page.locator('html')).toHaveAttribute('dir', 'ltr');
  }
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
  await expect(activeView()).toBeVisible();
}

export async function openClinicSummary(
  page: Page,
  locale: Feature010Locale,
  viewport?: Feature010Viewport,
) {
  const patientId = '92000000-0000-4000-8000-000000000001';
  const facilityId = '90000000-0000-4000-8000-000000000001';
  const doctorId = '91000000-0000-4000-8000-000000000001';
  const appointmentId = '93000000-0000-4000-8000-000000000001';
  const queueEntryId = '94000000-0000-4000-8000-000000000001';
  const civilDate = '2026-09-29';
  await installClinicRoute(page, (path) => {
    if (path === '/auth/login')
      return { kind: 'challenge', challenge_id: '96000000-0000-4000-8000-000000000099' };
    if (path === '/auth/otp/verify')
      return { kind: 'session', access_token: 'synthetic-staff-token', aal: 2 };
    if (path === '/appointments')
      return {
        items: [
          {
            id: appointmentId,
            patientId,
            facilityId,
            doctorId,
            startsAt: `${civilDate}T09:00:00+03:00`,
            endsAt: `${civilDate}T09:30:00+03:00`,
            timezone: 'Africa/Cairo',
            civilDate,
            status: 'checked_in',
            version: 1,
          },
        ],
        freshness: 'fresh',
      };
    if (path.startsWith(`/clinics/${facilityId}/queues`))
      return {
        facilityId,
        doctorId,
        civilDate,
        version: 1,
        freshness: 'fresh',
        entries: [
          {
            id: queueEntryId,
            appointmentId,
            facilityId,
            doctorId,
            civilDate,
            state: 'called',
            queueNumber: 14,
            position: 1,
            version: 1,
          },
        ],
      };
    return undefined;
  });
  await openClinicRoute(page, locale, viewport, `/patients/${patientId}/summary`, () =>
    page.getByText(appointmentId),
  );
}

export async function openClinicEncounter(
  page: Page,
  locale: Feature010Locale,
  viewport?: Feature010Viewport,
) {
  const encounterId = '95000000-0000-4000-8000-000000000001';
  const patientId = '92000000-0000-4000-8000-000000000001';
  const facilityId = '90000000-0000-4000-8000-000000000001';
  const appointmentId = '93000000-0000-4000-8000-000000000001';
  const responsibleId = '96000000-0000-4000-8000-000000000001';
  await installClinicRoute(page, (path) => {
    if (path === '/auth/login')
      return { kind: 'challenge', challenge_id: '96000000-0000-4000-8000-000000000099' };
    if (path === '/auth/otp/verify')
      return { kind: 'session', access_token: 'synthetic-staff-token', aal: 2 };
    if (path === `/encounters/${encounterId}`)
      return {
        id: encounterId,
        patientId,
        facilityId,
        appointmentId,
        encounterType: 'consultation',
        responsibleClinicianId: responsibleId,
        status: 'open',
        startedAt: '2026-09-29T09:00:00+03:00',
        version: 1,
        notes: [],
        participants: [
          {
            personId: responsibleId,
            roleCode: 'responsible_clinician',
            startedAt: '2026-09-29T09:00:00+03:00',
          },
        ],
      };
    return undefined;
  });
  await openClinicRoute(page, locale, viewport, `/encounters/${encounterId}`, () =>
    page.getByRole('heading', {
      name: locale === 'en-EG' ? 'Participants' : 'المشاركون',
    }),
  );
}

export async function openClinicReferrals(
  page: Page,
  locale: Feature010Locale,
  viewport?: Feature010Viewport,
) {
  const encounterId = '95000000-0000-4000-8000-000000000001';
  const referralId = '97000000-0000-4000-8000-000000000001';
  const updatedAt = '2026-09-29T09:30:00+03:00';
  await installClinicRoute(page, (path, method) => {
    if (path === '/auth/login')
      return { kind: 'challenge', challenge_id: '96000000-0000-4000-8000-000000000099' };
    if (path === '/auth/otp/verify')
      return { kind: 'session', access_token: 'synthetic-clinic-token', aal: 2 };
    if (path === '/referrals' && method === 'GET')
      return {
        data: [
          {
            id: referralId,
            sourceEncounterId: encounterId,
            status: 'pending',
            version: 1,
            targetSpecialty: 'Cardiology',
            reasonSummary: 'Synthetic referral reason for browser verification.',
            privateNote: 'SYNTHETIC_PRIVATE_NOTE_CANARY',
            targetFacilityName: 'MUST_NOT_RENDER_FACILITY_NAME',
          },
        ],
        meta: { nextCursor: null, lastUpdatedAt: updatedAt, stale: false },
      };
    return undefined;
  });
  await openClinicRoute(page, locale, viewport, '/referrals', () => page.getByText(referralId));
}

export async function openClinicMessages(
  page: Page,
  locale: Feature010Locale,
  viewport?: Feature010Viewport,
) {
  const encounterId = '95000000-0000-4000-8000-000000000001';
  const appointmentId = '93000000-0000-4000-8000-000000000001';
  const patientId = '92000000-0000-4000-8000-000000000001';
  const staffId = '96000000-0000-4000-8000-000000000001';
  const messageId = '98000000-0000-4000-8000-000000000001';
  const updatedAt = '2026-09-29T09:30:00+03:00';
  await installClinicRoute(page, (path) => {
    if (path === '/auth/login')
      return { kind: 'challenge', challenge_id: '96000000-0000-4000-8000-000000000099' };
    if (path === '/auth/otp/verify')
      return { kind: 'session', access_token: 'synthetic-clinic-token', aal: 2 };
    if (path === '/people/me') return { id: staffId, display_name: 'discarded' };
    if (path === `/encounters/${encounterId}`)
      return {
        id: encounterId,
        patientId,
        appointmentId,
        status: 'open',
        endedAt: null,
        participants: [
          {
            personId: staffId,
            roleCode: 'responsible_clinician',
            startedAt: '2026-09-29T09:00:00+03:00',
            endedAt: null,
          },
        ],
        clinicalMetadata: 'SYNTHETIC_CLINICAL_CANARY',
      };
    if (path === `/contexts/appointment/${appointmentId}/messages`)
      return {
        data: [
          {
            id: messageId,
            contextType: 'appointment',
            contextId: appointmentId,
            senderId: staffId,
            body: 'Synthetic canonical history message.',
            sentAt: updatedAt,
            privateNote: 'SYNTHETIC_PRIVATE_MESSAGE_CANARY',
            patientName: 'SYNTHETIC_PATIENT_NAME_CANARY',
          },
        ],
        meta: { nextCursor: null, lastUpdatedAt: updatedAt, stale: false },
      };
    return undefined;
  });
  await page.setViewportSize(viewport ?? viewportDefault);
  await page.goto('/messages');
  if (locale === 'en-EG') {
    await page.getByRole('button', { name: 'English' }).click();
    await expect(page.locator('html')).toHaveAttribute('lang', 'en-EG');
    await expect(page.locator('html')).toHaveAttribute('dir', 'ltr');
  }
  const words =
    locale === 'en-EG'
      ? {
          handle: 'Sign-in handle',
          password: 'Password',
          next: 'Continue',
          otp: 'Verification code',
          verify: 'Verify',
          encounter: 'Encounter ID',
          appointment: 'Appointment ID',
          confirm: 'Verify selected context',
        }
      : {
          handle: 'وسيلة الدخول',
          password: 'كلمة المرور',
          next: 'متابعة',
          otp: 'رمز التحقق',
          verify: 'تحقق',
          encounter: 'معرّف الزيارة',
          appointment: 'معرّف الموعد',
          confirm: 'تحقق من السياق المحدد',
        };
  await page.getByLabel(words.handle).fill('synthetic-clinic-staff');
  await page.getByLabel(words.password).fill('synthetic-password');
  await page.getByRole('button', { name: words.next }).click();
  await page.getByLabel(words.otp).fill('123456');
  await page.getByRole('button', { name: words.verify }).click();
  await expect(
    page.getByRole('heading', {
      name: locale === 'en-EG' ? 'Appointment-context messages' : 'رسائل سياق الموعد',
    }),
  ).toBeVisible();
  await page.getByLabel(words.encounter).fill(encounterId);
  await page.getByLabel(words.appointment).fill(appointmentId);
  await page.getByRole('button', { name: words.confirm }).click();
  await expect(page.getByText('Synthetic canonical history message.')).toBeVisible();
}

async function installPatientApi(page: Page) {
  const patientId = 'a1000000-0000-4000-8000-000000000022';
  const referralId = 'a1000000-0000-4000-8000-000000000020';
  const sourceEncounterId = 'a1000000-0000-4000-8000-000000000025';
  const appointmentId = 'a1000000-0000-4000-8000-000000000021';
  const facilityId = 'a1000000-0000-4000-8000-000000000023';
  const doctorId = 'a1000000-0000-4000-8000-000000000024';
  const reasonSummary = 'Synthetic referral reason for browser verification.';
  const startsAt = '2026-10-05T10:00:00Z';
  const endsAt = '2026-10-05T10:20:00Z';
  let resolveRefresh!: () => void;
  const refreshDone = new Promise<void>((resolve) => (resolveRefresh = resolve));
  await page.context().addCookies([
    {
      name: 'shifaa_csrf',
      value: 'synthetic-csrf',
      domain: '127.0.0.1',
      path: '/',
      sameSite: 'Lax',
      httpOnly: false,
      secure: false,
    },
  ]);
  await page.route('**/v1/**', async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (path === '/v1/auth/session/refresh') {
      await json(route, 200, {
        accessToken: 'synthetic-local-only-token',
        sessionId: 'a1000000-0000-4000-8000-000000000099',
        assurance: 'aal1',
        expiresAt: '2026-09-29T10:00:00Z',
      });
      resolveRefresh();
      return;
    }
    if (path === '/v1/people/me')
      return json(route, 200, {
        id: patientId,
        display_name: 'Synthetic Patient',
        birth_date: null,
        nationality_code: 'EG',
        preferred_locale: 'en-EG',
        verification_status: 'unverified',
        version: 1,
      });
    if (path === '/v1/referrals') {
      await refreshDone;
      return json(route, 200, {
        data: [
          {
            id: referralId,
            sourceEncounterId,
            status: 'pending',
            version: 1,
            targetSpecialty: 'cardiology',
            reasonSummary,
            encounterType: 'general',
            privateNoteBody: 'PRIVATE SOURCE ONLY SYNTHETIC SECRET',
            privateNoteCount: 1,
            sourceOnlyMetadata: 'SYNTHETIC SOURCE-ONLY METADATA',
          },
        ],
        meta: { nextCursor: null, lastUpdatedAt: '2026-09-29T08:00:00Z', stale: false },
      });
    }
    if (path === '/v1/encounters/a1000000-0000-4000-8000-000000000010') {
      await refreshDone;
      return json(route, 200, {
        id: 'a1000000-0000-4000-8000-000000000010',
        patientId: 'a1000000-0000-4000-8000-000000000011',
        facilityId: 'a1000000-0000-4000-8000-000000000012',
        appointmentId: 'a1000000-0000-4000-8000-000000000013',
        encounterType: 'general',
        responsibleClinicianId: 'a1000000-0000-4000-8000-000000000014',
        status: 'open',
        startedAt: '2030-01-07T09:00:00Z',
        version: 1,
        notes: [
          {
            id: 'a1000000-0000-4000-8000-000000000015',
            encounterId: 'a1000000-0000-4000-8000-000000000010',
            authorId: 'a1000000-0000-4000-8000-000000000014',
            noteType: 'assessment',
            visibility: 'patient_visible',
            signedAt: '2030-01-07T09:10:00Z',
            body: 'Released synthetic note',
          },
          {
            id: 'a1000000-0000-4000-8000-000000000016',
            encounterId: 'a1000000-0000-4000-8000-000000000010',
            authorId: 'a1000000-0000-4000-8000-000000000014',
            noteType: 'internal',
            visibility: 'private',
            signedAt: '2030-01-07T09:11:00Z',
            body: 'PRIVATE TEST SECRET',
          },
        ],
      });
    }
    if (path === '/v1/contexts/appointment/a1000000-0000-4000-8000-000000000013/messages')
      return json(route, 200, {
        data: [
          {
            id: 'a1000000-0000-4000-8a00-000000000001',
            contextType: 'appointment',
            contextId: 'a1000000-0000-4000-8000-000000000013',
            senderId: 'a1000000-0000-4000-8000-000000000014',
            body: 'Synthetic clinician message.',
            sentAt: '2030-01-07T09:15:00Z',
          },
        ],
        meta: { nextCursor: null, lastUpdatedAt: '2030-01-07T09:15:00Z', stale: false },
      });
    return json(route, 200, {});
  });
}

export async function openPatientRecords(
  page: Page,
  locale: Feature010Locale,
  viewport?: Feature010Viewport,
) {
  await page.setViewportSize(viewport ?? viewportDefault);
  await page.addInitScript((value) => localStorage.setItem('shifaa.patient.locale', value), locale);
  await installPatientApi(page);
  const refreshed = page.waitForResponse((response) =>
    response.url().endsWith('/v1/auth/session/refresh'),
  );
  await page.goto('/records');
  expect((await refreshed).status()).toBe(200);
  await page.waitForTimeout(50);
  const reread = page.waitForResponse(
    (response) => new URL(response.url()).pathname === '/v1/referrals',
  );
  await page.evaluate(() => window.dispatchEvent(new Event('online')));
  expect((await reread).status()).toBe(200);
  await expect(
    page.getByRole('button', { name: locale === 'ar-EG' ? 'مراجعة الإحالة' : 'Review referral' }),
  ).toBeVisible();
}

export async function openPatientEncounter(
  page: Page,
  locale: Feature010Locale,
  viewport?: Feature010Viewport,
) {
  const encounterId = 'a1000000-0000-4000-8000-000000000010';
  await page.setViewportSize(viewport ?? viewportDefault);
  await page.addInitScript((value) => localStorage.setItem('shifaa.patient.locale', value), locale);
  await installPatientApi(page);
  const refreshed = page.waitForResponse((response) =>
    response.url().endsWith('/v1/auth/session/refresh'),
  );
  await page.goto(`/encounters/${encounterId}`);
  expect((await refreshed).status()).toBe(200);
  await page.waitForTimeout(50);
  const reread = page.waitForResponse(
    (response) => new URL(response.url()).pathname === `/v1/encounters/${encounterId}`,
  );
  await page.evaluate(() => window.dispatchEvent(new Event('online')));
  expect((await reread).status()).toBe(200);
  await expect(page.getByText('Released synthetic note')).toBeVisible();
  await expect(page.getByText('Synthetic clinician message.')).toBeVisible();
}
