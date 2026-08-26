import React from 'react';

import { RouteStatePanel } from '../EmergencyFoundation.tsx';

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
    <RouteStatePanel
      title={title}
      detail={detail}
      assertive={state !== 'offline'}
      actionLabel={actionLabel}
      onAction={onAction}
      direction={direction}
    />
  );
}
