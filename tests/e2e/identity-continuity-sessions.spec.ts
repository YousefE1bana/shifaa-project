import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

import { runRealSessionJourney } from '../../services/api/test/identity-continuity-session-harness.js';

const enabled = process.env['SHIFAA_RUN_IDENTITY_CONTINUITY_SESSIONS'] === 'true';

test(
  'real-stack Arabic and English session continuation/revocation checkpoint',
  { skip: !enabled },
  async () => {
    for (const locale of ['ar-EG', 'en-EG'] as const) {
      const evidence = await runRealSessionJourney(locale);
      assert.equal(evidence.nativeRefreshStatus, 200);
      assert.equal(evidence.currentLogoutStatus, 200);
      assert.equal(evidence.secondDeviceContinued, true);
      assert.equal(evidence.globalLogoutStatus, 200);
      assert.equal(evidence.revokedChildStatus, 401);
      assert.equal(evidence.revokedWebChildStatus, 401);
      assert.equal(evidence.webRefreshStatus, 200);
      assert.equal(evidence.webResponseHasRefreshToken, false);
      assert.equal(evidence.webCookieStrict, true);
      assert.equal(evidence.contentLanguage, locale);
      assert.equal(evidence.currentCookieCleared, true);
      assert.equal(evidence.providerRefreshTokenLength, 12);
      assert.equal(evidence.refreshPersistenceCount, 3);
      assert.ok(evidence.auditCount >= 4);
      for (const sentinel of evidence.tokenSentinels) {
        assert.equal(evidence.durableText.includes(sentinel), false);
      }
    }

    const sessionStatus = fs.readFileSync(
      new URL('../../packages/design-system/src/security/SessionStatus.tsx', import.meta.url),
      'utf8',
    );
    const securityExperience = fs.readFileSync(
      new URL('../../packages/design-system/src/security/SecurityExperience.tsx', import.meta.url),
      'utf8',
    );
    const patientClient = fs.readFileSync(
      new URL('../../apps/patient/src/identity-continuity-api.ts', import.meta.url),
      'utf8',
    );
    assert.match(sessionStatus, /SecurityStatusBanner/);
    assert.match(securityExperience, /accessibilityRole/);
    assert.match(securityExperience, /accessibilityLiveRegion/);
    assert.match(securityExperience, /assertive/);
    assert.match(patientClient, /offline-no-queue/);
    assert.doesNotMatch(patientClient, /localStorage|AsyncStorage|backgroundSync|queueMutation/);
  },
);
