import {
  familyCareOperationIds,
  familyCareRequestSchemas,
  type AcceptDelegationInput,
  type CreateDelegationInput,
  type CreateEmergencyContactInput,
  type CreateGuardianshipInput,
  type GuardianshipDecisionInput,
  type RespondEmergencyContactInput,
  type RevokeRelationshipInput,
  type UpdateDelegationInput,
} from '@shifaa/contracts';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { ApiPolicyError } from '../modules/identity-onboarding/errors.js';
import type {
  FamilyActor,
  FamilyCareServicePort,
  FamilyPageQuery,
} from '../modules/family-care/index.js';
import type { IdempotencyStore } from '../platform/idempotency.js';

export const registeredFamilyCareOperationIds = [
  'listRelationships',
  'createGuardianship',
  'listGuardianshipCases',
  'reviewGuardianship',
  'createDelegation',
  'acceptDelegation',
  'updateDelegation',
  'revokeRelationship',
  'createEmergencyContact',
  'listEmergencyContacts',
  'respondEmergencyContact',
  'revokeEmergencyContact',
] satisfies readonly (typeof familyCareOperationIds)[number][];
export const redactFamilyRequestPath = (path: string) =>
  path.replace(/(\/emergency-contact-invites\/)[^/]+(\/response)/, '$1[REDACTED]$2');
const noStore = { 'cache-control': 'private, no-store', pragma: 'no-cache' } as const;
const syntheticModes = new WeakMap<FastifyInstance, boolean>();
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
    status: { type: 'string' },
    mode: { type: 'string', enum: ['guardianship_review', 'dependent_transition'] },
    includeDependentTransition: { type: 'boolean' },
  },
} as const;

async function actorFor(
  request: FastifyRequest,
  deps: FamilyRouteDependencies,
  requireContext = false,
): Promise<FamilyActor> {
  if (!syntheticModes.get(request.server))
    throw new ApiPolicyError(
      'open-sec-001',
      503,
      'Family Care sessions remain disabled outside seeded-synthetic mode.',
    );
  const token = request.headers.authorization?.startsWith('Bearer ')
    ? request.headers.authorization.slice(7)
    : '';
  const admin = /^synthetic-admin:support_admin:([0-9a-f-]{36})$/.exec(token);
  const person = /^synthetic-person:([0-9a-f-]{36})$/.exec(token);
  const native = !admin && !person ? await deps.resolveNativePatient?.(token) : undefined;
  if (!admin && !person && !native)
    throw new ApiPolicyError('authentication-required', 401, 'Sign in to continue.');
  const selectedPatientId =
    typeof request.headers['x-shifaa-patient-context'] === 'string'
      ? request.headers['x-shifaa-patient-context']
      : undefined;
  if (requireContext && !selectedPatientId)
    throw new ApiPolicyError(
      'patient-context-required',
      400,
      'Choose and confirm the patient context.',
    );
  return {
    personId: (admin ?? person)?.[1] ?? native!.personId,
    principal: (admin ?? person)?.[1] ?? native!.principal,
    requestId: request.id,
    ...(admin ? { role: 'support_admin' as const } : {}),
    aal: admin || person ? (request.headers['x-aal'] === '2' ? 2 : 1) : native!.aal,
    ...(typeof request.headers['x-purpose'] === 'string'
      ? { purpose: request.headers['x-purpose'] }
      : {}),
    ...(selectedPatientId ? { selectedPatientId } : {}),
  };
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
  deps: FamilyRouteDependencies,
  status: number,
  work: (actor: FamilyActor) => unknown,
  requireContext = true,
) {
  const actor = await actorFor(request, deps, requireContext);
  const stored = await deps.idempotency.execute({
    principal: actor.principal,
    method: request.method,
    route: request.routeOptions.url ?? redactFamilyRequestPath(request.url),
    key: key(request),
    body: request.body,
    work: async () => ({ status, headers: noStore, body: await work(actor) }),
  });
  return reply.status(stored.status).headers(stored.headers).send(stored.body);
}
interface FamilyRouteDependencies {
  service: FamilyCareServicePort;
  idempotency: IdempotencyStore;
  syntheticMode: boolean;
  resolveNativePatient?: (
    accessToken: string,
  ) => Promise<{ personId: string; principal: string; aal: 1 | 2 } | undefined>;
}

export async function registerFamilyCareRoutes(
  app: FastifyInstance,
  deps: FamilyRouteDependencies,
) {
  syntheticModes.set(app, deps.syntheticMode);
  app.get(
    '/v1/patients/:managedPatientId/relationships',
    { schema: { params: params('managedPatientId'), querystring: pageQuery } },
    async (r, p) =>
      p
        .headers(noStore)
        .send(
          await deps.service.listRelationships(
            await actorFor(r, deps),
            (r.params as { managedPatientId: string }).managedPatientId,
            r.query as FamilyPageQuery,
          ),
        ),
  );
  app.post(
    '/v1/patients/:managedPatientId/guardianships',
    {
      schema: {
        params: params('managedPatientId'),
        body: familyCareRequestSchemas.createGuardianship,
      },
    },
    (r, p) =>
      mutate(r, p, deps, 201, (a) =>
        deps.service.createGuardianship(
          a,
          (r.params as { managedPatientId: string }).managedPatientId,
          r.body as CreateGuardianshipInput,
        ),
      ),
  );
  app.get('/v1/admin/guardianships', { schema: { querystring: pageQuery } }, async (r, p) =>
    p
      .headers(noStore)
      .send(
        await deps.service.listGuardianshipCases(
          await actorFor(r, deps),
          r.query as FamilyPageQuery,
        ),
      ),
  );
  app.post(
    '/v1/admin/guardianships/:relationshipId/decision',
    {
      schema: {
        params: params('relationshipId'),
        body: familyCareRequestSchemas.reviewGuardianship,
      },
    },
    (r, p) =>
      mutate(
        r,
        p,
        deps,
        200,
        (a) =>
          deps.service.reviewGuardianship(
            a,
            (r.params as { relationshipId: string }).relationshipId,
            r.body as GuardianshipDecisionInput,
            version(r),
          ),
        false,
      ),
  );
  app.post(
    '/v1/patients/:managedPatientId/delegations',
    {
      schema: {
        params: params('managedPatientId'),
        body: familyCareRequestSchemas.createDelegation,
      },
    },
    (r, p) =>
      mutate(r, p, deps, 201, (a) =>
        deps.service.createDelegation(
          a,
          (r.params as { managedPatientId: string }).managedPatientId,
          r.body as CreateDelegationInput,
        ),
      ),
  );
  app.post(
    '/v1/delegations/:relationshipId/accept',
    {
      schema: { params: params('relationshipId'), body: familyCareRequestSchemas.acceptDelegation },
    },
    (r, p) =>
      mutate(
        r,
        p,
        deps,
        200,
        (a) => {
          const body = r.body as AcceptDelegationInput;
          return deps.service.acceptDelegation(
            a,
            (r.params as { relationshipId: string }).relationshipId,
            body.token,
          );
        },
        false,
      ),
  );
  app.patch(
    '/v1/delegations/:relationshipId',
    {
      schema: { params: params('relationshipId'), body: familyCareRequestSchemas.updateDelegation },
    },
    (r, p) =>
      mutate(r, p, deps, 200, (a) =>
        deps.service.updateDelegation(
          a,
          (r.params as { relationshipId: string }).relationshipId,
          r.body as UpdateDelegationInput,
          version(r),
        ),
      ),
  );
  app.post(
    '/v1/relationships/:relationshipId/revoke',
    {
      schema: {
        params: params('relationshipId'),
        body: familyCareRequestSchemas.revokeRelationship,
      },
    },
    (r, p) =>
      mutate(r, p, deps, 200, (a) =>
        deps.service.revokeRelationship(
          a,
          (r.params as { relationshipId: string }).relationshipId,
          r.body as RevokeRelationshipInput,
          version(r),
        ),
      ),
  );
  app.get(
    '/v1/patients/:managedPatientId/emergency-contacts',
    { schema: { params: params('managedPatientId'), querystring: pageQuery } },
    async (r, p) =>
      p
        .headers(noStore)
        .send(
          await deps.service.listEmergencyContacts(
            await actorFor(r, deps),
            (r.params as { managedPatientId: string }).managedPatientId,
            r.query as FamilyPageQuery,
          ),
        ),
  );
  app.post(
    '/v1/patients/:managedPatientId/emergency-contacts',
    {
      schema: {
        params: params('managedPatientId'),
        body: familyCareRequestSchemas.createEmergencyContact,
      },
    },
    (r, p) =>
      mutate(r, p, deps, 201, (a) =>
        deps.service.createEmergencyContact(
          a,
          (r.params as { managedPatientId: string }).managedPatientId,
          r.body as CreateEmergencyContactInput,
        ),
      ),
  );
  app.post(
    '/v1/emergency-contact-invites/response',
    { schema: { body: familyCareRequestSchemas.respondEmergencyContact } },
    async (r, p) => {
      const body = r.body as RespondEmergencyContactInput;
      const token = body.token;
      const principal = deps.service.invitationPrincipal(token);
      const stored = await deps.idempotency.execute({
        principal,
        method: r.method,
        route: '/v1/emergency-contact-invites/response',
        key: key(r),
        body: { decision: body.decision, token_digest_principal: principal },
        work: async () => ({
          status: 200,
          headers: noStore,
          body: await deps.service.respondEmergencyContact(
            token,
            { decision: body.decision },
            r.id,
          ),
        }),
      });
      return p.status(stored.status).headers(stored.headers).send(stored.body);
    },
  );
  app.post(
    '/v1/emergency-contacts/:contactId/revoke',
    {
      schema: {
        params: params('contactId'),
        body: familyCareRequestSchemas.revokeEmergencyContact,
      },
    },
    (r, p) =>
      mutate(r, p, deps, 200, (a) =>
        deps.service.revokeEmergencyContact(
          a,
          (r.params as { contactId: string }).contactId,
          r.body as RevokeRelationshipInput,
          version(r),
        ),
      ),
  );
}
