import { useCallback, useEffect, useState } from 'react';

export type SecurityAuthorityState = Readonly<{
  online: boolean;
  reconciliationRequired: boolean;
  sessionCurrent: boolean;
  authorityCurrent: boolean;
}>;

export function securityMutationAllowed(state: SecurityAuthorityState): boolean {
  return (
    state.online && !state.reconciliationRequired && state.sessionCurrent && state.authorityCurrent
  );
}

export function useSecurityConnection(onlineOverride?: boolean) {
  const [online, setOnline] = useState(
    onlineOverride ?? (typeof navigator === 'undefined' ? true : navigator.onLine),
  );
  const [reconnectVersion, setReconnectVersion] = useState(0);
  const [reconciledVersion, setReconciledVersion] = useState(0);

  useEffect(() => {
    if (onlineOverride !== undefined) setOnline(onlineOverride);
  }, [onlineOverride]);

  useEffect(() => {
    if (onlineOverride !== undefined || typeof window === 'undefined') return undefined;
    const offline = () => setOnline(false);
    const reconnect = () => {
      setOnline(true);
      setReconnectVersion((version) => version + 1);
    };
    window.addEventListener('offline', offline);
    window.addEventListener('online', reconnect);
    return () => {
      window.removeEventListener('offline', offline);
      window.removeEventListener('online', reconnect);
    };
  }, [onlineOverride]);

  const markReconciled = useCallback(
    () => setReconciledVersion(reconnectVersion),
    [reconnectVersion],
  );
  return {
    online,
    reconnectVersion,
    reconciliationRequired: reconnectVersion !== reconciledVersion,
    markReconciled,
  };
}
