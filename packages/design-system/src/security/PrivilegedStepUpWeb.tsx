'use client';

import React, { useEffect, useRef } from 'react';

import { color, localizedType, minimumTargetSize, radius, spacing } from '../tokens.ts';
import {
  privilegedAccessState,
  type PrivilegedAccessContext,
  type PrivilegedAccessState,
} from './privileged-access-policy.ts';

type Messages = Readonly<
  Record<Exclude<PrivilegedAccessState, 'allowed'>, string> & { action: string }
>;

export function PrivilegedStepUpWebBoundary({
  context,
  messages,
  direction,
  onLoginOrVerifyOtp,
  onResumeIntendedAction,
  children,
}: {
  context: PrivilegedAccessContext;
  messages: Messages;
  direction: 'rtl' | 'ltr';
  onLoginOrVerifyOtp: () => void;
  onResumeIntendedAction?: () => void;
  children: React.ReactNode;
}) {
  const state = privilegedAccessState(context);
  const previousState = useRef(state);
  const contentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (previousState.current !== 'allowed' && state === 'allowed') {
      contentRef.current?.focus();
      onResumeIntendedAction?.();
    }
    previousState.current = state;
  }, [onResumeIntendedAction, state]);

  if (state !== 'allowed') {
    return (
      <section
        role="alert"
        dir={direction}
        style={{
          ...localizedType(direction === 'rtl' ? 'ar-EG' : 'en-EG', 'body'),
          margin: spacing.lg,
          padding: spacing.lg,
          border: `2px solid ${color.danger}`,
          borderRadius: radius.card,
          color: color.ink,
          background: color.surface,
        }}
      >
        <h1 style={localizedType(direction === 'rtl' ? 'ar-EG' : 'en-EG', 'title')}>
          {messages[state]}
        </h1>
        <button
          type="button"
          onClick={onLoginOrVerifyOtp}
          style={{
            minHeight: minimumTargetSize,
            border: 0,
            borderRadius: radius.control,
            paddingInline: spacing.lg,
            background: color.brand,
            color: color.inverse,
            font: 'inherit',
            fontWeight: 800,
          }}
        >
          {messages.action}
        </button>
      </section>
    );
  }

  return (
    <div ref={contentRef} tabIndex={-1}>
      {children}
    </div>
  );
}
