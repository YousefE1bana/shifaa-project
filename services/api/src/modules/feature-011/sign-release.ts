import { Value } from '@sinclair/typebox/value';
import {
  feature011Schemas,
  type Feature011SignReleaseRequest,
  type Feature011SignReleaseResponse,
} from '@shifaa/contracts/feature-011';
import {
  validateContentActor,
  contentKey,
  contentScope,
  type ContentActor,
} from './create-release.js';
import {
  executeReceipt,
  type ReceiptStore,
  type HttpReceipt,
  type ReceiptRecord,
} from './mutation-receipts.js';
import { uuid, version, deny, type KeyProvider } from './protection.js';
import { prepareSigning, type SigningSource } from './signing-evidence.js';
import type {
  SigningBasis,
  SigningBinding,
  Capacity,
  EvidenceConfiguration,
} from './evidence-types.js';
import { ApiPolicyError } from '../identity-onboarding/errors.js';
export interface SigningSelection {
  basis: SigningBasis;
  contentType: string;
  artifactVersion: number;
  artifactDigest: string;
  creatorPersonId: string;
  signerPersonIds: readonly string[];
  administrative: boolean;
}
/** Approved private evidence preparation port. Selection is server-owned and
 * confers no content inspection privilege. SQL revalidates the exact basis. */
export interface SigningContext {
  select(actor: ContentActor, releaseId: string, capacity: Capacity): Promise<SigningSelection>;
}
export interface SigningDependencies {
  store: ReceiptStore;
  provider: KeyProvider | undefined;
  context: SigningContext;
  source: SigningSource | undefined;
  evidence: EvidenceConfiguration | undefined;
}
function composeSignature(
  binding: SigningBinding,
  meta: ReceiptRecord,
  projection: unknown,
): Feature011SignReleaseResponse {
  if (!Value.Check(feature011Schemas.SignReleaseResponse, projection)) deny();
  const response = projection as Feature011SignReleaseResponse;
  if (
    response.releaseId !== binding.releaseId ||
    response.releaseId !== meta.targetResourceId ||
    response.workflowVersion !== Number(meta.responseResourceVersion)
  )
    deny();
  for (const field of [
    'artifactVersion',
    'artifactDigest',
    'signerPersonId',
    'capacity',
    'decision',
    'evidenceRef',
  ] as const)
    if (response.signature[field] !== binding[field]) deny();
  // Identity/time come from the persisted SQL signature, never caller material.
  return response;
}
export class Feature011Signing {
  constructor(private readonly deps: SigningDependencies) {}
  async signClinicalContentRelease(
    actor: ContentActor,
    releaseId: string,
    request: Feature011SignReleaseRequest,
    options: { key: string; expectedVersion: number },
  ): Promise<HttpReceipt> {
    validateContentActor(actor);
    contentKey(options.key);
    uuid(releaseId);
    version(options.expectedVersion);
    if (!Value.Check(feature011Schemas.SignReleaseRequest, request))
      throw new ApiPolicyError('validation-failed', 422, 'Invalid signing request.');
    const selected = await this.deps.context.select(actor, releaseId, request.capacity);
    if (
      selected.administrative ||
      selected.basis.credentialBasis.personId !== actor.personId ||
      selected.basis.designationBasis.personId !== actor.personId ||
      selected.basis.authorityBasis.personId !== actor.personId
    )
      deny();
    const scope = contentScope(
      actor,
      {
        operationId: 'signClinicalContentRelease',
        targetId: releaseId,
        contentType: selected.contentType,
        expectedVersion: options.expectedVersion,
        input: {
          responseLanguage: actor.locale,
          responseRequestId: actor.requestId,
          signing: null,
        },
      },
      {
        binding: {
          releaseId,
          request,
          expectedVersion: options.expectedVersion,
          locale: actor.locale,
          purposes: actor.purposes,
        },
        role: request.capacity === 'physician' ? 'CLN' : 'PHA',
        facilityId: selected.basis.authorityBasis.facilityId ?? '',
      },
    );
    scope.context = { ...scope.context, idempotency_key: options.key };
    return executeReceipt(scope, {
      store: this.deps.store,
      provider: this.deps.provider,
      authorize: async () => {
        const current = await this.deps.context.select(actor, releaseId, request.capacity);
        if (
          current.administrative ||
          current.basis.credentialBasis.personId !== actor.personId ||
          current.basis.designationBasis.personId !== actor.personId ||
          current.basis.authorityBasis.personId !== actor.personId
        )
          deny();
      },
      // Receipt SQL reauthorizes the historical exact basis and current capacity
      // under locks. Replay discloses only the original closed signature response.
      authorizeDisclosure: async () => {},
      prepare: async () => {
        if (
          selected.creatorPersonId === actor.personId ||
          selected.signerPersonIds.includes(actor.personId)
        )
          deny();
        if (
          selected.artifactVersion !== request.artifactVersion ||
          selected.artifactDigest !== request.artifactDigest
        )
          deny();
        const binding = await prepareSigning(
          this.deps.evidence,
          this.deps.source,
          {
            releaseId,
            artifactVersion: request.artifactVersion,
            artifactDigest: request.artifactDigest,
            signerPersonId: actor.personId,
            capacity: request.capacity,
            decision: request.decision,
            evidenceRef: request.signingEvidenceRef,
          },
          selected.basis,
        );
        return {
          input: { ...scope.input, signing: binding },
          compose: (meta, projection) => composeSignature(binding, meta, projection),
          dispose() {},
        };
      },
    });
  }
}
