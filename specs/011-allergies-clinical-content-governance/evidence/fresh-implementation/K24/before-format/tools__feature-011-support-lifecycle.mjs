import assert from 'node:assert/strict';
import { sql } from './run-feature-011-postgres-test.mjs';

const supportId = 'f011c000-0000-4000-8800-000000000001';
const clinician = 'f0110000-0000-4000-8000-000000000002';
const quote = (value) => `'${String(value).replaceAll("'", "''")}'`;

// Separate psql transactions reproduce provisioning before later consumption.
// The caller supplies a committed synthetic initial revision with all five effects.
export function supportLifecycleProof(runtime, database) {
  const basis = JSON.parse(sql(runtime, database,
    `SELECT row_to_json(a) FROM clinical.allergies a WHERE version=1 ORDER BY id LIMIT 1;`).stdout.trim());
  assert.ok(basis.id, 'A committed initial revision is required');
  const insert = (overrides = {}) => {
    const fields = { id: supportId, patient_id: basis.patient_id, allergy_id: basis.allergy_id,
      previous_revision_id: basis.id, previous_version: 1, target_status: 'clinician_confirmed',
      attestor_person_id: clinician, source_identity: 'synthetic.internal_clinician_provenance',
      source_evidence_identity: supportId, producer_id: 'f011.allergy_evidence_boundary',
      recorded_at: '2026-10-06T10:00:00Z', synthetic: true, ...overrides };
    return `INSERT INTO clinical.allergy_verification_support(${Object.keys(fields).join(',')}) VALUES(${Object.values(fields).map(quote).join(',')});`;
  };
  const committed = sql(runtime, database,
    `BEGIN; ${insert()} SELECT 'VALID_SUPPORT_INSERTED_BEFORE_COMMIT'; COMMIT; SELECT 'UNCONSUMED_SUPPORT_COMMITTED';`);
  assert.ok(committed.stdout.includes('UNCONSUMED_SUPPORT_COMMITTED'));
  assert.equal(sql(runtime, database, `SELECT count(*) FROM clinical.allergy_verification_support s WHERE s.id=${quote(supportId)} AND NOT EXISTS (SELECT 1 FROM clinical.allergy_verification_bindings b WHERE b.evidence_ref=s.id);`).stdout.trim(), '1');
  const results = [{ id: 'UNCONSUMED_SUPPORT_COMMIT', result: 'PASS' }];
  function deny(id, statement, state) {
    const failure = sql(runtime, database, `BEGIN; ${statement} COMMIT;`, { allowFailure: true });
    assert.equal(failure.exitCode, 3, `${id} unexpectedly succeeded`);
    assert.match(failure.stderr, new RegExp(`ERROR:\\s+${state}:`), `${id} must fail its intended invariant`);
    results.push({ id, result: 'DENIED', sqlstate: state, diagnostic: failure.stderr });
  }
  const unusedId = 'f011c000-0000-4000-8800-000000000002';
  for (const [id, overrides, state] of [
    ['SUPPORT_SOURCE_SUBSTITUTION', { source_evidence_identity: supportId }, '23514'],
    ['SUPPORT_INVALID_PRODUCER', { producer_id: 'unapproved.producer' }, '23514'],
    ['SUPPORT_INVALID_TARGET', { target_status: 'self_reported' }, '23514'],
    ['SUPPORT_WRONG_PREDECESSOR_VERSION', { previous_version: 2 }, '23503'],
    ['SUPPORT_CROSS_ASSERTION', { allergy_id: unusedId }, '23503'],
    ['SUPPORT_CROSS_PATIENT', { patient_id: unusedId }, '23503'],
  ]) {
    const otherContext = id === 'SUPPORT_CROSS_PATIENT'
      ? `INSERT INTO identity.patients(id,person_id,medical_record_number,record_status) VALUES(${quote(unusedId)},'f0110000-0000-4000-8000-000000000008','F011-SUPPORT-SYNTHETIC-2','active');`
      : id === 'SUPPORT_CROSS_ASSERTION'
        ? `INSERT INTO clinical.allergy_heads(id,patient_id,current_revision_id,current_version) VALUES(${quote(unusedId)},${quote(basis.patient_id)},'f011c000-0000-4000-8800-000000000004',1);
           INSERT INTO clinical.allergies SELECT (jsonb_populate_record(NULL::clinical.allergies,to_jsonb(a)||jsonb_build_object('id','f011c000-0000-4000-8800-000000000004','allergy_id',${quote(unusedId)}))).* FROM clinical.allergies a WHERE a.id=${quote(basis.id)};`
        : '';
    deny(id, otherContext + insert({ id: unusedId, source_evidence_identity: unusedId, ...overrides }), state);
  }
  deny('SUPPORT_IMMUTABLE_UPDATE', `UPDATE clinical.allergy_verification_support SET target_status='refuted' WHERE id=${quote(supportId)};`, '55000');
  deny('SUPPORT_IMMUTABLE_DELETE', `DELETE FROM clinical.allergy_verification_support WHERE id=${quote(supportId)};`, '55000');

  const revisionId = 'f011c000-0000-4000-8800-000000000003';
  const append = (status = 'clinician_confirmed', actor = clinician, includeBinding = true) => `
    INSERT INTO clinical.allergies(id,allergy_id,patient_id,version,supersedes_id,verification_status,
      facts_contract_id,facts_key_ref,facts_nonce,facts_ciphertext,facts_auth_tag,
      original_recorder_person_id,original_recorded_at,action_actor_person_id,facility_id,encounter_id,
      reason_contract_id,reason_key_ref,reason_nonce,reason_ciphertext,reason_auth_tag,verification_evidence_ref)
    SELECT ${quote(revisionId)}::uuid,allergy_id,patient_id,2,id,${quote(status)},
      facts_contract_id,facts_key_ref,facts_nonce,facts_ciphertext,facts_auth_tag,
      original_recorder_person_id,original_recorded_at,${quote(actor)}::uuid,
      'f0110000-0000-4000-8200-000000000001'::uuid,'f0110000-0000-4000-8400-000000000001'::uuid,
      facts_contract_id,facts_key_ref,decode(repeat('01',12),'hex'),decode('d0','hex'),decode(repeat('02',16),'hex'),${quote(supportId)}::uuid
    FROM clinical.allergies WHERE id=${quote(basis.id)};
    ${includeBinding ? `INSERT INTO clinical.allergy_verification_bindings VALUES(${quote(revisionId)},gen_random_uuid(),'SHIFAA-F011-VERIFIED-EVIDENCE-BINDING/1',${quote(supportId)},'f011.allergy_evidence_boundary',clock_timestamp());` : ''}
    UPDATE clinical.allergy_heads SET current_revision_id=${quote(revisionId)},current_version=2,updated_at=clock_timestamp() WHERE id=${quote(basis.allergy_id)};
    SET CONSTRAINTS clinical.allergy_revisions_reciprocal_deferred,clinical.allergy_support_reciprocal_deferred,clinical.allergy_bindings_reciprocal_deferred,clinical.allergy_heads_lineage_deferred IMMEDIATE;
  `;
  deny('CONSUMPTION_WRONG_TARGET', append('refuted'), '23514');
  deny('CONSUMPTION_WRONG_ATTESTOR', append('clinician_confirmed', basis.action_actor_person_id), '23514');
  deny('CONSUMPTION_MISSING_BINDING', append('clinician_confirmed', clinician, false), '23514');
  const exact = sql(runtime, database, `BEGIN; ${append()} SELECT 'EXACT_SUPPORT_CONSUMPTION_VALID'; ROLLBACK;`);
  assert.ok(exact.stdout.includes('EXACT_SUPPORT_CONSUMPTION_VALID'));
  results.push({ id: 'EXACT_RECIPROCAL_CONSUMPTION', result: 'PASS_DEFERRED_CONSTRAINTS_ROLLBACK' });
  deny('SUPPORT_CONSUMED_ONLY_ONCE', `${append()}
    INSERT INTO clinical.allergy_verification_bindings VALUES(${quote(basis.id)},gen_random_uuid(),'SHIFAA-F011-VERIFIED-EVIDENCE-BINDING/1',${quote(supportId)},'f011.allergy_evidence_boundary',clock_timestamp());`, '23505');
  assert.equal(sql(runtime, database, `SELECT count(*) FROM clinical.allergy_verification_bindings WHERE evidence_ref=${quote(supportId)};`).stdout.trim(), '0');
  results.push({ id: 'FAILED_CONSUMPTION_PRESERVES_UNUSED_SUPPORT', result: 'PASS' });
  return { results, syntheticOnly: true, provisioningCommittedSeparately: true,
    verificationMutationCommitOwnedByAllFiveConsumerProof: 'K06', durableSupportRemainsUnconsumed: true };
}
