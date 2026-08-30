'use client';

import { type PrivilegedAccessContext } from '@shifaa/design-system/security/privileged-access-policy';
import { PrivilegedStepUpWebBoundary } from '@shifaa/design-system/security/privileged-step-up-web';
import { directionFor, privilegedStepUpMessages, type Locale } from '@shifaa/i18n';
import React from 'react';

export function SecurityStepUpShell(props: {
  locale: Locale;
  context: PrivilegedAccessContext;
  onLoginOrVerifyOtp: () => void;
  onResumeIntendedAction?: () => void;
  children: React.ReactNode;
}) {
  return (
    <PrivilegedStepUpWebBoundary
      {...props}
      messages={privilegedStepUpMessages(props.locale)}
      direction={directionFor(props.locale)}
    />
  );
}

export function AppSecurityStepUpBoundary({ children }: { children: React.ReactNode }) {
  const syntheticOnly = process.env['NODE_ENV'] !== 'production';
  return (
    <SecurityStepUpShell
      locale="ar-EG"
      context={{
        authAvailable: syntheticOnly,
        aal: syntheticOnly ? 'aal2' : 'aal1',
        amrAgeSeconds: syntheticOnly ? 0 : null,
        purpose: syntheticOnly ? 'seeded_synthetic_staff' : null,
        reason: syntheticOnly ? 'seeded_synthetic_session' : null,
      }}
      onLoginOrVerifyOtp={() =>
        globalThis.dispatchEvent(new Event('shifaa:login-or-verify-otp-requested'))
      }
    >
      {children}
    </SecurityStepUpShell>
  );
}
