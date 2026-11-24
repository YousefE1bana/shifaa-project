-- Run only in the separately admitted disposable harness after T015.
-- The missing-schema failure is distinct from a tested authorization denial.
DO $roster_test$
DECLARE
  roster_relation regclass;
  relation_name text;
BEGIN
  FOREACH relation_name IN ARRAY ARRAY[
    'clinical.f012_reviewer_roster_versions',
    'clinical.f012_reviewer_designations'
  ]
  LOOP
    roster_relation := to_regclass(relation_name);
    IF roster_relation IS NULL THEN
      RAISE EXCEPTION 'T015 roster substrate is absent: %', relation_name;
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM pg_catalog.pg_class
      WHERE oid = roster_relation AND relrowsecurity AND relforcerowsecurity
    ) THEN
      RAISE EXCEPTION 'Expected forced RLS on %', relation_name;
    END IF;

    IF has_any_column_privilege('shifaa_api', roster_relation, 'INSERT, UPDATE')
       OR has_table_privilege('shifaa_api', roster_relation, 'DELETE, TRUNCATE') THEN
      RAISE EXCEPTION 'Core API has direct roster mutation privileges on %', relation_name;
    END IF;
  END LOOP;
END
$roster_test$;
