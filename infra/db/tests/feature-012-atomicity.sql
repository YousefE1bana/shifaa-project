\set ON_ERROR_STOP on
\set VERBOSITY verbose

-- Private structural probe over the existing F011 pipeline. This file is sent
-- only to a verified disposable T002 PostgreSQL container. The protected byte
-- fixtures are opaque structural inputs and contain no clinical data or keys.
INSERT INTO identity.people(id,user_id,display_name,profile_status)
VALUES ('f0120000-0000-4000-8000-000000000001',
        'f0120000-0000-4000-8000-000000000002','Synthetic probe','active');
INSERT INTO identity.patients(id,person_id,medical_record_number,record_status)
VALUES ('f0120000-0000-4000-8000-000000000003',
        'f0120000-0000-4000-8000-000000000001','F012-ATOMICITY-SYNTHETIC','active');

CREATE FUNCTION pg_temp.probe_request(body_digest text, action text, mode text)
RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE
  request_id constant uuid := 'f0120000-0000-4000-8000-000000000004';
  patient constant uuid := 'f0120000-0000-4000-8000-000000000003';
  preparation jsonb;
  result jsonb;
BEGIN
  IF current_user <> 'shifaa_api' OR session_user <> 'shifaa_api' THEN
    RAISE EXCEPTION 'Probe must run as shifaa_api';
  END IF;
  PERFORM set_config('shifaa.environment','local',true);
  PERFORM set_config('shifaa.person_id','f0120000-0000-4000-8000-000000000001',true);
  PERFORM set_config('shifaa.actor_role','PAT',true);
  PERFORM set_config('shifaa.aal','1',true);
  PERFORM set_config('shifaa.action',action,true);
  PERFORM set_config('shifaa.purposes','synthetic.feature011',true);
  PERFORM set_config('shifaa.request_id',request_id::text,true);
  PERFORM set_config('shifaa.idempotency_key','synthetic-f012-atomicity-original',true);
  PERFORM set_config('shifaa.request_hash',body_digest,true);
  IF mode <> 'lookup' THEN
    preparation := jsonb_build_object(
      'allergyId','f0120000-0000-4000-8000-000000000005',
      'revisionId','f0120000-0000-4000-8000-000000000006',
      'revisionVersion',1,'previousRevisionId',NULL,'protectedReason',NULL,
      'correctsAllergyId',NULL,
      'protectedFacts',jsonb_build_object(
        'contractId','SHIFAA-F011-ALLERGY-PROTECTED/1','keyRef','synthetic/facts',
        'nonce',repeat('11',12),'ciphertext','a0','authTag',repeat('22',16)));
  END IF;
  result := clinical.create_allergy_api_v1(
    patient,jsonb_build_object('responseLanguage','en-EG','responseRequestId',request_id,'preparation',preparation)
  );
  IF mode = 'finalize' THEN
    result := clinical.f011_finalize_receipt_v1(
      (result->>'receiptId')::uuid,
      jsonb_build_object(
        'contractId','SHIFAA-F011-RECEIPT-PROTECTED/1','keyRef','synthetic/receipt',
        'nonce',repeat('33',12),'ciphertext','b0','authTag',repeat('44',16))
    );
  END IF;
  RETURN result;
END
$$;

CREATE FUNCTION pg_temp.probe_state() RETURNS jsonb LANGUAGE sql AS $$
  SELECT jsonb_build_object(
    'probe',(SELECT count(*) FROM clinical.allergies),
    'heads',(SELECT count(*) FROM clinical.allergy_heads),
    'audit',(SELECT count(*) FROM audit.events),
    'outbox',(SELECT count(*) FROM platform.outbox_events),
    'receipt',(SELECT count(*) FROM clinical.mutation_receipts),
    'obligation',(SELECT count(*) FROM clinical.mutation_commit_obligations),
    'idempotency',(SELECT count(*) FROM platform.idempotency_records WHERE state='completed'),
    'processing',(SELECT count(*) FROM platform.idempotency_records WHERE state='processing'),
    'digest',(SELECT encode(sha256(convert_to(jsonb_build_array(
      r.response_status,r.response_etag,r.response_language,r.response_request_id,
      encode(r.receipt_ciphertext,'hex'))::text,'UTF8')),'hex')
      FROM clinical.mutation_receipts r LIMIT 1))
$$;

-- Fail after all required writes, before commit. A genuine SQL abort must
-- erase all effects. A client-visible probe response is never emitted.
BEGIN;
SET SESSION AUTHORIZATION shifaa_api;
DO $$ BEGIN PERFORM pg_temp.probe_request(repeat('a',64),'createAllergy','finalize'); END $$;
\set ON_ERROR_STOP off
SELECT 1/0 AS controlled_precommit_failure;
\set precommit_state :SQLSTATE
ROLLBACK;
RESET SESSION AUTHORIZATION;
\set ON_ERROR_STOP on
SELECT 'precommit', :'precommit_state', pg_temp.probe_state();

-- Omit receipt finalization and let the actual deferred commit obligation
-- reject the incomplete transaction.
BEGIN;
SET SESSION AUTHORIZATION shifaa_api;
DO $$ BEGIN PERFORM pg_temp.probe_request(repeat('a',64),'createAllergy','stage'); END $$;
\set ON_ERROR_STOP off
COMMIT;
\set missing_receipt_state :SQLSTATE
RESET SESSION AUTHORIZATION;
\set ON_ERROR_STOP on
SELECT 'missing-receipt', :'missing_receipt_state', pg_temp.probe_state();

-- Commit on the same connection while withholding the result from the caller.
-- The original key, body and action are the only valid reconciliation input.
BEGIN;
SET SESSION AUTHORIZATION shifaa_api;
DO $$ BEGIN PERFORM pg_temp.probe_request(repeat('a',64),'createAllergy','finalize'); END $$;
COMMIT;
RESET SESSION AUTHORIZATION;
SELECT 'committed-without-response', '00000', pg_temp.probe_state();

BEGIN;
SET SESSION AUTHORIZATION shifaa_api;
WITH replay AS MATERIALIZED (
  SELECT pg_temp.probe_request(repeat('a',64),'createAllergy','lookup') AS row
)
SELECT 'original-key',row->>'replay',
  encode(sha256(convert_to(jsonb_build_array(
    (row->>'responseStatus')::integer, row->>'responseEtag', row->>'responseLanguage',
    row->>'responseRequestId',row->'receiptEnvelope'->>'ciphertext')::text,'UTF8')),'hex')
FROM replay;
COMMIT;
RESET SESSION AUTHORIZATION;

CREATE FUNCTION pg_temp.expect_rejection(body_digest text, action text, expected text)
RETURNS text LANGUAGE plpgsql AS $$
BEGIN
  BEGIN
    PERFORM pg_temp.probe_request(body_digest,action,'lookup');
  EXCEPTION WHEN OTHERS THEN
    IF SQLSTATE = expected THEN
      IF expected = '23505' AND position('idempotency key reused' IN SQLERRM) = 0 THEN
        RAISE;
      END IF;
      RETURN SQLSTATE;
    END IF;
    RAISE;
  END;
  RAISE EXCEPTION 'Unexpected receipt disclosure';
END
$$;
BEGIN;
SET SESSION AUTHORIZATION shifaa_api;
SELECT 'changed-body', pg_temp.expect_rejection(repeat('b',64),'createAllergy','23505');
SELECT 'changed-action', pg_temp.expect_rejection(repeat('a',64),'verifyAllergy','42501');
COMMIT;
RESET SESSION AUTHORIZATION;

UPDATE identity.people SET profile_status='suspended'
WHERE id='f0120000-0000-4000-8000-000000000001';
BEGIN;
SET SESSION AUTHORIZATION shifaa_api;
SELECT 'revoked', pg_temp.expect_rejection(repeat('a',64),'createAllergy','42501');
COMMIT;
RESET SESSION AUTHORIZATION;
SELECT 'after-replays', '00000', pg_temp.probe_state();
