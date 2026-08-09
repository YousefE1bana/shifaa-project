import { describe, expect, it } from 'vitest';

import { operationIds } from '@shifaa/contracts';

import { buildApp } from '../app.js';
import { registeredIdentityOnboardingOperationIds } from './identity-onboarding.js';

describe('identity onboarding HTTP contract', () => {
  it('registers exactly all 16 approved operation IDs', () => {
    expect(new Set(registeredIdentityOnboardingOperationIds)).toEqual(new Set(operationIds));
    expect(registeredIdentityOnboardingOperationIds).toHaveLength(16);
  });

  it('returns localized RFC 9457 problems with no-store and request IDs', async () => {
    const { app } = await buildApp();
    const response = await app.inject({
      method: 'POST',
      url: '/v1/auth/register',
      headers: { 'accept-language': 'ar-EG', 'idempotency-key': 'register-invalid-01' },
      payload: { locale: 'ar-EG', handle: 'bad', password: 'short' },
    });
    expect(response.statusCode).toBe(400);
    expect(response.headers['content-type']).toContain('application/problem+json');
    expect(response.headers['cache-control']).toBe('private, no-store');
    expect(response.json()).toMatchObject({
      code: 'validation-failed',
      status: 400,
      title: 'راجع البيانات المدخلة',
    });
    expect(response.json().request_id).toMatch(/^[0-9a-f-]{36}$/);
    await app.close();
  });
});
