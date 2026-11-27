// Offline fixture process. The owner connection never enters the API probe.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { provisionAdmission, provisionGovernance } from './provision-feature-011-evidence.mjs';
import { common } from '../services/api/src/modules/feature-011/evidence-validation.ts';

assert.equal(import.meta.dirname, '/tmp/f012-core-api/tools');
const postgres = createRequire('/opt/deps/services/api/package.json')('postgres');
const [operation] = process.argv.slice(2);
const password = process.env.F012_FIXTURE_OWNER_PASSWORD;
assert.match(password, /^[a-f0-9]{64}$/);
const pool = postgres({
  host: 'db',
  port: 5432,
  database: 'postgres',
  username: 'supabase_admin',
  password,
  max: 1,
  prepare: false,
  onnotice() {},
});
const actorPersonId = 'f0110000-0000-4000-8000-000000000008';
const now = () => new Date().toISOString().replace(/\.(\d{3})Z$/, '.$1000Z');
const profile = operation === 'admit' ? 'admissibility' : 'designation';
assert.ok(['admit', 'revoke-admission', 'advance-designation'].includes(operation));
const session = {
  pool,
  actorPersonId,
  async authorize(requested, value) {
    assert.equal(requested, profile);
    assert.equal(value.profile, profile);
  },
};
const neutralSource = (sourceIdentity) => ({
  async approve(requested, value) {
    assert.equal(requested, profile);
    return { sourceIdentity, approverPersonId: actorPersonId, value: structuredClone(value) };
  },
});
const input = JSON.parse(readFileSync(0, 'utf8'));
const evidence = common('f011.governance_provisioner', now());
try {
  const [role] = await pool`SELECT session_user AS login, current_user AS effective`;
  assert.deepEqual(role, { login: 'supabase_admin', effective: 'supabase_admin' });
  if (operation === 'admit') {
    const sourceIdentity = 'synthetic.exact-admission';
    const lifetimeSeconds = input.clockOnly === true ? 25 : null;
    const [r] = await pool`INSERT INTO clinical.content_admissibility_evidence
      (id,release_id,artifact_version,artifact_digest,content_type,governed_content_key,effective_scope_key,
       policy_ref,policy_version,policy_sha256,source_admission_ref,category_admission_ref,
       code_admission_ref,test_vector_admission_ref,source_identity,source_evidence_identity,
       synthetic,status,valid_from,valid_until,version)
      SELECT ${randomUUID()}::uuid,r.id,r.artifact_version,r.artifact_digest,s.content_type,s.governed_content_key,
        s.effective_scope_key,${randomUUID()}::uuid,'synthetic-policy-v1',decode(repeat('b',64),'hex'),
        ${randomUUID()}::uuid,${randomUUID()}::uuid,${randomUUID()}::uuid,${randomUUID()}::uuid,
        ${sourceIdentity},${randomUUID()},true,'active','2020-01-01',
        date_trunc('milliseconds',clock_timestamp())+make_interval(secs=>${lifetimeSeconds}::double precision),1
      FROM clinical.content_releases r JOIN clinical.content_series s ON s.id=r.series_id
      WHERE r.id=${input.releaseId}::uuid AND r.status='draft'
      RETURNING *,encode(artifact_digest,'hex') AS digest,encode(policy_sha256,'hex') AS policy_hash`;
    assert.ok(r, 'Expected an existing synthetic draft');
    const value = {
      ...evidence,
      profile,
      releaseId: r.release_id,
      artifactVersion: r.artifact_version,
      artifactDigest: r.digest,
      approvalId: r.id,
      approvalVersion: r.version,
      contentType: r.content_type,
      governedContentKey: r.governed_content_key,
      effectiveScopeKey: r.effective_scope_key,
      policyRef: r.policy_ref,
      policyVersion: r.policy_version,
      policySha256: r.policy_hash,
      sourceAdmissionRef: r.source_admission_ref,
      categoryAdmissionRef: r.category_admission_ref,
      codeAdmissionRef: r.code_admission_ref,
      testVectorAdmissionRef: r.test_vector_admission_ref,
      sourceIdentity: r.source_identity,
      sourceEvidenceIdentity: r.source_evidence_identity,
      sourceEvidenceVersion: r.source_evidence_version,
      sourceEvidenceSha256: null,
      synthetic: true,
    };
    await provisionAdmission(
      { mode: 'isolated-synthetic', sourceIdentity, now },
      neutralSource(sourceIdentity),
      session,
      value,
    );
    console.log(JSON.stringify({ role, approvalId: r.id, releaseId: r.release_id }));
  } else if (operation === 'revoke-admission') {
    // K17 uses owner DML to model lost upstream evidence.
    const [revoked] = await pool`UPDATE clinical.content_admissibility_evidence
      SET status='revoked',version=version+1
      WHERE id=${input.approvalId}::uuid AND synthetic AND status='active' AND version=1
      RETURNING id,version,status`;
    assert.deepEqual(revoked, { id: input.approvalId, version: 2, status: 'revoked' });
    console.log(JSON.stringify({ role, ...revoked }));
  } else {
    const current = input.designation;
    const info = { mode: 'isolated-synthetic', sourceIdentity: current.sourceIdentity, now };
    const designationBasis = { ...current, version: current.version + 1 };
    await provisionGovernance(
      info,
      neutralSource(info.sourceIdentity),
      session,
      profile,
      { ...evidence, profile, designationBasis },
      current.version,
    );
    console.log(
      JSON.stringify({ role, designationId: current.id, version: designationBasis.version }),
    );
  }
} catch (error) {
  const sqlState = /^[0-9A-Z]{5}$/.test(error?.code) ? error.code : null;
  console.log(JSON.stringify({ failed: true, sqlState }));
} finally {
  await pool.end({ timeout: 2 });
}
