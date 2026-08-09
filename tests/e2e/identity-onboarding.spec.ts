import assert from 'node:assert/strict';
import test from 'node:test';

import { buildApp } from '@shifaa/api';

import { PatientOnboardingApi } from '../../apps/patient/src/identity-onboarding-api.ts';

type TestApp = Awaited<ReturnType<typeof buildApp>>['app'];

function fastifyFetch(app: TestApp): typeof fetch {
  return async (input, init) => {
    const url = new URL(String(input));
    const headers = Object.fromEntries(new Headers(init?.headers).entries());
    const response = await app.inject({
      method: (init?.method ?? 'GET') as 'GET' | 'POST' | 'PATCH',
      url: `${url.pathname}${url.search}`,
      headers,
      ...(typeof init?.body === 'string' ? { payload: init.body } : {}),
    });
    return new Response(response.body, {
      status: response.statusCode,
      headers: response.headers as HeadersInit,
    });
  };
}

for (const viewport of [
  { width: 360, height: 800, locale: 'ar-EG', direction: 'rtl' },
  { width: 1440, height: 900, locale: 'en-EG', direction: 'ltr' },
] as const) {
  test(`API-backed registration-to-consent checkpoint ${viewport.width}x${viewport.height} ${viewport.locale}`, async () => {
    const harness = await buildApp();
    const gateway = new PatientOnboardingApi('http://shifaa.test', fastifyFetch(harness.app));
    const handle = `journey-${viewport.width}@synthetic.shifaa.test`;

    await gateway.register(handle, 'Synthetic-Only-2026!', viewport.locale);
    await gateway.verifyOtp('246810');
    const profile = await gateway.getProfile();
    const savedProfile = await gateway.updateProfile({
      display_name: viewport.locale === 'ar-EG' ? 'مريض تجريبي' : 'Synthetic patient',
      preferred_locale: viewport.locale,
    });
    const identity = await gateway.createIdentity({
      identity_type: 'passport',
      value: `SYNTHETIC-PASSPORT-${viewport.width}`,
      issuing_country: 'EG',
    });
    const notice = await gateway.getPrivacyNotice();
    await gateway.recordConsent('care_updates', 'refused');

    assert.equal(profile.version, 1);
    assert.equal(savedProfile.version, 2);
    assert.equal(identity.verification_case.status, 'manual_review');
    assert.equal(notice.locale, viewport.locale);
    assert.equal(viewport.locale === 'ar-EG' ? 'rtl' : 'ltr', viewport.direction);
    assert.ok(
      harness.repository.audits.some((entry) => entry.action === 'identity.registration.created'),
    );
    assert.ok(harness.repository.outbox.some((entry) => entry.eventType === 'consent.changed'));
    await harness.app.close();
  });
}
