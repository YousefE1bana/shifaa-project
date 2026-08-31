import {
  MemoryAccessTokenStore,
  type NativeSecureRefreshStorage,
} from '@shifaa/auth/identity-continuity';

const refreshTokenKey = 'shifaa.native.refresh-token.v1';

export const patientPlatform: 'web' | 'native' = typeof document === 'undefined' ? 'native' : 'web';
export const patientAccessTokens = new MemoryAccessTokenStore();

export const patientNativeRefreshTokens: NativeSecureRefreshStorage = {
  read: async () =>
    (await (await import('expo-secure-store')).getItemAsync(refreshTokenKey)) ?? undefined,
  write: async (value) => {
    await (await import('expo-secure-store')).setItemAsync(refreshTokenKey, value);
  },
  clear: async () => {
    await (await import('expo-secure-store')).deleteItemAsync(refreshTokenKey);
  },
};
