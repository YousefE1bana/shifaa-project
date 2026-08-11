export type RuntimeEnvironment = 'development' | 'test' | 'production';

export interface ApiConfig {
  environment: RuntimeEnvironment;
  host: string;
  port: number;
  corsOrigins: string[];
  databaseUrl: string;
  identityOnboardingEnabled: boolean;
  syntheticMode: boolean;
  syntheticProofingEnabled: boolean;
  authAdapter: 'local' | 'supabase';
  repositoryAdapter: 'memory' | 'postgres';
  proofingAdapter: 'local' | 'valify';
  uploadAdapter: 'local' | 'supabase';
  identityEncryptionKey: Uint8Array;
  identityBlindIndexKey: Uint8Array;
  preauthHmacKey: Uint8Array;
  supabaseUrl?: string;
  supabaseAnonKey?: string;
  supabaseServiceRoleKey?: string;
  supabaseJwksUrl?: string;
  supabaseJwtIssuer?: string;
  supabaseJwtAudience: string;
}

export class ConfigurationError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = 'ConfigurationError';
  }
}

function readBoolean(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined) return fallback;
  if (value === 'true') return true;
  if (value === 'false') return false;
  throw new ConfigurationError(`Expected boolean environment value, received ${value}.`);
}

function readKey(name: string, value: string | undefined): Uint8Array {
  if (!value) throw new ConfigurationError(`${name} is required.`);
  const decoded = Buffer.from(value, 'base64');
  if (decoded.byteLength !== 32) throw new ConfigurationError(`${name} must decode to 32 bytes.`);
  return decoded;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): ApiConfig {
  const environment = (env['NODE_ENV'] ?? 'development') as RuntimeEnvironment;
  if (!['development', 'test', 'production'].includes(environment)) {
    throw new ConfigurationError(`Unsupported NODE_ENV ${environment}.`);
  }

  const syntheticMode = readBoolean(env['SHIFAA_SYNTHETIC_MODE'], environment !== 'production');
  const syntheticProofingEnabled = readBoolean(
    env['SYNTHETIC_PROOFING_ENABLED'],
    environment !== 'production',
  );
  const authAdapter = (env['AUTH_ADAPTER'] ??
    (environment === 'test' ? 'local' : 'supabase')) as ApiConfig['authAdapter'];
  const repositoryAdapter = (env['REPOSITORY_ADAPTER'] ??
    (environment === 'test' ? 'memory' : 'postgres')) as ApiConfig['repositoryAdapter'];
  const proofingAdapter = (env['PROOFING_ADAPTER'] ?? 'local') as ApiConfig['proofingAdapter'];
  const uploadAdapter = (env['UPLOAD_ADAPTER'] ?? 'local') as ApiConfig['uploadAdapter'];
  const corsOrigins = (
    env['CORS_ALLOWED_ORIGINS'] ??
    'http://127.0.0.1:8081,http://localhost:8081,http://127.0.0.1:3001,http://localhost:3001'
  )
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

  if (environment === 'production') {
    const forbidden = [
      syntheticMode && 'SHIFAA_SYNTHETIC_MODE',
      syntheticProofingEnabled && 'SYNTHETIC_PROOFING_ENABLED',
      authAdapter === 'local' && 'AUTH_ADAPTER=local',
      repositoryAdapter === 'memory' && 'REPOSITORY_ADAPTER=memory',
      proofingAdapter === 'local' && 'PROOFING_ADAPTER=local',
      uploadAdapter === 'local' && 'UPLOAD_ADAPTER=local',
    ].filter(Boolean);
    if (forbidden.length > 0) {
      throw new ConfigurationError(
        `Production startup denied: synthetic/local adapters enabled (${forbidden.join(', ')}).`,
      );
    }
    for (const required of [
      'SUPABASE_URL',
      'SUPABASE_ANON_KEY',
      'VALIFY_BASE_URL',
      'VALIFY_API_KEY',
    ]) {
      if (!env[required])
        throw new ConfigurationError(`Production startup denied: ${required} is required.`);
    }
    if (!env['CORS_ALLOWED_ORIGINS']) {
      throw new ConfigurationError('Production startup denied: CORS_ALLOWED_ORIGINS is required.');
    }
  }

  if (!['local', 'supabase'].includes(authAdapter))
    throw new ConfigurationError('Invalid AUTH_ADAPTER.');
  if (!['memory', 'postgres'].includes(repositoryAdapter))
    throw new ConfigurationError('Invalid REPOSITORY_ADAPTER.');
  if (!['local', 'valify'].includes(proofingAdapter))
    throw new ConfigurationError('Invalid PROOFING_ADAPTER.');
  if (!['local', 'supabase'].includes(uploadAdapter))
    throw new ConfigurationError('Invalid UPLOAD_ADAPTER.');

  if (
    environment !== 'test' &&
    (authAdapter === 'local' || repositoryAdapter === 'memory' || uploadAdapter === 'local')
  ) {
    throw new ConfigurationError(
      'Executable development runtime requires Supabase Auth, PostgreSQL, and Supabase Storage adapters.',
    );
  }
  if (authAdapter === 'supabase' || uploadAdapter === 'supabase') {
    for (const required of [
      'SUPABASE_URL',
      'SUPABASE_ANON_KEY',
      'SUPABASE_SERVICE_ROLE_KEY',
      'SUPABASE_JWKS_URL',
      'SUPABASE_JWT_ISSUER',
    ]) {
      if (!env[required])
        throw new ConfigurationError(`${required} is required for the Supabase runtime.`);
    }
  }

  return {
    environment,
    host: env['HOST'] ?? '127.0.0.1',
    port: Number(env['PORT'] ?? 3000),
    corsOrigins,
    databaseUrl:
      env['DATABASE_URL'] ?? 'postgresql://shifaa_api:synthetic_api_only@127.0.0.1:5432/shifaa',
    identityOnboardingEnabled: readBoolean(
      env['IDENTITY_ONBOARDING_ENABLED'],
      environment !== 'production',
    ),
    syntheticMode,
    syntheticProofingEnabled,
    authAdapter,
    repositoryAdapter,
    proofingAdapter,
    uploadAdapter,
    identityEncryptionKey: readKey(
      'IDENTITY_ENCRYPTION_KEY_BASE64',
      env['IDENTITY_ENCRYPTION_KEY_BASE64'] ?? Buffer.alloc(32).toString('base64'),
    ),
    identityBlindIndexKey: readKey(
      'IDENTITY_BLIND_INDEX_KEY_BASE64',
      env['IDENTITY_BLIND_INDEX_KEY_BASE64'] ?? Buffer.alloc(32, 1).toString('base64'),
    ),
    preauthHmacKey: readKey(
      'PREAUTH_HMAC_KEY_BASE64',
      env['PREAUTH_HMAC_KEY_BASE64'] ?? Buffer.alloc(32, 2).toString('base64'),
    ),
    ...(env['SUPABASE_URL'] ? { supabaseUrl: env['SUPABASE_URL'] } : {}),
    ...(env['SUPABASE_ANON_KEY'] ? { supabaseAnonKey: env['SUPABASE_ANON_KEY'] } : {}),
    ...(env['SUPABASE_SERVICE_ROLE_KEY']
      ? { supabaseServiceRoleKey: env['SUPABASE_SERVICE_ROLE_KEY'] }
      : {}),
    ...(env['SUPABASE_JWKS_URL'] ? { supabaseJwksUrl: env['SUPABASE_JWKS_URL'] } : {}),
    ...(env['SUPABASE_JWT_ISSUER'] ? { supabaseJwtIssuer: env['SUPABASE_JWT_ISSUER'] } : {}),
    supabaseJwtAudience: env['SUPABASE_JWT_AUDIENCE'] ?? 'authenticated',
  };
}
