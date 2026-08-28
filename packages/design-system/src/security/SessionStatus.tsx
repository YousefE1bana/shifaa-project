import React from 'react';

import { SecurityStatusBanner } from './SecurityExperience.tsx';

export type SessionStatusState = 'expired' | 'degraded' | 'offline';

export function SessionStatus({
  state,
  title,
  detail,
  actionLabel,
  onAction,
  direction,
}: {
  state: SessionStatusState;
  title: string;
  detail: string;
  actionLabel?: string;
  onAction?: () => void;
  direction: 'rtl' | 'ltr';
}) {
  return (
    <SecurityStatusBanner
      tone={state === 'offline' ? 'offline' : 'danger'}
      title={title}
      detail={detail}
      actionLabel={actionLabel}
      onAction={onAction}
      direction={direction}
      focusKey={state}
    />
  );
}
