import { randomUUID } from 'node:crypto';

import { AesGcmIdentityCipher } from '@shifaa/core';
import cors from '@fastify/cors';
import Fastify from 'fastify';

import {
  LocalAuthIssuer,
  LocalProofingProvider,
  LocalQuarantineUploadStore,
  PostgresIdentityRepository,
  PostgresIdempotencyStore,
  PostgresFacilityOnboardingService,
  SupabaseAuthIssuer,
  SupabaseQuarantineUploadStore,
} from './adapters/index.js';
import { loadConfig, type ApiConfig } from './config.js';
import {
  IdentityOnboardingService,
  InMemoryIdentityRepository,
  defaultPortUtilities,
} from './modules/identity-onboarding/index.js';
import type { IdentityRepository } from './modules/identity-onboarding/ports.js';
import { InMemoryIdempotencyStore } from './platform/idempotency.js';
import {
  installIdentityErrorHandler,
  registerIdentityOnboardingRoutes,
} from './routes/identity-onboarding.js';
import { FacilityOnboardingService } from './modules/facility-onboarding/index.js';
import { registerFacilityOnboardingRoutes } from './routes/facility-onboarding.js';

export interface AppHarness {
  app: ReturnType<typeof Fastify>;
  config: ApiConfig;
  service: IdentityOnboardingService;
  repository: IdentityRepository;
  facilityService: FacilityOnboardingService | PostgresFacilityOnboardingService;
}

export async function buildApp(
  options: {
    config?: ApiConfig;
    proofing?: LocalProofingProvider;
    clock?: { now(): Date };
  } = {},
): Promise<AppHarness> {
  const config = options.config ?? loadConfig({ NODE_ENV: 'test' });
  if (!config.identityOnboardingEnabled)
    throw new Error('Identity onboarding feature is disabled.');
  const repository =
    config.repositoryAdapter === 'postgres'
      ? new PostgresIdentityRepository(config.databaseUrl)
      : new InMemoryIdentityRepository();
  if (repository instanceof PostgresIdentityRepository) await repository.ready();
  const utilities = defaultPortUtilities();
  const auth =
    config.authAdapter === 'supabase'
      ? new SupabaseAuthIssuer({
          url: config.supabaseUrl!,
          anonKey: config.supabaseAnonKey!,
          jwksUrl: config.supabaseJwksUrl!,
          issuer: config.supabaseJwtIssuer!,
          audience: config.supabaseJwtAudience,
        })
      : new LocalAuthIssuer();
  const uploads =
    config.uploadAdapter === 'supabase'
      ? new SupabaseQuarantineUploadStore(config.supabaseUrl!, config.supabaseServiceRoleKey!)
      : new LocalQuarantineUploadStore();
  if (auth instanceof SupabaseAuthIssuer) await auth.ready();
  if (uploads instanceof SupabaseQuarantineUploadStore) await uploads.ready();
  const service = new IdentityOnboardingService({
    auth,
    cipher: new AesGcmIdentityCipher(config.identityEncryptionKey, config.identityBlindIndexKey, 1),
    proofing: options.proofing ?? new LocalProofingProvider(),
    uploads,
    repository,
    clock: options.clock ?? utilities.clock,
    ids: utilities.ids,
  });
  const app = Fastify({ logger: false, genReqId: () => randomUUID() });
  const facilityService =
    repository instanceof PostgresIdentityRepository
      ? new PostgresFacilityOnboardingService(
          repository,
          config.identityEncryptionKey,
          config.identityBlindIndexKey,
          options.clock ? () => options.clock!.now() : undefined,
        )
      : options.clock
        ? new FacilityOnboardingService(() => options.clock!.now())
        : new FacilityOnboardingService();
  await app.register(cors, {
    origin: config.corsOrigins,
    methods: ['GET', 'HEAD', 'POST', 'PATCH', 'OPTIONS'],
    allowedHeaders: [
      'Accept',
      'Accept-Language',
      'Authorization',
      'Cache-Control',
      'Content-Type',
      'Idempotency-Key',
      'If-Match',
      'Pragma',
      'X-AAL',
      'X-Provider-Signature',
      'X-Purpose',
    ],
  });
  installIdentityErrorHandler(app);
  app.get('/v1/health', async () => ({ status: 'ok', feature: 'identity-onboarding' }));
  await registerIdentityOnboardingRoutes(app, {
    config,
    service,
    idempotency:
      repository instanceof PostgresIdentityRepository
        ? new PostgresIdempotencyStore(repository)
        : new InMemoryIdempotencyStore(),
  });
  if (config.facilityOnboardingEnabled) {
    await registerFacilityOnboardingRoutes(app, {
      service: facilityService,
      syntheticMode: config.syntheticMode,
      idempotency:
        repository instanceof PostgresIdentityRepository
          ? new PostgresIdempotencyStore(repository)
          : new InMemoryIdempotencyStore(),
    });
  }
  if (repository instanceof PostgresIdentityRepository) {
    app.addHook('onClose', () => repository.close());
  }
  return { app, config, service, repository, facilityService };
}
