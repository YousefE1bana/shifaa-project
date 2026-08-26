import { describe, expect, it } from 'vitest';

import { ConfigurationError, loadConfig } from './config.js';

describe('production-deny runtime configuration', () => {
  it('allows explicit seeded-synthetic test configuration', () => {
    const config = loadConfig({ NODE_ENV: 'test', SHIFAA_SYNTHETIC_MODE: 'true' });
    expect(config).toMatchObject({
      environment: 'test',
      syntheticMode: true,
      authAdapter: 'local',
      discoverySosEnabled: true,
      discoveryRadiusM: 25_000,
      sosMatchRadiusM: 25_000,
      capacitySourceCode: 'synthetic_seed',
    });
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
  const realKeys = {
    IDENTITY_ENCRYPTION_KEY_BASE64: key(10),
    IDENTITY_BLIND_INDEX_KEY_BASE64: key(11),
    PREAUTH_HMAC_KEY_BASE64: key(12),
  };

  it('fails production startup when any cryptographic key is absent', () => {
    for (const omitted of [
      'IDENTITY_ENCRYPTION_KEY_BASE64',
      'IDENTITY_BLIND_INDEX_KEY_BASE64',
      'PREAUTH_HMAC_KEY_BASE64',
    ]) {
      const env: Record<string, string> = { ...productionBase, ...realKeys };
      delete env[omitted];
      expect(() => loadConfig(env)).toThrowError(
        new RegExp(`${omitted} is required; fallback test keys are not permitted`),
      );
    }
  });

  it('rejects the documented seeded-synthetic placeholder constants even when explicitly supplied', () => {
    const placeholderCases = [
      {
        ...productionBase,
        IDENTITY_ENCRYPTION_KEY_BASE64: Buffer.alloc(32).toString('base64'),
        IDENTITY_BLIND_INDEX_KEY_BASE64: key(11),
        PREAUTH_HMAC_KEY_BASE64: key(12),
      },
      {
        ...productionBase,
        IDENTITY_ENCRYPTION_KEY_BASE64: key(10),
        IDENTITY_BLIND_INDEX_KEY_BASE64: Buffer.alloc(32, 1).toString('base64'),
        PREAUTH_HMAC_KEY_BASE64: key(12),
      },
      {
        ...productionBase,
        IDENTITY_ENCRYPTION_KEY_BASE64: key(10),
        IDENTITY_BLIND_INDEX_KEY_BASE64: key(11),
        PREAUTH_HMAC_KEY_BASE64: Buffer.alloc(32, 2).toString('base64'),
      },
      // Placeholder material is rejected regardless of which slot receives it.
      {
        ...productionBase,
        IDENTITY_ENCRYPTION_KEY_BASE64: Buffer.alloc(32, 2).toString('base64'),
        IDENTITY_BLIND_INDEX_KEY_BASE64: key(11),
        PREAUTH_HMAC_KEY_BASE64: key(12),
      },
    ];
    for (const env of placeholderCases) {
      expect(() => loadConfig(env)).toThrowError(/seeded-synthetic test key/);
    }
  });

  it('starts production only with three distinct non-placeholder 32-byte keys', () => {
    const config = loadConfig({ ...productionBase, ...realKeys });
    expect(Buffer.from(config.identityEncryptionKey).toString('base64')).toBe(key(10));
    expect(Buffer.from(config.identityBlindIndexKey).toString('base64')).toBe(key(11));
    expect(Buffer.from(config.preauthHmacKey).toString('base64')).toBe(key(12));
  });

  it('rejects duplicated key material across slots in every environment', () => {
    expect(() =>
      loadConfig({
        ...productionBase,
        IDENTITY_ENCRYPTION_KEY_BASE64: key(21),
        IDENTITY_BLIND_INDEX_KEY_BASE64: key(21),
        PREAUTH_HMAC_KEY_BASE64: key(22),
      }),
    ).toThrowError(/must be distinct key material/);
    expect(() =>
      loadConfig({
        NODE_ENV: 'test',
        IDENTITY_ENCRYPTION_KEY_BASE64: key(23),
        IDENTITY_BLIND_INDEX_KEY_BASE64: key(24),
        PREAUTH_HMAC_KEY_BASE64: key(24),
      }),
    ).toThrowError(/must be distinct key material/);
  });

  it('keeps the documented synthetic fallback keys available outside production', () => {
    const config = loadConfig({ NODE_ENV: 'test' });
    expect(Buffer.from(config.identityEncryptionKey)).toEqual(Buffer.alloc(32));
    expect(Buffer.from(config.identityBlindIndexKey)).toEqual(Buffer.alloc(32, 1));
    expect(Buffer.from(config.preauthHmacKey)).toEqual(Buffer.alloc(32, 2));
  });
});
