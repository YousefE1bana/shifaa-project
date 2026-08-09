import { randomUUID } from 'node:crypto';

import { AesGcmIdentityCipher } from '@shifaa/core';
import cors from '@fastify/cors';
import Fastify from 'fastify';

import {
  LocalAuthIssuer,
  LocalProofingProvider,
  LocalQuarantineUploadStore,
} from './adapters/index.js';
import { loadConfig, type ApiConfig } from './config.js';
import {
  IdentityOnboardingService,
  InMemoryIdentityRepository,
  defaultPortUtilities,
} from './modules/identity-onboarding/index.js';
import { InMemoryIdempotencyStore } from './platform/idempotency.js';
import {
  installIdentityErrorHandler,
  registerIdentityOnboardingRoutes,
} from './routes/identity-onboarding.js';

export interface AppHarness {
  app: ReturnType<typeof Fastify>;
  config: ApiConfig;
  service: IdentityOnboardingService;
  repository: InMemoryIdentityRepository;
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
  const repository = new InMemoryIdentityRepository();
  const utilities = defaultPortUtilities();
  const service = new IdentityOnboardingService({
    auth: new LocalAuthIssuer(),
    cipher: new AesGcmIdentityCipher(config.identityEncryptionKey, config.identityBlindIndexKey, 1),
    proofing: options.proofing ?? new LocalProofingProvider(),
    uploads: new LocalQuarantineUploadStore(),
    repository,
    clock: options.clock ?? utilities.clock,
    ids: utilities.ids,
  });
  const app = Fastify({ logger: false, genReqId: () => randomUUID() });
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
    idempotency: new InMemoryIdempotencyStore(),
  });
  return { app, config, service, repository };
}
