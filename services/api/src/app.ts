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
  PostgresFamilyCareService,
  PostgresPrivacyDsrNotificationService,
  PostgresDiscoverySosService,
  PostgresIdentityContinuityService,
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
import { FamilyCareService, type FamilyCareServicePort } from './modules/family-care/index.js';
import { registerFamilyCareRoutes } from './routes/family-care.js';
import { PrivacyDsrNotificationService } from './modules/privacy-dsr-notifications/index.js';
import { registerPrivacyDsrNotificationRoutes } from './routes/privacy-dsr-notifications.js';
import {
  DiscoverySosService,
  type DiscoverySosServicePort,
} from './modules/discovery-sos/index.js';
import { registerDiscoverySosRoutes } from './routes/discovery-sos.js';
import {
  FailClosedIdentityContinuityService,
  IdentityContinuityService,
  type IdentityContinuityServicePort,
} from './modules/identity-continuity/index.js';
import { registerIdentityContinuityRoutes } from './routes/identity-continuity.js';

export interface AppHarness {
  app: ReturnType<typeof Fastify>;
  config: ApiConfig;
  service: IdentityOnboardingService;
  repository: IdentityRepository;
  facilityService: FacilityOnboardingService | PostgresFacilityOnboardingService;
  familyService: FamilyCareServicePort;
  privacyService: PrivacyDsrNotificationService | PostgresPrivacyDsrNotificationService;
  discoverySosService: DiscoverySosServicePort;
  identityContinuityService: IdentityContinuityServicePort;
}

export async function buildApp(
  options: {
    config?: ApiConfig;
    proofing?: LocalProofingProvider;
    clock?: { now(): Date };
    identityContinuityService?: IdentityContinuityServicePort;
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
  const continuityRuntime =
    auth instanceof SupabaseAuthIssuer && repository instanceof PostgresIdentityRepository
      ? {
          auth,
          repository: new PostgresIdentityContinuityService(
            repository,
            config.identityEncryptionKey,
            config.environment === 'test'
              ? 'ci'
              : config.environment === 'production'
                ? 'production'
                : 'local',
          ),
        }
      : undefined;
  const service = new IdentityOnboardingService({
    auth,
    ...(continuityRuntime ? { sessionAuthority: continuityRuntime.repository } : {}),
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
  const familyService =
    repository instanceof PostgresIdentityRepository
      ? new PostgresFamilyCareService(
          repository,
          config.identityEncryptionKey,
          config.identityBlindIndexKey,
          config.preauthHmacKey,
          options.clock ? () => options.clock!.now() : undefined,
        )
      : options.clock
        ? new FamilyCareService(() => options.clock!.now(), config.preauthHmacKey)
        : new FamilyCareService(undefined, config.preauthHmacKey);
  const privacyService =
    repository instanceof PostgresIdentityRepository
      ? new PostgresPrivacyDsrNotificationService(
          repository,
          'synthetic-005-callback-secret-not-production',
          options.clock ? () => options.clock!.now() : undefined,
        )
      : options.clock
        ? new PrivacyDsrNotificationService(() => options.clock!.now())
        : new PrivacyDsrNotificationService();
  const discoverySosService: DiscoverySosServicePort =
    repository instanceof PostgresIdentityRepository
      ? new PostgresDiscoverySosService(repository, {
          discoveryRadiusM: config.discoveryRadiusM,
          sosMatchRadiusM: config.sosMatchRadiusM,
          capacitySourceCode: config.capacitySourceCode,
          publicAppUrl: config.discoverySosPublicAppUrl,
          environment: config.environment === 'test' ? 'ci' : 'local',
        })
      : new DiscoverySosService(
          options.clock ? () => options.clock!.now() : undefined,
          config.discoverySosPublicAppUrl,
        );
  const identityContinuityService =
    options.identityContinuityService ??
    (continuityRuntime
      ? new IdentityContinuityService({
          auth: continuityRuntime.auth,
          repository: continuityRuntime.repository,
          allowedWebOrigins: new Set(config.corsOrigins),
          hmacKey: config.preauthHmacKey,
          now: () => options.clock?.now() ?? new Date(),
        })
      : new FailClosedIdentityContinuityService());
  await app.register(cors, {
    origin: config.corsOrigins,
    methods: ['GET', 'HEAD', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
      'Accept',
      'Accept-Language',
      'Authorization',
      'Cache-Control',
      'Content-Type',
      'Idempotency-Key',
      'If-Match',
      'Origin',
      'Sec-Fetch-Site',
      'Pragma',
      'X-AAL',
      'X-Provider-Signature',
      'X-Provider-Timestamp',
      'X-Purpose',
      'X-CSRF-Token',
      'X-SHIFAA-Patient-Context',
    ],
    exposedHeaders: [
      'Cache-Control',
      'Content-Language',
      'Pragma',
      'Referrer-Policy',
      'Retry-After',
      'X-Request-Id',
    ],
  });
  installIdentityErrorHandler(app);
  app.get('/v1/health', async () => ({ status: 'ok', feature: 'identity-onboarding' }));
  await registerIdentityOnboardingRoutes(app, {
    config,
    service,
    idempotency:
      repository instanceof PostgresIdentityRepository
        ? new PostgresIdempotencyStore(repository, config.identityEncryptionKey)
        : new InMemoryIdempotencyStore(),
  });
  if (config.facilityOnboardingEnabled) {
    await registerFacilityOnboardingRoutes(app, {
      service: facilityService,
      syntheticMode: config.syntheticMode,
      idempotency:
        repository instanceof PostgresIdentityRepository
          ? new PostgresIdempotencyStore(repository, config.identityEncryptionKey)
          : new InMemoryIdempotencyStore(),
    });
  }
  if (config.familyCareEnabled) {
    await registerFamilyCareRoutes(app, {
      service: familyService,
      syntheticMode: config.syntheticMode,
      idempotency:
        repository instanceof PostgresIdentityRepository
          ? new PostgresIdempotencyStore(repository, config.identityEncryptionKey)
          : new InMemoryIdempotencyStore(),
    });
  }
  if (config.privacyDsrNotificationsEnabled) {
    await registerPrivacyDsrNotificationRoutes(app, {
      service: privacyService,
      syntheticMode: config.syntheticMode,
      idempotency:
        repository instanceof PostgresIdentityRepository
          ? new PostgresIdempotencyStore(repository, config.identityEncryptionKey)
          : new InMemoryIdempotencyStore(),
    });
  }
  if (config.discoverySosEnabled) {
    await registerDiscoverySosRoutes(app, {
      service: discoverySosService,
      syntheticMode: config.syntheticMode,
      idempotency:
        repository instanceof PostgresIdentityRepository
          ? new PostgresIdempotencyStore(repository, config.identityEncryptionKey)
          : new InMemoryIdempotencyStore(),
    });
  }
  if (config.identityContinuityEnabled) {
    await registerIdentityContinuityRoutes(app, {
      service: identityContinuityService,
      idempotency:
        repository instanceof PostgresIdentityRepository
          ? new PostgresIdempotencyStore(repository, config.identityEncryptionKey)
          : new InMemoryIdempotencyStore(),
      hmacKey: config.preauthHmacKey,
      ...(options.clock ? { now: () => options.clock!.now().getTime() } : {}),
    });
  }
  if (repository instanceof PostgresIdentityRepository) {
    app.addHook('onClose', () => repository.close());
  }
  return {
    app,
    config,
    service,
    repository,
    facilityService,
    familyService,
    privacyService,
    discoverySosService,
    identityContinuityService,
  };
}
