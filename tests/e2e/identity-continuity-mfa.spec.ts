import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { randomUUID } from 'node:crypto';

import {
  buildMfaHarness,
  confirmedSignup,
  currentTotp,
  supabaseStatus,
} from '../../services/api/test/identity-continuity-mfa-harness.js';

const enabled = process.env['SHIFAA_RUN_IDENTITY_CONTINUITY_MFA'] === 'true';

test('real-stack TOTP checkpoint passes in Arabic and English', { skip: !enabled }, async () => {
  const runtime = supabaseStatus();
  const harness = await buildMfaHarness(runtime);
  try {
    for (const locale of ['ar-EG', 'en-EG'] as const) {
      const email = `mfa-e2e-${locale.toLowerCase()}-${randomUUID()}@synthetic.shifaa.test`;
      const actor = await confirmedSignup(runtime, email, 'Synthetic-007-Mfa-E2E!');
      await harness.seedPerson(actor.userId, email);
      const enrollment = await harness.inject({
        method: 'POST',
        url: '/v1/auth/mfa/enroll',
        headers: {
          authorization: `Bearer ${actor.accessToken}`,
          'accept-language': locale,
          'idempotency-key': `mfa-e2e-begin-${randomUUID()}`,
        },
        payload: { factorType: 'totp', friendlyName: `Synthetic ${locale} factor` },
      });
      assert.equal(enrollment.statusCode, 200, enrollment.body);
      assert.equal(enrollment.headers['content-language'], locale);
      assert.equal(enrollment.headers['cache-control'], 'private, no-store');
      const enrollmentBody = enrollment.json();
      assert.match(String(enrollmentBody.qrUri), /^data:image\/svg\+xml/);

      const verification = await harness.inject({
        method: 'POST',
        url: '/v1/auth/mfa/enroll/verify',
        headers: {
          authorization: `Bearer ${actor.accessToken}`,
          'accept-language': locale,
          'idempotency-key': `mfa-e2e-verify-${randomUUID()}`,
        },
        payload: {
          enrollmentId: enrollmentBody.enrollmentId,
          code: currentTotp(String(enrollmentBody.secret)),
        },
      });
      assert.equal(verification.statusCode, 200, verification.body);
      assert.equal(verification.headers['content-language'], locale);
      assert.equal(verification.json().assurance, 'aal2');
      assert.equal('secret' in verification.json().factor, false);
    }

    const patientMfa = fs.readFileSync(
      new URL('../../apps/patient/app/mfa.tsx', import.meta.url),
      'utf8',
    );
    assert.match(patientMfa, /directionFor\(locale\)/);
    assert.match(patientMfa, /cachePolicy="none"/);
    assert.match(patientMfa, /manualSecret/);
    assert.match(patientMfa, /accessibilityLiveRegion/);
    assert.doesNotMatch(patientMfa, /qrcode|qrserver|backgroundSync|queueMutation/i);
  } finally {
    await harness.close();
  }
});
