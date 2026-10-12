-- K04 physical RED. Each case runs in its own isolated test transaction.

-- F011_CASE {"id":"ALG-REASON","task":"T012","missing":{"kind":"table","name":"clinical.allergies"},"purpose":"Exact reason nullability; self_reported v1 has no reason/evidence, every verification requires all five","user":"owner","commit":false}
CREATE FUNCTION pg_temp.f011_case() RETURNS void LANGUAGE plpgsql AS $case$
BEGIN
  PERFORM pg_temp.f011_require_table('clinical.allergies');
  PERFORM pg_temp.f011_columns('clinical.allergies','[{"name":"reason_contract_id","type":"text","nullable":true},{"name":"reason_key_ref","type":"text","nullable":true},{"name":"reason_nonce","type":"bytea","nullable":true},{"name":"reason_ciphertext","type":"bytea","nullable":true},{"name":"reason_auth_tag","type":"bytea","nullable":true}]'::jsonb,false);
  PERFORM pg_temp.f011_check(EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='clinical.allergies'::regclass AND contype='c' AND pg_get_constraintdef(oid) LIKE '%reason_contract_id%' AND pg_get_constraintdef(oid) LIKE '%verification_status%'),'initial all-null reason versus required verified reason');
END $case$;
SELECT 'K04_CASE_COMPILED';
SELECT pg_temp.f011_case();

-- F011_CASE {"id":"ALG-SUPPORT","task":"T012","missing":{"kind":"table","name":"clinical.allergy_verification_support"},"purpose":"Exact support patient/assertion/predecessor/attestor/target context, not license-bucket evidence","user":"owner","commit":false}
CREATE FUNCTION pg_temp.f011_case() RETURNS void LANGUAGE plpgsql AS $case$
BEGIN
  PERFORM pg_temp.f011_require_table('clinical.allergy_verification_support');
  PERFORM pg_temp.f011_columns('clinical.allergy_verification_support','[{"name":"id","type":"uuid","nullable":false},{"name":"patient_id","type":"uuid","nullable":false},{"name":"allergy_id","type":"uuid","nullable":false},{"name":"previous_revision_id","type":"uuid","nullable":false},{"name":"previous_version","type":"integer","nullable":false},{"name":"target_status","type":"text","nullable":false},{"name":"attestor_person_id","type":"uuid","nullable":false},{"name":"source_identity","type":"text","nullable":false},{"name":"source_evidence_identity","type":"uuid","nullable":false},{"name":"producer_id","type":"text","nullable":false},{"name":"recorded_at","type":"timestamptz","nullable":false},{"name":"synthetic","type":"boolean","nullable":false}]'::jsonb,true);
  PERFORM pg_temp.f011_fk('clinical.allergy_verification_support',ARRAY['previous_revision_id','allergy_id','patient_id','previous_version']::text[],'clinical.allergies',ARRAY['id','allergy_id','patient_id','version']::text[],false);
END $case$;
SELECT 'K04_CASE_COMPILED';
SELECT pg_temp.f011_case();

-- F011_CASE {"id":"ALG-ONE-USE","task":"T012","missing":{"kind":"table","name":"clinical.allergy_verification_bindings"},"purpose":"One-use immutable support and reciprocal verified-revision binding; cross-patient/assertion/orphan denied","user":"owner","commit":false}
CREATE FUNCTION pg_temp.f011_case() RETURNS void LANGUAGE plpgsql AS $case$
BEGIN
  PERFORM pg_temp.f011_require_table('clinical.allergy_verification_bindings');
  PERFORM pg_temp.f011_columns('clinical.allergy_verification_bindings','[{"name":"revision_id","type":"uuid","nullable":false},{"name":"binding_id","type":"uuid","nullable":false},{"name":"binding_contract_id","type":"text","nullable":false},{"name":"evidence_ref","type":"uuid","nullable":false},{"name":"producer_id","type":"text","nullable":false},{"name":"verified_at","type":"timestamptz","nullable":false}]'::jsonb,true);
  PERFORM pg_temp.f011_unique('clinical.allergy_verification_bindings',ARRAY['evidence_ref']::text[]);
  PERFORM pg_temp.f011_fk('clinical.allergy_verification_bindings',ARRAY['evidence_ref']::text[],'clinical.allergy_verification_support',ARRAY['id']::text[],false);
  PERFORM pg_temp.f011_deferred('clinical.allergy_verification_bindings');
  PERFORM pg_temp.f011_deferred('clinical.allergies');
END $case$;
SELECT 'K04_CASE_COMPILED';
SELECT pg_temp.f011_case();

-- F011_CASE {"id":"ALG-EDGES","task":"T012","missing":{"kind":"function","name":"clinical.verify_allergy_api_v1(uuid,integer,jsonb)"},"purpose":"Clinician-only allowed edges, current-head CAS; confirmed/refuted reversal, no verified self reset and terminal error","user":"shifaa_api","commit":false}
CREATE FUNCTION pg_temp.f011_case() RETURNS void LANGUAGE plpgsql AS $case$
BEGIN
  PERFORM pg_temp.f011_require_function('clinical.verify_allergy_api_v1(uuid,integer,jsonb)');
  PERFORM pg_temp.f011_context('f0110000-0000-4000-8000-000000000001','PAT','verifyAllergy');
  PERFORM pg_temp.f011_denied('SELECT clinical.verify_allergy_api_v1(''f0110000-0000-4000-8600-000000000001'',1,''{"targetStatus":"clinician_confirmed"}''::jsonb)',ARRAY['42501']);
END $case$;
SELECT 'K04_CASE_COMPILED';
SELECT pg_temp.f011_case();

-- F011_CASE {"id":"ALG-APPEND","task":"T012","missing":{"kind":"table","name":"clinical.allergies"},"purpose":"Append versions preserve original recorder/time/protected source/unknowns; linked new correction never resurrects terminal assertion","user":"owner","commit":false}
CREATE FUNCTION pg_temp.f011_case() RETURNS void LANGUAGE plpgsql AS $case$
BEGIN
  PERFORM pg_temp.f011_require_table('clinical.allergies');
  PERFORM pg_temp.f011_check(EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid='clinical.allergies'::regclass AND NOT tgisinternal AND (tgtype & 8)<>0 AND (tgtype & 16)<>0),'append-only UPDATE/DELETE guard');
  PERFORM pg_temp.f011_unique('clinical.allergies',ARRAY['allergy_id','version']::text[]);
END $case$;
SELECT 'K04_CASE_COMPILED';
SELECT pg_temp.f011_case();

-- F011_CASE {"id":"ALG-PREDECESSOR-CONTEXT","task":"T012","missing":{"kind":"table","name":"clinical.allergies"},"purpose":"No cross-patient/assertion predecessor or head; current head/version CAS is one bound tuple","user":"owner","commit":false}
CREATE FUNCTION pg_temp.f011_case() RETURNS void LANGUAGE plpgsql AS $case$
BEGIN
  PERFORM pg_temp.f011_require_table('clinical.allergies');
  PERFORM pg_temp.f011_fk('clinical.allergies',ARRAY['supersedes_id','allergy_id','patient_id']::text[],'clinical.allergies',ARRAY['id','allergy_id','patient_id']::text[],false);
  PERFORM pg_temp.f011_fk('clinical.allergy_heads',ARRAY['current_revision_id','id','patient_id','current_version']::text[],'clinical.allergies',ARRAY['id','allergy_id','patient_id','version']::text[],false);
  PERFORM pg_temp.f011_deferred('clinical.allergy_heads');
END $case$;
SELECT 'K04_CASE_COMPILED';
SELECT pg_temp.f011_case();

-- F011_CASE {"id":"ALG-ENVELOPE-LENGTHS","task":"T012","missing":{"kind":"table","name":"clinical.allergies"},"purpose":"Only structural synthetic ciphertext, no SQL AES/key/AAD carrier","user":"owner","commit":false}
CREATE FUNCTION pg_temp.f011_case() RETURNS void LANGUAGE plpgsql AS $case$
BEGIN
  PERFORM pg_temp.f011_require_table('clinical.allergies');
  PERFORM pg_temp.f011_check(EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='clinical.allergies'::regclass AND contype='c' AND pg_get_constraintdef(oid) LIKE '%octet_length(facts_nonce)%12%') AND EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='clinical.allergies'::regclass AND contype='c' AND pg_get_constraintdef(oid) LIKE '%octet_length(facts_auth_tag)%16%'),'opaque facts nonce/tag structure');
END $case$;
SELECT 'K04_CASE_COMPILED';
SELECT pg_temp.f011_case();

-- F011_CASE {"id":"ALG-EDGE-self_reported-clinician_confirmed","task":"T012","missing":{"kind":"function","name":"clinical.verify_allergy_api_v1(uuid,integer,jsonb)"},"purpose":"Frozen model section 2: self_reported -> clinician_confirmed requires append history, a current-head tuple, original provenance and fresh protected reason. Opaque offline row fixtures are structural only. Transition execution remains blocked by the absent physical entrypoint.","user":"owner","commit":false}
CREATE FUNCTION pg_temp.f011_case() RETURNS void LANGUAGE plpgsql AS $case$
BEGIN
  PERFORM pg_temp.f011_require_function('clinical.verify_allergy_api_v1(uuid,integer,jsonb)');
  DECLARE assertion uuid; BEGIN
    assertion:=pg_temp.f011_allergy_path(ARRAY['self_reported','clinician_confirmed']::text[]);
    PERFORM pg_temp.f011_check((SELECT count(*) FROM clinical.allergies WHERE allergy_id=assertion)=2,'append history retains every predecessor');
    PERFORM pg_temp.f011_check((SELECT verification_status FROM clinical.allergies r JOIN clinical.allergy_heads h ON h.current_revision_id=r.id WHERE h.id=assertion)='clinician_confirmed','head binds the allowed target revision');
    PERFORM pg_temp.f011_check((SELECT count(DISTINCT (original_recorder_person_id,original_recorded_at)) FROM clinical.allergies WHERE allergy_id=assertion)=1,'original recorder/time preserved with protected source and known/unknown facts');
  END;
END $case$;
SELECT 'K04_CASE_COMPILED';
SELECT pg_temp.f011_case();

-- F011_CASE {"id":"ALG-EDGE-self_reported-refuted","task":"T012","missing":{"kind":"function","name":"clinical.verify_allergy_api_v1(uuid,integer,jsonb)"},"purpose":"Frozen model section 2: self_reported -> refuted requires append history, a current-head tuple, original provenance and fresh protected reason. Opaque offline row fixtures are structural only. Transition execution remains blocked by the absent physical entrypoint.","user":"owner","commit":false}
CREATE FUNCTION pg_temp.f011_case() RETURNS void LANGUAGE plpgsql AS $case$
BEGIN
  PERFORM pg_temp.f011_require_function('clinical.verify_allergy_api_v1(uuid,integer,jsonb)');
  DECLARE assertion uuid; BEGIN
    assertion:=pg_temp.f011_allergy_path(ARRAY['self_reported','refuted']::text[]);
    PERFORM pg_temp.f011_check((SELECT count(*) FROM clinical.allergies WHERE allergy_id=assertion)=2,'append history retains every predecessor');
    PERFORM pg_temp.f011_check((SELECT verification_status FROM clinical.allergies r JOIN clinical.allergy_heads h ON h.current_revision_id=r.id WHERE h.id=assertion)='refuted','head binds the allowed target revision');
    PERFORM pg_temp.f011_check((SELECT count(DISTINCT (original_recorder_person_id,original_recorded_at)) FROM clinical.allergies WHERE allergy_id=assertion)=1,'original recorder/time preserved with protected source and known/unknown facts');
  END;
END $case$;
SELECT 'K04_CASE_COMPILED';
SELECT pg_temp.f011_case();

-- F011_CASE {"id":"ALG-EDGE-clinician_confirmed-refuted","task":"T012","missing":{"kind":"function","name":"clinical.verify_allergy_api_v1(uuid,integer,jsonb)"},"purpose":"Frozen model section 2: clinician_confirmed -> refuted requires append history, a current-head tuple, original provenance and fresh protected reason. Opaque offline row fixtures are structural only. Transition execution remains blocked by the absent physical entrypoint.","user":"owner","commit":false}
CREATE FUNCTION pg_temp.f011_case() RETURNS void LANGUAGE plpgsql AS $case$
BEGIN
  PERFORM pg_temp.f011_require_function('clinical.verify_allergy_api_v1(uuid,integer,jsonb)');
  DECLARE assertion uuid; BEGIN
    assertion:=pg_temp.f011_allergy_path(ARRAY['self_reported','clinician_confirmed','refuted']::text[]);
    PERFORM pg_temp.f011_check((SELECT count(*) FROM clinical.allergies WHERE allergy_id=assertion)=3,'append history retains every predecessor');
    PERFORM pg_temp.f011_check((SELECT verification_status FROM clinical.allergies r JOIN clinical.allergy_heads h ON h.current_revision_id=r.id WHERE h.id=assertion)='refuted','head binds the allowed target revision');
    PERFORM pg_temp.f011_check((SELECT count(DISTINCT (original_recorder_person_id,original_recorded_at)) FROM clinical.allergies WHERE allergy_id=assertion)=1,'original recorder/time preserved with protected source and known/unknown facts');
  END;
END $case$;
SELECT 'K04_CASE_COMPILED';
SELECT pg_temp.f011_case();

-- F011_CASE {"id":"ALG-EDGE-refuted-clinician_confirmed","task":"T012","missing":{"kind":"function","name":"clinical.verify_allergy_api_v1(uuid,integer,jsonb)"},"purpose":"Frozen model section 2: refuted -> clinician_confirmed requires append history, a current-head tuple, original provenance and fresh protected reason. Opaque offline row fixtures are structural only. Transition execution remains blocked by the absent physical entrypoint.","user":"owner","commit":false}
CREATE FUNCTION pg_temp.f011_case() RETURNS void LANGUAGE plpgsql AS $case$
BEGIN
  PERFORM pg_temp.f011_require_function('clinical.verify_allergy_api_v1(uuid,integer,jsonb)');
  DECLARE assertion uuid; BEGIN
    assertion:=pg_temp.f011_allergy_path(ARRAY['self_reported','refuted','clinician_confirmed']::text[]);
    PERFORM pg_temp.f011_check((SELECT count(*) FROM clinical.allergies WHERE allergy_id=assertion)=3,'append history retains every predecessor');
    PERFORM pg_temp.f011_check((SELECT verification_status FROM clinical.allergies r JOIN clinical.allergy_heads h ON h.current_revision_id=r.id WHERE h.id=assertion)='clinician_confirmed','head binds the allowed target revision');
    PERFORM pg_temp.f011_check((SELECT count(DISTINCT (original_recorder_person_id,original_recorded_at)) FROM clinical.allergies WHERE allergy_id=assertion)=1,'original recorder/time preserved with protected source and known/unknown facts');
  END;
END $case$;
SELECT 'K04_CASE_COMPILED';
SELECT pg_temp.f011_case();

-- F011_CASE {"id":"ALG-EDGE-clinician_confirmed-self_reported","task":"T012","missing":{"kind":"function","name":"clinical.verify_allergy_api_v1(uuid,integer,jsonb)"},"purpose":"Frozen model section 2: clinician_confirmed -> self_reported must be denied; never reset/reopen a terminal assertion. Opaque offline row fixtures are structural only. Transition execution remains blocked by the absent physical entrypoint.","user":"owner","commit":false}
CREATE FUNCTION pg_temp.f011_case() RETURNS void LANGUAGE plpgsql AS $case$
BEGIN
  PERFORM pg_temp.f011_require_function('clinical.verify_allergy_api_v1(uuid,integer,jsonb)');
  DECLARE assertion uuid; BEGIN
    assertion:=pg_temp.f011_allergy_path(ARRAY['self_reported','clinician_confirmed']::text[]);
    PERFORM pg_temp.f011_context('f0110000-0000-4000-8000-000000000002','CLN','verifyAllergy');
    PERFORM pg_temp.f011_denied(format('SELECT clinical.verify_allergy_api_v1(%L::uuid,2,%L::jsonb)',assertion,'{"targetStatus":"self_reported"}'),ARRAY['23514']);
  END;
END $case$;
SELECT 'K04_CASE_COMPILED';
SELECT pg_temp.f011_case();

-- F011_CASE {"id":"ALG-EDGE-refuted-self_reported","task":"T012","missing":{"kind":"function","name":"clinical.verify_allergy_api_v1(uuid,integer,jsonb)"},"purpose":"Frozen model section 2: refuted -> self_reported must be denied; never reset/reopen a terminal assertion. Opaque offline row fixtures are structural only. Transition execution remains blocked by the absent physical entrypoint.","user":"owner","commit":false}
CREATE FUNCTION pg_temp.f011_case() RETURNS void LANGUAGE plpgsql AS $case$
BEGIN
  PERFORM pg_temp.f011_require_function('clinical.verify_allergy_api_v1(uuid,integer,jsonb)');
  DECLARE assertion uuid; BEGIN
    assertion:=pg_temp.f011_allergy_path(ARRAY['self_reported','refuted']::text[]);
    PERFORM pg_temp.f011_context('f0110000-0000-4000-8000-000000000002','CLN','verifyAllergy');
    PERFORM pg_temp.f011_denied(format('SELECT clinical.verify_allergy_api_v1(%L::uuid,2,%L::jsonb)',assertion,'{"targetStatus":"self_reported"}'),ARRAY['23514']);
  END;
END $case$;
SELECT 'K04_CASE_COMPILED';
SELECT pg_temp.f011_case();

-- F011_CASE {"id":"ALG-EDGE-entered_in_error-clinician_confirmed","task":"T012","missing":{"kind":"function","name":"clinical.verify_allergy_api_v1(uuid,integer,jsonb)"},"purpose":"Frozen model section 2: entered_in_error -> clinician_confirmed must be denied; never reset/reopen a terminal assertion. Opaque offline row fixtures are structural only. Transition execution remains blocked by the absent physical entrypoint.","user":"owner","commit":false}
CREATE FUNCTION pg_temp.f011_case() RETURNS void LANGUAGE plpgsql AS $case$
BEGIN
  PERFORM pg_temp.f011_require_function('clinical.verify_allergy_api_v1(uuid,integer,jsonb)');
  DECLARE assertion uuid; BEGIN
    assertion:=pg_temp.f011_allergy_path(ARRAY['self_reported','clinician_confirmed','entered_in_error']::text[]);
    PERFORM pg_temp.f011_context('f0110000-0000-4000-8000-000000000002','CLN','verifyAllergy');
    PERFORM pg_temp.f011_denied(format('SELECT clinical.verify_allergy_api_v1(%L::uuid,3,%L::jsonb)',assertion,'{"targetStatus":"clinician_confirmed"}'),ARRAY['23514']);
  END;
END $case$;
SELECT 'K04_CASE_COMPILED';
SELECT pg_temp.f011_case();

-- F011_CASE {"id":"ALG-EDGE-entered_in_error-self_reported","task":"T012","missing":{"kind":"function","name":"clinical.verify_allergy_api_v1(uuid,integer,jsonb)"},"purpose":"Frozen model section 2: entered_in_error -> self_reported must be denied; never reset/reopen a terminal assertion. Opaque offline row fixtures are structural only. Transition execution remains blocked by the absent physical entrypoint.","user":"owner","commit":false}
CREATE FUNCTION pg_temp.f011_case() RETURNS void LANGUAGE plpgsql AS $case$
BEGIN
  PERFORM pg_temp.f011_require_function('clinical.verify_allergy_api_v1(uuid,integer,jsonb)');
  DECLARE assertion uuid; BEGIN
    assertion:=pg_temp.f011_allergy_path(ARRAY['self_reported','clinician_confirmed','entered_in_error']::text[]);
    PERFORM pg_temp.f011_context('f0110000-0000-4000-8000-000000000002','CLN','verifyAllergy');
    PERFORM pg_temp.f011_denied(format('SELECT clinical.verify_allergy_api_v1(%L::uuid,3,%L::jsonb)',assertion,'{"targetStatus":"self_reported"}'),ARRAY['23514']);
  END;
END $case$;
SELECT 'K04_CASE_COMPILED';
SELECT pg_temp.f011_case();

-- F011_CASE {"id":"ALG-EDGE-clinician_confirmed-clinician_confirmed","task":"T012","missing":{"kind":"function","name":"clinical.verify_allergy_api_v1(uuid,integer,jsonb)"},"purpose":"Frozen model section 2: clinician_confirmed -> clinician_confirmed must be denied; never reset/reopen a terminal assertion. Opaque offline row fixtures are structural only. Transition execution remains blocked by the absent physical entrypoint.","user":"owner","commit":false}
CREATE FUNCTION pg_temp.f011_case() RETURNS void LANGUAGE plpgsql AS $case$
BEGIN
  PERFORM pg_temp.f011_require_function('clinical.verify_allergy_api_v1(uuid,integer,jsonb)');
  DECLARE assertion uuid; BEGIN
    assertion:=pg_temp.f011_allergy_path(ARRAY['self_reported','clinician_confirmed']::text[]);
    PERFORM pg_temp.f011_context('f0110000-0000-4000-8000-000000000002','CLN','verifyAllergy');
    PERFORM pg_temp.f011_denied(format('SELECT clinical.verify_allergy_api_v1(%L::uuid,2,%L::jsonb)',assertion,'{"targetStatus":"clinician_confirmed"}'),ARRAY['23514']);
  END;
END $case$;
SELECT 'K04_CASE_COMPILED';
SELECT pg_temp.f011_case();

-- F011_CASE {"id":"ALG-TERMINAL-CORRECTION","task":"T012","missing":{"kind":"table","name":"clinical.allergy_heads"},"purpose":"Terminal error never resurrected; linked new assertion stays self_reported and same patient, original protected source/unknowns retained in history","user":"owner","commit":false}
CREATE FUNCTION pg_temp.f011_case() RETURNS void LANGUAGE plpgsql AS $case$
BEGIN
  PERFORM pg_temp.f011_require_table('clinical.allergy_heads');
  PERFORM pg_temp.f011_fk('clinical.allergy_heads',ARRAY['corrects_allergy_id','patient_id']::text[],'clinical.allergy_heads',ARRAY['id','patient_id']::text[],false);
  PERFORM pg_temp.f011_check(EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='clinical.allergy_heads'::regclass AND contype='c' AND pg_get_constraintdef(oid) LIKE '%corrects_allergy_id%' AND pg_get_constraintdef(oid) LIKE '%id%'),'correction must be a distinct assertion');
END $case$;
SELECT 'K04_CASE_COMPILED';
SELECT pg_temp.f011_case();

