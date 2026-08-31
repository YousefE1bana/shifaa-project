import React, { useEffect } from 'react';
import { AppState } from 'react-native';

import { createPatientSessionClient } from './identity-continuity-api';
import {
  patientAccessTokens,
  patientNativeRefreshTokens,
  patientPlatform,
} from './patient-auth-store';

export const ACCESS_TOKEN_REFRESH_INTERVAL_MS = 14 * 60 * 1_000;

export const patientSessionRuntime = createPatientSessionClient({
  platform: patientPlatform,
  locale: 'ar-EG',
  accessTokens: patientAccessTokens,
  ...(patientPlatform === 'native' ? { nativeRefreshTokens: patientNativeRefreshTokens } : {}),
});

export function PatientSessionLifecycle() {
  useEffect(() => {
    let disposed = false;
    let refreshing = false;
    let refreshTimer: ReturnType<typeof setTimeout> | undefined;
    let refresh: () => Promise<void>;
    const scheduleRefresh = () => {
      if (refreshTimer) clearTimeout(refreshTimer);
      if (!disposed) refreshTimer = setTimeout(refresh, ACCESS_TOKEN_REFRESH_INTERVAL_MS);
    };
    refresh = async () => {
      if (disposed || refreshing) return;
      if (refreshTimer) clearTimeout(refreshTimer);
      refreshing = true;
      try {
        await patientSessionRuntime.controller.refresh(
          {
            appState: AppState.currentState === 'active' ? 'active' : 'inactive',
            documentVisible:
              typeof document === 'undefined' || document.visibilityState === 'visible',
            windowFocused: typeof document === 'undefined' || document.hasFocus(),
            userEngaged: true,
          },
          typeof navigator === 'undefined' || navigator.onLine,
        );
      } catch {
        // Any refresh ambiguity must remove bearer authority until a later foreground reconciliation.
        patientSessionRuntime.controller.reconcile(undefined);
      } finally {
        refreshing = false;
        scheduleRefresh();
      }
    };
    const appStateSubscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') void refresh();
    });
    const visibilityListener = () => {
      if (document.visibilityState === 'visible') void refresh();
    };
    if (typeof document !== 'undefined')
      document.addEventListener('visibilitychange', visibilityListener);
    void refresh();
    return () => {
      disposed = true;
      if (refreshTimer) clearTimeout(refreshTimer);
      appStateSubscription.remove();
      if (typeof document !== 'undefined')
        document.removeEventListener('visibilitychange', visibilityListener);
    };
  }, []);
  return null;
}
