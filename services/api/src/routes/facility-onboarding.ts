import { adminRoles, type AdminRole } from '@shifaa/core';
import {
  facilityOperationIds,
  facilityRequestSchemas,
  type AdminGrantProposalInput,
  type DecisionInput,
  type FacilityCreateInput,
  type FacilityLicenseUploadInput,
  type FacilityPatchInput,
  type FacilityReviewInput,
  type FacilityUploadMetadata,
  type MembershipInviteInput,
  type MembershipPatchInput,
  type ProfessionalLicenseCreateInput,
  type ProfessionalReviewInput,
  type ReasonInput,
} from '@shifaa/contracts';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { ApiPolicyError } from '../modules/identity-onboarding/errors.js';
import type {
  FacilityActor,
  FacilityOnboardingService,
  FacilityPageQuery,
} from '../modules/facility-onboarding/index.js';
import type { PostgresFacilityOnboardingService } from '../adapters/postgres/facility-service.js';
import type { IdempotencyStore } from '../platform/idempotency.js';

export const registeredFacilityOperationIds = [
  'createProfessionalLicense',
  'createProfessionalLicenseUpload',
  'getProfessionalLicense',
  'listProfessionalLicenseCases',
  'reviewProfessionalLicense',
  'createFacility',
  'getFacility',
  'updateFacility',
  'submitFacility',
  'createFacilityLicenseUpload',
  'listFacilityApprovalCases',
  'reviewFacility',
  'listFacilityMemberships',
  'inviteFacilityMember',
  'acceptFacilityMembership',
  'updateFacilityMembership',
  'endFacilityMembership',
  'listAdminRoleGrants',
  'proposeAdminRoleGrant',
  'decideAdminRoleGrant',
  'proposeAdminRoleRevocation',
  'decideAdminRoleRevocation',
] satisfies readonly (typeof facilityOperationIds)[number][];
const noStore = { 'cache-control': 'private, no-store', pragma: 'no-cache' } as const;
const syntheticModes = new WeakMap<FastifyInstance, boolean>();
const rateWindows = new WeakMap<
  FastifyInstance,
  Map<string, { startedAt: number; count: number }>
>();
function consumeSyntheticRate(request: FastifyRequest, principal: string) {
  const store = rateWindows.get(request.server);
  if (!store) return;
  const reviewRead =
    request.method === 'GET' &&
    (request.url.startsWith('/v1/admin/facilities') ||
      request.url.startsWith('/v1/admin/professional-licenses'));
  const bucket = request.method === 'GET' ? (reviewRead ? 'review-read' : 'read') : 'mutation';
  const limit = bucket === 'mutation' ? 30 : bucket === 'review-read' ? 60 : 120;
  const key = `${principal}:${bucket}`;
  const now = Date.now();
  const current = store.get(key);
  const next =
    !current || now - current.startedAt >= 60_000
      ? { startedAt: now, count: 1 }
      : { ...current, count: current.count + 1 };
  store.set(key, next);
  if (next.count > limit)
    throw new ApiPolicyError('rate-limit-exceeded', 429, 'Retry after the current rate window.');
}
function actorFor(request: FastifyRequest): FacilityActor {
  if (!syntheticModes.get(request.server))
    throw new ApiPolicyError(
      'open-sec-001',
      503,
      'Facility sessions remain disabled outside seeded-synthetic mode.',
    );
  const authorization = request.headers.authorization;
  if (!authorization?.startsWith('Bearer '))
    throw new ApiPolicyError('authentication-required', 401, 'Sign in to continue.');
  const token = authorization.slice(7);
  const admin = /^synthetic-admin:([^:]+):([0-9a-f-]{36})$/.exec(token);
  if (admin) {
    if (!adminRoles.includes(admin[1] as AdminRole))
      throw new ApiPolicyError('permission-denied', 403, 'Unknown administrative role.');
    const actor: FacilityActor = {
      personId: admin[2]!,
      principal: token,
      requestId: request.id,
      adminRole: admin[1] as AdminRole,
      aal: request.headers['x-aal'] === '2' ? 2 : 1,
      ...(typeof request.headers['x-purpose'] === 'string'
        ? { purpose: request.headers['x-purpose'] }
        : {}),
    };
    consumeSyntheticRate(request, actor.principal);
    return actor;
  }
  const person = /^synthetic-person:([0-9a-f-]{36})$/.exec(token);
  if (!person)
    throw new ApiPolicyError('authentication-required', 401, 'Invalid synthetic session.');
  const actor: FacilityActor = {
    personId: person[1]!,
    principal: token,
    requestId: request.id,
    aal: request.headers['x-aal'] === '2' ? 2 : 1,
    ...(typeof request.headers['x-purpose'] === 'string'
      ? { purpose: request.headers['x-purpose'] }
      : {}),
  };
  consumeSyntheticRate(request, actor.principal);
  return actor;
}
function key(request: FastifyRequest) {
  const value = request.headers['idempotency-key'];
  if (typeof value !== 'string')
    throw new ApiPolicyError('idempotency-key-required', 400, 'Idempotency-Key is required.');
  return value;
}
function version(request: FastifyRequest) {
  const value = request.headers['if-match'];
  if (typeof value !== 'string' || !/^"[1-9][0-9]*"$/.test(value))
    throw new ApiPolicyError('if-match-required', 428, 'If-Match is required.');
  return Number(value.slice(1, -1));
}
async function mutate(
  request: FastifyRequest,
  reply: FastifyReply,
  deps: FacilityRouteDependencies,
  status: number,
  work: (actor: FacilityActor) => unknown,
) {
  const actor = actorFor(request);
  const stored = await deps.idempotency.execute({
    principal: actor.principal,
    method: request.method,
    route: request.routeOptions.url ?? request.url,
    key: key(request),
    body: request.body,
    work: async () => ({ status, headers: noStore, body: await work(actor) }),
  });
  return reply.status(stored.status).headers(stored.headers).send(stored.body);
}
interface FacilityRouteDependencies {
  service: FacilityOnboardingService | PostgresFacilityOnboardingService;
  idempotency: IdempotencyStore;
  syntheticMode: boolean;
}
const params = (...names: string[]) => ({
  type: 'object',
  required: names,
  properties: Object.fromEntries(names.map((name) => [name, { type: 'string', minLength: 1 }])),
});
const pageQuery = {
  type: 'object',
  additionalProperties: false,
  properties: {
    cursor: { type: 'string', minLength: 1 },
    limit: { type: 'integer', minimum: 1, maximum: 100 },
  },
} as const;
export async function registerFacilityOnboardingRoutes(
  app: FastifyInstance,
  deps: FacilityRouteDependencies,
) {
  syntheticModes.set(app, deps.syntheticMode);
  rateWindows.set(app, new Map());
  app.addHook('onSend', async (_request, reply, payload) => {
    reply.headers({ ...noStore, 'x-request-id': reply.request.id });
    return payload;
  });
  app.post(
    '/v1/people/me/professional-licenses',
    { schema: { body: facilityRequestSchemas.createProfessionalLicense } },
    (r, p) =>
      mutate(r, p, deps, 201, (a) =>
        deps.service.createProfessionalLicense(a, r.body as ProfessionalLicenseCreateInput),
      ),
  );
  app.post(
    '/v1/professional-licenses/:licenseId/upload-intent',
    {
      schema: {
        params: params('licenseId'),
        body: facilityRequestSchemas.createProfessionalLicenseUpload,
      },
    },
    (r, p) =>
      mutate(r, p, deps, 201, (a) =>
        deps.service.createProfessionalUpload(
          a,
          (r.params as { licenseId: string }).licenseId,
          r.body as FacilityUploadMetadata,
        ),
      ),
  );
  app.get(
    '/v1/professional-licenses/:licenseId',
    { schema: { params: params('licenseId') } },
    (r) =>
      deps.service.getProfessionalLicense(
        actorFor(r),
        (r.params as { licenseId: string }).licenseId,
      ),
  );
  app.get('/v1/admin/professional-licenses', { schema: { querystring: pageQuery } }, (r) =>
    deps.service.listProfessionalCases(actorFor(r), r.query as FacilityPageQuery),
  );
  app.post(
    '/v1/admin/professional-licenses/:licenseId/decision',
    {
      schema: {
        params: params('licenseId'),
        body: facilityRequestSchemas.reviewProfessionalLicense,
      },
    },
    (r, p) =>
      mutate(r, p, deps, 200, (a) =>
        deps.service.reviewProfessional(
          a,
          (r.params as { licenseId: string }).licenseId,
          r.body as ProfessionalReviewInput,
          version(r),
        ),
      ),
  );
  app.post('/v1/facilities', { schema: { body: facilityRequestSchemas.createFacility } }, (r, p) =>
    mutate(r, p, deps, 201, (a) => deps.service.createFacility(a, r.body as FacilityCreateInput)),
  );
  app.get('/v1/facilities/:facilityId', { schema: { params: params('facilityId') } }, (r) =>
    deps.service.getFacility(actorFor(r), (r.params as { facilityId: string }).facilityId),
  );
  app.patch(
    '/v1/facilities/:facilityId',
    { schema: { params: params('facilityId'), body: facilityRequestSchemas.updateFacility } },
    (r, p) =>
      mutate(r, p, deps, 200, (a) =>
        deps.service.updateFacility(
          a,
          (r.params as { facilityId: string }).facilityId,
          r.body as FacilityPatchInput,
          version(r),
        ),
      ),
  );
  app.post(
    '/v1/facilities/:facilityId/submit',
    { schema: { params: params('facilityId') } },
    (r, p) =>
      mutate(r, p, deps, 200, (a) =>
        deps.service.submitFacility(a, (r.params as { facilityId: string }).facilityId, version(r)),
      ),
  );
  app.post(
    '/v1/facilities/:facilityId/licenses/upload-intent',
    {
      schema: {
        params: params('facilityId'),
        body: facilityRequestSchemas.createFacilityLicenseUpload,
      },
    },
    (r, p) =>
      mutate(r, p, deps, 201, (a) =>
        deps.service.createFacilityLicenseUpload(
          a,
          (r.params as { facilityId: string }).facilityId,
          r.body as FacilityLicenseUploadInput,
        ),
      ),
  );
  app.get('/v1/admin/facilities', { schema: { querystring: pageQuery } }, (r) =>
    deps.service.listFacilityCases(actorFor(r), r.query as FacilityPageQuery),
  );
  app.post(
    '/v1/admin/facilities/:facilityId/decision',
    { schema: { params: params('facilityId'), body: facilityRequestSchemas.reviewFacility } },
    (r, p) =>
      mutate(r, p, deps, 200, (a) =>
        deps.service.reviewFacility(
          a,
          (r.params as { facilityId: string }).facilityId,
          r.body as FacilityReviewInput,
          version(r),
        ),
      ),
  );
  app.get(
    '/v1/facilities/:facilityId/memberships',
    { schema: { params: params('facilityId'), querystring: pageQuery } },
    (r) =>
      deps.service.listMemberships(
        actorFor(r),
        (r.params as { facilityId: string }).facilityId,
        r.query as FacilityPageQuery,
      ),
  );
  app.post(
    '/v1/facilities/:facilityId/memberships',
    { schema: { params: params('facilityId'), body: facilityRequestSchemas.inviteFacilityMember } },
    (r, p) =>
      mutate(r, p, deps, 201, (a) =>
        deps.service.inviteMember(
          a,
          (r.params as { facilityId: string }).facilityId,
          r.body as MembershipInviteInput,
        ),
      ),
  );
  app.post(
    '/v1/facility-membership-invites/:token/accept',
    { schema: { params: params('token') } },
    (r, p) =>
      mutate(r, p, deps, 200, (a) =>
        deps.service.acceptMembership(a, (r.params as { token: string }).token),
      ),
  );
  app.patch(
    '/v1/facilities/:facilityId/memberships/:membershipId',
    {
      schema: {
        params: params('facilityId', 'membershipId'),
        body: facilityRequestSchemas.updateFacilityMembership,
      },
    },
    (r, p) =>
      mutate(r, p, deps, 200, (a) => {
        const x = r.params as { facilityId: string; membershipId: string };
        return deps.service.updateMembership(
          a,
          x.facilityId,
          x.membershipId,
          r.body as MembershipPatchInput,
          version(r),
        );
      }),
  );
  app.post(
    '/v1/facilities/:facilityId/memberships/:membershipId/end',
    {
      schema: {
        params: params('facilityId', 'membershipId'),
        body: facilityRequestSchemas.endFacilityMembership,
      },
    },
    (r, p) =>
      mutate(r, p, deps, 200, (a) => {
        const x = r.params as { facilityId: string; membershipId: string };
        return deps.service.endMembership(
          a,
          x.facilityId,
          x.membershipId,
          r.body as ReasonInput,
          version(r),
        );
      }),
  );
  app.get('/v1/admin/role-grants', { schema: { querystring: pageQuery } }, (r) =>
    deps.service.listGrants(actorFor(r), r.query as FacilityPageQuery),
  );
  app.post(
    '/v1/admin/role-grants',
    { schema: { body: facilityRequestSchemas.proposeAdminRoleGrant } },
    (r, p) =>
      mutate(r, p, deps, 201, (a) =>
        deps.service.proposeGrant(a, r.body as AdminGrantProposalInput),
      ),
  );
  app.post(
    '/v1/admin/role-grants/:grantId/decision',
    { schema: { params: params('grantId'), body: facilityRequestSchemas.decideAdminRoleGrant } },
    (r, p) =>
      mutate(r, p, deps, 200, (a) =>
        deps.service.decideGrant(
          a,
          (r.params as { grantId: string }).grantId,
          r.body as DecisionInput,
          version(r),
        ),
      ),
  );
  app.post(
    '/v1/admin/role-grants/:grantId/revocation-requests',
    {
      schema: {
        params: params('grantId'),
        body: facilityRequestSchemas.proposeAdminRoleRevocation,
      },
    },
    (r, p) =>
      mutate(r, p, deps, 201, (a) =>
        deps.service.proposeRevocation(
          a,
          (r.params as { grantId: string }).grantId,
          r.body as ReasonInput,
          version(r),
        ),
      ),
  );
  app.post(
    '/v1/admin/role-grant-revocations/:requestId/decision',
    {
      schema: {
        params: params('requestId'),
        body: facilityRequestSchemas.decideAdminRoleRevocation,
      },
    },
    (r, p) =>
      mutate(r, p, deps, 200, (a) =>
        deps.service.decideRevocation(
          a,
          (r.params as { requestId: string }).requestId,
          r.body as DecisionInput,
          version(r),
        ),
      ),
  );
}
