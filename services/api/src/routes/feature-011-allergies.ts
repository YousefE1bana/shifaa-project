import { Value } from '@sinclair/typebox/value';
import {
  feature011Schemas,
  feature011Operations,
  type Feature011CreateAllergyRequest,
  type Feature011ListAllergiesQuery,
  type Feature011VerifyAllergyRequest,
} from '@shifaa/contracts/feature-011';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { isFeature011ExposureAllowed } from '../feature-011-exposure.js';
import { ApiPolicyError } from '../modules/identity-onboarding/errors.js';
import type { AllergyActor } from '../modules/feature-011/allergies.js';
import type { ApiConfig } from '../config.js';
import type { PatientActor } from '../modules/identity-onboarding/service.js';
import type { Feature011Allergies } from '../modules/feature-011/allergies.js';
export interface Feature011AllergyRoutes {
  config: ApiConfig;
  service: Pick<Feature011Allergies, 'listAllergies' | 'createAllergy'> &
    Partial<Pick<Feature011Allergies, 'verifyAllergy'>>;
  resolveNativePatient?: (token: string) => Promise<PatientActor | undefined>;
}
export const registeredFeature011AllergyOperationIds = [
  'listAllergies',
  'createAllergy',
  'verifyAllergy',
] as const;
async function actor(
  request: FastifyRequest,
  deps: Feature011AllergyRoutes,
): Promise<AllergyActor> {
  const token = request.headers.authorization?.startsWith('Bearer ')
    ? request.headers.authorization.slice(7)
    : '';
  const native = token ? await deps.resolveNativePatient?.(token) : undefined;
  if (!native) throw new ApiPolicyError('authentication-required', 401, 'Sign in to continue.');
  const raw = request.headers['x-purpose'];
  const purposes =
    typeof raw === 'string'
      ? [
          ...new Set(
            raw
              .split(',')
              .map((s) => s.trim())
              .filter(Boolean),
          ),
        ]
      : [];
  if (!purposes.length || purposes.some((s) => !/^[a-z][a-z0-9_.:-]*$/i.test(s)))
    throw new ApiPolicyError('purpose-required', 403, 'A current purpose is required.');
  const locale = request.headers['accept-language'] ?? 'ar-EG';
  if (locale !== 'ar-EG' && locale !== 'en-EG')
    throw new ApiPolicyError('validation-failed', 422, 'Unsupported locale.');
  return { ...native, requestId: request.id, locale, purposes };
}
function validate<T>(schema: Parameters<typeof Value.Check>[0], value: unknown): T {
  if (!Value.Check(schema, value))
    throw new ApiPolicyError(
      'validation-failed',
      422,
      'The request does not match the approved contract.',
    );
  return value as T;
}
export async function registerFeature011AllergyRoutes(
  app: FastifyInstance,
  deps: Feature011AllergyRoutes,
): Promise<void> {
  if (!isFeature011ExposureAllowed(deps.config)) return;
  if (deps.service.verifyAllergy) {
    const operation = feature011Operations.find((op) => op.operationId === 'verifyAllergy')!;
    app.post(
      '/v1' + operation.path.replace('{allergyId}', ':allergyId'),
      async (request, reply) => {
        const authenticated = await actor(request, deps);
        const allergyId = validate<string>(
          feature011Schemas.Uuid,
          (request.params as { allergyId: string }).allergyId,
        );
        if (Object.keys(request.query as object).length)
          throw new ApiPolicyError(
            'validation-failed',
            422,
            'No verification query parameters are accepted.',
          );
        const body = validate<Feature011VerifyAllergyRequest>(
          feature011Schemas.VerifyAllergyRequest,
          request.body,
        );
        const match = request.headers['if-match'],
          key = request.headers['idempotency-key'];
        if (
          typeof match !== 'string' ||
          !/^"[1-9][0-9]*"$/.test(match) ||
          !Number.isSafeInteger(Number(match.slice(1, -1)))
        )
          throw new ApiPolicyError(
            'validation-failed',
            422,
            'A current quoted If-Match version is required.',
          );
        if (typeof key !== 'string' || key.length < 16 || key.length > 128)
          throw new ApiPolicyError('idempotency-key-invalid', 400, 'Invalid Idempotency-Key.');
        const receipt = await deps.service.verifyAllergy!(
          authenticated,
          allergyId,
          body,
          Number(match.slice(1, -1)),
          key,
        ).catch((error: unknown) => {
          if (error instanceof Error && 'code' in error) {
            if (error.code === '40001')
              throw new ApiPolicyError('version-conflict', 409, 'The assertion has advanced.');
            if (error.code === '42501')
              throw new ApiPolicyError('forbidden', 403, 'Current authority is unavailable.');
            if (error.code === '23505' && error.message.includes('idempotency key reused'))
              throw new ApiPolicyError(
                'idempotency-key-reused',
                409,
                'This key is bound to another request.',
              );
            if (error.code === '23514' || error.code === 'P0002' || error.code === '23505')
              throw new ApiPolicyError(
                'state-transition-invalid',
                409,
                'The decision basis is no longer available.',
              );
          }
          throw error;
        });
        validate(feature011Schemas.AllergyRevision, JSON.parse(receipt.body.toString()));
        return reply
          .status(receipt.status)
          .headers(receipt.headers)
          .type('application/json')
          .send(receipt.body);
      },
    );
  }
  const template = feature011Operations.find((op) => op.operationId === 'listAllergies')!.path;
  const url = '/v1' + template.replace('{managedPatientId}', ':managedPatientId');
  app.get(url, async (request, reply) => {
    const authenticated = await actor(request, deps);
    const patient = validate<string>(
      feature011Schemas.Uuid,
      (request.params as { managedPatientId: string }).managedPatientId,
    );
    const raw = { ...(request.query as Record<string, unknown>) };
    if (typeof raw['limit'] === 'string' && /^[0-9]+$/.test(raw['limit']))
      raw['limit'] = Number(raw['limit']);
    const query = validate<Feature011ListAllergiesQuery>(feature011Schemas.listAllergiesQuery, raw);
    const result = await deps.service.listAllergies(authenticated, patient, query);
    validate(feature011Schemas.AllergyList, result);
    return reply
      .headers({
        'Cache-Control': 'private, no-store',
        'Content-Language': authenticated.locale,
        'X-Request-Id': authenticated.requestId,
      })
      .send(result);
  });
  app.post(url, async (request, reply) => {
    const authenticated = await actor(request, deps);
    const patient = validate<string>(
      feature011Schemas.Uuid,
      (request.params as { managedPatientId: string }).managedPatientId,
    );
    validate(feature011Schemas.listAllergiesQuery, request.query);
    if (Object.keys(request.query as object).length)
      throw new ApiPolicyError(
        'validation-failed',
        422,
        'No query parameters are accepted for this report.',
      );
    const body = validate<Feature011CreateAllergyRequest>(
      feature011Schemas.CreateAllergyRequest,
      request.body,
    );
    const key = request.headers['idempotency-key'];
    if (typeof key !== 'string' || key.length < 16 || key.length > 128)
      throw new ApiPolicyError(
        'idempotency-key-invalid',
        400,
        'Idempotency-Key must contain between 16 and 128 characters.',
      );
    const receipt = await deps.service
      .createAllergy(authenticated, patient, body, key)
      .catch((error: unknown) => {
        if (
          error instanceof Error &&
          'code' in error &&
          error.code === '23505' &&
          error.message.includes('idempotency key reused')
        )
          throw new ApiPolicyError(
            'idempotency-key-reused',
            409,
            'This key is already bound to another request.',
          );
        throw error;
      });
    validate(feature011Schemas.AllergyRevision, JSON.parse(receipt.body.toString()));
    return reply
      .status(receipt.status)
      .headers(receipt.headers)
      .type('application/json')
      .send(receipt.body);
  });
}
