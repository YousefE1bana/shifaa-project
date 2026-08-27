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

export interface NativeRecoveryOtpSession {
  subjectId: string;
  handle: string;
  session: NativeSessionProjection;
}

export interface NativeFactorSummary {
  id: string;
  type: 'totp';
  status: 'verified';
  friendlyName: string | null;
  createdAt: string;
}

export interface NativeFactorSummaryTransport {
  listFactors(accessToken: string): Promise<unknown>;
}

export class NativeFactorSummaryReader {
  public constructor(private readonly transport: NativeFactorSummaryTransport) {}

  public async list(accessToken: string): Promise<readonly NativeFactorSummary[]> {
    const response = await this.transport.listFactors(accessToken);
    if (!response || typeof response !== 'object')
      throw new Error('native-factor-response-invalid');
    const rawFactors = (response as { factors?: unknown }).factors;
    if (!Array.isArray(rawFactors)) throw new Error('native-factor-response-invalid');
    return rawFactors.flatMap((value): NativeFactorSummary[] => {
      if (!value || typeof value !== 'object') return [];
      const factor = value as Record<string, unknown>;
      if (
        typeof factor['id'] !== 'string' ||
        !UUID.test(factor['id']) ||
        factor['factor_type'] !== 'totp' ||
        factor['status'] !== 'verified' ||
        (factor['friendly_name'] !== null && typeof factor['friendly_name'] !== 'string') ||
        typeof factor['created_at'] !== 'string'
      ) {
        return [];
      }
      return [
        {
          id: factor['id'],
          type: 'totp',
          status: 'verified',
          friendlyName: factor['friendly_name'] as string | null,
          createdAt: factor['created_at'],
        },
      ];
    });
  }
}

export interface NativeTotpEnrollment {
  enrollmentId: string;
  secret: string;
  qrUri: string;
}

export interface VerifiedContinuitySession extends ContinuityClaims {
  expiresAt: number;
}

export interface ContinuityAuthPort {
  verifyAccessToken(accessToken: string): Promise<VerifiedContinuitySession | undefined>;
  refresh(refreshToken: string): Promise<NativeSessionProjection>;
  logout(accessToken: string, scope: 'local' | 'global'): Promise<void>;
  listFactors(accessToken: string): Promise<readonly NativeFactorSummary[]>;
  enrollTotp(accessToken: string, friendlyName?: string): Promise<NativeTotpEnrollment>;
  verifyTotp(accessToken: string, enrollmentId: string, code: string): Promise<NativeFactorSummary>;
  unenrollFactor(accessToken: string, factorId: string): Promise<void>;
  startRecovery(handle: string): Promise<void>;
  redeemRecoveryOtp(handle: string, recoveryOtp: string): Promise<NativeRecoveryOtpSession>;
  updateRecoveredCredential(accessToken: string, newCredential: string): Promise<void>;
  signInWithPassword(handle: string, credential: string): Promise<NativeSessionProjection>;
}

export interface SessionActivitySnapshot {
  appState: 'active' | 'background' | 'inactive';
  documentVisible: boolean;
  windowFocused: boolean;
  userEngaged: boolean;
}

export interface NativeSecureRefreshStorage {
  read(): Promise<string | undefined>;
  write(refreshToken: string): Promise<void>;
  clear(): Promise<void>;
}

export class MemoryAccessTokenStore {
  private accessToken: string | undefined;

  public read(): string | undefined {
    return this.accessToken;
  }

  public write(accessToken: string): void {
    this.accessToken = accessToken;
  }

  public clear(): void {
    this.accessToken = undefined;
  }
}

export function permitsForegroundRefresh(snapshot: SessionActivitySnapshot): boolean {
  return (
    snapshot.appState === 'active' &&
    snapshot.documentVisible &&
    snapshot.windowFocused &&
    snapshot.userEngaged
  );
}

export interface SessionContinuationTransport {
  refreshWeb(): Promise<NativeSessionProjection>;
  refreshNative(refreshToken: string): Promise<NativeSessionProjection>;
  logout(allSessions: boolean): Promise<void>;
}

export type SessionContinuationOutcome =
  | { status: 'refreshed'; session: NativeSessionProjection }
  | { status: 'suspended' };

export class SessionContinuationController {
  public constructor(
    private readonly dependencies: {
      platform: 'web' | 'native';
      accessTokens: MemoryAccessTokenStore;
      transport: SessionContinuationTransport;
      nativeRefreshTokens?: NativeSecureRefreshStorage;
    },
  ) {
    if (dependencies.platform === 'native' && !dependencies.nativeRefreshTokens) {
      throw new Error('Native session continuation requires OS-secure refresh storage.');
    }
  }

  public async refresh(
    activity: SessionActivitySnapshot,
    online: boolean,
  ): Promise<SessionContinuationOutcome> {
    if (!online) throw new Error('offline-no-queue');
    if (!permitsForegroundRefresh(activity)) return { status: 'suspended' };
    const session =
      this.dependencies.platform === 'web'
        ? await this.dependencies.transport.refreshWeb()
        : await this.refreshNative();
    this.dependencies.accessTokens.write(session.accessToken);
    return { status: 'refreshed', session };
  }

  public async logout(allSessions: boolean, online: boolean): Promise<void> {
    if (!online) throw new Error('offline-no-queue');
    await this.dependencies.transport.logout(allSessions);
    this.dependencies.accessTokens.clear();
    await this.dependencies.nativeRefreshTokens?.clear();
  }

  public reconcile(session: NativeSessionProjection | undefined): void {
    if (session) this.dependencies.accessTokens.write(session.accessToken);
    else this.dependencies.accessTokens.clear();
  }

  private async refreshNative(): Promise<NativeSessionProjection> {
    const storage = this.dependencies.nativeRefreshTokens!;
    const refreshToken = await storage.read();
    if (!refreshToken) throw new Error('session-expired');
    const session = await this.dependencies.transport.refreshNative(refreshToken);
    if (!session.refreshToken) throw new Error('session-refresh-token-missing');
    await storage.write(session.refreshToken);
    return session;
  }
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

const PRIMARY_AUTH_METHODS = new Set(['password', 'otp', 'magic_link']);

export function latestPrimaryAuthenticationAt(
  amr: readonly AuthMethodReference[],
): number | undefined {
  const timestamps = amr
    .filter((entry) => PRIMARY_AUTH_METHODS.has(entry.method))
    .map((entry) => entry.timestamp)
    .filter((value) => Number.isInteger(value) && value >= 0);
  return timestamps.length ? Math.max(...timestamps) : undefined;
}
