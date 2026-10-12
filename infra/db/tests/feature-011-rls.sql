-- K04 physical RED. Each case runs in its own isolated test transaction.

-- F011_CASE {"id":"ROLE-EXECUTOR","task":"T015","missing":{"kind":"role","name":"shifaa_f011_executor"},"purpose":"Actual shifaa_api versus NOLOGIN narrow executor, no role assumption","user":"owner","commit":false}
CREATE FUNCTION pg_temp.f011_case() RETURNS void LANGUAGE plpgsql AS $case$
BEGIN
  PERFORM pg_temp.f011_require_executor();
  PERFORM pg_temp.f011_check(NOT pg_has_role('shifaa_api','shifaa_f011_executor','MEMBER'),'API cannot SET ROLE executor');
END $case$;
SELECT 'K04_CASE_COMPILED';
SELECT pg_temp.f011_case();

-- F011_CASE {"id":"GRANT-shifaa_api","task":"T015","missing":{"kind":"table","name":"clinical.allergies"},"purpose":"Actual role catalog grants deny direct DML/read; no worker or service-role authority","user":"owner","commit":false}
CREATE FUNCTION pg_temp.f011_case() RETURNS void LANGUAGE plpgsql AS $case$
BEGIN
  PERFORM pg_temp.f011_require_table('clinical.allergies');
  PERFORM pg_temp.f011_check(NOT EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='clinical' AND c.relname=ANY(ARRAY['allergy_heads','allergies','mutation_receipts','mutation_commit_obligations','content_series','content_releases','content_governance_authorities','content_reviewer_designations','content_material_bindings','content_signature_bindings','content_admissibility_evidence','content_artifact_admissibility_bindings','allergy_verification_support','allergy_verification_bindings']::text[]) AND EXISTS(SELECT 1 FROM pg_roles WHERE rolname='shifaa_api') AND has_table_privilege('shifaa_api',c.oid,'SELECT,INSERT,UPDATE,DELETE')),'no direct feature-table privileges for shifaa_api');
END $case$;
SELECT 'K04_CASE_COMPILED';
SELECT pg_temp.f011_case();

-- F011_CASE {"id":"GRANT-shifaa_worker","task":"T015","missing":{"kind":"table","name":"clinical.allergies"},"purpose":"Actual role catalog grants deny direct DML/read; no worker or service-role authority","user":"owner","commit":false}
CREATE FUNCTION pg_temp.f011_case() RETURNS void LANGUAGE plpgsql AS $case$
BEGIN
  PERFORM pg_temp.f011_require_table('clinical.allergies');
  PERFORM pg_temp.f011_check(NOT EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='clinical' AND c.relname=ANY(ARRAY['allergy_heads','allergies','mutation_receipts','mutation_commit_obligations','content_series','content_releases','content_governance_authorities','content_reviewer_designations','content_material_bindings','content_signature_bindings','content_admissibility_evidence','content_artifact_admissibility_bindings','allergy_verification_support','allergy_verification_bindings']::text[]) AND EXISTS(SELECT 1 FROM pg_roles WHERE rolname='shifaa_worker') AND has_table_privilege('shifaa_worker',c.oid,'SELECT,INSERT,UPDATE,DELETE')),'no direct feature-table privileges for shifaa_worker');
END $case$;
SELECT 'K04_CASE_COMPILED';
SELECT pg_temp.f011_case();

-- F011_CASE {"id":"GRANT-anon","task":"T015","missing":{"kind":"table","name":"clinical.allergies"},"purpose":"Actual role catalog grants deny direct DML/read; no worker or service-role authority","user":"owner","commit":false}
CREATE FUNCTION pg_temp.f011_case() RETURNS void LANGUAGE plpgsql AS $case$
BEGIN
  PERFORM pg_temp.f011_require_table('clinical.allergies');
  PERFORM pg_temp.f011_check(NOT EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='clinical' AND c.relname=ANY(ARRAY['allergy_heads','allergies','mutation_receipts','mutation_commit_obligations','content_series','content_releases','content_governance_authorities','content_reviewer_designations','content_material_bindings','content_signature_bindings','content_admissibility_evidence','content_artifact_admissibility_bindings','allergy_verification_support','allergy_verification_bindings']::text[]) AND EXISTS(SELECT 1 FROM pg_roles WHERE rolname='anon') AND has_table_privilege('anon',c.oid,'SELECT,INSERT,UPDATE,DELETE')),'no direct feature-table privileges for anon');
END $case$;
SELECT 'K04_CASE_COMPILED';
SELECT pg_temp.f011_case();

-- F011_CASE {"id":"GRANT-authenticated","task":"T015","missing":{"kind":"table","name":"clinical.allergies"},"purpose":"Actual role catalog grants deny direct DML/read; no worker or service-role authority","user":"owner","commit":false}
CREATE FUNCTION pg_temp.f011_case() RETURNS void LANGUAGE plpgsql AS $case$
BEGIN
  PERFORM pg_temp.f011_require_table('clinical.allergies');
  PERFORM pg_temp.f011_check(NOT EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='clinical' AND c.relname=ANY(ARRAY['allergy_heads','allergies','mutation_receipts','mutation_commit_obligations','content_series','content_releases','content_governance_authorities','content_reviewer_designations','content_material_bindings','content_signature_bindings','content_admissibility_evidence','content_artifact_admissibility_bindings','allergy_verification_support','allergy_verification_bindings']::text[]) AND EXISTS(SELECT 1 FROM pg_roles WHERE rolname='authenticated') AND has_table_privilege('authenticated',c.oid,'SELECT,INSERT,UPDATE,DELETE')),'no direct feature-table privileges for authenticated');
END $case$;
SELECT 'K04_CASE_COMPILED';
SELECT pg_temp.f011_case();

-- F011_CASE {"id":"GRANT-service_role","task":"T015","missing":{"kind":"table","name":"clinical.allergies"},"purpose":"Actual role catalog grants deny direct DML/read; no worker or service-role authority","user":"owner","commit":false}
CREATE FUNCTION pg_temp.f011_case() RETURNS void LANGUAGE plpgsql AS $case$
BEGIN
  PERFORM pg_temp.f011_require_table('clinical.allergies');
  PERFORM pg_temp.f011_check(NOT EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='clinical' AND c.relname=ANY(ARRAY['allergy_heads','allergies','mutation_receipts','mutation_commit_obligations','content_series','content_releases','content_governance_authorities','content_reviewer_designations','content_material_bindings','content_signature_bindings','content_admissibility_evidence','content_artifact_admissibility_bindings','allergy_verification_support','allergy_verification_bindings']::text[]) AND EXISTS(SELECT 1 FROM pg_roles WHERE rolname='service_role') AND has_table_privilege('service_role',c.oid,'SELECT,INSERT,UPDATE,DELETE')),'no direct feature-table privileges for service_role');
END $case$;
SELECT 'K04_CASE_COMPILED';
SELECT pg_temp.f011_case();

-- F011_CASE {"id":"PUBLIC-EXECUTE","task":"T015","missing":{"kind":"function","name":"clinical.verify_allergy_api_v1(uuid,integer,jsonb)"},"purpose":"PUBLIC/helper denial and fixed search_path for SECURITY DEFINER","user":"owner","commit":false}
CREATE FUNCTION pg_temp.f011_case() RETURNS void LANGUAGE plpgsql AS $case$
BEGIN
  PERFORM pg_temp.f011_require_function('clinical.verify_allergy_api_v1(uuid,integer,jsonb)');
  PERFORM pg_temp.f011_check(NOT EXISTS(SELECT 1 FROM pg_proc p CROSS JOIN LATERAL aclexplode(COALESCE(p.proacl,acldefault('f',p.proowner))) a WHERE p.oid=to_regprocedure('clinical.verify_allergy_api_v1(uuid,integer,jsonb)') AND a.grantee=0 AND a.privilege_type='EXECUTE'),'no PUBLIC execution');
END $case$;
SELECT 'K04_CASE_COMPILED';
SELECT pg_temp.f011_case();

-- F011_CASE {"id":"DIRECT-SQL-SPOOF","task":"T015","missing":{"kind":"table","name":"clinical.allergies"},"purpose":"Client role/AAL/body claims confer no direct SQL authority; trusted repository GUC is attribution, not cryptographic authentication","user":"shifaa_api","commit":false}
CREATE FUNCTION pg_temp.f011_case() RETURNS void LANGUAGE plpgsql AS $case$
BEGIN
  PERFORM pg_temp.f011_require_table('clinical.allergies');
  PERFORM pg_temp.f011_context('f0110000-0000-4000-8000-000000000001','ADM-SUPER','verifyAllergy');
  PERFORM pg_temp.f011_denied('SELECT * FROM clinical.allergies',ARRAY['42501']);
  PERFORM pg_temp.f011_denied('UPDATE clinical.allergies SET version=version+1',ARRAY['42501']);
END $case$;
SELECT 'K04_CASE_COMPILED';
SELECT pg_temp.f011_case();

