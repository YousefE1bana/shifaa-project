import { feature011Operations } from '@shifaa/contracts';
import type { FastifyInstance } from 'fastify';
import { ConfigurationError, type ApiConfig } from './config.js';
import { ApiPolicyError } from './modules/identity-onboarding/errors.js';

export function isFeature011ExposureAllowed(config: ApiConfig): boolean {
  return (
    config.environment === 'test' &&
    config.syntheticMode === true &&
    config.syntheticModeExplicitlyEnabled === true &&
    config.feature011Enabled === true &&
    config.feature011IsolatedTest === true &&
    config.feature011KillSwitch === false &&
    ['127.0.0.1', '::1', 'localhost'].includes(config.host)
  );
}

function isFeature011Route(method: string, url: string): boolean {
  return feature011Operations.some((operation) => {
    const verb = method === 'HEAD' ? 'GET' : method;
    if (operation.method.toUpperCase() !== verb) return false;
    const expected = `/v1${operation.path}`.split('/');
    const actual = url.split('/');
    return (
      expected.length === actual.length &&
      expected.every((part, index) =>
        part.startsWith('{') ? Boolean(actual[index]) : part === actual[index],
      )
    );
  });
}

// Installed on the root before plugins/routes. It registers no operation itself.
export function installFeature011ExposureGuard(app: FastifyInstance, config: ApiConfig): void {
  app.addHook('onRoute', (route) => {
    const methods = Array.isArray(route.method) ? route.method : [route.method];
    if (
      methods.some((method) => isFeature011Route(method, route.url)) &&
      !isFeature011ExposureAllowed(config)
    ) {
      throw new ConfigurationError(
        'Feature 011 route registration denied: exposure is disabled or kill switch is engaged.',
      );
    }
  });
  app.addHook('onRequest', async (request) => {
    if (
      isFeature011Route(request.method, request.routeOptions.url ?? '') &&
      !isFeature011ExposureAllowed(config)
    ) {
      throw new ApiPolicyError(
        'service-unavailable',
        503,
        'Feature 011 is unavailable in the current runtime.',
        { 'cache-control': 'no-store' },
      );
    }
  });
}
