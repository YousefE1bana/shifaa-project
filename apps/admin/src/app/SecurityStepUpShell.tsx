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
