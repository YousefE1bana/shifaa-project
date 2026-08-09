import { describe, expect, it } from 'vitest';

import { ConfigurationError, loadConfig } from './config.js';

describe('production-deny runtime configuration', () => {
  it('allows explicit seeded-synthetic test configuration', () => {
    const config = loadConfig({ NODE_ENV: 'test', SHIFAA_SYNTHETIC_MODE: 'true' });
    expect(config).toMatchObject({
      environment: 'test',
      syntheticMode: true,
      authAdapter: 'local',
    });
  });

  it('rejects every local/synthetic adapter in production before listening', () => {
    expect(() =>
      loadConfig({
        NODE_ENV: 'production',
        SHIFAA_SYNTHETIC_MODE: 'true',
        SYNTHETIC_PROOFING_ENABLED: 'true',
        AUTH_ADAPTER: 'local',
        PROOFING_ADAPTER: 'local',
        UPLOAD_ADAPTER: 'local',
      }),
    ).toThrowError(ConfigurationError);
  });

  it('rejects absent production vendor secrets even with local adapters disabled', () => {
    expect(() =>
      loadConfig({
        NODE_ENV: 'production',
        SHIFAA_SYNTHETIC_MODE: 'false',
        SYNTHETIC_PROOFING_ENABLED: 'false',
        AUTH_ADAPTER: 'supabase',
        PROOFING_ADAPTER: 'valify',
        UPLOAD_ADAPTER: 'supabase',
      }),
    ).toThrowError(/SUPABASE_URL/);
  });
});
