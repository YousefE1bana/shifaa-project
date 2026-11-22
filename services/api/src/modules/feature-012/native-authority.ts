import { latestQualifyingFactorAt, type ContinuityAuthPort } from '@shifaa/auth';
import type {
  NativeAuthorityBinding,
  NativeAuthorityProfile,
} from '../identity-continuity/types.js';
import { ApiPolicyError } from '../identity-onboarding/errors.js';

const verified = Symbol('server-verified native authority');

export interface ServerVerifiedNativeContext extends NativeAuthorityBinding {
  readonly [verified]: true;
  readonly profile: NativeAuthorityProfile;
  readonly subjectId: string;
  readonly sessionId: string;
  readonly aal: 1 | 2;
  readonly expiresAt: number;
  readonly totpAt: number | null;
}

// The operation supplies this binding from trusted routing and deployment state.
// Verification may fetch signing keys and therefore precedes the transaction.
export async function verifyNativeAuthorityContext(
  auth: Pick<ContinuityAuthPort, 'verifyAccessToken'>,
  accessToken: string,
  binding: NativeAuthorityBinding,
  profile: NativeAuthorityProfile,
): Promise<ServerVerifiedNativeContext> {
  const claims = await auth.verifyAccessToken(accessToken);
  if (!claims) {
    throw new ApiPolicyError('authentication-required', 401, 'Sign in to continue.');
  }

  return Object.freeze({
    ...binding,
    [verified]: true as const,
    profile,
    subjectId: claims.subjectId,
    sessionId: claims.sessionId,
    aal: claims.aal,
    expiresAt: claims.expiresAt,
    totpAt: latestQualifyingFactorAt(claims.amr) ?? null,
  });
}

export function assertNativeAuthorityProfile(
  context: ServerVerifiedNativeContext,
  profile: NativeAuthorityProfile,
): void {
  if (context[verified] !== true || context.profile !== profile) {
    throw new ApiPolicyError('access-denied', 403, 'Current authority is required.');
  }
}
