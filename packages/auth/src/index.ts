import { createRemoteJWKSet, jwtVerify, type JWTPayload } from 'jose';

export interface VerifiedSupabaseSession {
  subjectId: string;
  aal: 1 | 2;
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
      if (!payload.sub || protectedHeader.alg !== 'ES256') return undefined;
      const aal = payload['aal'] === 'aal2' ? 2 : 1;
      return { subjectId: payload.sub, aal, payload };
    } catch {
      return undefined;
    }
  }
}
