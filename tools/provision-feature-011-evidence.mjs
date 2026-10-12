// Restricted offline port, deliberately no public route or automatic CLI.
// Authenticated clinical-owner/source approval is supplied by a configured
// internal adapter. Synthetic sources are isolated mechanism proof only.
import { randomUUID } from 'node:crypto';
import {
  configured,
  common,
  validateProfile,
  same,
} from '../services/api/src/modules/feature-011/evidence-validation.ts';
import { deny, uuid } from '../services/api/src/modules/feature-011/protection.ts';
const tables = {
  designation: 'clinical.content_reviewer_designations',
  signing_authority: 'clinical.content_governance_authorities',
  admissibility: 'clinical.content_artifact_admissibility_bindings',
};
async function approval(config, source, session, profile, value) {
  const cfg = configured(config);
  if (!source || !session?.pool?.begin || !session.authorize) deny();
  uuid(session.actorPersonId);
  await session.authorize(profile, value);
  const result = await source.approve(profile, structuredClone(value));
  if (
    !result ||
    result.sourceIdentity !== cfg.sourceIdentity ||
    result.approverPersonId !== session.actorPersonId ||
    !same(result.value, value)
  )
    deny();
  validateProfile(profile, value);
  if (profile === 'admissibility' && value.synthetic !== (cfg.mode === 'isolated-synthetic'))
    deny();
  return { ...structuredClone(value), ...common('f011.governance_provisioner', cfg.now()) };
}
async function boundary(tx, session) {
  const [role] = await tx`SELECT session_user AS actor,current_user AS executor`;
  if (!['shifaa_owner', 'supabase_admin'].includes(role?.actor) || role.actor !== role.executor)
    deny();
  // No GUC is used as authentication: the independently authorized offline
  // session owns the named actor, and this connection must be the existing owner.
  await tx`SELECT id FROM identity.people WHERE id=${session.actorPersonId}::uuid FOR SHARE`;
}
async function audit(tx, session, profile, id, version) {
  const requestId = randomUUID();
  await tx`SELECT * FROM audit.append_event_v1(${requestId}::uuid,${requestId},'clinical_content_evidence.provisioned',${tables[profile]},'success',p_actor_person_id=>${session.actorPersonId}::uuid,p_resource_id=>${id}::uuid,p_resource_version=>${version}::integer,p_purpose_code=>'governed.feature011.provision',p_user_agent_class=>'service')`;
}
function columns(tx, values) {
  const entries = Object.entries(values);
  return {
    names: entries.map(([k]) => k),
    args: entries.map(([, v]) => v),
    placeholders: entries
      .map(([k], i) =>
        ['artifact_digest', 'policy_sha256', 'source_evidence_sha256'].includes(k)
          ? `decode($${i + 1}::text,'hex')`
          : `$${i + 1}`,
      )
      .join(','),
  };
}
async function insert(tx, table, values) {
  const c = columns(tx, values);
  await tx.unsafe(`INSERT INTO ${table} (${c.names.join(',')}) VALUES (${c.placeholders})`, c.args);
}
export async function provisionGovernance(
  config,
  source,
  session,
  profile,
  value,
  expectedVersion = null,
) {
  if (!['designation', 'signing_authority'].includes(profile)) deny();
  const result = await approval(config, source, session, profile, value);
  const b = result[profile === 'designation' ? 'designationBasis' : 'authorityBasis'];
  if (
    (profile === 'designation' ? b.designatedBy : b.issuedBy) !== session.actorPersonId ||
    b.personId === session.actorPersonId ||
    b.sourceIdentity !== config.sourceIdentity
  )
    deny();
  await session.pool.begin(async (tx) => {
    // Baseline qualifications/admin ranks precede people and F011 authorities.
    if (profile === 'designation') {
      const [c] =
        await tx`SELECT * FROM identity.professional_licenses WHERE id=${b.professionalLicenseId}::uuid FOR SHARE`;
      if (
        !c ||
        c.person_id !== b.personId ||
        c.status !== 'verified' ||
        String(c.expires_on).slice(0, 10) < config.now().slice(0, 10) ||
        c.profession !== (b.capacity === 'physician' ? 'doctor' : 'pharmacist')
      )
        deny();
    }
    await tx`SELECT id FROM identity.people WHERE id=ANY(${[b.personId, session.actorPersonId]}::uuid[]) ORDER BY id FOR SHARE`;
    await boundary(tx, session);
    const fields = {
      id: b.id,
      person_id: b.personId,
      evidence_ref: b.evidenceRef,
      evidence_producer_id: 'f011.governance_provisioner',
      evidence_verified_at: b.evidenceVerifiedAt,
      source_identity: b.sourceIdentity,
      source_evidence_identity: b.sourceEvidenceIdentity,
      source_evidence_version: b.sourceEvidenceVersion,
      source_evidence_sha256: b.sourceEvidenceSha256,
      status: b.status,
      valid_from: b.validFrom,
      valid_until: b.validUntil,
      version: b.version,
    };
    if (profile === 'designation')
      Object.assign(fields, {
        professional_license_id: b.professionalLicenseId,
        reviewer_capacity: b.capacity,
        designated_by: b.designatedBy,
      });
    else
      Object.assign(fields, {
        action: b.action,
        capacity: b.capacity,
        content_type: b.contentType,
        governed_content_key: b.governedContentKey,
        effective_scope_key: b.effectiveScopeKey,
        facility_id: b.facilityId,
        issued_by: b.issuedBy,
      });
    if (expectedVersion === null) {
      await insert(tx, tables[profile], fields);
    } else {
      const [old] = await tx.unsafe(
        `SELECT id,version FROM ${tables[profile]} WHERE id=$1::uuid FOR UPDATE`,
        [b.id],
      );
      if (!old || old.version !== expectedVersion || b.version !== expectedVersion + 1) deny();
      const updates = Object.fromEntries(Object.entries(fields).filter(([k]) => k !== 'id')),
        c = columns(tx, updates);
      await tx.unsafe(
        `UPDATE ${tables[profile]} SET ${c.names.map((name, i) => `${name}=${['source_evidence_sha256'].includes(name) ? `decode($${i + 1}::text,'hex')` : `$${i + 1}`}`).join(',')} WHERE id=$${c.args.length + 1}::uuid`,
        [...c.args, b.id],
      );
    }
    await audit(tx, session, profile, b.id, b.version);
  });
  return Object.freeze(result);
}
export async function provisionAdmission(config, source, session, value) {
  const result = await approval(config, source, session, 'admissibility', value);
  await session.pool.begin(async (tx) => {
    await tx`SELECT s.id FROM clinical.content_series s JOIN clinical.content_releases r ON r.series_id=s.id WHERE r.id=${result.releaseId}::uuid FOR UPDATE OF s`;
    const [r] =
      await tx`SELECT r.*,encode(r.artifact_digest,'hex') AS digest,s.content_type,s.governed_content_key,s.effective_scope_key FROM clinical.content_releases r JOIN clinical.content_series s ON s.id=r.series_id WHERE r.id=${result.releaseId}::uuid FOR UPDATE OF r`;
    if (
      !r ||
      r.status !== 'draft' ||
      r.artifact_version !== result.artifactVersion ||
      r.digest !== result.artifactDigest ||
      r.content_type !== result.contentType ||
      r.governed_content_key !== result.governedContentKey ||
      r.effective_scope_key !== result.effectiveScopeKey
    )
      deny();
    await boundary(tx, session);
    const [a] =
      await tx`SELECT *,encode(artifact_digest,'hex') AS digest,encode(policy_sha256,'hex') AS policy_hash,encode(source_evidence_sha256,'hex') AS source_hash FROM clinical.content_admissibility_evidence WHERE id=${result.approvalId}::uuid FOR SHARE`;
    const compare = {
      releaseId: 'release_id',
      artifactVersion: 'artifact_version',
      artifactDigest: 'digest',
      approvalVersion: 'version',
      contentType: 'content_type',
      governedContentKey: 'governed_content_key',
      effectiveScopeKey: 'effective_scope_key',
      policyRef: 'policy_ref',
      policyVersion: 'policy_version',
      policySha256: 'policy_hash',
      sourceAdmissionRef: 'source_admission_ref',
      categoryAdmissionRef: 'category_admission_ref',
      codeAdmissionRef: 'code_admission_ref',
      testVectorAdmissionRef: 'test_vector_admission_ref',
      sourceIdentity: 'source_identity',
      sourceEvidenceIdentity: 'source_evidence_identity',
      sourceEvidenceVersion: 'source_evidence_version',
      sourceEvidenceSha256: 'source_hash',
      synthetic: 'synthetic',
    };
    if (
      !a ||
      a.status !== 'active' ||
      new Date(a.valid_from).getTime() > Date.parse(config.now()) ||
      (a.valid_until && new Date(a.valid_until).getTime() <= Date.parse(config.now()))
    )
      deny();
    for (const [k, col] of Object.entries(compare)) if (result[k] !== a[col]) deny();
    const [existing] =
      await tx`SELECT count(*)::integer AS n FROM clinical.content_artifact_admissibility_bindings WHERE release_id=${result.releaseId}::uuid AND approval_id=${result.approvalId}::uuid AND approval_version=${result.approvalVersion}`;
    if (existing.n !== 0) deny();
    const fields = {
      binding_id: result.bindingId,
      binding_contract_id: result.contractId,
      release_id: result.releaseId,
      artifact_version: result.artifactVersion,
      artifact_digest: result.artifactDigest,
      approval_id: result.approvalId,
      approval_version: result.approvalVersion,
      content_type: result.contentType,
      governed_content_key: result.governedContentKey,
      effective_scope_key: result.effectiveScopeKey,
      policy_ref: result.policyRef,
      policy_version: result.policyVersion,
      policy_sha256: result.policySha256,
      source_admission_ref: result.sourceAdmissionRef,
      category_admission_ref: result.categoryAdmissionRef,
      code_admission_ref: result.codeAdmissionRef,
      test_vector_admission_ref: result.testVectorAdmissionRef,
      source_identity: result.sourceIdentity,
      source_evidence_identity: result.sourceEvidenceIdentity,
      source_evidence_version: result.sourceEvidenceVersion,
      source_evidence_sha256: result.sourceEvidenceSha256,
      producer_id: result.producerId,
      verified_at: result.verifiedAt,
      synthetic: result.synthetic,
      approval_status: a.status,
      approval_valid_from: a.valid_from,
      approval_valid_until: a.valid_until,
    };
    await insert(tx, tables.admissibility, fields);
    await audit(tx, session, 'admissibility', result.approvalId, result.approvalVersion);
  });
  return Object.freeze(result);
}
