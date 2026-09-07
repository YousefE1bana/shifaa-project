import { randomUUID, timingSafeEqual } from 'node:crypto';

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
  PostgresAuditAdminRepository,
  PostgresAuditExportOrchestrationRepository,
  LocalSyntheticAuditObjectStore,
} from './adapters/index.js';
import { loadConfig, type ApiConfig } from './config.js';
import {
  IdentityOnboardingService,
  InMemoryIdentityRepository,
  defaultPortUtilities,
} from './modules/identity-onboarding/index.js';
import type { IdentityRepository } from './modules/identity-onboarding/ports.js';
import type { RecoveryProofGrantAuthority } from './modules/identity-onboarding/ports.js';
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
import { AuditAdminService } from './modules/audit-admin/service.js';
import { AuditExportService } from './modules/audit-admin/export-service.js';
import { AuditAdminHealthService } from './modules/audit-admin/health-service.js';
import { approvedInactiveAggregatePolicy } from './modules/audit-admin/approved-policy.js';
import type { AuditAdminActor, AuditExportServiceActor } from './modules/audit-admin/types.js';
import { registerAuditAdminRoutes } from './routes/audit-admin.js';
import { ApiPolicyError } from './modules/identity-onboarding/errors.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

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
    recoveryProofGrants?: RecoveryProofGrantAuthority;
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
  const recoveryProofGrants = options.recoveryProofGrants ?? continuityRuntime?.repository;
  const service = new IdentityOnboardingService({
    auth,
    ...(continuityRuntime ? { sessionAuthority: continuityRuntime.repository } : {}),
    ...(recoveryProofGrants ? { recoveryProofGrants } : {}),
    cipher: new AesGcmIdentityCipher(config.identityEncryptionKey, config.identityBlindIndexKey, 1),
    proofing: options.proofing ?? new LocalProofingProvider(),
    uploads,
    repository,
    clock: options.clock ?? utilities.clock,
    ids: utilities.ids,
  });
  const app = Fastify({
    logger: false,
    genReqId: (request) => {
      const supplied = request.headers['x-request-id'];
      return typeof supplied === 'string' && UUID.test(supplied) ? supplied : randomUUID();
    },
  });
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
      'Recovery-Proof-Grant',
      'X-AAL',
      'X-Provider-Signature',
      'X-Provider-Timestamp',
      'X-Purpose',
      'X-CSRF-Token',
      'X-SHIFAA-Patient-Context',
      'X-Request-Id',
      'X-Worker-Id',
      'traceparent',
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
    ...(recoveryProofGrants ? { recoveryProofGrants } : {}),
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
      resolveNativePatient: async (accessToken) => {
        const actor = await service.actorFromAccessToken(accessToken);
        return actor
          ? { personId: actor.personId, principal: actor.principal, aal: actor.aal }
          : undefined;
      },
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
  const auditRepository =
    repository instanceof PostgresIdentityRepository
      ? new PostgresAuditAdminRepository(repository, auditEnvironment(config.environment))
      : failClosedAuditRepository();
  const auditAdminService = new AuditAdminService({
    repository: auditRepository,
    policy: {
      getApprovedPolicy: async () => approvedInactiveAggregatePolicy,
      getApprovedRuntimeConfigurationSha256: async () => undefined,
    },
    aggregates: { getCells: async () => [] },
    clock: { now: () => options.clock?.now() ?? new Date() },
    cursorSecret: Buffer.from(config.identityEncryptionKey).toString('base64url'),
  });
  const exportRepository =
    repository instanceof PostgresIdentityRepository
      ? new PostgresAuditExportOrchestrationRepository(
          repository,
          auditEnvironment(config.environment),
        )
      : failClosedExportRepository();
  const exportService = new AuditExportService({
    repository: exportRepository,
    objects: new LocalSyntheticAuditObjectStore(config.identityEncryptionKey),
    idempotency:
      repository instanceof PostgresIdentityRepository
        ? new PostgresIdempotencyStore(repository, config.identityEncryptionKey)
        : new InMemoryIdempotencyStore(),
    clock: { now: () => options.clock?.now() ?? new Date() },
  });
  const healthService = new AuditAdminHealthService({
    readiness: auditRepository,
    integrity:
      auditRepository instanceof PostgresAuditAdminRepository
        ? auditRepository
        : { auditIntegrity: async () => 'failed', exportProof: async () => 'failed' },
    clock: { now: () => options.clock?.now() ?? new Date() },
  });
  await registerAuditAdminRoutes(app, {
    adminService: auditAdminService,
    exportService,
    healthService,
    resolveAdminActor: (request) =>
      resolveAuditAdminActor(request, service, auth, options.clock?.now()),
    resolveServiceActor: (request) => resolveAuditServiceActor(request, config),
    rateLimitHmacKey: config.preauthHmacKey,
    ...(options.clock ? { now: () => options.clock!.now().getTime() } : {}),
  });
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

function failClosedAuditRepository(): import('./modules/audit-admin/types.js').AuditAdminRepository {
  return {
    canReadAdminSummary: async () => false,
    approvedAdminSummaryMetricIds: async () => new Set<string>(),
    canReadAudit: async () => false,
    listRedactedAuditEvents: async () => [],
    getRedactedAuditEvent: async () => null,
    verifyAuditChain: async () => ({
      valid: false,
      checked_count: 0,
      first_invalid_sequence: null,
      failure_code: 'forbidden',
    }),
    getAuditExportBatch: async () => null,
    requestAuditExport: async () => {
      throw new ApiPolicyError('forbidden', 403, 'forbidden');
    },
    readiness: async () => ({
      status: 'not_ready',
      database: 'unavailable',
      outbox: 'integrity_failed',
    }),
    healthExposureEnabled: async () => false,
  };
}

function failClosedExportRepository(): import('./modules/audit-admin/types.js').AuditExportOrchestrationPort {
  return { getAuditExportWork: async () => null, recordProvenAuditExport: async () => null };
}

async function resolveAuditAdminActor(
  request: import('fastify').FastifyRequest,
  service: IdentityOnboardingService,
  auth: LocalAuthIssuer | SupabaseAuthIssuer,
  fixedNow?: Date,
): Promise<AuditAdminActor> {
  const authorization = request.headers.authorization;
  const token =
    typeof authorization === 'string' && authorization.startsWith('Bearer ')
      ? authorization.slice(7)
      : '';
  const patient = token ? await service.actorFromAccessToken(token) : undefined;
  const continuity =
    token && auth instanceof SupabaseAuthIssuer ? await auth.verifyAccessToken(token) : undefined;
  const factorAt = continuity?.amr
    .filter((entry) => entry.method === 'totp')
    .map((entry) => entry.timestamp)
    .sort((left, right) => right - left)[0];
  const now = fixedNow ?? new Date();
  return {
    personId: patient?.personId ?? null,
    principal: patient?.principal ?? null,
    sessionCurrent: Boolean(patient),
    aal: continuity?.aal ?? patient?.aal ?? null,
    factorAgeSeconds:
      factorAt === undefined ? null : Math.max(0, Math.floor(now.getTime() / 1000) - factorAt),
    purpose: null,
    requestId: request.id,
    traceId: traceId(request),
  };
}

function resolveAuditServiceActor(
  request: import('fastify').FastifyRequest,
  config: ApiConfig,
): Promise<AuditExportServiceActor> {
  if (!isPrivateAddress(request.ip))
    throw new ApiPolicyError('forbidden', 403, 'The internal operation requires a private peer.');
  const exportRoute = request.routeOptions.url === '/v1/internal/audit/exports';
  const expected = exportRoute
    ? config.auditExportServiceCredential
    : config.healthProbeServiceCredential;
  const supplied = request.headers.authorization?.replace(/^Bearer /, '');
  const authenticated = Boolean(expected && supplied && safeEqual(expected, supplied));
  return Promise.resolve({
    authenticated,
    principal: authenticated
      ? exportRoute
        ? 'service:audit-export-worker'
        : 'service:platform-probe'
      : null,
    workerId:
      exportRoute && authenticated && typeof request.headers['x-worker-id'] === 'string'
        ? request.headers['x-worker-id']
        : null,
    requestId: request.id,
    traceId: traceId(request),
  });
}

function isPrivateAddress(value: string): boolean {
  const address = value.replace(/^::ffff:/, '');
  return (
    address === '127.0.0.1' ||
    address === '::1' ||
    /^10\./.test(address) ||
    /^192\.168\./.test(address) ||
    /^172\.(?:1[6-9]|2\d|3[01])\./.test(address)
  );
}

function traceId(request: import('fastify').FastifyRequest): string {
  const value = request.headers['traceparent'];
  const match =
    typeof value === 'string' ? /^00-([a-f0-9]{32})-[a-f0-9]{16}-[a-f0-9]{2}$/i.exec(value) : null;
  return match?.[1]?.toLowerCase() ?? request.id.replaceAll('-', '').slice(0, 32);
}

function safeEqual(expected: string, supplied: string): boolean {
  const left = Buffer.from(expected);
  const right = Buffer.from(supplied.padEnd(left.length, '\0').slice(0, left.length));
  return left.length === Buffer.byteLength(supplied) && timingSafeEqual(left, right);
}

function auditEnvironment(environment: ApiConfig['environment']): 'local' | 'ci' | 'production' {
  return environment === 'test' ? 'ci' : environment === 'development' ? 'local' : 'production';
}
