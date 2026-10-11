-- K04 physical RED. Each case runs in its own isolated test transaction.

-- F011_CASE {"id":"PROJECTION-CLOSED","task":"T015","missing":{"kind":"function","name":"clinical.list_clinical_content_api_v1(text,jsonb)"},"purpose":"Clinic metadata projection denies private body/digest/workflow/signature/evidence, drafts and unsigned content; separate current read grant/AAL2/purpose","user":"shifaa_api","commit":false}
CREATE FUNCTION pg_temp.f011_case() RETURNS void LANGUAGE plpgsql AS $case$
BEGIN
  PERFORM pg_temp.f011_require_function('clinical.list_clinical_content_api_v1(text,jsonb)');
  PERFORM pg_temp.f011_context('f0110000-0000-4000-8000-000000000002','CLN','listClinicalContent');
  PERFORM pg_temp.f011_denied('SELECT clinical.list_clinical_content_api_v1(''synthetic'',''{"projection":"governance"}''::jsonb)',ARRAY['42501']);
  PERFORM set_config('shifaa.aal','1',true);
  PERFORM pg_temp.f011_denied('SELECT clinical.list_clinical_content_api_v1(''synthetic'',''{"projection":"status"}''::jsonb)',ARRAY['42501']);
END $case$;
SELECT 'K04_CASE_COMPILED';
SELECT pg_temp.f011_case();

