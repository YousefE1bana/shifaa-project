import { createRemoteJWKSet, jwtVerify, type JWTPayload } from 'jose';

import { parseContinuityClaims, type AuthMethodReference } from './identity-continuity.js';

export * from './identity-continuity.js';

export interface VerifiedSupabaseSession {
  subjectId: string;
  sessionId: string;
  aal: 1 | 2;
  amr: readonly AuthMethodReference[];
  payload: JWTPayload;
}

export class SupabaseJwtVerifier {
  private readonly jwks: ReturnType<typeof createRemoteJWKSet>;

  public constructor(
    jwksUrl: string,
    private readonly issuer: string,
    private readonly audience: string,
  ) {
    this.jwks = createRemoteJWKSet(new URL(jwksUrl));
  }

  public async verify(token: string): Promise<VerifiedSupabaseSession | undefined> {
    try {
      const { payload, protectedHeader } = await jwtVerify(token, this.jwks, {
        issuer: this.issuer,
        audience: this.audience,
        algorithms: ['ES256'],
      });
      if (protectedHeader.alg !== 'ES256') return undefined;
      const claims = parseContinuityClaims(payload);
      return claims ? { ...claims, payload } : undefined;
    } catch {
      return undefined;
    }
  }
}
