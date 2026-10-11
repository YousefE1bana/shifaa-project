import { existsSync } from 'node:fs';
import Fastify, { type FastifyInstance } from 'fastify';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from './app.js';
import { loadConfig, type ApiConfig } from './config.js';
import { installIdentityErrorHandler } from './routes/identity-onboarding.js';

// Independent literals from the approved seven-operation public contract.
const operations = [
  [
    'GET',
    '/v1/patients/:managedPatientId/allergies',
    '/v1/patients/f0110000-0000-4000-8100-000000000001/allergies',
  ],
  [
    'POST',
    '/v1/patients/:managedPatientId/allergies',
    '/v1/patients/f0110000-0000-4000-8100-000000000001/allergies',
  ],
  [
    'POST',
    '/v1/allergies/:allergyId/verification',
    '/v1/allergies/f0110000-0000-4000-8100-000000000001/verification',
  ],
  ['GET', '/v1/admin/clinical-content/:contentType', '/v1/admin/clinical-content/allergy'],
  [
    'POST',
    '/v1/admin/clinical-content/:contentType/releases',
    '/v1/admin/clinical-content/allergy/releases',
  ],
  [
    'POST',
    '/v1/admin/clinical-content/releases/:releaseId/signatures',
    '/v1/admin/clinical-content/releases/f0110000-0000-4000-8100-000000000001/signatures',
  ],
  [
    'POST',
    '/v1/admin/clinical-content/releases/:releaseId/publish',
    '/v1/admin/clinical-content/releases/f0110000-0000-4000-8100-000000000001/publish',
  ],
] as const;
const isolated = {
  NODE_ENV: 'test',
  SHIFAA_SYNTHETIC_MODE: 'true',
  FEATURE_011_ENABLED: 'true',
  FEATURE_011_ISOLATED_TEST: 'true',
  FEATURE_011_KILL_SWITCH: 'false',
};
const apps: FastifyInstance[] = [];
type Guard = (app: FastifyInstance, config: ApiConfig) => void;
let installGuard: Guard | undefined;
beforeAll(async () => {
  // Absent implementation is an explicit assertion failure, never an import/setup error.
  const path = new URL('./feature-011-exposure.ts', import.meta.url);
  if (existsSync(path)) {
    const module = await import(/* @vite-ignore */ path.href);
    installGuard = module.installFeature011ExposureGuard;
  }
});
afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
});
function guarded(config: ApiConfig) {
  expect(installGuard, 'Missing default-off exposure behavior').toBeTypeOf('function');
  const app = Fastify();
  apps.push(app);
  installIdentityErrorHandler(app);
  installGuard!(app, config);
  return app;
}
describe('Feature 011 exposure prerequisite', () => {
  it('has a healthy baseline application/configuration before exposure assertions', async () => {
    const config = loadConfig({ NODE_ENV: 'test' });
    expect(config.environment).toBe('test');
    const { app } = await buildApp({ config });
    apps.push(app);
    expect((await app.inject({ method: 'GET', url: '/v1/health' })).statusCode).toBe(200);
  });
  it('defaults to disabled exposure and an engaged kill switch', () => {
    expect(loadConfig({ NODE_ENV: 'test' })).toMatchObject({
      feature011Enabled: false,
      feature011IsolatedTest: false,
      feature011KillSwitch: true,
    });
  });
  for (const flag of [
    'FEATURE_011_ENABLED',
    'FEATURE_011_ISOLATED_TEST',
    'FEATURE_011_KILL_SWITCH',
  ]) {
    it(`rejects invalid ${flag} before any application can register routes`, () => {
      expect(() => loadConfig({ NODE_ENV: 'test', [flag]: 'invalid' })).toThrow(/boolean/);
    });
  }
  for (const env of [
    { NODE_ENV: 'test' },
    { NODE_ENV: 'test', FEATURE_011_ENABLED: 'false' },
    { ...isolated, FEATURE_011_KILL_SWITCH: 'true' },
    isolated,
  ]) {
    it(`keeps all seven actual application routes absent for ${JSON.stringify(env)}`, async () => {
      const { app } = await buildApp({ config: loadConfig(env) });
      apps.push(app);
      for (const [method, , url] of operations)
        expect((await app.inject({ method, url })).statusCode).toBe(404);
      for (const url of [
        '/v1/prescriptions',
        '/v1/prescriptions/safety',
        '/v1/warnings',
        '/v1/overrides',
        '/v1/break-glass',
        '/v1/dispensing',
      ]) {
        expect((await app.inject({ method: 'POST', url })).statusCode).toBe(404);
      }
    });
  }
  for (const patch of [
    { SHIFAA_SYNTHETIC_MODE: undefined },
    { SHIFAA_SYNTHETIC_MODE: 'false' },
    { FEATURE_011_ISOLATED_TEST: undefined },
    { FEATURE_011_ISOLATED_TEST: 'false' },
    { NODE_ENV: 'development' },
    { NODE_ENV: 'production' },
    { HOST: '0.0.0.0' },
  ]) {
    it(`denies nonisolated enablement ${JSON.stringify(patch)}`, () => {
      expect(() => loadConfig({ ...isolated, ...patch })).toThrow(/Feature 011/);
    });
  }
  for (const [method, url] of operations) {
    it(`blocks later registration while disabled: ${method} ${url}`, () => {
      const app = guarded(loadConfig({ NODE_ENV: 'test' }));
      expect(() => app.route({ method, url, handler: () => ({ syntheticProbe: true }) })).toThrow(
        /Feature 011/,
      );
    });
  }
  it('permits only neutral ephemeral handlers in explicit isolated exposure and rechecks kill switch before execution', async () => {
    const config = loadConfig(isolated);
    const app = guarded(config);
    let effects = 0;
    const queue: string[] = [];
    for (const [method, url] of operations)
      app.route({
        method,
        url,
        handler: () => {
          effects++;
          queue.push('neutral-probe');
          return { syntheticProbe: true };
        },
      });
    for (const [method, , url] of operations)
      expect((await app.inject({ method, url })).statusCode).toBe(200);
    expect(effects).toBe(7);
    queue.length = 0;
    Object.assign(config, { feature011KillSwitch: true });
    for (const [method, , url] of operations) {
      const response = await app.inject({ method, url });
      expect(response.statusCode).toBe(503);
      expect(response.json()).toMatchObject({ code: 'service-unavailable' });
    }
    expect(effects).toBe(7);
    expect(queue).toEqual([]);
  });
  it('guards later nested application registration without affecting baseline routes', async () => {
    const { app } = await buildApp({ config: loadConfig({ NODE_ENV: 'test' }) });
    apps.push(app);
    app.register(async (nested: FastifyInstance) => {
      nested.post('/v1/allergies/:allergyId/verification', () => ({ syntheticProbe: true }));
    });
    let failure: unknown;
    try {
      await app.ready();
    } catch (error) {
      failure = error;
    }
    expect(failure).toBeInstanceOf(Error);
    expect((failure as Error).message).toMatch(/Feature 011/);
  });
  it('cannot bypass disabled registration by renaming a parameter or specializing its value', () => {
    const app = guarded(loadConfig({ NODE_ENV: 'test' }));
    for (const url of ['/v1/patients/:id/allergies', '/v1/admin/clinical-content/allergy']) {
      expect(() => app.get(url, () => ({ syntheticProbe: true }))).toThrow(/Feature 011/);
    }
  });
  it('rechecks isolation after registration before any neutral effect or queue entry', async () => {
    const config = loadConfig(isolated),
      app = guarded(config);
    const queue: string[] = [];
    app.post('/v1/patients/:id/allergies', () => {
      queue.push('neutral-probe');
      return {};
    });
    config.feature011IsolatedTest = false;
    expect((await app.inject({ method: 'POST', url: operations[1][2] })).statusCode).toBe(503);
    expect(queue).toEqual([]);
  });
});
