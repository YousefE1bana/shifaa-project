export interface AuthMethodReference {
  method: string;
  timestamp: number;
}

export interface ContinuityClaims {
  subjectId: string;
  sessionId: string;
  aal: 1 | 2;
  amr: readonly AuthMethodReference[];
}

export interface NativeSessionProjection {
  accessToken: string;
  refreshToken?: string;
  sessionId: string;
  assurance: 'aal1' | 'aal2';
  expiresAt: string;
}

export interface NativeFactorSummary {
  id: string;
  type: 'totp';
  status: 'verified';
  friendlyName: string | null;
  createdAt: string;
}

export interface NativeTotpEnrollment {
  enrollmentId: string;
  secret: string;
  qrUri: string;
}

export interface ContinuityAuthPort {
  refresh(refreshToken: string): Promise<NativeSessionProjection>;
  logout(accessToken: string, scope: 'local' | 'global'): Promise<void>;
  listFactors(accessToken: string): Promise<readonly NativeFactorSummary[]>;
  enrollTotp(accessToken: string, friendlyName?: string): Promise<NativeTotpEnrollment>;
  verifyTotp(accessToken: string, enrollmentId: string, code: string): Promise<NativeFactorSummary>;
  unenrollFactor(accessToken: string, factorId: string): Promise<void>;
  startRecovery(handle: string): Promise<void>;
  updateRecoveredCredential(accessToken: string, newCredential: string): Promise<void>;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function parseContinuityClaims(
  payload: Record<string, unknown>,
): ContinuityClaims | undefined {
  const subjectId = payload['sub'];
  const sessionId = payload['session_id'];
  const rawAal = payload['aal'];
  const rawAmr = payload['amr'];
  if (typeof subjectId !== 'string' || !UUID.test(subjectId)) return undefined;
  if (typeof sessionId !== 'string' || !UUID.test(sessionId)) return undefined;
  if (rawAal !== 'aal1' && rawAal !== 'aal2') return undefined;
  if (!Array.isArray(rawAmr)) return undefined;
  const amr: AuthMethodReference[] = [];
  for (const entry of rawAmr) {
    if (!entry || typeof entry !== 'object') return undefined;
    const method = (entry as Record<string, unknown>)['method'];
    const timestamp = (entry as Record<string, unknown>)['timestamp'];
    if (
      typeof method !== 'string' ||
      method.length === 0 ||
      !Number.isInteger(timestamp) ||
      (timestamp as number) < 0
    )
      return undefined;
    amr.push({ method, timestamp: timestamp as number });
  }
  return { subjectId, sessionId, aal: rawAal === 'aal2' ? 2 : 1, amr };
}

export function latestQualifyingFactorAt(amr: readonly AuthMethodReference[]): number | undefined {
  const timestamps = amr
    .filter((entry) => entry.method === 'totp')
    .map((entry) => entry.timestamp)
    .filter((value) => Number.isInteger(value) && value >= 0);
  return timestamps.length ? Math.max(...timestamps) : undefined;
}
