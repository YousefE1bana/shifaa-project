import { common, configured, validateProfile, currentBasis, same } from './evidence-validation.js';
import { deny } from './protection.js';
import type {
  EvidenceConfiguration,
  SigningBinding,
  SigningRequest,
  SigningBasis,
} from './evidence-types.js';
export { validateProfile, currentBasis };
/** Configured authenticated verifier. Public selector alone is never trusted. */
export interface SigningSource {
  verify(
    request: Readonly<SigningRequest>,
    basis: Readonly<SigningBasis>,
  ): Promise<{ selector: string; sourceEvidenceIdentity: string; result: SigningBinding }>;
}
export async function prepareSigning(
  config: EvidenceConfiguration | undefined,
  source: SigningSource | undefined,
  nativeRequest: SigningRequest,
  selected: SigningBasis,
): Promise<SigningBinding> {
  const approved = configured(config);
  if (!source) deny();
  const request = structuredClone(nativeRequest),
    basis = structuredClone(selected),
    now = approved.now();
  for (const [profile, key] of [
    ['credential', 'credentialBasis'],
    ['designation', 'designationBasis'],
    ['signing_authority', 'authorityBasis'],
  ] as const) {
    const producerId =
      profile === 'credential'
        ? 'identity.professional_license_review'
        : 'f011.governance_provisioner';
    validateProfile(profile, { ...common(producerId, now), profile, [key]: basis[key] });
    if (!currentBasis(basis[key], basis[key], now)) deny();
  }
  const { credentialBasis: c, designationBasis: d, authorityBasis: a } = basis;
  if (
    c.personId !== request.signerPersonId ||
    d.personId !== c.personId ||
    a.personId !== c.personId ||
    d.professionalLicenseId !== c.id ||
    d.capacity !== request.capacity ||
    a.capacity !== request.capacity ||
    c.profession !== (request.capacity === 'physician' ? 'doctor' : 'pharmacist') ||
    d.designatedBy === c.personId ||
    a.issuedBy === c.personId
  )
    deny();
  const verified = await source.verify(
    Object.freeze(structuredClone(request)),
    Object.freeze(structuredClone(basis)),
  );
  if (!verified || verified.selector !== request.evidenceRef) deny();
  const result = validateProfile('signing', verified.result) as SigningBinding;
  for (const k of [
    'releaseId',
    'artifactVersion',
    'artifactDigest',
    'signerPersonId',
    'capacity',
    'decision',
    'evidenceRef',
  ] as const)
    if (result[k] !== request[k]) deny();
  if (
    result.sourceIdentity !== approved.sourceIdentity ||
    result.sourceEvidenceIdentity !== verified.sourceEvidenceIdentity ||
    result.verifiedAt > now ||
    !same(
      {
        credentialBasis: result.credentialBasis,
        designationBasis: result.designationBasis,
        authorityBasis: result.authorityBasis,
      },
      basis,
    )
  )
    deny();
  // Source correlation is authenticated by the port; nullable provider-specific
  // version/digest remain source-owned. No clinical truth is inferred.
  return Object.freeze({
    ...result,
    ...common('f011.signing_port', now),
    producerId: 'f011.signing_port',
  });
}
