import { describe, expect, it } from 'vitest';

import { ConfigurationError, loadConfig } from './config.js';

describe('production-deny runtime configuration', () => {
  it('keeps production identity proofing disabled under OPEN-VENDOR-001', () => {
    expect(() =>
      loadConfig({ NODE_ENV: 'production', IDENTITY_ONBOARDING_ENABLED: 'true' }),
    ).toThrowError(/OPEN-VENDOR-001/);
  });

  it('allows explicit seeded-synthetic test configuration', () => {
    const config = loadConfig({ NODE_ENV: 'test', SHIFAA_SYNTHETIC_MODE: 'true' });
    expect(config).toMatchObject({
      environment: 'test',
      syntheticMode: true,
      syntheticModeExplicitlyEnabled: true,
      authAdapter: 'local',
      discoverySosEnabled: true,
      discoveryRadiusM: 25_000,
      sosMatchRadiusM: 25_000,
      capacitySourceCode: 'synthetic_seed',
    });
  });

  it('does not treat the test environment as explicit synthetic reviewer enablement', () => {
    const config = loadConfig({ NODE_ENV: 'test' });
    expect(config.syntheticMode).toBe(true);
    expect(config.syntheticModeExplicitlyEnabled).toBe(false);
  });

  it('rejects production SOS enablement and invalid synthetic radius configuration', () => {
    expect(() =>
      loadConfig({ NODE_ENV: 'production', DISCOVERY_SOS_ENABLED: 'true' }),
    ).toThrowError(/Discovery and SOS remain seeded-synthetic only/);
    expect(() => loadConfig({ NODE_ENV: 'test', DISCOVERY_RADIUS_M: '99' })).toThrowError(
      /DISCOVERY_RADIUS_M/,
    );
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

describe('SEC-002 production cryptographic key policy', () => {
  const productionBase: Record<string, string> = {
    NODE_ENV: 'production',
    SHIFAA_SYNTHETIC_MODE: 'false',
    SYNTHETIC_PROOFING_ENABLED: 'false',
    AUTH_ADAPTER: 'supabase',
    REPOSITORY_ADAPTER: 'postgres',
    PROOFING_ADAPTER: 'valify',
    UPLOAD_ADAPTER: 'supabase',
    SUPABASE_URL: 'https://supabase.example',
    SUPABASE_ANON_KEY: 'anon-key-placeholder-not-a-secret',
    SUPABASE_SERVICE_ROLE_KEY: 'service-role-placeholder-supplied-by-test-harness',
    SUPABASE_JWKS_URL: 'https://supabase.example/auth/v1/.well-known/jwks.json',
    SUPABASE_JWT_ISSUER: 'https://supabase.example/auth/v1',
    CORS_ALLOWED_ORIGINS: 'https://patient.example',
    VALIFY_BASE_URL: 'https://valify.example',
    VALIFY_API_KEY: 'valify-api-key-placeholder',
  };
  const key = (fill: number) => Buffer.alloc(32, fill).toString('base64');
  const productionKeys = {
    IDENTITY_ENCRYPTION_KEY_BASE64: key(10),
    IDENTITY_BLIND_INDEX_KEY_BASE64: key(11),
    PREAUTH_HMAC_KEY_BASE64: key(12),
  };

  it('requires all three cryptographic keys in production', () => {
    for (const omitted of Object.keys(productionKeys)) {
      const env: Record<string, string> = { ...productionBase, ...productionKeys };
      delete env[omitted];

      expect(() => loadConfig(env)).toThrowError(
        new RegExp(`${omitted} is required; fallback test keys are not permitted`),
      );
    }
  });

  it('rejects every documented synthetic placeholder in every production key slot', () => {
    const placeholders = [key(0), key(1), key(2)];

    for (const slot of Object.keys(productionKeys)) {
      for (const placeholder of placeholders) {
        expect(() =>
          loadConfig({ ...productionBase, ...productionKeys, [slot]: placeholder }),
        ).toThrowError(/seeded-synthetic test key/);
      }
    }
  });

  it('requires distinct key material across all three slots', () => {
    const duplicateCases = [
      [key(20), key(20), key(22)],
      [key(20), key(21), key(20)],
      [key(20), key(21), key(21)],
    ];

    for (const [encryptionKey, blindIndexKey, hmacKey] of duplicateCases) {
      expect(() =>
        loadConfig({
          NODE_ENV: 'test',
          IDENTITY_ENCRYPTION_KEY_BASE64: encryptionKey,
          IDENTITY_BLIND_INDEX_KEY_BASE64: blindIndexKey,
          PREAUTH_HMAC_KEY_BASE64: hmacKey,
        }),
      ).toThrowError(/must be distinct key material/);
    }
  });

  it('accepts three distinct non-placeholder production keys', () => {
    const production = loadConfig({ ...productionBase, ...productionKeys });
    expect(Buffer.from(production.identityEncryptionKey).toString('base64')).toBe(key(10));
    expect(Buffer.from(production.identityBlindIndexKey).toString('base64')).toBe(key(11));
    expect(Buffer.from(production.preauthHmacKey).toString('base64')).toBe(key(12));
  });

  it('preserves documented synthetic fallback keys outside production', () => {
    const synthetic = loadConfig({ NODE_ENV: 'test', SHIFAA_SYNTHETIC_MODE: 'true' });
    expect(Buffer.from(synthetic.identityEncryptionKey)).toEqual(Buffer.alloc(32));
    expect(Buffer.from(synthetic.identityBlindIndexKey)).toEqual(Buffer.alloc(32, 1));
    expect(Buffer.from(synthetic.preauthHmacKey)).toEqual(Buffer.alloc(32, 2));
  });
});
