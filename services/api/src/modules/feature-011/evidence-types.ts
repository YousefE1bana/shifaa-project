export type Capacity = 'physician' | 'pharmacist';
export interface CredentialBasis {
  id: string;
  version: number;
  personId: string;
  profession: 'doctor' | 'pharmacist';
  status: 'verified';
  expiresOn: string;
  issuer: string;
  evidenceObjectId: string | null;
  reviewedByPersonId: string | null;
  reviewedAt: string | null;
}
export interface DesignationBasis {
  id: string;
  version: number;
  personId: string;
  professionalLicenseId: string;
  capacity: Capacity;
  evidenceRef: string;
  designatedBy: string;
  status: 'active';
  validFrom: string;
  validUntil: string | null;
  sourceIdentity: string;
  sourceEvidenceIdentity: string;
  sourceEvidenceVersion: string | null;
  sourceEvidenceSha256: string | null;
  evidenceProducerId: 'f011.governance_provisioner';
  evidenceVerifiedAt: string;
}
export interface AuthorityBasis {
  id: string;
  version: number;
  personId: string;
  action: 'signClinicalContentRelease';
  capacity: Capacity;
  contentType: string;
  governedContentKey: string;
  effectiveScopeKey: string;
  facilityId: string | null;
  issuedBy: string;
  evidenceRef: string;
  status: 'active';
  validFrom: string;
  validUntil: string | null;
  sourceIdentity: string;
  sourceEvidenceIdentity: string;
  sourceEvidenceVersion: string | null;
  sourceEvidenceSha256: string | null;
  evidenceProducerId: 'f011.governance_provisioner';
  evidenceVerifiedAt: string;
}
export interface SigningBasis {
  credentialBasis: CredentialBasis;
  designationBasis: DesignationBasis;
  authorityBasis: AuthorityBasis;
}
export interface CommonBinding {
  contractId: 'SHIFAA-F011-VERIFIED-EVIDENCE-BINDING/1';
  bindingId: string;
  producerId: string;
  verifiedAt: string;
}
export interface SigningRequest {
  releaseId: string;
  artifactVersion: number;
  artifactDigest: string;
  signerPersonId: string;
  capacity: Capacity;
  decision: 'approved' | 'rejected';
  evidenceRef: string;
}
export interface SigningBinding extends CommonBinding, SigningRequest, SigningBasis {
  profile: 'signing';
  producerId: 'f011.signing_port';
  sourceIdentity: string;
  sourceEvidenceIdentity: string;
  sourceEvidenceVersion: string | null;
  sourceEvidenceSha256: string | null;
}
export type MaterialKind = 'content' | 'code' | 'testVectors';
export interface MaterialRef {
  reference: string;
  verifiedSha256: string;
}
export interface MaterialBinding extends CommonBinding {
  profile: 'content_material' | 'code_material' | 'test_vector_material';
  producerId: 'f011.evidence_port';
  releaseId: string;
  artifactVersion: number;
  evidenceRef: string;
  verifiedSha256: string;
}
export interface SupportRequest {
  evidenceRef: string;
  patientId: string;
  allergyId: string;
  previousRevisionId: string;
  previousVersion: number;
  revisionId: string;
  revisionVersion: number;
  targetStatus: 'clinician_confirmed' | 'refuted' | 'entered_in_error';
  attestorPersonId: string;
}
export interface SupportBinding extends CommonBinding, SupportRequest {
  profile: 'allergy_verification';
  producerId: 'f011.allergy_evidence_boundary';
  sourceIdentity:
    | 'governed.internal_clinician_provenance'
    | 'synthetic.internal_clinician_provenance';
  sourceEvidenceIdentity: string;
  synthetic: boolean;
}
export interface AdmissionBinding extends CommonBinding {
  profile: 'admissibility';
  producerId: 'f011.governance_provisioner';
  releaseId: string;
  artifactVersion: number;
  artifactDigest: string;
  approvalId: string;
  approvalVersion: number;
  contentType: string;
  governedContentKey: string;
  effectiveScopeKey: string;
  policyRef: string;
  policyVersion: string;
  policySha256: string;
  sourceAdmissionRef: string;
  categoryAdmissionRef: string;
  codeAdmissionRef: string;
  testVectorAdmissionRef: string;
  sourceIdentity: string;
  sourceEvidenceIdentity: string;
  sourceEvidenceVersion: string | null;
  sourceEvidenceSha256: string | null;
  synthetic: boolean;
}
export interface EvidenceConfiguration {
  mode: 'isolated-synthetic' | 'governed';
  sourceIdentity: string;
  now(): string;
}
