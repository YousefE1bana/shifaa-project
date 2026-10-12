// Test-only authenticated neutral source over actual restricted owner SQL.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { root, sql } from './run-feature-011-postgres-test.mjs';
import { provisionAdmission, provisionGovernance } from './provision-feature-011-evidence.mjs';
import { common } from '../services/api/src/modules/feature-011/evidence-validation.ts';
const postgres = createRequire(resolve(root, 'services/api/package.json'))('postgres');
const quote = (v) => `'${String(v).replaceAll("'", "''")}'`;
const person = (n) => `f0110000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const instant = (v) =>
  v === null ? null : new Date(v).toISOString().replace(/\.(\d{3})Z$/, '.$1000Z');
export async function governedOfflineProof(runtime, database, config, external) {
  // Use existing runtime credentials in memory only, never evidence/logs.
  const env = JSON.parse(
    execFileSync('docker', ['inspect', '--format', '{{json .Config.Env}}', runtime.container], {
      encoding: 'utf8',
      windowsHide: true,
    }),
  );
  const password = env
    .find((v) => v.startsWith('POSTGRES_PASSWORD='))
    ?.slice('POSTGRES_PASSWORD='.length);
  assert(password, 'Existing local runtime owner credential required');
  const pool = postgres({
    host: '127.0.0.1',
    port: runtime.name === 'shifaa-local-postgres' ? 5432 : 54322,
    database,
    username: runtime.user,
    password,
    prepare: false,
    max: 1,
    onnotice: () => {},
    connect_timeout: 10,
  });
  const owner = (q) => JSON.parse(sql(runtime, database, q).stdout.trim());
  const session = {
    pool,
    actorPersonId: person(8),
    authorize: async (profile, value) => {
      external();
      assert(['designation', 'signing_authority', 'admissibility'].includes(profile));
      assert(value.profile === profile);
    },
  };
  const source = (identity) => ({
    approve: async (profile, value) => {
      external();
      assert.equal(value.profile, profile);
      return {
        sourceIdentity: identity,
        approverPersonId: session.actorPersonId,
        value: structuredClone(value),
      };
    },
  });
  const results = [];
  const checkpoint = () =>
    owner(
      `SELECT json_build_object('audit',(SELECT count(*) FROM audit.events),'bindings',(SELECT count(*) FROM clinical.content_artifact_admissibility_bindings),'grants',(SELECT count(*) FROM clinical.content_governance_authorities),'designations',(SELECT count(*) FROM clinical.content_reviewer_designations));`,
    );
  const deny = async (id, fn) => {
    const before = checkpoint();
    await assert.rejects(fn, (e) => e.message === 'Feature 011 protection denied');
    assert.deepEqual(checkpoint(), before);
    results.push({ id, result: 'DENIED_WITHOUT_EFFECT' });
  };
  const d = owner(
    `SELECT row_to_json(d) FROM clinical.content_reviewer_designations d WHERE person_id=${quote(person(2))}::uuid;`,
  );
  const db = {
    id: d.id,
    version: d.version + 1,
    personId: d.person_id,
    professionalLicenseId: d.professional_license_id,
    capacity: d.reviewer_capacity,
    evidenceRef: d.evidence_ref,
    designatedBy: d.designated_by,
    status: d.status,
    validFrom: instant(d.valid_from),
    validUntil: instant(d.valid_until),
    sourceIdentity: d.source_identity,
    sourceEvidenceIdentity: d.source_evidence_identity,
    sourceEvidenceVersion: d.source_evidence_version,
    sourceEvidenceSha256:
      d.source_evidence_sha256 === null ? null : d.source_evidence_sha256.slice(2),
    evidenceProducerId: d.evidence_producer_id,
    evidenceVerifiedAt: instant(d.evidence_verified_at),
  };
  const designation = {
    ...common('f011.governance_provisioner', config(d.source_identity).now()),
    profile: 'designation',
    designationBasis: db,
  };
  try {
    await deny('OFFLINE_UNAPPROVED_SOURCE', () =>
      provisionGovernance(undefined, undefined, session, 'designation', designation, d.version),
    );
    const beforeDesignation = checkpoint();
    await provisionGovernance(
      config(d.source_identity),
      source(d.source_identity),
      session,
      'designation',
      designation,
      d.version,
    );
    assert.equal(checkpoint().audit, beforeDesignation.audit + 1);
    assert.equal(
      owner(
        `SELECT version FROM clinical.content_reviewer_designations WHERE id=${quote(d.id)}::uuid;`,
      ),
      d.version + 1,
    );
    results.push({ id: 'OFFLINE_DESIGNATION_CAS_CURRENT_AUDITED', result: 'PASS' });
    await deny('OFFLINE_STALE_VERSION', () =>
      provisionGovernance(
        config(d.source_identity),
        source(d.source_identity),
        session,
        'designation',
        designation,
        d.version,
      ),
    );
    const a = owner(
      `SELECT row_to_json(a) FROM clinical.content_governance_authorities a WHERE person_id=${quote(person(2))}::uuid AND action='signClinicalContentRelease';`,
    );
    const ab = {
      id: a.id,
      version: a.version + 1,
      personId: a.person_id,
      action: a.action,
      capacity: a.capacity,
      contentType: a.content_type,
      governedContentKey: a.governed_content_key,
      effectiveScopeKey: a.effective_scope_key,
      facilityId: a.facility_id,
      issuedBy: a.issued_by,
      evidenceRef: a.evidence_ref,
      status: a.status,
      validFrom: instant(a.valid_from),
      validUntil: instant(a.valid_until),
      sourceIdentity: a.source_identity,
      sourceEvidenceIdentity: a.source_evidence_identity,
      sourceEvidenceVersion: a.source_evidence_version,
      sourceEvidenceSha256:
        a.source_evidence_sha256 === null ? null : a.source_evidence_sha256.slice(2),
      evidenceProducerId: a.evidence_producer_id,
      evidenceVerifiedAt: instant(a.evidence_verified_at),
    };
    const beforeAuthority = checkpoint();
    await provisionGovernance(
      config(a.source_identity),
      source(a.source_identity),
      session,
      'signing_authority',
      {
        ...common('f011.governance_provisioner', config(a.source_identity).now()),
        profile: 'signing_authority',
        authorityBasis: ab,
      },
      a.version,
    );
    assert.equal(checkpoint().audit, beforeAuthority.audit + 1);
    assert.equal(
      owner(
        `SELECT version FROM clinical.content_governance_authorities WHERE id=${quote(a.id)}::uuid;`,
      ),
      a.version + 1,
    );
    results.push({ id: 'OFFLINE_AUTHORITY_CAS_CURRENT_AUDITED', result: 'PASS' });
  } catch (error) {
    await pool.end({ timeout: 5 });
    throw error;
  }
  return {
    results,
    async admission(id) {
      const a = owner(
        `SELECT row_to_json(q) FROM (SELECT a.*,encode(artifact_digest,'hex') AS digest,encode(policy_sha256,'hex') AS policy_hash,encode(source_evidence_sha256,'hex') AS source_hash FROM clinical.content_admissibility_evidence a WHERE id=${quote(id)}::uuid) q;`,
      );
      const value = {
        ...common('f011.governance_provisioner', config(a.source_identity).now()),
        profile: 'admissibility',
        releaseId: a.release_id,
        artifactVersion: a.artifact_version,
        artifactDigest: a.digest,
        approvalId: a.id,
        approvalVersion: a.version,
        contentType: a.content_type,
        governedContentKey: a.governed_content_key,
        effectiveScopeKey: a.effective_scope_key,
        policyRef: a.policy_ref,
        policyVersion: a.policy_version,
        policySha256: a.policy_hash,
        sourceAdmissionRef: a.source_admission_ref,
        categoryAdmissionRef: a.category_admission_ref,
        codeAdmissionRef: a.code_admission_ref,
        testVectorAdmissionRef: a.test_vector_admission_ref,
        sourceIdentity: a.source_identity,
        sourceEvidenceIdentity: a.source_evidence_identity,
        sourceEvidenceVersion: a.source_evidence_version,
        sourceEvidenceSha256: a.source_hash,
        synthetic: a.synthetic,
      };
      for (const [field, changed] of [
        ['releaseId', randomUUID()],
        ['artifactVersion', a.artifact_version + 1],
        ['artifactDigest', '0'.repeat(64)],
        ['policyRef', randomUUID()],
        ['sourceAdmissionRef', randomUUID()],
      ]) {
        const wrong = { ...value, [field]: changed };
        await deny('ADMISSION_EXACT_' + field, () =>
          provisionAdmission(config(a.source_identity), source(a.source_identity), session, wrong),
        );
      }
      const beforeAdmission = checkpoint();
      await provisionAdmission(
        config(a.source_identity),
        source(a.source_identity),
        session,
        value,
      );
      assert.equal(checkpoint().audit, beforeAdmission.audit + 1);
      assert.equal(checkpoint().bindings, beforeAdmission.bindings + 1);
      results.push({ id: 'ADMISSION_EXACT_DRAFT_AUDITED', result: 'PASS' });
      await deny('ADMISSION_DUPLICATE_BINDING', () =>
        provisionAdmission(config(a.source_identity), source(a.source_identity), session, value),
      );
    },
    async finish() {
      await pool.end({ timeout: 5 });
    },
  };
}
