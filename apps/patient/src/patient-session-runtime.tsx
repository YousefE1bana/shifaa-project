import React, { useEffect } from 'react';
import { AppState } from 'react-native';

import { createPatientSessionClient } from './identity-continuity-api';
import {
  patientAccessTokens,
  patientNativeRefreshTokens,
  patientPlatform,
} from './patient-auth-store';

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
    const refresh = async () => {
      if (disposed || refreshing) return;
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
      appStateSubscription.remove();
      if (typeof document !== 'undefined')
        document.removeEventListener('visibilitychange', visibilityListener);
    };
  }, []);
  return null;
}
