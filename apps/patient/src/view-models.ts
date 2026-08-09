export type AsyncState =
  | 'loading'
  | 'empty'
  | 'ready'
  | 'offline'
  | 'error'
  | 'permission'
  | 'success';
export type AuthState = AsyncState | 'otp' | 'rate_limited';
export type ProfileState = AsyncState | 'conflict';
export type IdentityState =
  | AsyncState
  | 'pending'
  | 'manual_review'
  | 'quarantine'
  | 'verified'
  | 'rejected'
  | 'failed';
export type ConsentState = AsyncState | 'saved';

export const authStates: readonly AuthState[] = [
  'loading',
  'empty',
  'ready',
  'offline',
  'error',
  'permission',
  'success',
  'otp',
  'rate_limited',
];
export const profileStates: readonly ProfileState[] = [
  'loading',
  'empty',
  'ready',
  'offline',
  'error',
  'permission',
  'success',
  'conflict',
];
export const identityStates: readonly IdentityState[] = [
  'loading',
  'empty',
  'ready',
  'offline',
  'error',
  'permission',
  'success',
  'pending',
  'manual_review',
  'quarantine',
  'verified',
  'rejected',
  'failed',
];
export const consentStates: readonly ConsentState[] = [
  'loading',
  'empty',
  'ready',
  'offline',
  'error',
  'permission',
  'success',
  'saved',
];

export const commonStateMessage = <
  EmptyKey extends string,
  SuccessKey extends string = 'state.success',
>(
  state: AsyncState,
  emptyKey: EmptyKey,
  successKey: SuccessKey = 'state.success' as SuccessKey,
) =>
  (
    ({
      loading: 'state.loading',
      empty: emptyKey,
      ready: null,
      offline: 'state.offline',
      error: 'state.unavailable',
      permission: 'state.permission',
      success: successKey,
    }) as const
  )[state];

export const authStateMessage = (state: AuthState) =>
  state === 'otp'
    ? null
    : state === 'rate_limited'
      ? 'auth.rate'
      : commonStateMessage(state, 'auth.explainer', 'auth.success');
export const profileStateMessage = (state: ProfileState) =>
  state === 'conflict'
    ? 'profile.conflict'
    : commonStateMessage(state, 'profile.empty', 'profile.saved');
export const identityStateMessage = (state: IdentityState) =>
  (
    ({
      pending: 'identity.pending',
      manual_review: 'identity.manual_review',
      quarantine: 'identity.quarantine',
      verified: 'identity.verified',
      rejected: 'identity.rejected',
      failed: 'identity.failed',
    }) as const
  )[state as 'pending' | 'manual_review' | 'quarantine' | 'verified' | 'rejected' | 'failed'] ??
  commonStateMessage(state as AsyncState, 'identity.empty');
export const consentStateMessage = (state: ConsentState) =>
  state === 'saved' ? 'privacy.saved' : commonStateMessage(state, 'privacy.empty', 'privacy.saved');

export type IdentityProjection = {
  id: string;
  identityType: 'egyptian_national_id' | 'passport' | 'unhcr_card';
  maskedValue: string;
  status: Exclude<IdentityState, AsyncState | 'quarantine'>;
  nextAction?: string;
};

export const identityProjectionText = (projection: IdentityProjection) =>
  `${projection.identityType}|${projection.maskedValue}|${projection.status}|${projection.nextAction ?? ''}`;

export type ConsentChoice = {
  purposeCode: string;
  decision: 'granted' | 'refused' | 'withdrawn';
  version: number;
};

export const saveableConsentChoices = (choices: readonly ConsentChoice[], online: boolean) => {
  if (!online) return { queued: false, saved: [], reason: 'offline' as const };
  return { queued: false, saved: choices.map((choice) => ({ ...choice })), reason: null };
};

export const resolveProfileConflict = (serverVersion: number, submittedVersion: number) =>
  serverVersion === submittedVersion ? 'save' : 'refresh';
