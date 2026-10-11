import { Value } from '@sinclair/typebox/value';
import {
  feature011Operations,
  feature011Schemas,
  type Feature011CreateReleaseRequest,
  type Feature011SignReleaseRequest,
  type Feature011PublishReleaseRequest,
  type Feature011ListClinicalContentQuery,
} from '@shifaa/contracts/feature-011';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { ApiConfig } from '../config.js';
import { isFeature011ExposureAllowed } from '../feature-011-exposure.js';
import { ApiPolicyError } from '../modules/identity-onboarding/errors.js';
import type { PatientActor } from '../modules/identity-onboarding/service.js';
import type { Feature011Content, ContentActor } from '../modules/feature-011/create-release.js';
import type { Feature011Signing } from '../modules/feature-011/sign-release.js';
import type { Feature011Publication } from '../modules/feature-011/publish-release.js';
import type { Feature011Governance } from '../modules/feature-011/list-clinical-content.js';
export interface Feature011ContentRoutes {
  config: ApiConfig;
  service: Pick<Feature011Content, 'createClinicalContentRelease'>;
  signing?: Pick<Feature011Signing, 'signClinicalContentRelease'>;
  publication?: Pick<Feature011Publication, 'publishClinicalContentRelease'>;
  reading?: Pick<Feature011Governance, 'listClinicalContent'>;
  resolveNativePatient?: (token: string) => Promise<PatientActor | undefined>;
}
export async function contentActor(
  request: FastifyRequest,
  deps: Pick<Feature011ContentRoutes, 'resolveNativePatient'>,
): Promise<ContentActor> {
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
export function contentProblem(error: unknown): never {
  if (error instanceof ApiPolicyError) throw error;
  if (error instanceof Error && error.message === 'Feature 011 protection denied')
    throw new ApiPolicyError(
      'forbidden',
      403,
      'Current signing authority or evidence is unavailable.',
    );
  if (error instanceof Error && 'code' in error) {
    const code = error.code;
    if (code === '42501')
      throw new ApiPolicyError('forbidden', 403, 'Current content authority is unavailable.');
    if (code === '40001' || code === 'P0002')
      throw new ApiPolicyError('version-conflict', 409, 'The release version has changed.');
    if (code === '23505' && error.message.includes('idempotency key reused'))
      throw new ApiPolicyError(
        'idempotency-key-reused',
        409,
        'This key is bound to another request.',
      );
    if (code === '22023' || code === '23514')
      throw new ApiPolicyError('validation-failed', 422, 'The artifact is unavailable or invalid.');
  }
  throw error;
}
export async function registerFeature011ContentRoutes(
  app: FastifyInstance,
  deps: Feature011ContentRoutes,
): Promise<void> {
  if (!isFeature011ExposureAllowed(deps.config)) return;
  if (deps.reading) {
    const reading = deps.reading,
      op = feature011Operations.find((o) => o.operationId === 'listClinicalContent')!;
    app.get('/v1' + op.path.replace('{contentType}', ':contentType'), async (request, reply) => {
      const actor = await contentActor(request, deps),
        contentType = (request.params as { contentType: string }).contentType,
        query = { ...(request.query as Record<string, unknown>) };
      for (const name of ['limit', 'version']) {
        if (typeof query[name] === 'string' && /^[1-9][0-9]*$/.test(query[name]))
          query[name] = Number(query[name]);
      }
      if (!contentType.length || !Value.Check(feature011Schemas.listClinicalContentQuery, query))
        throw new ApiPolicyError('validation-failed', 422, 'Invalid content filters.');
      const result = await reading
        .listClinicalContent(actor, contentType, query as Feature011ListClinicalContentQuery)
        .catch(contentProblem);
      return reply.header('cache-control', 'private, no-store').send(result);
    });
  }
  if (deps.publication) {
    const publication = deps.publication,
      op = feature011Operations.find((o) => o.operationId === 'publishClinicalContentRelease')!;
    app.post('/v1' + op.path.replace('{releaseId}', ':releaseId'), async (request, reply) => {
      const actor = await contentActor(request, deps),
        releaseId = (request.params as { releaseId: string }).releaseId;
      if (
        !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(releaseId) ||
        Object.keys(request.query as object).length ||
        !Value.Check(feature011Schemas.PublishReleaseRequest, request.body)
      )
        throw new ApiPolicyError('validation-failed', 422, 'Invalid publication request.');
      const match = request.headers['if-match'];
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
      const key = request.headers['idempotency-key'];
      if (typeof key !== 'string' || key.length < 16 || key.length > 128)
        throw new ApiPolicyError('idempotency-key-invalid', 400, 'Invalid Idempotency-Key.');
      const result = await publication
        .publishClinicalContentRelease(
          actor,
          releaseId,
          request.body as Feature011PublishReleaseRequest,
          { key, expectedVersion: Number(match.slice(1, -1)) },
        )
        .catch(contentProblem);
      return reply
        .status(result.status)
        .headers(result.headers)
        .type('application/json')
        .send(result.body);
    });
  }
  if (deps.signing) {
    const signing = deps.signing,
      signature = feature011Operations.find((o) => o.operationId === 'signClinicalContentRelease')!;
    app.post(
      '/v1' + signature.path.replace('{releaseId}', ':releaseId'),
      async (request, reply) => {
        const actor = await contentActor(request, deps),
          releaseId = (request.params as { releaseId: string }).releaseId;
        if (
          !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(releaseId) ||
          Object.keys(request.query as object).length ||
          !Value.Check(feature011Schemas.SignReleaseRequest, request.body)
        )
          throw new ApiPolicyError('validation-failed', 422, 'Invalid signing request.');
        const match = request.headers['if-match'];
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
        const key = request.headers['idempotency-key'];
        if (typeof key !== 'string' || key.length < 16 || key.length > 128)
          throw new ApiPolicyError('idempotency-key-invalid', 400, 'Invalid Idempotency-Key.');
        const result = await signing
          .signClinicalContentRelease(
            actor,
            releaseId,
            request.body as Feature011SignReleaseRequest,
            { key, expectedVersion: Number(match.slice(1, -1)) },
          )
          .catch(contentProblem);
        return reply
          .status(result.status)
          .headers(result.headers)
          .type('application/json')
          .send(result.body);
      },
    );
  }
  const op = feature011Operations.find((o) => o.operationId === 'createClinicalContentRelease')!;
  app.post('/v1' + op.path.replace('{contentType}', ':contentType'), async (request, reply) => {
    const actor = await contentActor(request, deps),
      contentType = (request.params as { contentType: string }).contentType;
    if (
      !contentType?.length ||
      Object.keys(request.query as object).length ||
      !Value.Check(feature011Schemas.CreateReleaseRequest, request.body)
    )
      throw new ApiPolicyError('validation-failed', 422, 'Invalid create-release request.');
    const key = request.headers['idempotency-key'];
    if (typeof key !== 'string' || key.length < 16 || key.length > 128)
      throw new ApiPolicyError('idempotency-key-invalid', 400, 'Invalid Idempotency-Key.');
    const result = await deps.service
      .createClinicalContentRelease(
        actor,
        contentType,
        request.body as Feature011CreateReleaseRequest,
        key,
      )
      .catch(contentProblem);
    return reply
      .status(result.status)
      .headers(result.headers)
      .type('application/json')
      .send(result.body);
  });
}
