export type PrivilegedAccessState =
  | 'allowed'
  | 'auth-degraded'
  | 'aal2-required'
  | 'amr-stale'
  | 'purpose-required'
  | 'reason-required';

export type PrivilegedAccessContext = Readonly<{
  authAvailable: boolean;
  aal: 'aal1' | 'aal2';
  amrAgeSeconds: number | null;
  purpose: string | null;
  reason: string | null;
}>;

export function privilegedAccessState(context: PrivilegedAccessContext): PrivilegedAccessState {
  if (!context.authAvailable) return 'auth-degraded';
  if (context.aal !== 'aal2') return 'aal2-required';
  if (
    context.amrAgeSeconds === null ||
    !Number.isFinite(context.amrAgeSeconds) ||
    context.amrAgeSeconds < 0 ||
    context.amrAgeSeconds > 300
  )
    return 'amr-stale';
  if (!context.purpose?.trim()) return 'purpose-required';
  if (!context.reason?.trim()) return 'reason-required';
  return 'allowed';
}
