'use client';

import { PrivilegedStepUpBoundary, type PrivilegedAccessContext } from '@shifaa/design-system';
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
    <PrivilegedStepUpBoundary
      {...props}
      messages={privilegedStepUpMessages(props.locale)}
      direction={directionFor(props.locale)}
    />
  );
}
