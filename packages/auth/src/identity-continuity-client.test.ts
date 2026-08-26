import { describe, expect, it } from 'vitest';

import {
  MemoryAccessTokenStore,
  SessionContinuationController,
  permitsForegroundRefresh,
} from './identity-continuity.js';

describe('identity continuity session client policy', () => {
  it.each([
    [
      'background app',
      { appState: 'background', documentVisible: true, windowFocused: true, userEngaged: true },
    ],
    [
      'inactive app',
      { appState: 'inactive', documentVisible: true, windowFocused: true, userEngaged: true },
    ],
    [
      'hidden document',
      { appState: 'active', documentVisible: false, windowFocused: true, userEngaged: true },
    ],
    [
      'blurred window',
      { appState: 'active', documentVisible: true, windowFocused: false, userEngaged: true },
    ],
    [
      'unattended user',
      { appState: 'active', documentVisible: true, windowFocused: true, userEngaged: false },
    ],
  ] as const)('suspends refresh for a %s', (_scenario, snapshot) => {
    expect(permitsForegroundRefresh(snapshot)).toBe(false);
  });

  it('permits a foreground engaged refresh and keeps access tokens memory-only', () => {
    expect(
      permitsForegroundRefresh({
        appState: 'active',
        documentVisible: true,
        windowFocused: true,
        userEngaged: true,
      }),
    ).toBe(true);
    const store = new MemoryAccessTokenStore();
    store.write('synthetic-access-token-never-persisted');
    expect(store.read()).toBe('synthetic-access-token-never-persisted');
    store.clear();
    expect(store.read()).toBeUndefined();
  });

  it('uses OS-secure native refresh storage and never queues offline mutations', async () => {
    let refreshToken = 'synthetic-native-refresh-token';
    const accessTokens = new MemoryAccessTokenStore();
    const controller = new SessionContinuationController({
      platform: 'native',
      accessTokens,
      nativeRefreshTokens: {
        read: async () => refreshToken,
        write: async (next) => {
          refreshToken = next;
        },
        clear: async () => {
          refreshToken = '';
        },
      },
      transport: {
        refreshWeb: async () => {
          throw new Error('web transport must not run');
        },
        refreshNative: async (stored) => ({
          accessToken: `access-for-${stored}`,
          refreshToken: 'rotated-native-refresh-token',
          sessionId: '71000000-0000-4000-8000-000000000001',
          assurance: 'aal1',
          expiresAt: '2026-08-26T00:15:00.000Z',
        }),
        logout: async () => undefined,
      },
    });
    const active = {
      appState: 'active' as const,
      documentVisible: true,
      windowFocused: true,
      userEngaged: true,
    };
    await expect(controller.refresh(active, false)).rejects.toThrow('offline-no-queue');
    await expect(controller.refresh(active, true)).resolves.toMatchObject({ status: 'refreshed' });
    expect(refreshToken).toBe('rotated-native-refresh-token');
    expect(accessTokens.read()).toContain('synthetic-native-refresh-token');
    await controller.logout(true, true);
    expect(refreshToken).toBe('');
    expect(accessTokens.read()).toBeUndefined();
  });

  it('uses the web cookie bridge without a persistent refresh-token port', async () => {
    const accessTokens = new MemoryAccessTokenStore();
    const controller = new SessionContinuationController({
      platform: 'web',
      accessTokens,
      transport: {
        refreshWeb: async () => ({
          accessToken: 'web-memory-access-token',
          sessionId: '71000000-0000-4000-8000-000000000001',
          assurance: 'aal1',
          expiresAt: '2026-08-26T00:15:00.000Z',
        }),
        refreshNative: async () => {
          throw new Error('native transport must not run');
        },
        logout: async () => undefined,
      },
    });
    await controller.refresh(
      {
        appState: 'active',
        documentVisible: true,
        windowFocused: true,
        userEngaged: true,
      },
      true,
    );
    expect(accessTokens.read()).toBe('web-memory-access-token');
  });
});
