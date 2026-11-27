-- Designation and signing authority use the offline governance port.
-- Its database boundary can be measured without exercising privileged DML.
BEGIN READ ONLY;
SET LOCAL search_path=pg_catalog;
DO $governance_boundary$
DECLARE
  test_role text;
  target regclass;
  executor constant text := 'shifaa_f011_executor';
  eligibility constant regprocedure := 'clinical.f011_release_current_eligibility_v1(uuid)'::regprocedure;
BEGIN
  FOREACH target IN ARRAY ARRAY[
    'clinical.content_reviewer_designations'::regclass,
    'clinical.content_governance_authorities'::regclass
  ] LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_class WHERE oid=target AND relrowsecurity AND relforcerowsecurity
    ) THEN RAISE EXCEPTION 'governance target % lacks forced RLS',target; END IF;
    FOREACH test_role IN ARRAY ARRAY['shifaa_api','shifaa_worker','service_role'] LOOP
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname=test_role) THEN
        RAISE EXCEPTION 'missing installed role %',test_role;
      END IF;
      IF has_any_column_privilege(test_role,target,'INSERT')
         OR has_any_column_privilege(test_role,target,'UPDATE')
         OR has_table_privilege(test_role,target,'DELETE')
         OR pg_has_role(test_role,executor,'MEMBER')
         OR has_function_privilege(test_role,eligibility,'EXECUTE') THEN
        RAISE EXCEPTION 'online role % acquired offline governance authority on %',test_role,target;
      END IF;
    END LOOP;
    RAISE NOTICE 'forced RLS and no online designation/authority DML on %',target;
  END LOOP;
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc WHERE oid=eligibility AND prosecdef AND pg_get_userbyid(proowner)=executor
  ) OR NOT EXISTS (
    SELECT 1 FROM pg_roles WHERE rolname=executor AND NOT rolcanlogin AND NOT rolbypassrls AND NOT rolsuper
  ) THEN RAISE EXCEPTION 'eligibility helper is not confined to its installed executor'; END IF;
END
$governance_boundary$;

SET SESSION AUTHORIZATION shifaa_f011_executor;
DO $absent_release$
BEGIN
  IF clinical.f011_release_current_eligibility_v1('74123000-0000-4000-8100-000000000001') IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'unavailable content release was eligible';
  END IF;
  RAISE NOTICE 'installed eligibility helper denies an absent release';
END
$absent_release$;
RESET SESSION AUTHORIZATION;
ROLLBACK;
