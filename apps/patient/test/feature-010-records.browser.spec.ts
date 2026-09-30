import { expect, test, type Page } from 'playwright/test';

const referralId = 'a1000000-0000-4000-8000-000000000020';
const appointmentId = 'a1000000-0000-4000-8000-000000000021';
const patientId = 'a1000000-0000-4000-8000-000000000022';
const facilityId = 'a1000000-0000-4000-8000-000000000023';
const doctorId = 'a1000000-0000-4000-8000-000000000024';
const sourceEncounterId = 'a1000000-0000-4000-8000-000000000025';
const reasonSummary = 'Synthetic referral reason for browser verification.';
const privateSourceText = 'PRIVATE SOURCE ONLY SYNTHETIC SECRET';
const startsAt = '2026-10-05T10:00:00Z';
const endsAt = '2026-10-05T10:20:00Z';

const pendingReferral = {
  id: referralId,
  sourceEncounterId,
  status: 'pending',
  version: 1,
  targetSpecialty: 'cardiology',
  reasonSummary,
  encounterType: 'general',
  privateNoteBody: privateSourceText,
  privateNoteCount: 1,
  sourceOnlyMetadata: 'SYNTHETIC SOURCE-ONLY METADATA',
};

const doctor = {
  doctorId,
  doctorDisplayName: 'Synthetic Doctor',
  specialty: 'cardiology',
  professionalLicenseVerified: true,
  facilityId,
  facilityDisplayName: 'Synthetic Clinic',
  facilityVerified: true,
  feeMinorUnits: 25000,
  currency: 'EGP',
  paymentMethod: 'cash_on_arrival',
  nextAvailableSlot: {
    facilityId,
    doctorId,
    startsAt,
    endsAt,
    timezone: 'Africa/Cairo',
    civilDate: '2026-10-05',
  },
  distanceMeters: null,
  availabilityVersion: 1,
  updatedAt: '2026-09-29T08:00:00Z',
  stale: false,
};

const slot = {
  facilityId,
  doctorId,
  startsAt,
  endsAt,
  timezone: 'Africa/Cairo',
  civilDate: '2026-10-05',
};

type ReadFailure = 'denied' | 'stale' | 'conflict' | 'offline' | null;

async function wireSyntheticApi(page: Page) {
  let failure: ReadFailure = null;
  let accepted = false;
  let resolveRefresh!: () => void;
  const refreshDone = new Promise<void>((resolve) => (resolveRefresh = resolve));
  const acceptBodies: unknown[] = [];

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
    const headers = { 'cache-control': 'private, no-store' };
    if (path === '/v1/auth/session/refresh') {
      await route.fulfill({
        status: 200,
        json: {
          accessToken: 'synthetic-local-only-token',
          sessionId: 'a1000000-0000-4000-8000-000000000099',
          assurance: 'aal2',
          expiresAt: '2026-09-29T10:00:00Z',
        },
        headers,
      });
      resolveRefresh();
      return;
    }
    if (
      (path === '/v1/referrals' || path.startsWith('/v1/referrals/')) &&
      (!request.headers()['x-purpose'] || request.headers()['x-aal'] !== '2')
    ) {
      await route.fulfill({ status: 403, json: { status: 403 }, headers });
      return;
    }
    if (path === '/v1/people/me' && request.method() === 'GET') {
      await route.fulfill({
        status: 200,
        json: {
          id: patientId,
          display_name: 'Synthetic Patient',
          birth_date: null,
          nationality_code: 'EG',
          preferred_locale: 'en-EG',
          verification_status: 'unverified',
          version: 1,
        },
        headers,
      });
      return;
    }
    if (path === '/v1/referrals') {
      await refreshDone;
      if (failure === 'denied') {
        await route.fulfill({ status: 403, json: { code: 'forbidden' }, headers });
      } else if (failure === 'stale' || failure === 'offline') {
        await route.fulfill({ status: 503, json: { code: 'temporarily-unavailable' }, headers });
      } else if (failure === 'conflict') {
        await route.fulfill({ status: 409, json: { code: 'version-conflict' }, headers });
      } else {
        await route.fulfill({
          status: 200,
          json: {
            data: [
              accepted ? { ...pendingReferral, status: 'accepted', version: 2 } : pendingReferral,
            ],
            meta: { nextCursor: null, lastUpdatedAt: '2026-09-29T08:00:00Z', stale: false },
          },
          headers,
        });
      }
      return;
    }
    if (path === `/v1/referrals/${referralId}/accept` && request.method() === 'POST') {
      acceptBodies.push(request.postDataJSON());
      if (failure === 'denied') {
        await route.fulfill({ status: 403, json: { code: 'forbidden' }, headers });
      } else if (failure === 'stale' || failure === 'offline') {
        await route.fulfill({ status: 503, json: { code: 'temporarily-unavailable' }, headers });
      } else if (failure === 'conflict') {
        await route.fulfill({ status: 412, json: { code: 'version-conflict' }, headers });
      } else {
        accepted = true;
        const body = request.postDataJSON() as { authorizedFieldCodes?: string[] };
        await route.fulfill({
          status: 200,
          json: {
            referral: {
              ...pendingReferral,
              status: 'accepted',
              version: 2,
              acceptedFieldCodes: body.authorizedFieldCodes ?? ['reason_summary'],
              resultingAppointmentId: appointmentId,
            },
            appointment: {
              id: appointmentId,
              sourceReferralId: referralId,
              status: 'confirmed',
              facilityId,
              doctorId,
              startsAt,
              endsAt,
              timezone: 'Africa/Cairo',
              civilDate: '2026-10-05',
              feeMinorUnits: 25000,
              currency: 'EGP',
              paymentMethod: 'cash_on_arrival',
              version: 1,
            },
          },
          headers,
        });
      }
      return;
    }
    if (path === '/v1/discovery/doctors') {
      await route.fulfill({
        status: 200,
        json: {
          items: [doctor],
          nextCursor: null,
          freshness: 'fresh',
        },
        headers,
      });
      return;
    }
    if (path === `/v1/clinics/${facilityId}/doctors/${doctorId}/availability`) {
      await route.fulfill({
        status: 200,
        json: {
          items: [slot],
          feeMinorUnits: 25000,
          currency: 'EGP',
          paymentMethod: 'cash_on_arrival',
          version: 1,
          freshness: 'fresh',
        },
        headers,
      });
      return;
    }
    await route.fulfill({ status: 200, json: {}, headers });
  });

  return {
    acceptBodies,
    setFailure: (value: ReadFailure) => (failure = value),
  };
}

async function openRecords(page: Page, locale: 'ar-EG' | 'en-EG', patientContext?: string) {
  await page.addInitScript((value) => localStorage.setItem('shifaa.patient.locale', value), locale);
  const refreshed = page.waitForResponse((response) =>
    response.url().endsWith('/v1/auth/session/refresh'),
  );
  await page.goto(patientContext ? `/records?patientId=${patientContext}` : '/records');
  expect((await refreshed).status()).toBe(200);
  // The initial route read may run before the session refresh installs its in-memory token.
  await page.waitForTimeout(50);
  const reread = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === '/v1/referrals' && response.request().method() === 'GET',
  );
  await page.evaluate(() => window.dispatchEvent(new Event('online')));
  expect((await reread).status()).toBe(200);
}

async function reviewReferral(page: Page) {
  await page
    .getByTestId(`records-referral-card-${referralId}`)
    .getByTestId('records-review')
    .click();
}

async function chooseTargetSlot(page: Page) {
  await page.getByTestId('records-find-slots').click();
  await page.getByTestId('records-target-doctor').click();
  await page.getByTestId('records-target-slot').click();
}

async function completeAcceptance(
  page: Page,
  locale: 'ar-EG' | 'en-EG',
  includeEncounterType: boolean,
) {
  await page.getByTestId('records-reason-authorize').click();
  await page
    .getByTestId(
      includeEncounterType
        ? 'records-encounter-type-choice-include'
        : 'records-encounter-type-choice-exclude',
    )
    .click();
  await chooseTargetSlot(page);
}

for (const locale of ['ar-EG', 'en-EG'] as const) {
  for (const role of ['PAT', 'GUA', 'DEL'] as const) {
    test(`${locale} /records labels ${role} acting role and explicit patient context`, async ({
      page,
    }) => {
      await page.setViewportSize({ width: 360, height: 800 });
      await wireSyntheticApi(page);
      await openRecords(page, locale, role === 'PAT' ? undefined : patientId);
      const roleControl = page.getByTestId(`records-context-role-${role}`);
      await expect(roleControl).toBeVisible();
      await roleControl.click();
      await expect(roleControl).toHaveAttribute('aria-checked', 'true');
      await expect(page.getByTestId('records-context-patient')).toContainText(patientId);
      await expect(page.getByTestId('records-pending-list')).toBeVisible();
      expect(await page.locator('html').getAttribute('dir')).toBe(
        locale === 'ar-EG' ? 'rtl' : 'ltr',
      );
    });
  }

  test(`${locale} referral review and acceptance are keyboard reachable`, async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 800 });
    await wireSyntheticApi(page);
    await openRecords(page, locale);
    const review = page
      .getByTestId(`records-referral-card-${referralId}`)
      .getByTestId('records-review');
    await review.focus();
    await expect(review).toBeFocused();
    await page.keyboard.press('Enter');

    const reason = page.getByTestId('records-reason-authorize');
    await reason.focus();
    await expect(reason).toBeFocused();
    await page.keyboard.press('Space');
    await expect(reason).toHaveAttribute('aria-checked', 'true');
    const includeType = page.getByTestId('records-encounter-type-choice-include');
    await includeType.focus();
    await page.keyboard.press('Space');
    await expect(includeType).toHaveAttribute('aria-checked', 'true');

    await chooseTargetSlot(page);
    const accept = page.getByTestId('records-accept');
    await expect(accept).toBeVisible();
    await accept.focus();
    await expect(accept).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page.getByTestId('records-success-appointment')).toBeVisible();
  });

  for (const viewport of [
    { width: 360, height: 800 },
    { width: 412, height: 915 },
    { width: 768, height: 1024 },
  ]) {
    test(`${locale} /records referral acceptance at ${viewport.width}x${viewport.height}`, async ({
      page,
    }) => {
      await page.setViewportSize(viewport);
      const api = await wireSyntheticApi(page);
      await openRecords(page, locale);
      await expect(page.getByTestId('records-context-role')).toBeVisible();
      await expect(page.getByTestId('records-context-patient')).toBeVisible();
      await expect(page.getByTestId('records-pending-list')).toBeVisible();
      await expect(page.getByText(reasonSummary)).toHaveCount(0);
      await expect(page.getByText(privateSourceText)).toHaveCount(0);
      await expect(page.getByText('SYNTHETIC SOURCE-ONLY METADATA')).toHaveCount(0);
      await expect(page.getByText(/PRIVATE|private note|ملاحظة خاصة/i)).toHaveCount(0);
      expect(await page.locator('html').getAttribute('dir')).toBe(
        locale === 'ar-EG' ? 'rtl' : 'ltr',
      );
      expect(await page.locator('body').evaluate((node) => node.scrollWidth)).toBeLessThanOrEqual(
        viewport.width,
      );

      await reviewReferral(page);
      await expect(page.getByText(reasonSummary)).toHaveCount(1);
      await expect(page.getByText(privateSourceText)).toHaveCount(0);
      await expect(page.getByText('SYNTHETIC SOURCE-ONLY METADATA')).toHaveCount(0);
      await expect(page.getByText(/PRIVATE|private note|ملاحظة خاصة/i)).toHaveCount(0);
      await expect(page.getByTestId('records-reason-authorize')).not.toBeChecked();
      await expect(page.getByTestId('records-encounter-type-choice-include')).not.toBeChecked();
      await expect(page.getByTestId('records-encounter-type-choice-exclude')).not.toBeChecked();

      // The UI must block until both disclosure choices are affirmative and explicit.
      await expect(page.getByTestId('records-find-slots')).toHaveAttribute('aria-disabled', 'true');
      await page.getByTestId('records-reason-authorize').click();
      await expect(page.getByTestId('records-find-slots')).toHaveAttribute('aria-disabled', 'true');
      await page.getByTestId('records-encounter-type-choice-include').click();
      await expect(page.getByTestId('records-find-slots')).not.toHaveAttribute(
        'aria-disabled',
        'true',
      );
      await page.getByTestId('records-encounter-type-choice-exclude').click();
      await expect(page.getByTestId('records-find-slots')).not.toHaveAttribute(
        'aria-disabled',
        'true',
      );
      await page.getByTestId('records-encounter-type-choice-include').click();
      await page.getByTestId('records-find-slots').click();
      await expect(page.getByTestId('records-target-doctor')).toBeVisible();
      await expect(page.getByTestId('records-accept')).toHaveAttribute('aria-disabled', 'true');
      await page.getByTestId('records-target-doctor').click();
      await expect(page.getByTestId('records-accept')).toHaveAttribute('aria-disabled', 'true');
      await page.getByTestId('records-target-slot').click();
      await expect(page.getByTestId('records-accept')).not.toHaveAttribute('aria-disabled', 'true');
      await expect(page.getByTestId('records-booking-terms')).toContainText('EGP');
      await expect(page.getByTestId('records-booking-terms')).toContainText(
        locale === 'en-EG' ? 'Cash on arrival' : 'الدفع نقداً عند الوصول',
      );
      await expect(page.getByTestId('records-booking-terms')).toContainText(
        locale === 'en-EG' ? '250' : '٢٥٠',
      );
      await page.getByTestId('records-accept').click();

      await expect(page.getByTestId('records-success-appointment')).toContainText(
        'Synthetic Clinic',
      );
      await expect(page.getByTestId('records-success-appointment')).toContainText(
        'Synthetic Doctor',
      );
      await expect(page.getByTestId('records-success-appointment')).toContainText(appointmentId);
      await expect(page.getByTestId('records-success-appointment')).toContainText(
        /2026|٢٠٢٦|10:00|١:٠٠|صباح/,
      );
      await expect(page.getByTestId('records-view-appointment')).toBeVisible();
      await expect(page.getByTestId('records-view-appointment')).not.toHaveAttribute(
        'aria-disabled',
        'true',
      );
      expect(api.acceptBodies).toHaveLength(1);
      expect(api.acceptBodies[0]).toMatchObject({
        authorizedFieldCodes: ['reason_summary', 'encounter_type'],
        targetSlot: slot,
      });
    });
  }

  test(`${locale} explicit encounter type exclusion sends only authorized summary`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: 360, height: 800 });
    const api = await wireSyntheticApi(page);
    await openRecords(page, locale);
    await reviewReferral(page);
    await completeAcceptance(page, locale, false);
    await page.getByTestId('records-accept').click();
    expect(api.acceptBodies[0]).toMatchObject({
      authorizedFieldCodes: ['reason_summary'],
      targetSlot: slot,
    });
  });

  for (const failure of ['denied', 'stale', 'conflict', 'offline'] as const) {
    test(`${locale} referral authority and ${failure} failure clear protected content`, async ({
      page,
    }) => {
      await page.setViewportSize({ width: 360, height: 800 });
      const api = await wireSyntheticApi(page);
      await openRecords(page, locale);
      await reviewReferral(page);
      await expect(page.getByText(reasonSummary)).toBeVisible();
      api.setFailure(failure);
      if (failure === 'offline') {
        await page.context().setOffline(true);
        await page.evaluate(() => window.dispatchEvent(new Event('offline')));
      } else {
        await page.getByTestId('records-refresh').click();
      }
      await expect(page.getByText(reasonSummary)).toHaveCount(0);
      await expect(page.getByText(privateSourceText)).toHaveCount(0);
      const mainText = await page.getByRole('main').innerText();
      expect(mainText).not.toContain(reasonSummary);
      expect(mainText).not.toContain('SYNTHETIC SOURCE-ONLY METADATA');
      expect(await page.locator('body').evaluate((node) => node.scrollWidth)).toBeLessThanOrEqual(
        360,
      );
    });
  }

  for (const failure of ['denied', 'conflict'] as const) {
    test(`${locale} failed referral acceptance (${failure}) creates no appointment`, async ({
      page,
    }) => {
      await page.setViewportSize({ width: 360, height: 800 });
      const api = await wireSyntheticApi(page);
      await openRecords(page, locale);
      await reviewReferral(page);
      await completeAcceptance(page, locale, true);
      api.setFailure(failure);
      const accepted = page.waitForResponse(
        (response) =>
          new URL(response.url()).pathname === `/v1/referrals/${referralId}/accept` &&
          response.request().method() === 'POST',
      );
      await expect(page.getByTestId('records-booking-terms')).toContainText('EGP');
      await expect(page.getByTestId('records-booking-terms')).toContainText(
        locale === 'en-EG' ? 'Cash on arrival' : 'الدفع نقداً عند الوصول',
      );
      await expect(page.getByTestId('records-booking-terms')).toContainText(
        locale === 'en-EG' ? '250' : '٢٥٠',
      );
      await page.getByTestId('records-accept').click();
      expect((await accepted).status()).toBe(failure === 'denied' ? 403 : 412);
      await expect(page.getByTestId('records-success-appointment')).toHaveCount(0);
      await expect(page.getByTestId('records-view-appointment')).toHaveCount(0);
      if (failure === 'denied') {
        await expect(page.getByText(reasonSummary)).toHaveCount(0);
        await expect(page.getByText(privateSourceText)).toHaveCount(0);
      }
    });
  }
}

for (const locale of ['ar-EG', 'en-EG'] as const) {
  test(`${locale} same doctor at two facilities keeps slots and server terms scoped to the selected pair`, async ({
    page,
  }) => {
    await wireSyntheticApi(page);
    const secondFacility = 'a1000000-0000-4000-8000-000000000099';
    await page.route('**/v1/discovery/doctors**', async (route) =>
      route.fulfill({
        status: 200,
        json: {
          items: [
            doctor,
            {
              ...doctor,
              facilityId: secondFacility,
              facilityDisplayName: 'Synthetic Second Clinic',
            },
          ],
          nextCursor: null,
          freshness: 'fresh',
        },
        headers: { 'cache-control': 'private, no-store' },
      }),
    );
    await page.route(
      `**/v1/clinics/${secondFacility}/doctors/${doctorId}/availability**`,
      async (route) =>
        route.fulfill({
          status: 200,
          json: {
            items: [{ ...slot, facilityId: secondFacility }],
            feeMinorUnits: 37500,
            currency: 'EGP',
            paymentMethod: 'cash_on_arrival',
            version: 2,
            freshness: 'fresh',
          },
          headers: { 'cache-control': 'private, no-store' },
        }),
    );
    await openRecords(page, locale);
    await reviewReferral(page);
    await page.getByTestId('records-reason-authorize').click();
    await page.getByTestId('records-encounter-type-choice-exclude').click();
    await page.getByTestId('records-find-slots').click();
    const choices = page.getByTestId('records-target-doctor');
    await expect(choices).toHaveCount(2);
    await choices.filter({ hasText: 'Synthetic Second Clinic' }).click();
    await expect(page.getByTestId('records-target-slot')).toHaveCount(1);
    await page.getByTestId('records-target-slot').click();
    const terms = page.getByTestId('records-booking-terms');
    await expect(terms).toContainText('Synthetic Second Clinic');
    await expect(terms).toContainText(locale === 'en-EG' ? '375' : '٣٧٥');
    await expect(terms).toContainText('EGP');
    await choices.filter({ hasText: 'Synthetic Clinic' }).click();
    await expect(terms).toHaveCount(0);
    await expect(page.getByTestId('records-target-slot')).toHaveAttribute('aria-checked', 'false');
    await page.getByTestId('records-target-slot').click();
    await expect(terms).toContainText(locale === 'en-EG' ? '250' : '٢٥٠');
  });
}
