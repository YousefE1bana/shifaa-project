import { IdentityContinuityClient } from '@shifaa/api-client/identity-continuity';
import {
  MemoryAccessTokenStore,
  SessionContinuationController,
  type NativeSecureRefreshStorage,
  type NativeSessionProjection,
} from '@shifaa/auth/identity-continuity';

export interface PatientSessionClientOptions {
  locale: 'ar-EG' | 'en-EG';
  platform: 'web' | 'native';
  csrfToken?: () => string | undefined;
  nativeRefreshTokens?: NativeSecureRefreshStorage;
  fetch?: typeof globalThis.fetch;
}

export function createPatientSessionClient(options: PatientSessionClientOptions) {
  const accessTokens = new MemoryAccessTokenStore();
  const client = new IdentityContinuityClient({
    baseUrl: process.env['EXPO_PUBLIC_API_BASE_URL'] ?? 'http://127.0.0.1:3000',
    accessToken: () => accessTokens.read(),
    acceptLanguage: options.locale,
    ...(options.csrfToken ? { csrfToken: options.csrfToken } : {}),
    origin: process.env['EXPO_PUBLIC_PATIENT_ORIGIN'] ?? 'http://127.0.0.1:8081',
    ...(options.fetch ? { fetch: options.fetch } : {}),
  });
  const transport = {
    refreshWeb: async () =>
      sessionProjection(
        await client.refreshSession(
          { client: 'web', foregroundEngaged: true },
          mutationKey('refresh-web'),
        ),
      ),
    refreshNative: async (refreshToken: string) =>
      sessionProjection(
        await client.refreshSession(
          { client: 'native', foregroundEngaged: true, refreshToken },
          mutationKey('refresh-native'),
        ),
      ),
    logout: async (allSessions: boolean) => {
      await client.logout(
        { allSessions },
        mutationKey(allSessions ? 'logout-all' : 'logout-current'),
      );
    },
  };
  return {
    accessTokens,
    controller: new SessionContinuationController({
      platform: options.platform,
      accessTokens,
      transport,
      ...(options.nativeRefreshTokens ? { nativeRefreshTokens: options.nativeRefreshTokens } : {}),
    }),
  };
}

export function assertIdentityContinuityOnline(): void {
  if (typeof navigator !== 'undefined' && !navigator.onLine) throw new Error('offline-no-queue');
}

function mutationKey(action: string): string {
  return `synthetic-ui-007-${action}-${globalThis.crypto.randomUUID()}`;
}

function sessionProjection(value: unknown): NativeSessionProjection {
  if (!value || typeof value !== 'object') throw new Error('session-response-invalid');
  const session = value as Record<string, unknown>;
  if (
    typeof session['accessToken'] !== 'string' ||
    typeof session['sessionId'] !== 'string' ||
    (session['assurance'] !== 'aal1' && session['assurance'] !== 'aal2') ||
    typeof session['expiresAt'] !== 'string'
  ) {
    throw new Error('session-response-invalid');
  }
  return {
    accessToken: session['accessToken'],
    ...(typeof session['refreshToken'] === 'string'
      ? { refreshToken: session['refreshToken'] }
      : {}),
    sessionId: session['sessionId'],
    assurance: session['assurance'],
    expiresAt: session['expiresAt'],
  };
}
