import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

import { privilegedAccessState } from '@shifaa/design-system/security/privileged-access-policy';
import { directionFor, privilegedStepUpMessages } from '@shifaa/i18n';

const applications = ['admin', 'clinic', 'pharmacy', 'hospital', 'lab'] as const;

test('every workforce and admin shell denies incomplete privileged context', () => {
  const allowed = {
    authAvailable: true,
    aal: 'aal2' as const,
    amrAgeSeconds: 300,
    purpose: 'assigned_sensitive_action',
    reason: 'synthetic-action-reason',
  };
  for (const application of applications) {
    assert.equal(privilegedAccessState({ ...allowed, aal: 'aal1' }), 'aal2-required', application);
    assert.equal(
      privilegedAccessState({ ...allowed, amrAgeSeconds: 301 }),
      'amr-stale',
      application,
    );
    assert.equal(
      privilegedAccessState({ ...allowed, purpose: null }),
      'purpose-required',
      application,
    );
    assert.equal(
      privilegedAccessState({ ...allowed, reason: null }),
      'reason-required',
      application,
    );
    assert.equal(
      privilegedAccessState({ ...allowed, authAvailable: false }),
      'auth-degraded',
      application,
    );
    assert.equal(privilegedAccessState(allowed), 'allowed', application);

    const shell = fs.readFileSync(
      new URL(`../../apps/${application}/src/app/SecurityStepUpShell.tsx`, import.meta.url),
      'utf8',
    );
    assert.match(shell, /onLoginOrVerifyOtp/);
    assert.match(shell, /onResumeIntendedAction/);
    assert.doesNotMatch(shell, /fetch\(|stepUpMfa|\/auth\/mfa\/step/);
  }
});

test('privileged step-up copy has Arabic RTL and English LTR parity', () => {
  for (const locale of ['ar-EG', 'en-EG'] as const) {
    const messages = privilegedStepUpMessages(locale);
    assert.equal(directionFor(locale), locale === 'ar-EG' ? 'rtl' : 'ltr');
    assert.ok(Object.values(messages).every((message) => message.length > 0));
  }
});
