-- K04 physical RED. Each case runs in its own isolated test transaction.

-- F011_CASE {"id":"ALG-FACTS","task":"T012","missing":{"kind":"table","name":"clinical.allergies"},"purpose":"Exact five facts columns, required opaque envelope, original source/unknowns remain inside protected facts","user":"owner","commit":false}
CREATE FUNCTION pg_temp.f011_case() RETURNS void LANGUAGE plpgsql AS $case$
BEGIN
  PERFORM pg_temp.f011_require_table('clinical.allergies');
  PERFORM pg_temp.f011_columns('clinical.allergies','[{"name":"facts_contract_id","type":"text","nullable":false},{"name":"facts_key_ref","type":"text","nullable":false},{"name":"facts_nonce","type":"bytea","nullable":false},{"name":"facts_ciphertext","type":"bytea","nullable":false},{"name":"facts_auth_tag","type":"bytea","nullable":false}]'::jsonb,false);
END $case$;
SELECT 'K04_CASE_COMPILED';
SELECT pg_temp.f011_case();

-- F011_CASE {"id":"ALG-PLAINTEXT","task":"T012","missing":{"kind":"table","name":"clinical.allergies"},"purpose":"Closed structural plaintext allowlist, no copied source/known-unknown scalar","user":"owner","commit":false}
CREATE FUNCTION pg_temp.f011_case() RETURNS void LANGUAGE plpgsql AS $case$
BEGIN
  PERFORM pg_temp.f011_require_table('clinical.allergies');
  PERFORM pg_temp.f011_check(NOT EXISTS(SELECT 1 FROM pg_attribute WHERE attrelid='clinical.allergies'::regclass AND attnum>0 AND NOT attisdropped AND attname=ANY(ARRAY['substance','source','coding','reaction','severity','onset','reason','aad','key','verification_reason_ciphertext'])),'no clinical plaintext, key or free-form AAD');
END $case$;
SELECT 'K04_CASE_COMPILED';
SELECT pg_temp.f011_case();

-- F011_CASE {"id":"ALG-HEAD","task":"T012","missing":{"kind":"table","name":"clinical.allergy_heads"},"purpose":"Stable assertion/head/patient/revision identity and current-head CAS basis","user":"owner","commit":false}
CREATE FUNCTION pg_temp.f011_case() RETURNS void LANGUAGE plpgsql AS $case$
BEGIN
  PERFORM pg_temp.f011_require_table('clinical.allergy_heads');
  PERFORM pg_temp.f011_unique('clinical.allergy_heads',ARRAY['id','patient_id']::text[]);
  PERFORM pg_temp.f011_unique('clinical.allergies',ARRAY['id','allergy_id','patient_id','version']::text[]);
  PERFORM pg_temp.f011_fk('clinical.allergies',ARRAY['patient_id']::text[],'identity.patients',ARRAY['id']::text[],false);
END $case$;
SELECT 'K04_CASE_COMPILED';
SELECT pg_temp.f011_case();

-- F011_CASE {"id":"ALG-CREATE-AUTH","task":"T012","missing":{"kind":"function","name":"clinical.create_allergy_api_v1(uuid,jsonb)"},"purpose":"GUA/DEL cannot create; self or authorized clinician only","user":"shifaa_api","commit":false}
CREATE FUNCTION pg_temp.f011_case() RETURNS void LANGUAGE plpgsql AS $case$
BEGIN
  PERFORM pg_temp.f011_require_function('clinical.create_allergy_api_v1(uuid,jsonb)');
  PERFORM pg_temp.f011_context('f0110000-0000-4000-8000-000000000001','GUA','createAllergy');
  PERFORM pg_temp.f011_denied('SELECT clinical.create_allergy_api_v1(''f0110000-0000-4000-8100-000000000001'',''{}''::jsonb)',ARRAY['42501']);
END $case$;
SELECT 'K04_CASE_COMPILED';
SELECT pg_temp.f011_case();

-- F011_CASE {"id":"ALG-READ-AUTH","task":"T012","missing":{"kind":"function","name":"clinical.list_allergies_api_v1(uuid,jsonb)"},"purpose":"Admin status does not grant patient read; own/authorized care projection only","user":"shifaa_api","commit":false}
CREATE FUNCTION pg_temp.f011_case() RETURNS void LANGUAGE plpgsql AS $case$
BEGIN
  PERFORM pg_temp.f011_require_function('clinical.list_allergies_api_v1(uuid,jsonb)');
  PERFORM pg_temp.f011_context('f0110000-0000-4000-8000-000000000001','ADM-MEDICAL','listAllergies');
  PERFORM pg_temp.f011_denied('SELECT clinical.list_allergies_api_v1(''f0110000-0000-4000-8100-000000000001'',''{}''::jsonb)',ARRAY['42501']);
END $case$;
SELECT 'K04_CASE_COMPILED';
SELECT pg_temp.f011_case();

