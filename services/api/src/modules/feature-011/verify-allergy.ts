import { randomUUID } from 'node:crypto';
import { Value } from '@sinclair/typebox/value';
import {
  feature011Schemas,
  type Feature011VerifyAllergyRequest,
} from '@shifaa/contracts/feature-011';
import { ApiPolicyError } from '../identity-onboarding/errors.js';
import { hashRequest } from '../../platform/idempotency.js';
import { canonicalBytes, uuid } from './protection.js';
import { correctedFacts, protectAllergy, reconstructAllergy } from './allergy-protection.js';
import { prepareSupport, validateKnownCoding } from './allergy-evidence.js';
import { composeAllergy } from './response-composition.js';
import { executeReceipt, type MutationScope } from './mutation-receipts.js';
import type { AllergyActor, AllergyDependencies } from './allergies.js';
const forbidden = () =>
  new ApiPolicyError('forbidden', 403, 'The verification context is not authorized.');
/** Private immutable provenance is a selector, never client-authored authority.
 * Native/current scope and exact protected history are checked independently. */
export async function verifyAllergy(
  deps: AllergyDependencies,
  actor: AllergyActor,
  allergyId: string,
  request: Feature011VerifyAllergyRequest,
  expectedVersion: number,
  key: string,
) {
  uuid(allergyId);
  if (!Value.Check(feature011Schemas.VerifyAllergyRequest, request))
    throw new ApiPolicyError('validation-failed', 422, 'Invalid allergy verification.');
  if (!Number.isSafeInteger(expectedVersion) || expectedVersion < 1)
    throw new ApiPolicyError('validation-failed', 422, 'Invalid revision version.');
  if (key.length < 16 || key.length > 128)
    throw new ApiPolicyError('idempotency-key-invalid', 400, 'Invalid Idempotency-Key.');
  if (!deps.support || !deps.evidence)
    throw new ApiPolicyError('validation-failed', 422, 'Supporting provenance is unavailable.');
  let locator;
  try {
    locator = await deps.support.lookup(request.verificationEvidenceRef);
  } catch {
    throw forbidden();
  }
  if (
    !locator ||
    locator.evidenceRef !== request.verificationEvidenceRef ||
    locator.allergyId !== allergyId ||
    locator.attestorPersonId !== actor.personId
  )
    throw forbidden();
  const patientId = uuid(locator.patientId);
  const authority = await deps.repository.resolve(actor, patientId, request.encounterId);
  if (authority.role !== 'CLN') throw forbidden();
  const authorize = async () => {
    await deps.repository.read(authority, patientId, { allergyId, limit: 1 });
  };
  const scope: MutationScope = {
    operationId: 'verifyAllergy',
    targetId: allergyId,
    patientId,
    contentType: '',
    expectedVersion,
    input: {
      responseLanguage: actor.locale,
      responseRequestId: actor.requestId,
      preparation: null,
    },
    context: {
      environment: 'local',
      person_id: actor.personId,
      actor_role: 'CLN',
      aal: String(actor.aal),
      purposes: actor.purposes.join(','),
      facility_id: authority.facilityId ?? '',
      encounter_id: authority.encounterId ?? '',
      request_id: actor.requestId,
      idempotency_key: key,
      request_hash: hashRequest({
        allergyId,
        request,
        expectedVersion,
        locale: actor.locale,
        purposes: actor.purposes,
        facilityId: authority.facilityId ?? null,
        encounterId: authority.encounterId ?? null,
      }),
    },
  };
  return executeReceipt(scope, {
    store: deps.repository.receipts,
    provider: deps.provider,
    authorize,
    authorizeDisclosure: authorize,
    prepare: async () => {
      const page = await deps.repository.read(authority, patientId, {
        allergyId,
        view: 'current',
        limit: 1,
      });
      const previous = page.data.find(
        (r) => r['allergyId'] === allergyId && r['patientId'] === patientId,
      );
      if (!previous) throw new ApiPolicyError('not-found', 404, 'The assertion is unavailable.');
      if (previous['version'] !== expectedVersion)
        throw new ApiPolicyError('version-conflict', 409, 'The assertion has advanced.');
      const from = previous['status'];
      if (
        from === 'entered_in_error' ||
        from === request.targetStatus ||
        !['self_reported', 'clinician_confirmed', 'refuted'].includes(String(from))
      )
        throw new ApiPolicyError(
          'state-transition-invalid',
          409,
          'This verification transition is not permitted.',
        );
      const previousRevisionId = uuid(previous['revisionId']);
      const revisionId = randomUUID(),
        revisionVersion = expectedVersion + 1;
      const authorizePrevious = async () => {
        const current = await deps.repository.read(authority, patientId, {
          allergyId,
          view: 'current',
          limit: 1,
        });
        const exact = current.data.find((r) => r['revisionId'] === previousRevisionId);
        if (!exact || !canonicalBytes(exact).equals(canonicalBytes(previous)))
          throw new ApiPolicyError('version-conflict', 409, 'The assertion has advanced.');
      };
      const verifiedEvidence = await prepareSupport(
        deps.evidence,
        deps.support,
        {
          evidenceRef: request.verificationEvidenceRef,
          patientId,
          allergyId,
          previousRevisionId,
          previousVersion: expectedVersion,
          revisionId,
          revisionVersion,
          targetStatus: request.targetStatus,
          attestorPersonId: actor.personId,
        },
        authorizePrevious,
      ).catch((error: unknown) => {
        if (
          error instanceof ApiPolicyError ||
          (error instanceof Error &&
            'code' in error &&
            ['42501', '40001'].includes(String(error.code)))
        )
          throw error;
        throw new ApiPolicyError(
          'validation-failed',
          422,
          'Supporting provenance does not match this decision.',
        );
      });
      const old = await reconstructAllergy(
        deps.provider,
        { allergyId, revisionId: previousRevisionId, revisionVersion: expectedVersion },
        {
          protectedFacts: previous['facts'] as Parameters<
            typeof reconstructAllergy
          >[2]['protectedFacts'],
          protectedReason: previous['reason'] as Parameters<
            typeof reconstructAllergy
          >[2]['protectedReason'],
        },
        authorizePrevious,
      );
      const facts = await correctedFacts(old.facts, request.corrections ?? {}, (coding) =>
        validateKnownCoding(deps.evidence, deps.coding, coding, revisionId),
      ).catch(() => {
        throw new ApiPolicyError(
          'validation-failed',
          422,
          'New coding requires an approved matching source.',
        );
      });
      const reason = {
        contractId: 'SHIFAA-F011-ALLERGY-REASON/1' as const,
        reason: request.reason,
      };
      const encrypted = await protectAllergy(
        deps.provider,
        { allergyId, revisionId, revisionVersion },
        facts,
        reason,
      );
      await authorizePrevious();
      const prepared = {
        patientId,
        allergyId,
        revisionId,
        revisionVersion,
        previousRevisionId,
        facts,
        reason,
        ...encrypted,
      };
      return {
        input: {
          ...scope.input,
          preparation: {
            protectedRevision: {
              allergyId,
              revisionId,
              revisionVersion,
              previousRevisionId,
              ...encrypted,
            },
            verifiedEvidence,
          },
        },
        compose: (meta, projection) => composeAllergy(prepared, meta, projection),
        dispose() {},
      };
    },
  });
}
