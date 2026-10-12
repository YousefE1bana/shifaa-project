-- K04 physical RED. Each case runs in its own isolated test transaction.

-- F011_CASE {"id":"RECEIPT-TUPLE","task":"T014","missing":{"kind":"table","name":"clinical.mutation_receipts"},"purpose":"Exact immutable response tuple plus opaque five-field envelope; twelve-frame AAD metadata, no plaintext response/headers","user":"owner","commit":false}
CREATE FUNCTION pg_temp.f011_case() RETURNS void LANGUAGE plpgsql AS $case$
BEGIN
  PERFORM pg_temp.f011_require_table('clinical.mutation_receipts');
  PERFORM pg_temp.f011_columns('clinical.mutation_receipts','[{"name":"id","type":"uuid","nullable":false},{"name":"idempotency_record_id","type":"uuid","nullable":false},{"name":"actor_person_id","type":"uuid","nullable":false},{"name":"operation_id","type":"text","nullable":false},{"name":"resource_type","type":"text","nullable":false},{"name":"resource_id","type":"uuid","nullable":false},{"name":"resource_version","type":"integer","nullable":false},{"name":"response_status","type":"smallint","nullable":false},{"name":"response_etag","type":"text","nullable":false},{"name":"response_language","type":"text","nullable":false},{"name":"response_request_id","type":"uuid","nullable":false},{"name":"occurred_at","type":"timestamptz","nullable":false},{"name":"receipt_contract_id","type":"text","nullable":false},{"name":"receipt_key_ref","type":"text","nullable":false},{"name":"receipt_nonce","type":"bytea","nullable":false},{"name":"receipt_ciphertext","type":"bytea","nullable":false},{"name":"receipt_auth_tag","type":"bytea","nullable":false}]'::jsonb,true);
END $case$;
SELECT 'K04_CASE_COMPILED';
SELECT pg_temp.f011_case();

-- F011_CASE {"id":"OBLIGATION-TUPLE","task":"T014","missing":{"kind":"table","name":"clinical.mutation_commit_obligations"},"purpose":"Partition-compatible composite audit FK, outbox binding, deferred all-five obligation","user":"owner","commit":false}
CREATE FUNCTION pg_temp.f011_case() RETURNS void LANGUAGE plpgsql AS $case$
BEGIN
  PERFORM pg_temp.f011_require_table('clinical.mutation_commit_obligations');
  PERFORM pg_temp.f011_columns('clinical.mutation_commit_obligations','[{"name":"idempotency_record_id","type":"uuid","nullable":false},{"name":"receipt_id","type":"uuid","nullable":false},{"name":"actor_person_id","type":"uuid","nullable":false},{"name":"operation_id","type":"text","nullable":false},{"name":"resource_type","type":"text","nullable":false},{"name":"resource_id","type":"uuid","nullable":false},{"name":"resource_version","type":"integer","nullable":false},{"name":"response_status","type":"smallint","nullable":false},{"name":"response_etag","type":"text","nullable":false},{"name":"response_language","type":"text","nullable":false},{"name":"response_request_id","type":"uuid","nullable":false},{"name":"audit_event_occurred_at","type":"timestamptz","nullable":false},{"name":"audit_event_id","type":"uuid","nullable":false},{"name":"outbox_event_id","type":"uuid","nullable":false},{"name":"occurred_at","type":"timestamptz","nullable":false}]'::jsonb,true);
  PERFORM pg_temp.f011_fk('clinical.mutation_commit_obligations',ARRAY['audit_event_occurred_at','audit_event_id']::text[],'audit.events',ARRAY['occurred_at','id']::text[],false);
  PERFORM pg_temp.f011_fk('clinical.mutation_commit_obligations',ARRAY['outbox_event_id']::text[],'platform.outbox_events',ARRAY['id']::text[],false);
  PERFORM pg_temp.f011_deferred('clinical.mutation_commit_obligations');
END $case$;
SELECT 'K04_CASE_COMPILED';
SELECT pg_temp.f011_case();

-- F011_CASE {"id":"RECEIPT-HISTORY","task":"T014","missing":{"kind":"table","name":"clinical.mutation_receipts"},"purpose":"Original replay snapshot immutable, pointer-only generic response, linked idempotency history RESTRICT","user":"owner","commit":false}
CREATE FUNCTION pg_temp.f011_case() RETURNS void LANGUAGE plpgsql AS $case$
BEGIN
  PERFORM pg_temp.f011_require_table('clinical.mutation_receipts');
  PERFORM pg_temp.f011_fk('clinical.mutation_receipts',ARRAY['idempotency_record_id']::text[],'platform.idempotency_records',ARRAY['id']::text[],true);
  PERFORM pg_temp.f011_unique('clinical.mutation_receipts',ARRAY['idempotency_record_id']::text[]);
  PERFORM pg_temp.f011_check(EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid='clinical.mutation_receipts'::regclass AND NOT tgisinternal AND (tgtype & 8)<>0 AND (tgtype & 16)<>0),'receipt UPDATE/DELETE immutable');
END $case$;
SELECT 'K04_CASE_COMPILED';
SELECT pg_temp.f011_case();

-- F011_CASE {"id":"COMMIT-createAllergy-missing-receipt","task":"T014","missing":{"kind":"table","name":"clinical.mutation_commit_obligations"},"purpose":"createAllergy: missing-receipt must abort the transaction at COMMIT; no real AES/KMS","user":"owner","commit":true}
CREATE FUNCTION pg_temp.f011_case() RETURNS void LANGUAGE plpgsql AS $case$
BEGIN
  PERFORM pg_temp.f011_require_table('clinical.mutation_commit_obligations');
  PERFORM pg_temp.f011_receipt_fault('createAllergy','missing-receipt');
END $case$;
SELECT 'K04_CASE_COMPILED';
SELECT pg_temp.f011_case();

-- F011_CASE {"id":"COMMIT-createAllergy-wrong-tuple","task":"T014","missing":{"kind":"table","name":"clinical.mutation_commit_obligations"},"purpose":"createAllergy: wrong-tuple must abort the transaction at COMMIT; no real AES/KMS","user":"owner","commit":true}
CREATE FUNCTION pg_temp.f011_case() RETURNS void LANGUAGE plpgsql AS $case$
BEGIN
  PERFORM pg_temp.f011_require_table('clinical.mutation_commit_obligations');
  PERFORM pg_temp.f011_receipt_fault('createAllergy','wrong-tuple');
END $case$;
SELECT 'K04_CASE_COMPILED';
SELECT pg_temp.f011_case();

-- F011_CASE {"id":"COMMIT-createAllergy-missing-audit","task":"T014","missing":{"kind":"table","name":"clinical.mutation_commit_obligations"},"purpose":"createAllergy: missing-audit must abort the transaction at COMMIT; no real AES/KMS","user":"owner","commit":true}
CREATE FUNCTION pg_temp.f011_case() RETURNS void LANGUAGE plpgsql AS $case$
BEGIN
  PERFORM pg_temp.f011_require_table('clinical.mutation_commit_obligations');
  PERFORM pg_temp.f011_receipt_fault('createAllergy','missing-audit');
END $case$;
SELECT 'K04_CASE_COMPILED';
SELECT pg_temp.f011_case();

-- F011_CASE {"id":"COMMIT-createAllergy-wrong-audit","task":"T014","missing":{"kind":"table","name":"clinical.mutation_commit_obligations"},"purpose":"createAllergy: wrong-audit must abort the transaction at COMMIT; no real AES/KMS","user":"owner","commit":true}
CREATE FUNCTION pg_temp.f011_case() RETURNS void LANGUAGE plpgsql AS $case$
BEGIN
  PERFORM pg_temp.f011_require_table('clinical.mutation_commit_obligations');
  PERFORM pg_temp.f011_receipt_fault('createAllergy','wrong-audit');
END $case$;
SELECT 'K04_CASE_COMPILED';
SELECT pg_temp.f011_case();

-- F011_CASE {"id":"COMMIT-createAllergy-missing-outbox","task":"T014","missing":{"kind":"table","name":"clinical.mutation_commit_obligations"},"purpose":"createAllergy: missing-outbox must abort the transaction at COMMIT; no real AES/KMS","user":"owner","commit":true}
CREATE FUNCTION pg_temp.f011_case() RETURNS void LANGUAGE plpgsql AS $case$
BEGIN
  PERFORM pg_temp.f011_require_table('clinical.mutation_commit_obligations');
  PERFORM pg_temp.f011_receipt_fault('createAllergy','missing-outbox');
END $case$;
SELECT 'K04_CASE_COMPILED';
SELECT pg_temp.f011_case();

-- F011_CASE {"id":"COMMIT-createAllergy-wrong-outbox","task":"T014","missing":{"kind":"table","name":"clinical.mutation_commit_obligations"},"purpose":"createAllergy: wrong-outbox must abort the transaction at COMMIT; no real AES/KMS","user":"owner","commit":true}
CREATE FUNCTION pg_temp.f011_case() RETURNS void LANGUAGE plpgsql AS $case$
BEGIN
  PERFORM pg_temp.f011_require_table('clinical.mutation_commit_obligations');
  PERFORM pg_temp.f011_receipt_fault('createAllergy','wrong-outbox');
END $case$;
SELECT 'K04_CASE_COMPILED';
SELECT pg_temp.f011_case();

-- F011_CASE {"id":"COMMIT-createAllergy-incomplete-idempotency","task":"T014","missing":{"kind":"table","name":"clinical.mutation_commit_obligations"},"purpose":"createAllergy: incomplete-idempotency must abort the transaction at COMMIT; no real AES/KMS","user":"owner","commit":true}
CREATE FUNCTION pg_temp.f011_case() RETURNS void LANGUAGE plpgsql AS $case$
BEGIN
  PERFORM pg_temp.f011_require_table('clinical.mutation_commit_obligations');
  PERFORM pg_temp.f011_receipt_fault('createAllergy','incomplete-idempotency');
END $case$;
SELECT 'K04_CASE_COMPILED';
SELECT pg_temp.f011_case();

-- F011_CASE {"id":"COMMIT-createAllergy-wrong-pointer","task":"T014","missing":{"kind":"table","name":"clinical.mutation_commit_obligations"},"purpose":"createAllergy: wrong-pointer must abort the transaction at COMMIT; no real AES/KMS","user":"owner","commit":true}
CREATE FUNCTION pg_temp.f011_case() RETURNS void LANGUAGE plpgsql AS $case$
BEGIN
  PERFORM pg_temp.f011_require_table('clinical.mutation_commit_obligations');
  PERFORM pg_temp.f011_receipt_fault('createAllergy','wrong-pointer');
END $case$;
SELECT 'K04_CASE_COMPILED';
SELECT pg_temp.f011_case();

-- F011_CASE {"id":"COMMIT-verifyAllergy-missing-receipt","task":"T014","missing":{"kind":"table","name":"clinical.mutation_commit_obligations"},"purpose":"verifyAllergy: missing-receipt must abort the transaction at COMMIT; no real AES/KMS","user":"owner","commit":true}
CREATE FUNCTION pg_temp.f011_case() RETURNS void LANGUAGE plpgsql AS $case$
BEGIN
  PERFORM pg_temp.f011_require_table('clinical.mutation_commit_obligations');
  PERFORM pg_temp.f011_receipt_fault('verifyAllergy','missing-receipt');
END $case$;
SELECT 'K04_CASE_COMPILED';
SELECT pg_temp.f011_case();

-- F011_CASE {"id":"COMMIT-verifyAllergy-wrong-tuple","task":"T014","missing":{"kind":"table","name":"clinical.mutation_commit_obligations"},"purpose":"verifyAllergy: wrong-tuple must abort the transaction at COMMIT; no real AES/KMS","user":"owner","commit":true}
CREATE FUNCTION pg_temp.f011_case() RETURNS void LANGUAGE plpgsql AS $case$
BEGIN
  PERFORM pg_temp.f011_require_table('clinical.mutation_commit_obligations');
  PERFORM pg_temp.f011_receipt_fault('verifyAllergy','wrong-tuple');
END $case$;
SELECT 'K04_CASE_COMPILED';
SELECT pg_temp.f011_case();

-- F011_CASE {"id":"COMMIT-verifyAllergy-missing-audit","task":"T014","missing":{"kind":"table","name":"clinical.mutation_commit_obligations"},"purpose":"verifyAllergy: missing-audit must abort the transaction at COMMIT; no real AES/KMS","user":"owner","commit":true}
CREATE FUNCTION pg_temp.f011_case() RETURNS void LANGUAGE plpgsql AS $case$
BEGIN
  PERFORM pg_temp.f011_require_table('clinical.mutation_commit_obligations');
  PERFORM pg_temp.f011_receipt_fault('verifyAllergy','missing-audit');
END $case$;
SELECT 'K04_CASE_COMPILED';
SELECT pg_temp.f011_case();

-- F011_CASE {"id":"COMMIT-verifyAllergy-wrong-audit","task":"T014","missing":{"kind":"table","name":"clinical.mutation_commit_obligations"},"purpose":"verifyAllergy: wrong-audit must abort the transaction at COMMIT; no real AES/KMS","user":"owner","commit":true}
CREATE FUNCTION pg_temp.f011_case() RETURNS void LANGUAGE plpgsql AS $case$
BEGIN
  PERFORM pg_temp.f011_require_table('clinical.mutation_commit_obligations');
  PERFORM pg_temp.f011_receipt_fault('verifyAllergy','wrong-audit');
END $case$;
SELECT 'K04_CASE_COMPILED';
SELECT pg_temp.f011_case();

-- F011_CASE {"id":"COMMIT-verifyAllergy-missing-outbox","task":"T014","missing":{"kind":"table","name":"clinical.mutation_commit_obligations"},"purpose":"verifyAllergy: missing-outbox must abort the transaction at COMMIT; no real AES/KMS","user":"owner","commit":true}
CREATE FUNCTION pg_temp.f011_case() RETURNS void LANGUAGE plpgsql AS $case$
BEGIN
  PERFORM pg_temp.f011_require_table('clinical.mutation_commit_obligations');
  PERFORM pg_temp.f011_receipt_fault('verifyAllergy','missing-outbox');
END $case$;
SELECT 'K04_CASE_COMPILED';
SELECT pg_temp.f011_case();

-- F011_CASE {"id":"COMMIT-verifyAllergy-wrong-outbox","task":"T014","missing":{"kind":"table","name":"clinical.mutation_commit_obligations"},"purpose":"verifyAllergy: wrong-outbox must abort the transaction at COMMIT; no real AES/KMS","user":"owner","commit":true}
CREATE FUNCTION pg_temp.f011_case() RETURNS void LANGUAGE plpgsql AS $case$
BEGIN
  PERFORM pg_temp.f011_require_table('clinical.mutation_commit_obligations');
  PERFORM pg_temp.f011_receipt_fault('verifyAllergy','wrong-outbox');
END $case$;
SELECT 'K04_CASE_COMPILED';
SELECT pg_temp.f011_case();

-- F011_CASE {"id":"COMMIT-verifyAllergy-incomplete-idempotency","task":"T014","missing":{"kind":"table","name":"clinical.mutation_commit_obligations"},"purpose":"verifyAllergy: incomplete-idempotency must abort the transaction at COMMIT; no real AES/KMS","user":"owner","commit":true}
CREATE FUNCTION pg_temp.f011_case() RETURNS void LANGUAGE plpgsql AS $case$
BEGIN
  PERFORM pg_temp.f011_require_table('clinical.mutation_commit_obligations');
  PERFORM pg_temp.f011_receipt_fault('verifyAllergy','incomplete-idempotency');
END $case$;
SELECT 'K04_CASE_COMPILED';
SELECT pg_temp.f011_case();

-- F011_CASE {"id":"COMMIT-verifyAllergy-wrong-pointer","task":"T014","missing":{"kind":"table","name":"clinical.mutation_commit_obligations"},"purpose":"verifyAllergy: wrong-pointer must abort the transaction at COMMIT; no real AES/KMS","user":"owner","commit":true}
CREATE FUNCTION pg_temp.f011_case() RETURNS void LANGUAGE plpgsql AS $case$
BEGIN
  PERFORM pg_temp.f011_require_table('clinical.mutation_commit_obligations');
  PERFORM pg_temp.f011_receipt_fault('verifyAllergy','wrong-pointer');
END $case$;
SELECT 'K04_CASE_COMPILED';
SELECT pg_temp.f011_case();

-- F011_CASE {"id":"COMMIT-createClinicalContentRelease-missing-receipt","task":"T014","missing":{"kind":"table","name":"clinical.mutation_commit_obligations"},"purpose":"createClinicalContentRelease: missing-receipt must abort the transaction at COMMIT; no real AES/KMS","user":"owner","commit":true}
CREATE FUNCTION pg_temp.f011_case() RETURNS void LANGUAGE plpgsql AS $case$
BEGIN
  PERFORM pg_temp.f011_require_table('clinical.mutation_commit_obligations');
  PERFORM pg_temp.f011_receipt_fault('createClinicalContentRelease','missing-receipt');
END $case$;
SELECT 'K04_CASE_COMPILED';
SELECT pg_temp.f011_case();

-- F011_CASE {"id":"COMMIT-createClinicalContentRelease-wrong-tuple","task":"T014","missing":{"kind":"table","name":"clinical.mutation_commit_obligations"},"purpose":"createClinicalContentRelease: wrong-tuple must abort the transaction at COMMIT; no real AES/KMS","user":"owner","commit":true}
CREATE FUNCTION pg_temp.f011_case() RETURNS void LANGUAGE plpgsql AS $case$
BEGIN
  PERFORM pg_temp.f011_require_table('clinical.mutation_commit_obligations');
  PERFORM pg_temp.f011_receipt_fault('createClinicalContentRelease','wrong-tuple');
END $case$;
SELECT 'K04_CASE_COMPILED';
SELECT pg_temp.f011_case();

-- F011_CASE {"id":"COMMIT-createClinicalContentRelease-missing-audit","task":"T014","missing":{"kind":"table","name":"clinical.mutation_commit_obligations"},"purpose":"createClinicalContentRelease: missing-audit must abort the transaction at COMMIT; no real AES/KMS","user":"owner","commit":true}
CREATE FUNCTION pg_temp.f011_case() RETURNS void LANGUAGE plpgsql AS $case$
BEGIN
  PERFORM pg_temp.f011_require_table('clinical.mutation_commit_obligations');
  PERFORM pg_temp.f011_receipt_fault('createClinicalContentRelease','missing-audit');
END $case$;
SELECT 'K04_CASE_COMPILED';
SELECT pg_temp.f011_case();

-- F011_CASE {"id":"COMMIT-createClinicalContentRelease-wrong-audit","task":"T014","missing":{"kind":"table","name":"clinical.mutation_commit_obligations"},"purpose":"createClinicalContentRelease: wrong-audit must abort the transaction at COMMIT; no real AES/KMS","user":"owner","commit":true}
CREATE FUNCTION pg_temp.f011_case() RETURNS void LANGUAGE plpgsql AS $case$
BEGIN
  PERFORM pg_temp.f011_require_table('clinical.mutation_commit_obligations');
  PERFORM pg_temp.f011_receipt_fault('createClinicalContentRelease','wrong-audit');
END $case$;
SELECT 'K04_CASE_COMPILED';
SELECT pg_temp.f011_case();

-- F011_CASE {"id":"COMMIT-createClinicalContentRelease-missing-outbox","task":"T014","missing":{"kind":"table","name":"clinical.mutation_commit_obligations"},"purpose":"createClinicalContentRelease: missing-outbox must abort the transaction at COMMIT; no real AES/KMS","user":"owner","commit":true}
CREATE FUNCTION pg_temp.f011_case() RETURNS void LANGUAGE plpgsql AS $case$
BEGIN
  PERFORM pg_temp.f011_require_table('clinical.mutation_commit_obligations');
  PERFORM pg_temp.f011_receipt_fault('createClinicalContentRelease','missing-outbox');
END $case$;
SELECT 'K04_CASE_COMPILED';
SELECT pg_temp.f011_case();

-- F011_CASE {"id":"COMMIT-createClinicalContentRelease-wrong-outbox","task":"T014","missing":{"kind":"table","name":"clinical.mutation_commit_obligations"},"purpose":"createClinicalContentRelease: wrong-outbox must abort the transaction at COMMIT; no real AES/KMS","user":"owner","commit":true}
CREATE FUNCTION pg_temp.f011_case() RETURNS void LANGUAGE plpgsql AS $case$
BEGIN
  PERFORM pg_temp.f011_require_table('clinical.mutation_commit_obligations');
  PERFORM pg_temp.f011_receipt_fault('createClinicalContentRelease','wrong-outbox');
END $case$;
SELECT 'K04_CASE_COMPILED';
SELECT pg_temp.f011_case();

-- F011_CASE {"id":"COMMIT-createClinicalContentRelease-incomplete-idempotency","task":"T014","missing":{"kind":"table","name":"clinical.mutation_commit_obligations"},"purpose":"createClinicalContentRelease: incomplete-idempotency must abort the transaction at COMMIT; no real AES/KMS","user":"owner","commit":true}
CREATE FUNCTION pg_temp.f011_case() RETURNS void LANGUAGE plpgsql AS $case$
BEGIN
  PERFORM pg_temp.f011_require_table('clinical.mutation_commit_obligations');
  PERFORM pg_temp.f011_receipt_fault('createClinicalContentRelease','incomplete-idempotency');
END $case$;
SELECT 'K04_CASE_COMPILED';
SELECT pg_temp.f011_case();

-- F011_CASE {"id":"COMMIT-createClinicalContentRelease-wrong-pointer","task":"T014","missing":{"kind":"table","name":"clinical.mutation_commit_obligations"},"purpose":"createClinicalContentRelease: wrong-pointer must abort the transaction at COMMIT; no real AES/KMS","user":"owner","commit":true}
CREATE FUNCTION pg_temp.f011_case() RETURNS void LANGUAGE plpgsql AS $case$
BEGIN
  PERFORM pg_temp.f011_require_table('clinical.mutation_commit_obligations');
  PERFORM pg_temp.f011_receipt_fault('createClinicalContentRelease','wrong-pointer');
END $case$;
SELECT 'K04_CASE_COMPILED';
SELECT pg_temp.f011_case();

-- F011_CASE {"id":"COMMIT-signClinicalContentRelease-missing-receipt","task":"T014","missing":{"kind":"table","name":"clinical.mutation_commit_obligations"},"purpose":"signClinicalContentRelease: missing-receipt must abort the transaction at COMMIT; no real AES/KMS","user":"owner","commit":true}
CREATE FUNCTION pg_temp.f011_case() RETURNS void LANGUAGE plpgsql AS $case$
BEGIN
  PERFORM pg_temp.f011_require_table('clinical.mutation_commit_obligations');
  PERFORM pg_temp.f011_receipt_fault('signClinicalContentRelease','missing-receipt');
END $case$;
SELECT 'K04_CASE_COMPILED';
SELECT pg_temp.f011_case();

-- F011_CASE {"id":"COMMIT-signClinicalContentRelease-wrong-tuple","task":"T014","missing":{"kind":"table","name":"clinical.mutation_commit_obligations"},"purpose":"signClinicalContentRelease: wrong-tuple must abort the transaction at COMMIT; no real AES/KMS","user":"owner","commit":true}
CREATE FUNCTION pg_temp.f011_case() RETURNS void LANGUAGE plpgsql AS $case$
BEGIN
  PERFORM pg_temp.f011_require_table('clinical.mutation_commit_obligations');
  PERFORM pg_temp.f011_receipt_fault('signClinicalContentRelease','wrong-tuple');
END $case$;
SELECT 'K04_CASE_COMPILED';
SELECT pg_temp.f011_case();

-- F011_CASE {"id":"COMMIT-signClinicalContentRelease-missing-audit","task":"T014","missing":{"kind":"table","name":"clinical.mutation_commit_obligations"},"purpose":"signClinicalContentRelease: missing-audit must abort the transaction at COMMIT; no real AES/KMS","user":"owner","commit":true}
CREATE FUNCTION pg_temp.f011_case() RETURNS void LANGUAGE plpgsql AS $case$
BEGIN
  PERFORM pg_temp.f011_require_table('clinical.mutation_commit_obligations');
  PERFORM pg_temp.f011_receipt_fault('signClinicalContentRelease','missing-audit');
END $case$;
SELECT 'K04_CASE_COMPILED';
SELECT pg_temp.f011_case();

-- F011_CASE {"id":"COMMIT-signClinicalContentRelease-wrong-audit","task":"T014","missing":{"kind":"table","name":"clinical.mutation_commit_obligations"},"purpose":"signClinicalContentRelease: wrong-audit must abort the transaction at COMMIT; no real AES/KMS","user":"owner","commit":true}
CREATE FUNCTION pg_temp.f011_case() RETURNS void LANGUAGE plpgsql AS $case$
BEGIN
  PERFORM pg_temp.f011_require_table('clinical.mutation_commit_obligations');
  PERFORM pg_temp.f011_receipt_fault('signClinicalContentRelease','wrong-audit');
END $case$;
SELECT 'K04_CASE_COMPILED';
SELECT pg_temp.f011_case();

-- F011_CASE {"id":"COMMIT-signClinicalContentRelease-missing-outbox","task":"T014","missing":{"kind":"table","name":"clinical.mutation_commit_obligations"},"purpose":"signClinicalContentRelease: missing-outbox must abort the transaction at COMMIT; no real AES/KMS","user":"owner","commit":true}
CREATE FUNCTION pg_temp.f011_case() RETURNS void LANGUAGE plpgsql AS $case$
BEGIN
  PERFORM pg_temp.f011_require_table('clinical.mutation_commit_obligations');
  PERFORM pg_temp.f011_receipt_fault('signClinicalContentRelease','missing-outbox');
END $case$;
SELECT 'K04_CASE_COMPILED';
SELECT pg_temp.f011_case();

-- F011_CASE {"id":"COMMIT-signClinicalContentRelease-wrong-outbox","task":"T014","missing":{"kind":"table","name":"clinical.mutation_commit_obligations"},"purpose":"signClinicalContentRelease: wrong-outbox must abort the transaction at COMMIT; no real AES/KMS","user":"owner","commit":true}
CREATE FUNCTION pg_temp.f011_case() RETURNS void LANGUAGE plpgsql AS $case$
BEGIN
  PERFORM pg_temp.f011_require_table('clinical.mutation_commit_obligations');
  PERFORM pg_temp.f011_receipt_fault('signClinicalContentRelease','wrong-outbox');
END $case$;
SELECT 'K04_CASE_COMPILED';
SELECT pg_temp.f011_case();

-- F011_CASE {"id":"COMMIT-signClinicalContentRelease-incomplete-idempotency","task":"T014","missing":{"kind":"table","name":"clinical.mutation_commit_obligations"},"purpose":"signClinicalContentRelease: incomplete-idempotency must abort the transaction at COMMIT; no real AES/KMS","user":"owner","commit":true}
CREATE FUNCTION pg_temp.f011_case() RETURNS void LANGUAGE plpgsql AS $case$
BEGIN
  PERFORM pg_temp.f011_require_table('clinical.mutation_commit_obligations');
  PERFORM pg_temp.f011_receipt_fault('signClinicalContentRelease','incomplete-idempotency');
END $case$;
SELECT 'K04_CASE_COMPILED';
SELECT pg_temp.f011_case();

-- F011_CASE {"id":"COMMIT-signClinicalContentRelease-wrong-pointer","task":"T014","missing":{"kind":"table","name":"clinical.mutation_commit_obligations"},"purpose":"signClinicalContentRelease: wrong-pointer must abort the transaction at COMMIT; no real AES/KMS","user":"owner","commit":true}
CREATE FUNCTION pg_temp.f011_case() RETURNS void LANGUAGE plpgsql AS $case$
BEGIN
  PERFORM pg_temp.f011_require_table('clinical.mutation_commit_obligations');
  PERFORM pg_temp.f011_receipt_fault('signClinicalContentRelease','wrong-pointer');
END $case$;
SELECT 'K04_CASE_COMPILED';
SELECT pg_temp.f011_case();

-- F011_CASE {"id":"COMMIT-publishClinicalContentRelease-missing-receipt","task":"T014","missing":{"kind":"table","name":"clinical.mutation_commit_obligations"},"purpose":"publishClinicalContentRelease: missing-receipt must abort the transaction at COMMIT; no real AES/KMS","user":"owner","commit":true}
CREATE FUNCTION pg_temp.f011_case() RETURNS void LANGUAGE plpgsql AS $case$
BEGIN
  PERFORM pg_temp.f011_require_table('clinical.mutation_commit_obligations');
  PERFORM pg_temp.f011_receipt_fault('publishClinicalContentRelease','missing-receipt');
END $case$;
SELECT 'K04_CASE_COMPILED';
SELECT pg_temp.f011_case();

-- F011_CASE {"id":"COMMIT-publishClinicalContentRelease-wrong-tuple","task":"T014","missing":{"kind":"table","name":"clinical.mutation_commit_obligations"},"purpose":"publishClinicalContentRelease: wrong-tuple must abort the transaction at COMMIT; no real AES/KMS","user":"owner","commit":true}
CREATE FUNCTION pg_temp.f011_case() RETURNS void LANGUAGE plpgsql AS $case$
BEGIN
  PERFORM pg_temp.f011_require_table('clinical.mutation_commit_obligations');
  PERFORM pg_temp.f011_receipt_fault('publishClinicalContentRelease','wrong-tuple');
END $case$;
SELECT 'K04_CASE_COMPILED';
SELECT pg_temp.f011_case();

-- F011_CASE {"id":"COMMIT-publishClinicalContentRelease-missing-audit","task":"T014","missing":{"kind":"table","name":"clinical.mutation_commit_obligations"},"purpose":"publishClinicalContentRelease: missing-audit must abort the transaction at COMMIT; no real AES/KMS","user":"owner","commit":true}
CREATE FUNCTION pg_temp.f011_case() RETURNS void LANGUAGE plpgsql AS $case$
BEGIN
  PERFORM pg_temp.f011_require_table('clinical.mutation_commit_obligations');
  PERFORM pg_temp.f011_receipt_fault('publishClinicalContentRelease','missing-audit');
END $case$;
SELECT 'K04_CASE_COMPILED';
SELECT pg_temp.f011_case();

-- F011_CASE {"id":"COMMIT-publishClinicalContentRelease-wrong-audit","task":"T014","missing":{"kind":"table","name":"clinical.mutation_commit_obligations"},"purpose":"publishClinicalContentRelease: wrong-audit must abort the transaction at COMMIT; no real AES/KMS","user":"owner","commit":true}
CREATE FUNCTION pg_temp.f011_case() RETURNS void LANGUAGE plpgsql AS $case$
BEGIN
  PERFORM pg_temp.f011_require_table('clinical.mutation_commit_obligations');
  PERFORM pg_temp.f011_receipt_fault('publishClinicalContentRelease','wrong-audit');
END $case$;
SELECT 'K04_CASE_COMPILED';
SELECT pg_temp.f011_case();

-- F011_CASE {"id":"COMMIT-publishClinicalContentRelease-missing-outbox","task":"T014","missing":{"kind":"table","name":"clinical.mutation_commit_obligations"},"purpose":"publishClinicalContentRelease: missing-outbox must abort the transaction at COMMIT; no real AES/KMS","user":"owner","commit":true}
CREATE FUNCTION pg_temp.f011_case() RETURNS void LANGUAGE plpgsql AS $case$
BEGIN
  PERFORM pg_temp.f011_require_table('clinical.mutation_commit_obligations');
  PERFORM pg_temp.f011_receipt_fault('publishClinicalContentRelease','missing-outbox');
END $case$;
SELECT 'K04_CASE_COMPILED';
SELECT pg_temp.f011_case();

-- F011_CASE {"id":"COMMIT-publishClinicalContentRelease-wrong-outbox","task":"T014","missing":{"kind":"table","name":"clinical.mutation_commit_obligations"},"purpose":"publishClinicalContentRelease: wrong-outbox must abort the transaction at COMMIT; no real AES/KMS","user":"owner","commit":true}
CREATE FUNCTION pg_temp.f011_case() RETURNS void LANGUAGE plpgsql AS $case$
BEGIN
  PERFORM pg_temp.f011_require_table('clinical.mutation_commit_obligations');
  PERFORM pg_temp.f011_receipt_fault('publishClinicalContentRelease','wrong-outbox');
END $case$;
SELECT 'K04_CASE_COMPILED';
SELECT pg_temp.f011_case();

-- F011_CASE {"id":"COMMIT-publishClinicalContentRelease-incomplete-idempotency","task":"T014","missing":{"kind":"table","name":"clinical.mutation_commit_obligations"},"purpose":"publishClinicalContentRelease: incomplete-idempotency must abort the transaction at COMMIT; no real AES/KMS","user":"owner","commit":true}
CREATE FUNCTION pg_temp.f011_case() RETURNS void LANGUAGE plpgsql AS $case$
BEGIN
  PERFORM pg_temp.f011_require_table('clinical.mutation_commit_obligations');
  PERFORM pg_temp.f011_receipt_fault('publishClinicalContentRelease','incomplete-idempotency');
END $case$;
SELECT 'K04_CASE_COMPILED';
SELECT pg_temp.f011_case();

-- F011_CASE {"id":"COMMIT-publishClinicalContentRelease-wrong-pointer","task":"T014","missing":{"kind":"table","name":"clinical.mutation_commit_obligations"},"purpose":"publishClinicalContentRelease: wrong-pointer must abort the transaction at COMMIT; no real AES/KMS","user":"owner","commit":true}
CREATE FUNCTION pg_temp.f011_case() RETURNS void LANGUAGE plpgsql AS $case$
BEGIN
  PERFORM pg_temp.f011_require_table('clinical.mutation_commit_obligations');
  PERFORM pg_temp.f011_receipt_fault('publishClinicalContentRelease','wrong-pointer');
END $case$;
SELECT 'K04_CASE_COMPILED';
SELECT pg_temp.f011_case();

