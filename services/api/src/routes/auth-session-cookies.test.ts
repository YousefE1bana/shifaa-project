import { describe, expect, it } from 'vitest';

import { setInitialBrowserSessionCookies } from './auth-session-cookies.js';

describe('browser Auth session cookie bootstrap', () => {
  it('installs one HttpOnly refresh cookie and one readable matching-CSRF cookie', () => {
    const headers = new Map<string, unknown>();
    setInitialBrowserSessionCookies(
      { header: (name: string, value: unknown) => headers.set(name, value) } as never,
      'synthetic-browser-refresh-token',
    );
    const cookies = headers.get('set-cookie') as string[];
    expect(cookies).toHaveLength(2);
    expect(cookies[0]).toContain('shifaa_refresh=synthetic-browser-refresh-token');
    expect(cookies[0]).toContain('HttpOnly; Secure; SameSite=Strict');
    expect(cookies[1]).toMatch(/^shifaa_csrf=[A-Za-z0-9_-]{43};/);
    expect(cookies[0]).toContain('Path=/v1/auth');
    expect(cookies[1]).toContain('Path=/;');
    expect(cookies[1]).not.toContain('HttpOnly');
  });
});
