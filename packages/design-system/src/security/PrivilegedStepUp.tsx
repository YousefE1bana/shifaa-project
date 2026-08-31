import React, { useEffect, useRef } from 'react';
import { View } from 'react-native';

import { SecurityStatusBanner } from './SecurityExperience.tsx';
import {
  privilegedAccessState,
  type PrivilegedAccessContext,
  type PrivilegedAccessState,
} from './privileged-access-policy.ts';

export {
  privilegedAccessState,
  type PrivilegedAccessContext,
  type PrivilegedAccessState,
} from './privileged-access-policy.ts';

export type PrivilegedStepUpMessages = Readonly<
  Record<Exclude<PrivilegedAccessState, 'allowed'>, string> & { action: string }
>;

export function PrivilegedStepUpBoundary({
  context,
  messages,
  direction,
  onLoginOrVerifyOtp,
  onResumeIntendedAction,
  children,
}: {
  context: PrivilegedAccessContext;
  messages: PrivilegedStepUpMessages;
  direction: 'rtl' | 'ltr';
  onLoginOrVerifyOtp: () => void;
  onResumeIntendedAction?: () => void;
  children: React.ReactNode;
}) {
  const state = privilegedAccessState(context);
  const previousState = useRef(state);
  const contentRef = useRef<{ focus?: () => void } | null>(null);

  useEffect(() => {
    if (previousState.current !== 'allowed' && state === 'allowed') {
      contentRef.current?.focus?.();
      onResumeIntendedAction?.();
    }
    previousState.current = state;
  }, [onResumeIntendedAction, state]);

  if (state !== 'allowed') {
    return (
      <SecurityStatusBanner
        tone="danger"
        title={messages[state]}
        actionLabel={messages.action}
        onAction={onLoginOrVerifyOtp}
        direction={direction}
        focusKey={state}
      />
    );
  }

  return (
    <View ref={contentRef as never} accessible accessibilityRole="summary" tabIndex={-1}>
      {children}
    </View>
  );
}
